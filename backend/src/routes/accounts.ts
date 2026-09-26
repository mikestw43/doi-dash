import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { runtimeStore } from '../services/runtimeStore';
import { commandQueue } from '../services/commandQueue';
import { logAudit } from '../services/auditLogger';
import { isReal } from '../mock/simulator';
import { broadcastToUser } from '../websocket/broadcaster';
import prisma from '../lib/prisma';
import type { Account } from '../mock/data';

const router = Router();

router.use(authMiddleware);

router.get('/', (req: AuthRequest, res: Response) => {
  const accounts = runtimeStore.getAccountsByUser(req.user!.id);
  const masked = accounts.map(acc => ({
    ...acc,
    apiKey: '●●●●' + acc.apiKey.slice(-6),
    orders: acc.orders.length,
    pending: acc.pending.length,
  }));
  res.json(masked);
});

// Account limits by role
const ACCOUNT_LIMITS: Record<string, number | null> = {
  user: 1,        // Free tier: 1 account
  vip: null,      // Unlimited
  admin: null,    // Unlimited
};

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, broker, accountNumber, apiKey, server, currency, leverage, groupId, isDemo } = req.body as {
      name: string; broker: string; accountNumber: string;
      apiKey: string; server: string; currency: string; leverage: number; groupId?: string; isDemo?: boolean;
    };

    if (!name || !apiKey) {
      res.status(400).json({ error: 'name and apiKey are required' });
      return;
    }

    // Enforce account limit by role
    const role = req.user!.role || 'user';
    const limit = ACCOUNT_LIMITS[role];
    if (limit !== null && limit !== undefined) {
      const existingCount = await prisma.account.count({ where: { userId: req.user!.id } });
      if (existingCount >= limit) {
        res.status(403).json({
          error: `Account limit reached (${limit} for ${role.toUpperCase()} role). Upgrade to VIP for unlimited accounts.`,
        });
        return;
      }
    }

    const newAccount = await runtimeStore.addAccount(req.user!.id, {
      name,
      broker: broker || '',
      accountNumber: accountNumber || '',
      apiKey,
      server: server || 'Unknown',
      currency: currency || 'USD',
      leverage: leverage || 100,
      groupId: groupId || undefined,
      isDemo: isDemo ?? false,
    });
    logAudit(req.user!.id, 'create_account', 'account', newAccount.id,
      JSON.stringify({ name, broker, accountNumber }));

    // Return full API key on creation (only chance to see it — will be masked after this)
    res.status(201).json(newAccount);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[accounts] POST / failed:', message);
    res.status(500).json({ error: `Failed to create account: ${message}` });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const success = await runtimeStore.removeAccount(req.user!.id, id);
  if (success) {
    logAudit(req.user!.id, 'delete_account', 'account', id);
    res.json({ message: 'Account deleted' });
  } else {
    res.status(404).json({ error: 'Account not found' });
  }
});

router.post('/:id/close-all', (req: AuthRequest, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const accounts = runtimeStore.getAccountsByUser(req.user!.id);
  const account = accounts.find(a => a.id === id);

  if (!account || account.status === 'offline') {
    res.status(404).json({ error: 'Account not found or offline' });
    return;
  }

  const orderCount = account.orders.length;
  const pendingCount = account.pending.length;

  logAudit(req.user!.id, 'close_all', 'account', id,
    JSON.stringify({ accountName: account.name, openOrders: orderCount }));

  // Check if this is a real MT5 account or a simulated one
  if (isReal(id)) {
    // Real account: enqueue command — delivered to the EA on next push (~2s)
    commandQueue.enqueue(account.apiKey, {
      type: 'CLOSE_ALL',
      accountId: id,
      userId: req.user!.id,
    });
    res.json({ message: 'Close all command queued', accountId: id, mode: 'queued' });
  } else {
    // Simulated account: execute immediately in memory
    const updated: Account = {
      ...account,
      orders: [],
      pending: [],
      profit: 0,
      equity: account.balance,
      margin: 0,
      freeMargin: account.balance,
      marginLevel: 9999,
      drawdown: 0,
      openLots: 0,
      buyLots: 0,
      sellLots: 0,
      pendingOrders: 0,
    };
    runtimeStore.updateAccount(req.user!.id, updated);
    broadcastToUser(req.user!.id, runtimeStore.getAccountsByUser(req.user!.id));

    console.log(`[CloseAll] Simulated CLOSE_ALL for ${account.name}: cleared ${orderCount} orders + ${pendingCount} pending`);
    res.json({
      message: `Closed ${orderCount} orders, deleted ${pendingCount} pending`,
      accountId: id,
      mode: 'immediate',
      closed: orderCount,
      deleted: pendingCount,
    });
  }
});

// POST /api/accounts/:id/open-trade — queue an open trade command to the EA
router.post('/:id/open-trade', (req: AuthRequest, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { symbol, action, volume, orderType, price, sl, tp } = req.body as {
    symbol: string;
    action: 'BUY' | 'SELL';
    volume: number;
    orderType?: 'market' | 'limit' | 'stop';
    price?: number;
    sl?: number;
    tp?: number;
  };

  if (!symbol || !action || !volume) {
    res.status(400).json({ error: 'symbol, action, and volume are required' });
    return;
  }
  if (action !== 'BUY' && action !== 'SELL') {
    res.status(400).json({ error: 'action must be BUY or SELL' });
    return;
  }

  // An older client sends no orderType and means market unless it sent a
  // price, which is how this worked before limit and stop were told apart.
  const kind = orderType ?? ((price ?? 0) > 0 ? 'limit' : 'market');
  if (kind !== 'market' && kind !== 'limit' && kind !== 'stop') {
    res.status(400).json({ error: 'orderType must be market, limit or stop' });
    return;
  }
  if (kind !== 'market' && !(price && price > 0)) {
    res.status(400).json({ error: `A ${kind} order needs a price` });
    return;
  }

  const accounts = runtimeStore.getAccountsByUser(req.user!.id);
  const account = accounts.find(a => a.id === id);

  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  if (account.status === 'offline') {
    res.status(400).json({ error: 'Account is offline' });
    return;
  }
  if (!isReal(id)) {
    res.status(400).json({ error: 'Cannot trade on simulated accounts' });
    return;
  }

  const cmd = commandQueue.enqueue(account.apiKey, {
    type: 'OPEN_TRADE',
    accountId: id,
    userId: req.user!.id,
    symbol,
    action,
    volume,
    orderType: kind,
    price: kind === 'market' ? 0 : price ?? 0,
    sl: sl ?? 0,
    tp: tp ?? 0,
    // Fixed on purpose. The comment is how a position opened from here is
    // recognised in MT5; letting it be edited only creates positions nobody
    // can account for later.
    comment: 'OnlyFunds',
  });

  logAudit(req.user!.id, 'open_trade', 'account', id,
    JSON.stringify({ symbol, action, volume, orderType: kind, price, sl, tp }));

  res.json({ message: 'Open trade command queued', commandId: cmd.id });
});

// POST /api/accounts/:id/close-position — close a single position by ticket
router.post('/:id/close-position', (req: AuthRequest, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { ticket } = req.body as { ticket: number };

  if (!ticket) {
    res.status(400).json({ error: 'ticket is required' });
    return;
  }

  const accounts = runtimeStore.getAccountsByUser(req.user!.id);
  const account = accounts.find(a => a.id === id);

  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  if (account.status === 'offline') {
    res.status(400).json({ error: 'Account is offline' });
    return;
  }
  if (!isReal(id)) {
    res.status(400).json({ error: 'Cannot close positions on simulated accounts' });
    return;
  }

  const cmd = commandQueue.enqueue(account.apiKey, {
    type: 'CLOSE_POSITION',
    accountId: id,
    userId: req.user!.id,
    ticket,
  });

  logAudit(req.user!.id, 'close_position', 'account', id, JSON.stringify({ ticket }));
  res.json({ message: 'Close position command queued', commandId: cmd.id });
});

// POST /api/accounts/:id/set-sltp — modify SL/TP for a single position
router.post('/:id/set-sltp', (req: AuthRequest, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { ticket, sl, tp } = req.body as { ticket: number; sl: number; tp: number };

  if (!ticket) {
    res.status(400).json({ error: 'ticket is required' });
    return;
  }

  const accounts = runtimeStore.getAccountsByUser(req.user!.id);
  const account = accounts.find(a => a.id === id);

  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  if (account.status === 'offline') {
    res.status(400).json({ error: 'Account is offline' });
    return;
  }
  if (!isReal(id)) {
    res.status(400).json({ error: 'Cannot modify positions on simulated accounts' });
    return;
  }

  const cmd = commandQueue.enqueue(account.apiKey, {
    type: 'SET_SLTP',
    accountId: id,
    userId: req.user!.id,
    ticket,
    sl: sl ?? 0,
    tp: tp ?? 0,
  });

  logAudit(req.user!.id, 'set_sltp', 'account', id, JSON.stringify({ ticket, sl, tp }));
  res.json({ message: 'Set SL/TP command queued', commandId: cmd.id });
});

// GET /api/accounts/:id/symbols — what this account can be asked to trade
//
// Every symbol the broker has shown us for this account: what is open now,
// what is waiting as a pending order, and everything closed in the stored
// history. That is not the broker's whole Market Watch — the reporter EA
// does not send one — but it is every instrument this account has actually
// touched, which is what someone typing into the box is reaching for.
// The field stays free text, so a symbol we have never seen can still be
// typed in full.
router.get('/:id/symbols', async (req: AuthRequest, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const account = runtimeStore.getAccountsByUser(req.user!.id).find(a => a.id === id);
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  const live = [
    ...(account.orders ?? []).map(o => o.symbol),
    ...(account.pending ?? []).map(o => o.symbol),
  ];

  const traded = await prisma.closedTrade.findMany({
    where: { accountId: id },
    select: { symbol: true },
    distinct: ['symbol'],
  });

  const symbols = [...new Set([...live, ...traded.map(t => t.symbol)])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  res.json({ symbols });
});

// GET /api/accounts/:id/apikey — reveal full API key (for copy)
router.get('/:id/apikey', async (req: AuthRequest, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const dbAccount = await prisma.account.findFirst({
    where: { id, userId: req.user!.id },
    select: { apiKey: true },
  });
  if (!dbAccount) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  res.json({ apiKey: dbAccount.apiKey });
});

// GET /api/accounts/:id/alerts — fetch alert thresholds
router.get('/:id/alerts', async (req: AuthRequest, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const dbAccount = await prisma.account.findFirst({
    where: { id, userId: req.user!.id },
    select: {
      id: true,
      alertDrawdown: true,
      alertEquityBelow: true,
      alertMarginLevel: true,
      alertOffline: true,
    },
  });
  if (!dbAccount) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  res.json(dbAccount);
});

// PATCH /api/accounts/:id/alerts — save alert thresholds
router.patch('/:id/alerts', async (req: AuthRequest, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { alertDrawdown, alertEquityBelow, alertMarginLevel, alertOffline } = req.body as {
    alertDrawdown?: number | null;
    alertEquityBelow?: number | null;
    alertMarginLevel?: number | null;
    alertOffline?: boolean;
  };

  // Verify account belongs to this user
  const dbAccount = await prisma.account.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!dbAccount) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  const updated = await prisma.account.update({
    where: { id },
    data: {
      ...(alertDrawdown !== undefined && { alertDrawdown }),
      ...(alertEquityBelow !== undefined && { alertEquityBelow }),
      ...(alertMarginLevel !== undefined && { alertMarginLevel }),
      ...(alertOffline !== undefined && { alertOffline }),
    },
    select: {
      id: true,
      alertDrawdown: true,
      alertEquityBelow: true,
      alertMarginLevel: true,
      alertOffline: true,
    },
  });

  logAudit(req.user!.id, 'update_alerts', 'account', id, JSON.stringify(updated));

  res.json(updated);
});

export default router;
