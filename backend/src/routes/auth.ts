import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../lib/prisma';
import { generateToken, authMiddleware, AuthRequest } from '../middleware/auth';
import { sendTelegramMessage } from '../services/telegramService';
import { logAudit } from '../services/auditLogger';
import { encrypt, decrypt } from '../lib/encryption';
import crypto from 'node:crypto';
import { sendEmail, siteUrl, recordEmailSkipped } from '../services/emailService';
import { passwordResetEmail, googleSignInEmail } from '../services/emailTemplates';

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

/** Shape returned to the client after any successful login/register flow.
 *  Kept in sync with frontend AuthUser type. */
const publicUser = (u: {
  id: string; email: string; role: string;
  name: string | null; displayName: string | null;
  mobile: string | null; phoneCountry: string | null;
  timezone: string; avatarUrl?: string | null;
  password?: string | null; googleId?: string | null;
  createdAt: Date; lastLoginAt: Date | null;
}) => ({
  id: u.id, email: u.email, role: u.role,
  name: u.name, displayName: u.displayName,
  mobile: u.mobile, phoneCountry: u.phoneCountry,
  timezone: u.timezone, avatarUrl: u.avatarUrl ?? null,
  hasPassword: !!u.password,
  hasGoogleLinked: !!u.googleId,
  createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // A Google-only user has password = null — they must use the Google button.
  if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
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
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  logAudit(user.id, 'login', 'user', user.id);
  res.json({ token, user: publicUser(updated) });
});

// POST /api/auth/google — validate Google OAuth access_token, then log in or
// create user. Frontend now uses the popup flow (useGoogleLogin from
// @react-oauth/google) which returns an access_token rather than a JWT
// credential, because the FedCM-styled "Continue as X" button can't be
// disabled — using a custom button + popup flow is the only way back to a
// standard account picker.
router.post('/google', async (req: Request, res: Response) => {
  if (!googleClient) {
    res.status(503).json({ error: 'Google login is not configured on this server' });
    return;
  }
  const { accessToken } = req.body as { accessToken?: string };
  if (!accessToken) {
    res.status(400).json({ error: 'Missing Google access token' });
    return;
  }

  // 1) Validate the token is real AND was minted for *our* OAuth client.
  let tokenInfo;
  try {
    tokenInfo = await googleClient.getTokenInfo(accessToken);
  } catch {
    res.status(401).json({ error: 'Invalid Google access token' });
    return;
  }
  if (tokenInfo.aud !== GOOGLE_CLIENT_ID) {
    res.status(401).json({ error: 'Token audience mismatch' });
    return;
  }

  // 2) Pull the user's profile (sub, email, name, picture).
  let profile: { sub?: string; email?: string; name?: string; picture?: string };
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) throw new Error(`userinfo ${r.status}`);
    // fetch().json() is typed unknown — the shape is validated right below.
    profile = (await r.json()) as typeof profile;
  } catch {
    res.status(502).json({ error: 'Failed to fetch Google profile' });
    return;
  }
  if (!profile.sub || !profile.email) {
    res.status(401).json({ error: 'Google profile missing required fields' });
    return;
  }

  const googleId = profile.sub;
  const email = profile.email.toLowerCase();
  const name = profile.name || null;
  const avatarUrl = profile.picture || null;

  // 1) Try lookup by googleId (returning Google user)
  let user = await prisma.user.findUnique({ where: { googleId } });

  // 2) Fall back to email — link Google to an existing password account
  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId, avatarUrl: byEmail.avatarUrl || avatarUrl },
      });
    }
  }

  // 3) Brand-new user — auto-create. Google has already verified the email,
  //    so we set status='active' (skipping the pending/admin-approval step
  //    that password-register goes through).
  if (!user) {
    user = await prisma.user.create({
      data: {
        email, googleId, name, avatarUrl,
        role: 'user', status: 'active',
      },
    });
  }

  if (user.status === 'rejected' || user.status === 'suspended') {
    res.status(403).json({ error: 'Your account is not active. Please contact an administrator.' });
    return;
  }
  if (user.status === 'pending') {
    res.status(403).json({ error: 'Your account is pending admin approval.' });
    return;
  }

  const token = generateToken({ id: user.id, email: user.email, role: user.role });
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  logAudit(user.id, 'login_google', 'user', user.id);
  res.json({ token, user: publicUser(updated) });
});

// POST /api/auth/google/link — authenticated. Attach a Google account to
// the current user so they can sign in either with password or Google.
// Frontend obtains an OAuth access_token via the same popup flow used at
// login and posts it here.
router.post('/google/link', authMiddleware, async (req: AuthRequest, res: Response) => {
  if (!googleClient) {
    res.status(503).json({ error: 'Google login is not configured on this server' });
    return;
  }
  const { accessToken } = req.body as { accessToken?: string };
  if (!accessToken) {
    res.status(400).json({ error: 'Missing Google access token' });
    return;
  }

  let tokenInfo;
  try {
    tokenInfo = await googleClient.getTokenInfo(accessToken);
  } catch {
    res.status(401).json({ error: 'Invalid Google access token' });
    return;
  }
  if (tokenInfo.aud !== GOOGLE_CLIENT_ID) {
    res.status(401).json({ error: 'Token audience mismatch' });
    return;
  }

  let profile: { sub?: string; email?: string; picture?: string };
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) throw new Error(`userinfo ${r.status}`);
    // fetch().json() is typed unknown — the shape is validated right below.
    profile = (await r.json()) as typeof profile;
  } catch {
    res.status(502).json({ error: 'Failed to fetch Google profile' });
    return;
  }
  if (!profile.sub) {
    res.status(401).json({ error: 'Google profile missing required fields' });
    return;
  }

  const googleId = profile.sub;
  const avatarUrl = profile.picture || null;

  // Reject if this Google account is already linked to a different user.
  const owner = await prisma.user.findUnique({ where: { googleId } });
  if (owner && owner.id !== req.user!.id) {
    res.status(409).json({ error: 'This Google account is already linked to another user' });
    return;
  }

  const me = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!me) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: me.id },
    data: { googleId, avatarUrl: me.avatarUrl || avatarUrl },
  });
  logAudit(me.id, 'link_google', 'user', me.id);
  res.json(publicUser(updated));
});

// POST /api/auth/google/unlink — authenticated. Detach the Google account.
// Refuses if the user has no password — would lock them out.
router.post('/google/unlink', authMiddleware, async (req: AuthRequest, res: Response) => {
  const me = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!me) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (!me.password) {
    res.status(400).json({ error: 'Set a password before unlinking Google — otherwise you will be locked out' });
    return;
  }
  if (!me.googleId) {
    res.status(400).json({ error: 'No Google account is linked' });
    return;
  }
  const updated = await prisma.user.update({
    where: { id: me.id },
    data: { googleId: null },
  });
  logAudit(me.id, 'unlink_google', 'user', me.id);
  res.json(publicUser(updated));
});

/** How long a reset link stays usable. Long enough to find the mail, short
 *  enough that a mailbox read later is not a way in. */
const RESET_TTL_MINUTES = 30;

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

// POST /api/auth/forgot-password
//
// Always answers the same way. Telling the caller whether an address is
// registered turns this into a way of finding out who has an account, and a
// password form is the last place to be handing that out.
router.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  const sameAnswer = { message: 'If that address has an account, a reset link is on its way.' };

  if (!email || typeof email !== 'string') {
    res.json(sameAnswer);
    return;
  }

  const address = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: address } });

  // A Google-only account has no password to reset — the button is the way in
  // — and a rejected or suspended one should not be handed a way back.
  const eligible = user && user.password && user.status !== 'rejected' && user.status !== 'suspended';

  if (eligible) {
    // Any link already outstanding stops working: asking again should not
    // leave two keys to the same door.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
      },
    });

    const link = `${siteUrl()}/reset-password?token=${token}`;
    sendEmail(user.email, passwordResetEmail(user.name, link, siteUrl(), RESET_TTL_MINUTES), 'reset');
  } else if (user && !user.password && user.status !== 'rejected' && user.status !== 'suspended') {
    // Nothing to reset, but the owner of the address deserves to know why no
    // reset link is coming. The page still says the same thing to everyone.
    console.log(`[Auth] reset asked for ${address} — Google-only account, sent the Google notice`);
    sendEmail(user.email, googleSignInEmail(user.name, siteUrl()), 'google-notice');
  } else {
    const why = !user ? 'no account with that address' : `account is ${user.status}`;
    console.log(`[Auth] reset asked for ${address} — ${why}, nothing sent`);
    recordEmailSkipped(address, why);
  }

  res.json(sameAnswer);
});

// GET /api/auth/reset-password/:token
// Lets the page say "this link has expired" before asking for a new password,
// rather than after it has been typed twice.
router.get('/reset-password/:token', async (req: Request, res: Response) => {
  const raw = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(raw || '') } });
  const valid = !!row && !row.usedAt && row.expiresAt > new Date();
  res.json({ valid });
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req: Request, res: Response) => {
  const { token, password } = req.body as { token?: string; password?: string };

  if (!token || !password) {
    res.status(400).json({ error: 'Token and password are required' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.usedAt || row.expiresAt <= new Date()) {
    res.status(400).json({ error: 'This link has expired or has already been used.' });
    return;
  }

  // Spent first. If setting the password fails the link is gone, which is the
  // safe way round — a link that survives a half-finished reset is worse than
  // one that has to be asked for again.
  await prisma.passwordResetToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });
  await prisma.user.update({
    where: { id: row.userId },
    data: { password: await bcrypt.hash(password, 10) },
  });

  console.log(`[Auth] password reset completed for user ${row.userId}`);
  res.json({ message: 'Your password has been changed. You can sign in with it now.' });
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
  res.json(publicUser(user));
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
  res.json(publicUser(updated));
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
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  // Google-only users have no current password — direct them through a
  // separate "set password" flow instead (not implemented yet).
  if (!user.password) {
    res.status(400).json({ error: 'Cannot change password for Google-linked accounts without an existing password' });
    return;
  }
  if (!(await bcrypt.compare(currentPassword, user.password))) {
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
      '✅ [OnlyFunds] Test message — Telegram alerts are working correctly!',
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
    notice: 'This is a copy of all personal data stored by OnlyFunds.',
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
