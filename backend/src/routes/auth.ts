import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { generateToken, authMiddleware, AuthRequest } from '../middleware/auth';
import { sendTelegramMessage } from '../services/telegramService';
import { logAudit } from '../services/auditLogger';
import { encrypt, decrypt } from '../lib/encryption';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (user.status === 'pending') {
    res.status(403).json({ error: 'Your account is pending admin approval.' });
    return;
  }
  if (user.status === 'rejected') {
    res.status(403).json({ error: 'Your account registration was rejected.' });
    return;
  }
  if (user.status === 'suspended') {
    res.status(403).json({ error: 'Your account has been suspended. Please contact an administrator.' });
    return;
  }

  const token = generateToken({ id: user.id, email: user.email, role: user.role });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  logAudit(user.id, 'login', 'user', user.id);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      displayName: user.displayName,
      mobile: user.mobile,
      phoneCountry: user.phoneCountry,
      timezone: user.timezone,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
  });
});

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, name, displayName, mobile, phoneCountry } = req.body as {
    email: string; password: string; name?: string; displayName?: string;
    mobile?: string; phoneCountry?: string;
  };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Email already in use' });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email, password: hash, name: name || null,
      displayName: displayName || null,
      mobile: mobile || null, phoneCountry: phoneCountry || null,
      role: 'user', status: 'pending',
    },
  });
  res.status(201).json({ message: 'Registration submitted. Please wait for admin approval.' });
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    displayName: user.displayName,
    mobile: user.mobile,
    phoneCountry: user.phoneCountry,
    timezone: user.timezone,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  });
});

// PATCH /api/auth/profile
router.patch('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { name, displayName, email, mobile, phoneCountry, timezone } = req.body as {
    name?: string; displayName?: string; email?: string;
    mobile?: string; phoneCountry?: string; timezone?: string;
  };

  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== req.user!.id) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }
  }

  const updated = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...(name !== undefined && { name }),
      ...(displayName !== undefined && { displayName: displayName || null }),
      ...(email !== undefined && { email }),
      ...(mobile !== undefined && { mobile: mobile || null }),
      ...(phoneCountry !== undefined && { phoneCountry: phoneCountry || null }),
      ...(timezone !== undefined && { timezone }),
    },
  });
  logAudit(req.user!.id, 'update_profile', 'user', req.user!.id,
    JSON.stringify({ name, displayName, email, mobile, phoneCountry, timezone }));
  res.json({
    id: updated.id,
    email: updated.email,
    role: updated.role,
    name: updated.name,
    displayName: updated.displayName,
    mobile: updated.mobile,
    phoneCountry: updated.phoneCountry,
    timezone: updated.timezone,
    createdAt: updated.createdAt,
    lastLoginAt: updated.lastLoginAt,
  });
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current and new password are required' });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    res.status(400).json({ error: 'Current password is incorrect' });
    return;
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
  logAudit(req.user!.id, 'change_password', 'user', req.user!.id);
  res.json({ message: 'Password changed successfully' });
});

// GET /api/auth/telegram — fetch Telegram settings
router.get('/telegram', authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { telegramChatId: true, telegramBotToken: true },
  });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  const rawToken = user.telegramBotToken ? decrypt(user.telegramBotToken) : null;
  res.json({
    telegramChatId: user.telegramChatId,
    telegramBotToken: rawToken
      ? '●●●●●●●●●●' + rawToken.slice(-6)
      : null,
    configured: !!(rawToken && user.telegramChatId),
  });
});

// PATCH /api/auth/telegram — save Telegram settings
router.patch('/telegram', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { telegramBotToken, telegramChatId } = req.body as {
    telegramBotToken?: string;
    telegramChatId?: string;
  };
  const encryptedToken = telegramBotToken ? encrypt(telegramBotToken) : null;
  const updated = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...(telegramBotToken !== undefined && { telegramBotToken: encryptedToken }),
      ...(telegramChatId !== undefined && { telegramChatId: telegramChatId || null }),
    },
  });
  logAudit(req.user!.id, 'update_telegram', 'settings', req.user!.id);
  res.json({
    configured: !!(updated.telegramBotToken && updated.telegramChatId),
    telegramChatId: updated.telegramChatId,
  });
});

// POST /api/auth/telegram/test — send a test message
router.post('/telegram/test', authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { telegramBotToken: true, telegramChatId: true },
  });
  if (!user?.telegramBotToken || !user?.telegramChatId) {
    res.status(400).json({ error: 'Telegram not configured. Save bot token and chat ID first.' });
    return;
  }
  const botToken = decrypt(user.telegramBotToken);
  try {
    await sendTelegramMessage(
      botToken,
      user.telegramChatId,
      '✅ [SENTINEL] Test message — Telegram alerts are working correctly!',
    );
    res.json({ ok: true, message: 'Test message sent successfully' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Telegram Test]', msg);
    res.status(502).json({ error: `Failed to send: ${msg}` });
  }
});

// GET /api/auth/my-data — PDPA: export all personal data
router.get('/my-data', authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      language: true,
      theme: true,
      reportEnabled: true,
      reportFrequency: true,
      reportTime: true,
      reportDay: true,
      createdAt: true,
      updatedAt: true,
      accounts: {
        select: {
          id: true, name: true, broker: true, accountNumber: true, server: true,
          currency: true, leverage: true, createdAt: true,
        },
      },
      accountGroups: { select: { id: true, name: true, color: true } },
      notificationLogs: {
        select: { type: true, message: true, success: true, sentAt: true },
        orderBy: { sentAt: 'desc' },
        take: 100,
      },
      auditLogs: {
        select: { action: true, resourceType: true, details: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      },
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  logAudit(req.user!.id, 'export_data', 'user', req.user!.id);
  res.json({
    exportedAt: new Date().toISOString(),
    notice: 'This is a copy of all personal data stored by SENTINEL.',
    ...user,
    // Sensitive fields excluded: password, telegramBotToken, apiKeys
  });
});

// DELETE /api/auth/my-account — PDPA: self-service account deletion
router.delete('/my-account', authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  // Admins cannot delete themselves if they're the only admin
  if (req.user!.role === 'admin') {
    const adminCount = await prisma.user.count({ where: { role: 'admin' } });
    if (adminCount <= 1) {
      res.status(400).json({ error: 'Cannot delete the only admin account' });
      return;
    }
  }

  logAudit(userId, 'self_delete', 'user', userId);

  // Cascade delete all user data
  await prisma.user.delete({ where: { id: userId } });

  res.json({ message: 'Account and all associated data have been permanently deleted' });
});

export default router;
