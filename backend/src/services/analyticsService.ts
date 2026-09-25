import prisma from '../lib/prisma';
import { toUsd } from './fxService';

export interface DailyPnL {
  date: string;
  profit: number;
  trades: number;
  /** True when every account's figure for this day came from MT5 itself.
   *  False means at least one account's day had to be rebuilt from the trades
   *  we stored, which is an estimate and can disagree with the terminal. */
  verified: boolean;
}

export interface PerformanceMetrics {
  totalTrades: number;
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  grossProfit: number;
  grossLoss: number;
}

type Period = '1M' | '3M' | '6M';

const PERIOD_DAYS: Record<Period, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
};

/** YYYY-MM-DD for a Date as observed in the given IANA timezone.
 *  Used only for accounts that have never reported a broker offset. */
const dateKeyInTz = (d: Date, tz: string): string => {
  const parts: Record<string, string> = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d).forEach(p => { parts[p.type] = p.value; });
  return `${parts.year}-${parts.month}-${parts.day}`;
};

/** YYYY-MM-DD as the broker's own clock reads it. */
const dateKeyAtOffset = (d: Date, offsetSec: number): string =>
  new Date(d.getTime() + offsetSec * 1000).toISOString().slice(0, 10);

/**
 * Get daily P&L summary from closed trades.
 *
 * A day is the *broker's* day, taken from each account's own reported offset.
 * It used to be the user's day (Asia/Bangkok), which put the boundary 4–5
 * hours earlier than the broker's: a calendar cell for Friday began at 19:00
 * on the broker's Thursday and swallowed the last hours of the New York
 * session, so the figure never matched what MT5 showed for that date. Checking
 * a day against MT5 is the whole point of the view, so the broker wins.
 *
 * With several brokers this means each trade lands on the day *its* broker
 * calls it, and two brokers an hour apart can split a cell boundary. That is
 * the price of every single-account view agreeing with its own terminal, and
 * it is worth paying.
 *
 * Net per-trade P/L = profit + swap + commission.
 * Demo accounts are excluded per project rule.
 */
export const getDailyPnL = async (
  userId: string,
  accountId?: string,
  period: Period = '3M',
  timezone: string = 'Asia/Bangkok',
): Promise<DailyPnL[]> => {
  const cutoff = new Date(Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000);

  // Rows whose account is gone keep the owner and the account details they
  // were written with, so they stay in the record instead of disappearing
  // from months that already happened.
  const ownership = [
    { account: { userId, isDemo: false } },
    { accountId: null, userId, accountIsDemo: false },
  ];

  const where: Record<string, unknown> = { closeTime: { gte: cutoff }, OR: ownership };
  if (accountId) where.accountId = accountId;

  const dayWhere: Record<string, unknown> = {
    brokerDate: { gte: cutoff.toISOString().slice(0, 10) },
    OR: ownership,
  };
  if (accountId) dayWhere.accountId = accountId;

  const [trades, days] = await Promise.all([
    prisma.closedTrade.findMany({
      where,
      select: {
        profit: true,
        swap: true,
        commission: true,
        closeTime: true,
        accountId: true,
        accountCurrency: true,
        account: { select: { currency: true, brokerTimeOffset: true } },
      },
      orderBy: { closeTime: 'asc' },
    }),
    prisma.dailyPnl.findMany({
      where: dayWhere,
      select: {
        accountId: true,
        brokerDate: true,
        netProfit: true,
        deals: true,
        accountCurrency: true,
        account: { select: { currency: true } },
      },
    }),
  ]);

  // MT5's own figure wins for any (account, day) it covers. Adding up the
  // trades we stored is the fallback for days the EA never reported — days
  // before this was kept, or a day an account spent offline.
  const authoritative = new Set(days.map(d => `${d.accountId ?? ''}|${d.brokerDate}`));

  type Cell = { profit: number; trades: number; verified: boolean };
  const dailyMap = new Map<string, Cell>();
  const add = (date: string, profitUsd: number, count: number, verified: boolean) => {
    const cell = dailyMap.get(date) || { profit: 0, trades: 0, verified: true };
    cell.profit += profitUsd;
    cell.trades += count;
    cell.verified = cell.verified && verified;
    dailyMap.set(date, cell);
  };

  for (const d of days) {
    add(
      d.brokerDate,
      toUsd(d.netProfit, d.account?.currency || d.accountCurrency || 'USD'),
      d.deals,
      true,
    );
  }

  for (const t of trades) {
    const offset = t.account?.brokerTimeOffset;
    const date = offset === null || offset === undefined
      ? dateKeyInTz(t.closeTime, timezone)
      : dateKeyAtOffset(t.closeTime, offset);
    if (authoritative.has(`${t.accountId ?? ''}|${date}`)) continue;
    const net = t.profit + t.swap + t.commission;
    add(date, toUsd(net, t.account?.currency || t.accountCurrency || 'USD'), 1, false);
  }

  return Array.from(dailyMap.entries()).map(([date, v]) => ({
    date,
    profit: parseFloat(v.profit.toFixed(2)),
    trades: v.trades,
    verified: v.verified,
  }));
};

/**
 * Calculate performance metrics from closed trades.
 */
export const getPerformanceMetrics = async (
  userId: string,
  accountId?: string,
): Promise<PerformanceMetrics> => {
  const where: Record<string, unknown> = {
    OR: [
      { account: { userId, isDemo: false } },
      { accountId: null, userId, accountIsDemo: false },
    ],
  };
  if (accountId) where.accountId = accountId;

  const trades = await prisma.closedTrade.findMany({
    where,
    select: { profit: true },
  });

  const totalTrades = trades.length;
  if (totalTrades === 0) {
    return {
      totalTrades: 0, winRate: 0, avgProfit: 0, avgLoss: 0,
      profitFactor: 0, maxDrawdown: 0, grossProfit: 0, grossLoss: 0,
    };
  }

  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.profit, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.profit, 0));

  const winRate = (wins.length / totalTrades) * 100;
  const avgProfit = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Max drawdown from equity snapshots
  let maxDrawdown = 0;
  const snapWhere: Record<string, unknown> = { account: { userId, isDemo: false } };
  if (accountId) snapWhere.accountId = accountId;

  const snapshots = await prisma.equitySnapshot.findMany({
    where: snapWhere,
    select: { drawdown: true },
    orderBy: { timestamp: 'asc' },
  });

  for (const s of snapshots) {
    if (s.drawdown > maxDrawdown) maxDrawdown = s.drawdown;
  }

  return {
    totalTrades,
    winRate: parseFloat(winRate.toFixed(1)),
    avgProfit: parseFloat(avgProfit.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    profitFactor: profitFactor === Infinity ? 999 : parseFloat(profitFactor.toFixed(2)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    grossProfit: parseFloat(grossProfit.toFixed(2)),
    grossLoss: parseFloat(grossLoss.toFixed(2)),
  };
};
