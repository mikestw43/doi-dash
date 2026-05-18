import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { runtimeStore } from '../services/runtimeStore';
import { toUsd } from '../services/fxService';
import prisma from '../lib/prisma';

const router = Router();
router.use(authMiddleware);

router.get('/overview', (req: AuthRequest, res: Response) => {
  const allAccounts = runtimeStore.getAccountsByUser(req.user!.id);
  // Exclude demo/sandbox accounts from KPI summary
  const accounts = allAccounts.filter(a => !a.isDemo);
  const online = accounts.filter(a => a.status === 'online');
  const offline = accounts.filter(a => a.status === 'offline');

  const totalBalance = accounts.reduce((s, a) => s + toUsd(a.balance, a.currency), 0);
  const totalEquity = accounts.reduce((s, a) => s + toUsd(a.equity, a.currency), 0);
  const totalProfit = accounts.reduce((s, a) => s + toUsd(a.profit, a.currency), 0);
  const totalOpenLots = accounts.reduce((s, a) => s + a.openLots, 0);
  const totalBuyLots = accounts.reduce((s, a) => s + a.buyLots, 0);
  const totalSellLots = accounts.reduce((s, a) => s + a.sellLots, 0);
  const totalPending = accounts.reduce((s, a) => s + a.pendingOrders, 0);

  res.json({
    totalAccounts: accounts.length,
    onlineAccounts: online.length,
    offlineAccounts: offline.length,
    totalBalance: parseFloat(totalBalance.toFixed(2)),
    totalEquity: parseFloat(totalEquity.toFixed(2)),
    totalProfit: parseFloat(totalProfit.toFixed(2)),
    totalOpenLots: parseFloat(totalOpenLots.toFixed(2)),
    totalBuyLots: parseFloat(totalBuyLots.toFixed(2)),
    totalSellLots: parseFloat(totalSellLots.toFixed(2)),
    totalPendingOrders: totalPending,
  });
});

router.get('/heatmap/accounts', (req: AuthRequest, res: Response) => {
  const accounts = runtimeStore.getAccountsByUser(req.user!.id).filter(a => !a.isDemo);
  const data = accounts.map(a => ({
    id: a.id,
    name: a.name,
    broker: a.broker,
    status: a.status,
    balance: a.balance,
    equity: a.equity,
    drawdown: a.drawdown,
    marginLevel: a.marginLevel,
    profit: a.profit,
    currency: a.currency,
  }));
  res.json(data);
});

router.get('/heatmap/orders', (req: AuthRequest, res: Response) => {
  const accounts = runtimeStore.getAccountsByUser(req.user!.id).filter(a => !a.isDemo);
  const orders: object[] = [];
  accounts.forEach(account => {
    account.orders.forEach(order => {
      const openTime = new Date(order.openTime);
      const durationMs = Date.now() - openTime.getTime();
      const durationMin = Math.floor(durationMs / 60000);
      orders.push({
        ...order,
        accountName: account.name,
        accountId: account.id,
        broker: account.broker,
        durationMin,
      });
    });
  });
  res.json(orders);
});

router.get('/heatmap/pending', (req: AuthRequest, res: Response) => {
  const accounts = runtimeStore.getAccountsByUser(req.user!.id).filter(a => !a.isDemo);
  const pending: object[] = [];
  accounts.forEach(account => {
    account.pending.forEach(order => {
      pending.push({
        ...order,
        accountName: account.name,
        accountId: account.id,
        broker: account.broker,
      });
    });
  });
  res.json(pending);
});

// Today's closed P/L per account.
// Prefer EA-reported `todayPnl` (v1.3+ computes it from MT5 history directly).
// Fall back to DB-summed closedTrade rows for accounts that haven't reported one yet
// (older EA builds, or accounts offline since last server restart).
router.get('/today-pnl', async (req: AuthRequest, res: Response) => {
  const accounts = runtimeStore.getAccountsByUser(req.user!.id).filter(a => !a.isDemo);

  const pnlMap: Record<string, number> = {};

  // 1) Trust EA-reported todayPnl when present
  const accountsNeedingFallback: typeof accounts = [];
  for (const a of accounts) {
    if (typeof a.todayPnl === 'number') {
      pnlMap[a.id] = parseFloat(a.todayPnl.toFixed(2));
    } else {
      accountsNeedingFallback.push(a);
    }
  }

  // 2) DB fallback for accounts without an EA-reported value
  if (accountsNeedingFallback.length > 0) {
    const offsetMap = new Map<string, number>();
    for (const a of accountsNeedingFallback) {
      offsetMap.set(a.id, a.brokerTimeOffset ?? 7200);
    }

    const offsets = [...new Set(offsetMap.values())];
    const now = new Date();
    let earliestStart = now;
    for (const offset of offsets) {
      const offsetMs = offset * 1000;
      const brokerNow = new Date(now.getTime() + offsetMs);
      const brokerMidnight = new Date(Date.UTC(
        brokerNow.getUTCFullYear(), brokerNow.getUTCMonth(), brokerNow.getUTCDate()
      ));
      const startUtc = new Date(brokerMidnight.getTime() - offsetMs);
      if (startUtc < earliestStart) earliestStart = startUtc;
    }

    const trades = await prisma.closedTrade.findMany({
      where: {
        closeTime: { gte: earliestStart },
        accountId: { in: accountsNeedingFallback.map(a => a.id) },
      },
      select: { accountId: true, profit: true, swap: true, commission: true, closeTime: true },
    });

    for (const t of trades) {
      const offset = offsetMap.get(t.accountId) ?? 7200;
      const offsetMs = offset * 1000;
      const brokerNow = new Date(now.getTime() + offsetMs);
      const brokerMidnight = new Date(Date.UTC(
        brokerNow.getUTCFullYear(), brokerNow.getUTCMonth(), brokerNow.getUTCDate()
      ));
      const accountStartOfDay = new Date(brokerMidnight.getTime() - offsetMs);

      if (t.closeTime >= accountStartOfDay) {
        pnlMap[t.accountId] = (pnlMap[t.accountId] || 0) + t.profit + t.swap + t.commission;
      }
    }

    for (const a of accountsNeedingFallback) {
      pnlMap[a.id] = parseFloat((pnlMap[a.id] || 0).toFixed(2));
    }
  }

  res.json(pnlMap);
});

// ─── Economic Calendar (ForexFactory proxy) ─────────────────────────────────

interface CalendarCache {
  data: unknown;
  expiry: number;
}

let calendarCache: CalendarCache | null = null;
const CALENDAR_TTL = 30 * 60 * 1000; // 30 minutes

router.get('/economic-calendar', async (_req: AuthRequest, res: Response) => {
  try {
    if (calendarCache && calendarCache.expiry > Date.now()) {
      return res.json(calendarCache.data);
    }

    const response = await fetch(
      'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
      {
        headers: {
          'User-Agent': 'SENTINEL/2.0',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      throw new Error(`ForexFactory responded with HTTP ${response.status}`);
    }

    const data = await response.json();
    calendarCache = { data, expiry: Date.now() + CALENDAR_TTL };
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Calendar] Fetch failed:', msg);
    // Return stale cache if available rather than an error
    if (calendarCache) {
      return res.json(calendarCache.data);
    }
    res.status(502).json({ error: `Failed to fetch economic calendar: ${msg}` });
  }
});

export default router;
