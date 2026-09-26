import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { runtimeStore } from '../services/runtimeStore';
import prisma from '../lib/prisma';
import { rateLimit } from '../middleware/rateLimit';
import { buildPortfolioContext } from '../services/aiContext';
import { askModel, aiConfigured, aiModel, aiProvider, type AiTurn } from '../services/aiProvider';
import { logAudit } from '../services/auditLogger';

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

const provider = aiProvider;
const model = aiModel;
const configured = aiConfigured;

/**
 * What the assistant is and is not.
 *
 * Most of this is about the second part. It can read this portfolio and it
 * can do arithmetic on it; it cannot see a chart it has not been given, it
 * does not know what the market will do next, and it must not sound as if
 * it does. The person on the other end has real money in these positions.
 */
const systemPrompt = (contextText: string, language: string): string => `
You are the assistant inside OnlyFunds, a dashboard that watches this
person's live MT5 trading accounts. You are talking to the account owner.

WHAT YOU CAN SEE
Everything below is this person's own live data, refreshed seconds ago.
It is the only account data you have; you cannot look anything else up.

${contextText}

HOW TO ANSWER
- Answer in ${language === 'th' ? 'Thai' : 'English'}, plainly. This person
  is a trader, not a programmer.
- Be specific and use their real figures. Name the position, the symbol,
  the amount. Vague advice is worse than none.
- Lead with the answer, then the reasoning. Keep it short unless asked.
- Money: state the account's own currency. A USC account is in cents —
  100 units there is 1 US dollar. Never mix the two up.

WHAT YOU MUST NOT DO
- Do not predict where any price will go. You cannot see the chart, the
  news or the order book. If asked, say so plainly and talk about risk,
  exposure and this person's own history instead.
- Do not invent numbers. If something is not in the data above, say it is
  not available rather than estimating it.
- Do not claim to have placed, closed or changed any order. You cannot.
  You can suggest what to do; the person does it from the dashboard.
- Do not lecture. One short caution where it matters, not a disclaimer on
  every paragraph.
`.trim();

/** Twenty questions an hour is far more than a person asks and far less
 *  than a runaway loop costs. */
const chatLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 20,
  message: 'That is a lot of questions in an hour. Give it a few minutes.',
});

/** How much of the conversation goes back with each question. Enough to
 *  follow a thread, capped because every turn is paid for again. */
const MAX_HISTORY_TURNS = 10;

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

/**
 * What a question may carry with it.
 *
 * Photos arrive as data URLs, which is the shape every vision API takes, and
 * are never written to disk: a picture of somebody's account goes with the
 * question and lives only in that conversation. The limits are here rather
 * than at the model because an oversized request should be refused by us,
 * cheaply, and because a browser is not a thing to be trusted about size.
 */
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;   // after the browser has shrunk it

const checkImages = (raw: unknown): { images: string[] } | { error: string } => {
  if (raw == null) return { images: [] };
  if (!Array.isArray(raw)) return { error: 'images must be a list' };
  if (raw.length > MAX_IMAGES) return { error: `At most ${MAX_IMAGES} photos per question` };

  const images: string[] = [];
  for (const one of raw) {
    if (typeof one !== 'string') return { error: 'each photo must be a data URL' };
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/.test(one)) {
      return { error: 'photos must be PNG, JPEG, WebP or GIF data URLs' };
    }
    const bytes = Math.round((one.length - one.indexOf(',') - 1) * 0.75);
    if (bytes > MAX_IMAGE_BYTES) return { error: 'that photo is too large — 3MB each is the limit' };
    images.push(one);
  }
  return { images };
};

// POST /api/ai/chat
router.post('/chat', chatLimiter, async (req: AuthRequest, res: Response) => {
  const body = req.body as { message?: unknown; images?: unknown; history?: unknown; language?: unknown };

  const checked = checkImages(body.images);
  if ('error' in checked) {
    res.status(400).json({ error: 'bad_images', message: checked.error });
    return;
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message && checked.images.length === 0) {
    res.status(400).json({ error: 'empty', message: 'Ask something, or attach a photo.' });
    return;
  }
  if (message.length > 4000) {
    res.status(400).json({ error: 'too_long', message: 'That question is too long — 4000 characters is the limit.' });
    return;
  }

  if (!configured()) {
    res.status(503).json({
      error: 'not_configured',
      message: 'No AI provider is connected yet. Add AI_API_KEY on the server to switch this on.',
    });
    return;
  }

  // The conversation so far comes from the browser, which holds it. Only
  // the text: old photos are not sent again, since paying to re-read them
  // on every turn is how a chat gets expensive.
  const history: AiTurn[] = Array.isArray(body.history)
    ? (body.history as unknown[])
        .filter((h): h is { role: string; text: string } =>
          !!h && typeof h === 'object' && typeof (h as { text?: unknown }).text === 'string')
        .slice(-MAX_HISTORY_TURNS)
        .map(h => ({
          role: h.role === 'assistant' ? 'assistant' : 'user',
          text: String(h.text).slice(0, 4000),
        }))
    : [];

  const language = body.language === 'th' ? 'th' : 'en';

  try {
    const context = await buildPortfolioContext(req.user!.id);
    const turns: AiTurn[] = [
      ...history,
      { role: 'user', text: message || '(the photo is the question)', images: checked.images },
    ];

    const started = Date.now();
    const answer = await askModel(systemPrompt(context.text, language), turns);
    const ms = Date.now() - started;

    console.log(
      `[AI] ${provider()}/${model()} answered ${req.user!.email} in ${ms}ms ` +
      `(${answer.inputTokens ?? '?'} in, ${answer.outputTokens ?? '?'} out, ` +
      `${context.accounts} accounts, ${context.openOrders} open, ${checked.images.length} photo(s))`,
    );
    logAudit(req.user!.id, 'ai_chat', 'ai', undefined,
      JSON.stringify({ chars: message.length, images: checked.images.length, inputTokens: answer.inputTokens, outputTokens: answer.outputTokens }));

    if (!answer.text) {
      res.status(502).json({ error: 'empty_answer', message: 'The model answered with nothing. Try asking again.' });
      return;
    }

    res.json({ reply: answer.text, model: model(), tokens: { in: answer.inputTokens, out: answer.outputTokens } });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[AI] ${provider()}/${model()} failed for ${req.user!.email}: ${detail}`);

    // The provider's status code is the useful part: a key that is wrong,
    // a bill unpaid and a model that does not exist all look the same
    // otherwise, and each needs a different thing done about it.
    const friendly =
      /^401|invalid[_ ]api[_ ]key|authentication/i.test(detail) ? 'The AI key was refused. Check AI_API_KEY on the server.'
      : /^402|credit|quota|billing|insufficient/i.test(detail) ? 'The AI account is out of credit.'
      : /^404|model/i.test(detail) ? `The model "${model()}" was not found for this provider. Check AI_MODEL.`
      : /^429/.test(detail) ? 'The provider is rate-limiting us. Try again in a moment.'
      : /timeout|aborted/i.test(detail) ? 'The model took too long to answer. Try again.'
      : 'Could not reach the AI provider.';

    res.status(502).json({ error: 'provider_failed', message: friendly, detail: detail.slice(0, 200) });
  }
});

export default router;
