import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailContent } from './emailTemplates';

/**
 * Outbound email, by whichever route the environment provides.
 *
 * Two of them, because the obvious one is not always available. DigitalOcean
 * blocks outbound 25, 465 and 587 on new droplets to keep spam off its
 * network, which this server confirmed the hard way: Gmail's address resolved
 * and every mail port timed out while HTTPS answered 200. An HTTP API goes
 * over 443 and is not affected.
 *
 *   RESEND_API_KEY   re_...        → send over HTTPS, preferred when present
 *
 *   SMTP_HOST        smtp.gmail.com
 *   SMTP_PORT        587
 *   SMTP_USER        the full address the mail is sent from
 *   SMTP_PASS        an app password, not the account password
 *
 *   MAIL_FROM        OnlyFunds <you@example.com>     (optional)
 *   SITE_URL         https://onlyfunds.duckdns.org   (used to build links)
 *
 * Everything comes from the environment, so the credentials live on the
 * server and nowhere in this repository, and swapping providers is a change
 * of variables rather than a change of code.
 *
 * With neither configured nothing is sent: every call says so in the log
 * instead of throwing. An unconfigured mailer must not be able to fail an
 * approval or a registration.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const cfg = () => ({
  resendKey: process.env.RESEND_API_KEY,
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
  return !!c.resendKey || !!(c.host && c.user && c.pass);
};

/** Which route a send will take, for the log and the startup check. */
const route = (): 'resend' | 'smtp' | 'none' => {
  const c = cfg();
  if (c.resendKey) return 'resend';
  if (c.host && c.user && c.pass) return 'smtp';
  return 'none';
};

/**
 * Resend's HTTP API. No SDK — it is one POST, and a dependency that wraps one
 * POST is a dependency to keep updated for nothing.
 */
const sendViaResend = async (to: string, content: EmailContent): Promise<boolean> => {
  const c = cfg();
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: c.from || 'OnlyFunds <onboarding@resend.dev>',
        to: [to],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      // The body carries the reason — an unverified sending domain, a key
      // without send permission — and it is the only place it is said.
      const detail = await res.text().catch(() => '');
      console.error(`[Email] Resend refused "${content.subject}" for ${to}: ${res.status} ${detail.slice(0, 300)}`);
      return false;
    }
    const body = await res.json().catch(() => ({})) as { id?: string };
    console.log(`[Email] sent "${content.subject}" to ${to} via Resend (${body.id ?? 'no id'})`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Email] Resend request failed for ${to}: ${msg}`);
    return false;
  }
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
  if (route() === 'resend') return sendViaResend(to, content);

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
  const c = cfg();

  if (route() === 'resend') {
    const from = c.from || 'OnlyFunds <onboarding@resend.dev>';
    // Listing domains proves the key is real without sending anything — but
    // a send-only key, which is the right kind to give a server, is not
    // allowed to read that list and answers 401 restricted_api_key. That
    // answer only comes back to a key the API recognised, so it means the
    // credential is good; the first version of this check reported it as a
    // rejection and sent me looking for a fault that was not there.
    try {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${c.resendKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      const body = await res.text().catch(() => '');
      if (res.ok) {
        console.log(`[Email] Resend ready (from ${from})`);
      } else if (body.includes('restricted_api_key')) {
        console.log(`[Email] Resend ready — send-only key (from ${from})`);
      } else {
        console.error(`[Email] Resend key rejected: ${res.status} ${body.slice(0, 200)}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Email] Resend unreachable: ${msg}`);
    }
    return;
  }

  const tx = getTransport();
  if (!tx) {
    console.log('[Email] not configured — approval and reset emails will not be sent');
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
