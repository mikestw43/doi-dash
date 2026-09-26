import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { runtimeStore } from '../services/runtimeStore';
import prisma from '../lib/prisma';

/**
 * The AI assistant's own routes.
 *
 * No model is wired up yet, on purpose: the screens go in first, and the
 * provider is a later change to one file. What exists here is everything
 * that does not depend on which model answers —
 *
 *   GET  /api/ai/status   whether a provider is configured, so the page can
 *                         say so plainly instead of failing at the first
 *                         question
 *   GET  /api/ai/context  the figures an answer would be built from, which
 *                         is also what the page shows in its header
 *   POST /api/ai/chat     answers 503 with a clear reason until a key exists
 *
 * Nothing here sends anything anywhere. When a provider is added it goes
 * behind one adapter, and swapping it is a change of environment variables:
 *
 *   AI_PROVIDER   anthropic | openai | google | openrouter
 *   AI_MODEL      the model id
 *   AI_API_KEY    the key, which lives on the server and nowhere else
 */

const router = Router();
router.use(authMiddleware);

const provider = () => process.env.AI_PROVIDER || 'anthropic';
const model = () => process.env.AI_MODEL || 'claude-sonnet-5';
const configured = () => !!process.env.AI_API_KEY;

// GET /api/ai/status
router.get('/status', (_req: AuthRequest, res: Response) => {
  res.json({
    configured: configured(),
    provider: provider(),
    // Never the key itself, and not even its tail: this answer goes to a
    // browser.
    model: configured() ? model() : null,
  });
});

// GET /api/ai/context
//
// What the assistant would be told about the portfolio. It is shown in the
// page header so the person can see the assistant is looking at their real
// figures — and, once a model is answering, so a wrong answer can be traced
// to what it was given.
router.get('/context', async (req: AuthRequest, res: Response) => {
  const accounts = runtimeStore.getAccountsByUser(req.user!.id).filter(a => !a.isDemo);

  const openOrders = accounts.flatMap(a =>
    (a.orders ?? []).map(o => ({ ...o, account: a.name, currency: a.currency })));

  const losing = openOrders.filter(o => (o.profit ?? 0) < 0);
  const noStop = openOrders.filter(o => !o.sl);

  const since = new Date(Date.now() - 30 * 864e5);
  const closed = await prisma.closedTrade.count({
    where: { userId: req.user!.id, closeTime: { gte: since } },
  });

  res.json({
    accounts: accounts.length,
    online: accounts.filter(a => a.status === 'online').length,
    openOrders: openOrders.length,
    losingOrders: losing.length,
    ordersWithoutStop: noStop.length,
    floating: Number(accounts.reduce((sum, a) => sum + (a.profit ?? 0), 0).toFixed(2)),
    todayPnl: Number(accounts.reduce((sum, a) => sum + (a.todayPnl ?? 0), 0).toFixed(2)),
    closedTrades30d: closed,
  });
});

// POST /api/ai/chat
router.post('/chat', (_req: AuthRequest, res: Response) => {
  if (!configured()) {
    res.status(503).json({
      error: 'not_configured',
      message: 'No AI provider is connected yet. Add AI_API_KEY on the server to switch this on.',
    });
    return;
  }

  // The provider adapter lands here. Until then this cannot be reached with
  // a key set, so it says what it is rather than pretending to answer.
  res.status(501).json({
    error: 'not_implemented',
    message: 'The chat backend is not built yet — only the screens are.',
  });
});

export default router;
