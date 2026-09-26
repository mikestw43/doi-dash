/**
 * The transactional emails, as HTML an email client will actually render.
 *
 * Email is not the web. Tables carry the layout because a fair number of
 * clients still do not lay out flex or grid; every rule is inline because
 * Outlook and some webmail strip a stylesheet; the type is a system stack
 * because a web font will not load; and each table states its own bgcolor so
 * a client's dark mode has less to guess at. The width stops at 600px, which
 * is what a preview pane gives you.
 */

const BRAND = {
  bg:      '#0d0f13',
  card:    '#16181d',
  border:  '#2a2d34',
  text:    '#e8eaed',
  dim:     '#9aa0a6',
  faint:   '#6b7280',
  blue:    '#60a5fa',
  green:   '#34d399',
  red:     '#f87171',
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

interface LayoutOptions {
  /** Colour of the rule under the wordmark — the email's one note of state. */
  accent: string;
  preheader: string;
  heading: string;
  /** Paragraphs and other blocks, already rendered. */
  body: string;
  siteUrl: string;
}

const layout = ({ accent, preheader, heading, body, siteUrl }: LayoutOptions): string => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};">
  <!-- What the inbox shows beside the subject, and nowhere else. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.bg}" style="background-color:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

          <!-- Wordmark -->
          <tr>
            <td style="padding:0 0 20px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:30px;height:30px;border:2px solid ${BRAND.green};border-radius:8px 8px 14px 14px;" align="center" valign="middle">
                    <span style="font:700 14px ${FONT};color:${BRAND.green};line-height:26px;">O</span>
                  </td>
                  <td style="padding-left:11px;font:600 18px ${FONT};color:${BRAND.text};letter-spacing:.4px;">OnlyFunds</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td bgcolor="${BRAND.card}" style="background-color:${BRAND.card};border:1px solid ${BRAND.border};border-radius:14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td bgcolor="${accent}" style="background-color:${accent};height:3px;line-height:3px;font-size:0;border-radius:14px 14px 0 0;">&nbsp;</td></tr>
                <tr>
                  <td style="padding:32px 32px 36px 32px;">
                    <h1 style="margin:0 0 18px 0;font:600 21px/1.35 ${FONT};color:${BRAND.text};">${heading}</h1>
                    ${body}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:22px 8px 0 8px;">
              <p style="margin:0;font:400 12px/1.6 ${FONT};color:${BRAND.faint};">
                OnlyFunds &middot; <a href="${siteUrl}" style="color:${BRAND.faint};text-decoration:underline;">${siteUrl.replace(/^https?:\/\//, '')}</a><br>
                This is an automated message. Please do not reply to it.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const p = (html: string, color = BRAND.dim): string =>
  `<p style="margin:0 0 16px 0;font:400 15px/1.65 ${FONT};color:${color};">${html}</p>`;

const button = (href: string, label: string, color: string): string => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 8px 0;">
  <tr>
    <td bgcolor="${color}" style="background-color:${color};border-radius:8px;">
      <a href="${href}" style="display:inline-block;padding:13px 26px;font:600 15px ${FONT};color:#0d0f13;text-decoration:none;">${label}</a>
    </td>
  </tr>
</table>`;

/** A muted panel for the note that matters — an expiry, a caveat. */
const note = (html: string): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 22px 0;">
  <tr>
    <td bgcolor="#1c1f26" style="background-color:#1c1f26;border-left:2px solid ${BRAND.border};border-radius:0 6px 6px 0;padding:13px 16px;">
      <p style="margin:0;font:400 13px/1.6 ${FONT};color:${BRAND.dim};">${html}</p>
    </td>
  </tr>
</table>`;

const greeting = (name?: string | null): string =>
  name ? `Hi ${name},` : 'Hi,';

// ── The three emails ────────────────────────────────────────────────────────

export const accountApprovedEmail = (name: string | null, siteUrl: string): EmailContent => ({
  subject: 'Your OnlyFunds account is approved',
  html: layout({
    accent: BRAND.green,
    preheader: 'Your account has been approved — you can sign in now.',
    heading: 'Your account is approved',
    siteUrl,
    body:
      p(greeting(name), BRAND.text) +
      p('An administrator has approved your OnlyFunds account. You can sign in now with the email address and password you registered with.') +
      button(siteUrl, 'Sign in to OnlyFunds', BRAND.green) +
      p(`<span style="color:${BRAND.faint};font-size:13px;">If you didn't register for OnlyFunds, you can safely ignore this email.</span>`),
  }),
  text: [
    greeting(name),
    '',
    'An administrator has approved your OnlyFunds account. You can sign in now with',
    'the email address and password you registered with.',
    '',
    `Sign in: ${siteUrl}`,
    '',
    "If you didn't register for OnlyFunds, you can safely ignore this email.",
    '',
    '— OnlyFunds',
  ].join('\n'),
});

export const accountRejectedEmail = (name: string | null, siteUrl: string): EmailContent => ({
  subject: 'About your OnlyFunds registration',
  html: layout({
    accent: BRAND.faint,
    preheader: 'An update on the registration you submitted.',
    heading: 'About your registration',
    siteUrl,
    body:
      p(greeting(name), BRAND.text) +
      p('Thank you for your interest in OnlyFunds. We are not able to approve your registration at this time, and your account has not been activated.') +
      p('If you believe this was a mistake, you are welcome to get in touch with the administrator who invited you.') +
      p(`<span style="color:${BRAND.faint};font-size:13px;">No account has been created and nothing further is required from you.</span>`),
  }),
  text: [
    greeting(name),
    '',
    'Thank you for your interest in OnlyFunds. We are not able to approve your',
    'registration at this time, and your account has not been activated.',
    '',
    'If you believe this was a mistake, you are welcome to get in touch with the',
    'administrator who invited you.',
    '',
    'No account has been created and nothing further is required from you.',
    '',
    '— OnlyFunds',
  ].join('\n'),
});

export const passwordResetEmail = (
  name: string | null,
  resetUrl: string,
  siteUrl: string,
  minutes: number,
): EmailContent => ({
  subject: 'Reset your OnlyFunds password',
  html: layout({
    accent: BRAND.blue,
    preheader: `Choose a new password — this link expires in ${minutes} minutes.`,
    heading: 'Reset your password',
    siteUrl,
    body:
      p(greeting(name), BRAND.text) +
      p('Someone asked to reset the password for the OnlyFunds account using this email address. If that was you, choose a new password with the button below.') +
      button(resetUrl, 'Choose a new password', BRAND.blue) +
      note(`This link expires in <strong style="color:${BRAND.text};">${minutes} minutes</strong> and can be used once.`) +
      p(`<span style="color:${BRAND.faint};font-size:13px;">If this wasn't you, nothing has changed — your current password still works and you can ignore this email.</span>`) +
      p(`<span style="color:${BRAND.faint};font-size:12px;">If the button doesn't work, paste this address into your browser:<br><span style="color:${BRAND.dim};word-break:break-all;">${resetUrl}</span></span>`),
  }),
  text: [
    greeting(name),
    '',
    'Someone asked to reset the password for the OnlyFunds account using this email',
    'address. If that was you, open the link below to choose a new password.',
    '',
    resetUrl,
    '',
    `This link expires in ${minutes} minutes and can be used once.`,
    '',
    "If this wasn't you, nothing has changed — your current password still works and",
    'you can ignore this email.',
    '',
    '— OnlyFunds',
  ].join('\n'),
});
