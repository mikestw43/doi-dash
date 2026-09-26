import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { usageThisMonth } from '../services/aiUsage';
import { aiPrices } from '../services/aiSettings';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth';
import { runtimeStore } from '../services/runtimeStore';
import { logAudit } from '../services/auditLogger';
import { sendEmail, siteUrl } from '../services/emailService';
import { accountApprovedEmail, accountRejectedEmail } from '../services/emailTemplates';

const router = Router();
router.use(authMiddleware);
router.use(adminMiddleware);

// GET /api/admin/users
router.get('/users', async (_req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, name: true, displayName: true,
      mobile: true, phoneCountry: true,
      role: true, status: true,
      aiEnabled: true, aiDailyLimit: true,
      createdAt: true, lastLoginAt: true,
      // Not the hash itself — only whether there is one. A Google-only account
      // has none, which is why a password reset can do nothing for it.
      password: true,
      googleId: true,
      _count: { select: { accounts: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(users.map(({ password, googleId, ...u }) => ({
    ...u,
    signIn: password && googleId ? 'both' : googleId ? 'google' : password ? 'password' : 'none',
  })));
});

/**
 * PATCH /api/admin/users/:id/ai
 *
 * Who may ask the assistant, and how often. Off by default for everyone
 * but an admin, because every question is paid for by whoever owns the
 * API key — the person running this dashboard.
 */
router.patch('/users/:id/ai', async (req: AuthRequest, res: Response) => {
  const body = req.body as { enabled?: unknown; dailyLimit?: unknown };
  const id = String(req.params.id);

  const user = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const limit = body.dailyLimit === undefined ? undefined : Number(body.dailyLimit);
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 0 || limit > 10000)) {
    res.status(400).json({ error: 'The daily limit must be a number between 0 and 10000 (0 means no limit).' });
    return;
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(body.enabled !== undefined && { aiEnabled: !!body.enabled }),
      ...(limit !== undefined && { aiDailyLimit: Math.round(limit) }),
    },
    select: { id: true, aiEnabled: true, aiDailyLimit: true },
  });

  logAudit(req.user!.id, 'change_ai_access', 'user', id,
    JSON.stringify({ email: user.email, enabled: updated.aiEnabled, dailyLimit: updated.aiDailyLimit }));

  res.json(updated);
});

/**
 * GET /api/admin/ai-usage
 *
 * This month, per person: questions asked and tokens spent, with today's
 * count so a daily limit can be read against something. The money is an
 * estimate from a price an admin sets, since only the provider's own bill
 * is the truth.
 */
router.get('/ai-usage', async (_req: AuthRequest, res: Response) => {
  const [rows, prices] = await Promise.all([usageThisMonth(), aiPrices()]);
  res.json({ usage: rows, prices });
});

// GET /api/admin/email-log
//
// What the mail system has been doing, so an admin with a phone can see why a
// message did or did not arrive. The server log says the same thing, and a
// phone cannot read the server log.
router.get('/email-log', async (_req: AuthRequest, res: Response) => {
  const rows = await prisma.emailLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(rows);
});

const ALLOWED_ROLES = ['user', 'vip', 'admin'] as const;

// POST /api/admin/users
router.post('/users', async (req: AuthRequest, res: Response) => {
  const { email, password, name, displayName, mobile, phoneCountry, role } = req.body as {
    email: string; password: string;
    name?: string; displayName?: string;
    mobile?: string; phoneCountry?: string; role?: string;
  };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }
  const finalRole = role || 'user';
  if (!ALLOWED_ROLES.includes(finalRole as typeof ALLOWED_ROLES[number])) {
    res.status(400).json({ error: `Role must be one of: ${ALLOWED_ROLES.join(', ')}` });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Email already in use' });
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email, password: hash,
      name: name || null,
      displayName: displayName || null,
      mobile: mobile || null,
      phoneCountry: phoneCountry || null,
      role: finalRole,
      status: 'active', // Admin-created users are active immediately
    },
  });

  logAudit(req.user!.id, 'create_user', 'user', user.id,
    JSON.stringify({ email, role: finalRole }));

  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', async (req: AuthRequest, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Generate a memorable but secure random password (12 chars, mixed)
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let newPassword = '';
  for (let i = 0; i < 12; i++) {
    newPassword += charset[Math.floor(Math.random() * charset.length)];
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id }, data: { password: hash } });

  logAudit(req.user!.id, 'reset_password', 'user', id,
    JSON.stringify({ email: user.email }));

  res.json({ newPassword, message: 'Password reset. Copy and share with user securely.' });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (id === req.user!.id) {
    res.status(400).json({ error: 'Cannot delete yourself' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  await prisma.user.delete({ where: { id } });
  runtimeStore.removeUserAccounts(id);

  logAudit(req.user!.id, 'delete_user', 'user', id,
    JSON.stringify({ email: user.email }));

  res.json({ message: 'User deleted' });
});

// PATCH /api/admin/users/:id/role
router.patch('/users/:id/role', async (req: AuthRequest, res: Response) => {
  const { role } = req.body as { role: string };
  if (!role || !ALLOWED_ROLES.includes(role as typeof ALLOWED_ROLES[number])) {
    res.status(400).json({ error: `Role must be one of: ${ALLOWED_ROLES.join(', ')}` });
    return;
  }

  const paramId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = await prisma.user.findUnique({ where: { id: paramId } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: paramId },
    data: { role },
  });

  logAudit(req.user!.id, 'change_role', 'user', paramId,
    JSON.stringify({ email: user.email, oldRole: user.role, newRole: role }));

  res.json({ id: updated.id, email: updated.email, role: updated.role });
});

// PATCH /api/admin/users/:id/status
router.patch('/users/:id/status', async (req: AuthRequest, res: Response) => {
  const { status } = req.body as { status: string };
  if (!status || !['active', 'pending', 'rejected', 'suspended'].includes(status)) {
    res.status(400).json({ error: 'Status must be active, pending, rejected, or suspended' });
    return;
  }
  const paramId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = await prisma.user.findUnique({ where: { id: paramId } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const updated = await prisma.user.update({
    where: { id: paramId },
    data: { status },
  });
  logAudit(req.user!.id, 'change_status', 'user', paramId,
    JSON.stringify({ email: user.email, oldStatus: user.status, newStatus: status }));

  // Tell them the decision. Only on the move out of pending: somebody waiting
  // to be let in is owed an answer, while suspending or reinstating an account
  // that is already in use is a different conversation and not one to open
  // with an automated mail. Not awaited, and it cannot throw — the decision is
  // already saved and must not be held up, or undone, by the mail.
  if (user.status === 'pending' && status === 'active') {
    sendEmail(user.email, accountApprovedEmail(user.name, siteUrl()), 'approval');
  } else if (user.status === 'pending' && status === 'rejected') {
    sendEmail(user.email, accountRejectedEmail(user.name, siteUrl()), 'rejection');
  }

  res.json({ id: updated.id, email: updated.email, status: updated.status });
});

export default router;
