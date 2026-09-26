import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailContent } from './emailTemplates';

/**
 * Outbound email, over whatever SMTP the environment points at.
 *
 * Configured entirely from the environment, so the credentials live on the
 * server and nowhere in this repository, and so moving from a Gmail account
 * to a proper sending service later is a change of four variables rather than
 * a change of code:
 *
 *   SMTP_HOST   smtp.gmail.com
 *   SMTP_PORT   587
 *   SMTP_USER   the full address the mail is sent from
 *   SMTP_PASS   an app password, not the account password
 *   MAIL_FROM   OnlyFunds <you@gmail.com>          (optional)
 *   SITE_URL    https://onlyfunds.duckdns.org      (used to build links)
 *
 * With SMTP_HOST unset nothing is sent and every call says so in the log
 * instead of throwing: an unconfigured mailer must not be able to fail an
 * approval or a registration.
 */

const cfg = () => ({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.MAIL_FROM || (process.env.SMTP_USER ? `OnlyFunds <${process.env.SMTP_USER}>` : ''),
});

export const siteUrl = (): string =>
  (process.env.SITE_URL || 'https://onlyfunds.duckdns.org').replace(/\/+$/, '');

export const isEmailConfigured = (): boolean => {
  const c = cfg();
  return !!(c.host && c.user && c.pass);
};

let transporter: Transporter | null = null;

const getTransport = (): Transporter | null => {
  if (!isEmailConfigured()) return null;
  if (transporter) return transporter;
  const c = cfg();
  transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    // 465 is TLS from the first byte; 587 opens plain and upgrades with
    // STARTTLS, which is what Gmail expects.
    secure: c.port === 465,
    // Fail in ten seconds rather than hanging a request for a minute.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: { user: c.user, pass: c.pass },
  });
  return transporter;
};

/**
 * Send one message.
 *
 * Never throws. The caller is always in the middle of something that matters
 * more than the email — approving an account, accepting a registration — and
 * a refused SMTP handshake is not a reason to fail it. Returns whether it
 * went, for the callers that want to say so.
 */
export const sendEmail = async (to: string, content: EmailContent): Promise<boolean> => {
  const tx = getTransport();
  if (!tx) {
    console.warn(`[Email] not configured — would have sent "${content.subject}" to ${to}`);
    return false;
  }
  try {
    const info = await tx.sendMail({
      from: cfg().from,
      to,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    console.log(`[Email] sent "${content.subject}" to ${to} (${info.messageId})`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Email] failed to send "${content.subject}" to ${to}: ${msg}`);
    return false;
  }
};

/**
 * Check the credentials once at startup, so a typo in the app password shows
 * up in the log on deploy rather than the first time somebody is approved.
 */
export const verifyEmailTransport = async (): Promise<void> => {
  const tx = getTransport();
  if (!tx) {
    console.log('[Email] SMTP not configured — approval and reset emails will not be sent');
    return;
  }
  try {
    await tx.verify();
    console.log(`[Email] SMTP ready (${cfg().host}:${cfg().port} as ${cfg().user})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Email] SMTP configured but not usable: ${msg}`);
  }
};
