import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

/**
 * What was sent to the EAs, and what became of it.
 *
 * Every command has been recorded since the day the dashboard learned to
 * send them; there was simply nowhere to look at them. "It says queued"
 * is not an answer when real money is on the other end — the questions
 * are whether the EA picked it up, what the broker said, and if it was
 * refused, by which of the several things that can refuse it.
 *
 * Scoped to the person asking on every query.
 */

const router = Router();
router.use(authMiddleware);

const STATUSES = ['queued', 'sent', 'done', 'failed', 'dropped'] as const;

// GET /api/commands?accountId=&status=&limit=
router.get('/', async (req: AuthRequest, res: Response) => {
  const { accountId, status } = req.query as { accountId?: string; status?: string };
  const limit = Math.min(Number(req.query.limit) || 60, 200);

  const rows = await prisma.commandLog.findMany({
    where: {
      userId: req.user!.id,
      ...(accountId && { accountId }),
      ...(status && STATUSES.includes(status as typeof STATUSES[number]) && { status }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  // The account name, which is what a person recognises — the rows carry
  // an id because that is what the EA speaks.
  const accounts = await prisma.account.findMany({
    where: { userId: req.user!.id },
    select: { id: true, name: true, accountNumber: true, currency: true },
  });
  const byId = new Map(accounts.map(a => [a.id, a]));

  res.json({
    commands: rows.map(r => ({
      commandId: r.commandId,
      accountId: r.accountId,
      account: byId.get(r.accountId)?.name ?? '—',
      accountNumber: byId.get(r.accountId)?.accountNumber ?? null,
      type: r.type,
      detail: r.detail,
      status: r.status,
      result: r.result,
      createdAt: r.createdAt,
      sentAt: r.sentAt,
      settledAt: r.settledAt,
    })),
    accounts: accounts.map(a => ({ id: a.id, name: a.name })),
  });
});

export default router;
