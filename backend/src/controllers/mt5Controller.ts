import { Request, Response } from 'express';
import { runtimeStore } from '../services/runtimeStore';
import { broadcastToUser } from '../websocket/broadcaster';
import { checkAlerts, checkOfflineAlert } from '../services/alertService';
import { commandQueue } from '../services/commandQueue';
import { sendCloseAllNotification } from '../services/commandNotifier';
import { detectClosedTrades, recordClosedDeals } from '../services/tradeHistoryService';
import { recordSnapshot } from '../services/equityService';
import { markAsReal, unmarkAsReal } from '../mock/simulator';
import prisma from '../lib/prisma';
import type { Account, Order, PendingOrder } from '../mock/data';

interface MT5PushPayload {
  apiKey: string;
  accountNumber: string;
  name?: string;
  broker?: string;
  server?: string;
  currency?: string;
  leverage?: number;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  profit: number;
  orders: {
    ticket: number;
    symbol: string;
    type: number;
    lots: number;
    openPrice: number;
    currentPrice: number;
    profit: number;
    swap: number;
    commission: number;
    openTime: string;
    sl: number;
    tp: number;
  }[];
  pending: {
    ticket: number;
    symbol: string;
    type: number;
    lots: number;
    openPrice: number;
    sl: number;
    tp: number;
    expiration: string;
  }[];
  brokerTimeOffset?: number;
  todayPnl?: number;
  closedOrdersToday?: number;
  closedDeals?: {
    positionId: number;
    ticket: number;
    symbol: string;
    type: number;
    lots: number;
    openPrice: number;
    closePrice: number;
    profit: number;
    swap: number;
    commission: number;
    openTime: string;
    closeTime: string;
  }[];
}

const ORDER_TYPE_MAP: Record<number, Order['type']> = {
  0: 'BUY',
  1: 'SELL',
};

const PENDING_TYPE_MAP: Record<number, PendingOrder['type']> = {
  2: 'BUY_LIMIT',
  3: 'SELL_LIMIT',
  4: 'BUY_STOP',
  5: 'SELL_STOP',
  6: 'BUY_STOP_LIMIT',
  7: 'SELL_STOP_LIMIT',
};

export const receiveMT5Push = (req: Request, res: Response): void => {
  const payload = req.body as MT5PushPayload;

  if (!payload.apiKey) {
    res.status(400).json({ error: 'apiKey is required' });
    return;
  }

  const result = runtimeStore.findAccountByApiKey(payload.apiKey);

  if (!result) {
    res.status(404).json({ error: 'Account not found. Add it via dashboard first.' });
    return;
  }

  const { account, userId } = result;

  const orders: Order[] = (payload.orders || []).map(o => ({
    ticket: o.ticket,
    symbol: o.symbol,
    type: ORDER_TYPE_MAP[o.type] ?? 'BUY',
    lots: o.lots,
    openPrice: o.openPrice,
    currentPrice: o.currentPrice,
    profit: o.profit,
    swap: o.swap ?? 0,
    commission: o.commission ?? 0,
    openTime: o.openTime,
    sl: o.sl,
    tp: o.tp,
  }));

  const pending: PendingOrder[] = (payload.pending || []).map(p => ({
    ticket: p.ticket,
    symbol: p.symbol,
    type: PENDING_TYPE_MAP[p.type] ?? 'BUY_LIMIT',
    lots: p.lots,
    openPrice: p.openPrice,
    sl: p.sl,
    tp: p.tp,
    expiration: p.expiration || null,
  }));

  const buyLots = orders.filter(o => o.type === 'BUY').reduce((s, o) => s + o.lots, 0);
  const sellLots = orders.filter(o => o.type === 'SELL').reduce((s, o) => s + o.lots, 0);

  // Floating P/L = sum of open positions' profit + swap.
  // Don't trust payload.profit — older EAs compute it as `equity - balance`
  // which incorrectly includes credit bonus when the account has any.
  // Summing the orders payload sidesteps that bug regardless of EA version.
  const floatingProfit = parseFloat(
    orders.reduce((s, o) => s + (o.profit ?? 0) + (o.swap ?? 0), 0).toFixed(2),
  );

  const drawdown = payload.equity < payload.balance
    ? parseFloat(((payload.balance - payload.equity) / payload.balance * 100).toFixed(2))
    : 0;

  const updated: Account = {
    ...account,
    status: 'online',
    balance: payload.balance,
    equity: payload.equity,
    margin: payload.margin,
    freeMargin: payload.freeMargin,
    marginLevel: payload.marginLevel,
    profit: floatingProfit,
    drawdown,
    openLots: parseFloat((buyLots + sellLots).toFixed(2)),
    buyLots: parseFloat(buyLots.toFixed(2)),
    sellLots: parseFloat(sellLots.toFixed(2)),
    pendingOrders: pending.length,
    orders,
    pending,
    // Update runtime fields from MT5 push (always take latest from EA)
    ...(payload.broker && { broker: payload.broker }),
    ...(payload.server && { server: payload.server }),
    ...(payload.leverage && { leverage: payload.leverage }),
    ...(payload.currency && { currency: payload.currency }),
    ...(payload.accountNumber && { accountNumber: payload.accountNumber }),
    ...(payload.brokerTimeOffset != null && { brokerTimeOffset: payload.brokerTimeOffset }),
    ...(payload.todayPnl != null && { todayPnl: parseFloat(payload.todayPnl.toFixed(2)) }),
    ...(payload.closedOrdersToday != null && { closedOrdersToday: payload.closedOrdersToday }),
  };

  // Trace EA-reported today P/L (helps verify EA→backend handoff in prod logs)
  if (payload.todayPnl != null) {
    console.log(
      `[MT5] ${account.name} todayPnl=${payload.todayPnl.toFixed(2)} (${payload.closedOrdersToday ?? 0} deals)`
    );
  }

  // Persist MT5 account details to DB if they were empty (first-time connection)
  const needsDbUpdate =
    (payload.accountNumber && (!account.accountNumber || account.accountNumber === '')) ||
    (payload.broker        && (!account.broker        || account.broker        === '')) ||
    (payload.currency      && (!account.currency      || account.currency      === 'USD')) ||
    (payload.server        && (!account.server        || account.server        === 'Unknown')) ||
    (payload.leverage      && (!account.leverage      || account.leverage      === 100));

  if (needsDbUpdate) {
    prisma.account.update({
      where: { id: account.id },
      data: {
        ...(payload.accountNumber && { accountNumber: payload.accountNumber }),
        ...(payload.broker        && { broker: payload.broker }),
        ...(payload.currency      && { currency: payload.currency }),
        ...(payload.server        && { server: payload.server }),
        ...(payload.leverage      && { leverage: payload.leverage }),
      },
    }).catch(err => console.error('[MT5] Failed to persist account details:', err.message));
  }

  persistSnapshot(updated);

  // Record closed trades: prefer EA-reported deals (exact P/L), fallback to position diff
  if (payload.closedDeals && payload.closedDeals.length > 0) {
    const brokerOffset = payload.brokerTimeOffset ?? 7200;
    console.log(`[TradeHistory] ${account.name} — ${payload.closedDeals.length} closed deal(s) from EA`);
    recordClosedDeals(account.id, payload.closedDeals, brokerOffset)
      .catch(err => console.error('[TradeHistory] recordClosedDeals error:', err.message));
  }
  // Always run position diff detection as fallback (catches trades from old EAs)
  detectClosedTrades(account.id, orders)
    .catch(err => console.error('[TradeHistory] detectClosedTrades error:', err.message));

  runtimeStore.updateAccount(userId, updated);
  broadcastToUser(userId, runtimeStore.getAccountsByUser(userId));

  // Record equity snapshot (sampled 1x/hour)
  recordSnapshot(account.id, payload.equity, payload.balance, drawdown)
    .catch(err => console.error('[Equity] recordSnapshot error:', err.message));

  // Check alert conditions with fresh data
  checkAlerts(userId, runtimeStore.getAccountsByUser(userId))
    .catch(err => console.error('[Alert] checkAlerts error:', err.message));

  markAsReal(account.id);
  resetHeartbeat(account.id, userId);

  // Drain any pending commands for this apiKey
  const commands = commandQueue.drain(payload.apiKey);

  const response: Record<string, unknown> = {
    ok: true,
    accountId: account.id,
    orders: orders.length,
    pending: pending.length,
  };

  if (commands.length > 0) {
    // Send full command payload so EA can execute correctly
    response.commands = commands.map(cmd => {
      const c: Record<string, unknown> = { id: cmd.id, type: cmd.type };
      if (cmd.symbol   != null) c.symbol  = cmd.symbol;
      if (cmd.action   != null) c.action  = cmd.action;
      if (cmd.volume   != null) c.volume  = cmd.volume;
      if (cmd.price    != null) c.price   = cmd.price;
      if (cmd.sl       != null) c.sl      = cmd.sl;
      if (cmd.tp       != null) c.tp      = cmd.tp;
      if (cmd.comment  != null) c.comment = cmd.comment;
      if (cmd.ticket   != null) c.ticket  = cmd.ticket;
      return c;
    });

    for (const cmd of commands) {
      if (cmd.type === 'CLOSE_ALL') {
        sendCloseAllNotification(cmd.userId, account.name, orders.length)
          .catch(err => console.error('[CmdNotify] Telegram send failed:', err.message));
      }
    }

    console.log(`[MT5] Sent ${commands.length} command(s) to ${account.name}: ${commands.map(c => c.type).join(', ')}`);
  }

  res.json(response);
};

/**
 * Write an account's live figures to the DB so they survive an API restart.
 *
 * The EA pushes every 2s; SQLite does not need that. One write per account
 * per SNAPSHOT_INTERVAL_MS is enough to keep the stored copy close, and the
 * heartbeat flushes a final one when the account drops offline so what we
 * keep is the last thing the EA actually reported.
 */
const SNAPSHOT_INTERVAL_MS = 30_000;
const lastSnapshotAt = new Map<string, number>();

const persistSnapshot = (account: Account, force = false): void => {
  const now = Date.now();
  if (!force && now - (lastSnapshotAt.get(account.id) ?? 0) < SNAPSHOT_INTERVAL_MS) return;
  lastSnapshotAt.set(account.id, now);

  prisma.account.update({
    where: { id: account.id },
    data: {
      balance: account.balance,
      equity: account.equity,
      margin: account.margin,
      freeMargin: account.freeMargin,
      marginLevel: account.marginLevel,
      profit: account.profit,
      drawdown: account.drawdown,
      openLots: account.openLots,
      buyLots: account.buyLots,
      sellLots: account.sellLots,
      pendingOrders: account.pendingOrders,
      todayPnl: account.todayPnl ?? null,
      closedOrdersToday: account.closedOrdersToday ?? null,
      brokerTimeOffset: account.brokerTimeOffset ?? null,
      lastPushAt: new Date(),
    },
  }).catch(err => console.error('[MT5] Failed to persist snapshot:', err.message));
};

const heartbeats = new Map<string, ReturnType<typeof setTimeout>>();

const resetHeartbeat = (accountId: string, userId: string): void => {
  const existing = heartbeats.get(accountId);
  if (existing) clearTimeout(existing);

  heartbeats.set(accountId, setTimeout(() => {
    const accounts = runtimeStore.getAccountsByUser(userId);
    const account = accounts.find(a => a.id === accountId);
    if (account && account.status === 'online') {
      console.log(`[MT5] Account ${account.name} went offline (no push for 30s)`);
      const updated: Account = { ...account, status: 'offline' };
      runtimeStore.updateAccount(userId, updated);
      persistSnapshot(updated, true);
      broadcastToUser(userId, runtimeStore.getAccountsByUser(userId));
      // Fire offline alert
      checkOfflineAlert(userId, updated)
        .catch(err => console.error('[Alert] checkOfflineAlert error:', err.message));
      unmarkAsReal(accountId);
    }
    heartbeats.delete(accountId);
  }, 30000));
};
