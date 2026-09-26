import prisma from '../lib/prisma';
import { toUsd } from './fxService';
import type { Order } from '../mock/data';

// A year, not a quarter. The calendar and the statistics pages both offer
// six months, and at 90 days half of what they offered was already deleted —
// silently, by the nightly clean. A year of this account's volume is on the
// order of 80,000 rows, which SQLite does not notice.
const MAX_AGE_DAYS = 365;

// In-memory: previous orders per account for comparison
const previousOrders = new Map<string, Map<number, Order>>();

/**
 * Detect closed trades by comparing current orders with previous snapshot.
 * Missing tickets = trades that were closed.
 */
export const detectClosedTrades = async (
  accountId: string,
  currentOrders: Order[],
): Promise<void> => {
  const prevMap = previousOrders.get(accountId);

  // Build current ticket map
  const currentMap = new Map<number, Order>();
  for (const o of currentOrders) {
    currentMap.set(o.ticket, o);
  }

  // Update previous orders for next comparison
  previousOrders.set(accountId, currentMap);

  // Skip first push (no previous data to compare)
  if (!prevMap) return;

  // Find tickets that were in previous but not in current = closed
  const closedTickets: Order[] = [];
  for (const [ticket, order] of prevMap.entries()) {
    if (!currentMap.has(ticket)) {
      closedTickets.push(order);
    }
  }

  if (closedTickets.length === 0) return;

  const snapshot = await accountSnapshot(accountId);

  // Batch insert closed trades
  for (const order of closedTickets) {
    try {
      // The EA's own deal report is the accurate one and usually lands first;
      // guessing from a vanished position gives the wrong close time (now) and
      // the last floating profit, without the commission booked at the close.
      const already = await prisma.closedTrade.findFirst({
        where: { accountId, ticket: order.ticket },
        select: { id: true },
      });
      if (already) continue;

      await prisma.closedTrade.create({
        data: {
          ...snapshot,
          source: 'detected',
          accountId,
          ticket: order.ticket,
          symbol: order.symbol,
          type: order.type,
          lots: order.lots,
          openPrice: order.openPrice,
          closePrice: order.currentPrice,
          profit: order.profit,
          swap: order.swap ?? 0,
          commission: order.commission ?? 0,
          openTime: new Date(order.openTime),
          sl: order.sl,
          tp: order.tp,
        },
      });
      console.log(`[TradeHistory] Closed trade #${order.ticket} ${order.symbol} P/L: ${order.profit}`);
    } catch (err: unknown) {
      // Unique constraint violation = already recorded
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('Unique constraint')) {
        console.error(`[TradeHistory] Error recording trade #${order.ticket}:`, msg);
      }
    }
  }
};

/**
 * Record closed deals sent directly from EA's deal history.
 * These have exact P/L including commission — much more accurate than position diff.
 */
export interface ClosedDeal {
  positionId: number;
  ticket: number;
  symbol: string;
  type: number; // 0=BUY, 1=SELL
  lots: number;
  openPrice: number;
  closePrice: number;
  profit: number;
  swap: number;
  commission: number;
  openTime: string;
  closeTime: string;
}

const TYPE_MAP: Record<number, string> = { 0: 'BUY', 1: 'SELL' };

/** Parse MT5 time string (broker server time) and convert to UTC.
 *  MT5 format: "YYYY.MM.DD HH:MM:SS" (dots in date, space separator)
 *  We treat this as broker time, then subtract the broker offset to get UTC.
 */
const mt5TimeToUtc = (timeStr: string, brokerOffsetSec: number): Date => {
  // "2024.03.15 14:30:45" → "2024-03-15T14:30:45Z"
  // Adding 'Z' forces JS to treat the string as UTC (not local time).
  // This gives us the broker time as a UTC timestamp, then we subtract the
  // broker offset (e.g. GMT+2 = 7200s) to get the real UTC time.
  const normalized = timeStr.replace(/\./g, '-').replace(' ', 'T') + 'Z';
  const brokerTimeAsUtc = new Date(normalized);
  return new Date(brokerTimeAsUtc.getTime() - brokerOffsetSec * 1000);
};

/**
 * Stamp the owner and account details onto rows written before they existed.
 *
 * Without it every trade already stored would vanish from the calendar the
 * moment its account was removed — the opposite of what keeping the row is for.
 */
export const backfillTradeOwners = async (): Promise<void> => {
  const stale = await prisma.closedTrade.findMany({
    where: { userId: null, NOT: { accountId: null } },
    select: { id: true, accountId: true },
  });
  if (stale.length === 0) return;

  const ids = [...new Set(stale.map(t => t.accountId!))];
  const accounts = await prisma.account.findMany({
    where: { id: { in: ids } },
    select: { id: true, userId: true, name: true, currency: true, isDemo: true },
  });
  const byId = new Map(accounts.map(a => [a.id, a]));

  let done = 0;
  for (const [accountId, a] of byId) {
    const r = await prisma.closedTrade.updateMany({
      where: { accountId, userId: null },
      data: {
        userId: a.userId,
        accountName: a.name,
        accountCurrency: a.currency,
        accountIsDemo: a.isDemo,
      },
    });
    done += r.count;
  }
  console.log(`[TradeHistory] stamped the owner onto ${done} existing trade(s)`);
};

/**
 * Undo the broker-time-as-UTC open times the position-diff fallback wrote.
 *
 * `detectClosedTrades` stored `new Date(order.openTime)` straight from the
 * EA's `2026.09.25 18:05:12`, which JavaScript reads as UTC. The broker's
 * clock runs ahead of UTC, so every one of those rows opens several hours
 * later than it really did — and on a position that was open for less than the
 * offset, that puts the open *after* the close, which is impossible and is how
 * the whole thing was spotted.
 *
 * Rows where the open still precedes the close are shifted by the same amount
 * but cannot be told apart from correct ones, so only the impossible ones are
 * repaired. That is a repair, not a guess: an open time later than its own
 * close can only have come from this bug, and subtracting the account's offset
 * is exactly the conversion that was missed.
 */
export const repairGuessedOpenTimes = async (): Promise<void> => {
  const accounts = await prisma.account.findMany({
    where: { NOT: { brokerTimeOffset: null } },
    select: { id: true, brokerTimeOffset: true },
  });

  let fixed = 0;
  for (const a of accounts) {
    const offsetMs = (a.brokerTimeOffset ?? 0) * 1000;
    if (offsetMs <= 0) continue;

    // SQLite through Prisma cannot compare two columns in a filter, so the
    // candidates are narrowed by account and checked in JS.
    const rows = await prisma.closedTrade.findMany({
      where: { accountId: a.id },
      select: { id: true, openTime: true, closeTime: true },
    });

    for (const r of rows) {
      if (r.openTime <= r.closeTime) continue;
      await prisma.closedTrade.update({
        where: { id: r.id },
        data: { openTime: new Date(r.openTime.getTime() - offsetMs) },
      });
      fixed += 1;
    }
  }

  if (fixed > 0) {
    console.log(`[TradeHistory] repaired ${fixed} open time(s) left behind by the position-diff fallback`);
  }
};

/**
 * The symbols this user has actually closed a trade on.
 *
 * The symbol filter was a free-text box, which asks people to remember and
 * spell what their own EAs trade — and answers an empty list if they get it
 * wrong. The set is small and we already hold it, so it can just be offered.
 */
export const getTradedSymbols = async (
  userId: string,
  accountId?: string,
): Promise<string[]> => {
  const where: Record<string, unknown> = {
    OR: [
      { account: { userId, isDemo: false } },
      { accountId: null, userId, accountIsDemo: false },
    ],
  };
  if (accountId) where.accountId = accountId;

  const rows = await prisma.closedTrade.findMany({
    where,
    select: { symbol: true },
    distinct: ['symbol'],
    orderBy: { symbol: 'asc' },
  });
  return rows.map(r => r.symbol).filter(Boolean);
};

/** The owner and the account details a detached row has to carry on its own. */
export const accountSnapshot = async (accountId: string) => {
  const a = await prisma.account.findUnique({
    where: { id: accountId },
    select: { userId: true, name: true, currency: true, isDemo: true },
  });
  return {
    userId: a?.userId ?? null,
    accountName: a?.name ?? null,
    accountCurrency: a?.currency ?? null,
    accountIsDemo: a?.isDemo ?? false,
  };
};

/**
 * Store the closing deals the EA reported.
 *
 * Keyed on the *deal* ticket, not the position id. A position closed in parts
 * produces one deal per part and they all share the position id, so the old key
 * made Friday's half overwrite Wednesday's — Wednesday silently lost its
 * profit, and the total came out as the last part alone.
 *
 * Rows written under the old key have no deal ticket. The first deal of a
 * position adopts such a row rather than inserting beside it, so the change
 * does not double-count anything already stored; the second and later parts
 * find it taken and insert as their own rows, which is what they always
 * should have been.
 */
export const recordClosedDeals = async (
  accountId: string,
  deals: ClosedDeal[],
  brokerOffsetSec: number = 7200,
): Promise<void> => {
  const snapshot = await accountSnapshot(accountId);

  for (const deal of deals) {
    try {
      const values = {
        profit: deal.profit,
        swap: deal.swap,
        commission: deal.commission,
        closePrice: deal.closePrice,
        closeTime: mt5TimeToUtc(deal.closeTime, brokerOffsetSec),
        // Was missing, and it is how the impossible rows were spotted: the
        // fallback writes the open time without subtracting the broker offset,
        // and nothing here ever corrected it, so a trade held ten minutes came
        // out opening three hours after it closed.
        openTime: mt5TimeToUtc(deal.openTime, brokerOffsetSec),
        source: 'deal',
        ...snapshot,
      };

      const existing = await prisma.closedTrade.findFirst({
        where: { accountId, dealTicket: deal.ticket },
        select: { id: true },
      });

      if (existing) {
        await prisma.closedTrade.update({ where: { id: existing.id }, data: values });
      } else {
        const legacy = await prisma.closedTrade.findFirst({
          where: { accountId, ticket: deal.positionId, dealTicket: null },
          select: { id: true },
        });

        if (legacy) {
          await prisma.closedTrade.update({
            where: { id: legacy.id },
            data: { ...values, dealTicket: deal.ticket },
          });
        } else {
          await prisma.closedTrade.create({
            data: {
              accountId,
              dealTicket: deal.ticket,
              ticket: deal.positionId,
              symbol: deal.symbol,
              type: TYPE_MAP[deal.type] ?? 'BUY',
              lots: deal.lots,
              openPrice: deal.openPrice,
              sl: 0,
              tp: 0,
              ...values,
            },
          });
        }
      }
      const net = deal.profit + deal.swap + deal.commission;
      console.log(`[TradeHistory] Deal #${deal.positionId} ${deal.symbol} net: ${net.toFixed(2)} (profit:${deal.profit} swap:${deal.swap} comm:${deal.commission})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      console.error(`[TradeHistory] Error recording deal #${deal.positionId}:`, msg);
    }
  }
};

interface TradeQueryParams {
  page?: number;
  limit?: number;
  symbol?: string;
  type?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Get trade history for a user, optionally filtered by account.
 */
export const getTradeHistory = async (
  userId: string,
  accountId?: string,
  params: TradeQueryParams = {},
) => {
  const { page = 1, limit = 25, symbol, type, sortBy = 'closeTime', sortDir = 'desc', dateFrom, dateTo } = params;

  // Exactly the population the calendar counts, so a day here and a cell there
  // are the same set of trades: no demo accounts, and rows whose account has
  // since been removed are still the user's own history.
  const where: Record<string, unknown> = {
    OR: [
      { account: { userId, isDemo: false } },
      { accountId: null, userId, accountIsDemo: false },
    ],
  };
  if (accountId) where.accountId = accountId;
  if (symbol) where.symbol = { contains: symbol };
  if (type) where.type = type;
  if (dateFrom || dateTo) {
    /**
     * A date means the broker's date, so that filtering this page to one day
     * and reading that day's calendar cell give the same set of trades — which
     * is the point of being able to filter it at all. Only exact for a single
     * account, since only then is there one broker clock to read; across
     * accounts the bounds stay UTC and a trade near midnight can fall either
     * side.
     */
    let shiftMs = 0;
    if (accountId) {
      const a = await prisma.account.findUnique({
        where: { id: accountId },
        select: { brokerTimeOffset: true },
      });
      shiftMs = (a?.brokerTimeOffset ?? 0) * 1000;
    }
    const at = (iso: string, endOfDay = false): Date =>
      new Date(new Date(iso + (endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z')).getTime() - shiftMs);

    where.closeTime = {
      ...(dateFrom ? { gte: at(dateFrom) } : {}),
      ...(dateTo   ? { lte: at(dateTo, true) } : {}),
    };
  }

  const [rows, total] = await Promise.all([
    prisma.closedTrade.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * limit,
      take: limit,
      include: { account: { select: { name: true, broker: true, currency: true } } },
    }),
    prisma.closedTrade.count({ where }),
  ]);

  /**
   * `profit` alone is the raw figure in the account's own currency, and on a
   * cent account that is a hundred times the dollar. Summing a column of those
   * across accounts — which is what the page's total did — adds cents to
   * dollars. `net` is the whole trade (profit, swap and commission, the same
   * definition the calendar uses) and `profitUsd` is that converted, so a
   * total over any mix of accounts means something.
   */
  const trades = rows.map(t => {
    const net = t.profit + t.swap + t.commission;
    return {
      ...t,
      currency: t.account?.currency ?? t.accountCurrency ?? 'USD',
      net: parseFloat(net.toFixed(2)),
      profitUsd: parseFloat(toUsd(net, t.account?.currency ?? t.accountCurrency ?? 'USD').toFixed(2)),
    };
  });

  return { trades, total, page, limit };
};

/**
 * Clean trades older than MAX_AGE_DAYS.
 */
export const cleanOldTrades = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.closedTrade.deleteMany({
    where: { closeTime: { lt: cutoff } },
  });
  if (result.count > 0) {
    console.log(`[TradeHistory] Cleaned ${result.count} old trades`);
  }
  return result.count;
};
