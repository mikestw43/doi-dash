import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { runtimeStore } from '../services/runtimeStore';
import prisma from '../lib/prisma';
import { rateLimit } from '../middleware/rateLimit';
import { buildPortfolioContext } from '../services/aiContext';
import { askModel, resolveAi, aiDefaultModel, aiBaseFor, listModels, AI_PROVIDERS, type AiTurn, type ResolvedAi } from '../services/aiProvider';
import { loadAiConfig, saveAiConfig, redacted, configForProvider, savedKeyHints } from '../services/aiSettings';
import { listChats, getChat, saveTurn, deleteChat, truncateFrom } from '../services/aiChats';
import { adminMiddleware } from '../middleware/auth';
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
- Answer plainly. This person is a trader, not a programmer.
- Start in ${language === 'th' ? 'Thai' : 'English'} — that is the language
  the dashboard is set to. It is a default, not a rule: answer in whatever
  language the question is asked in, and if this person asks you to switch,
  switch and stay switched. You are able to write both. Never tell them you
  cannot answer in a language.
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

/** The provider's own words, turned into the thing to do about them. A
 *  refused key, an unpaid bill and a misspelt model all look the same
 *  otherwise, and each needs something different. */
const explainProviderError = (detail: string, model: string): string =>
  /^401|invalid[_ ]api[_ ]key|authentication|incorrect api key/i.test(detail)
    ? 'The key was refused. Check it, or paste a new one.'
  : /^402|credit|quota|billing|insufficient/i.test(detail)
    ? 'That account is out of credit. Top it up with the provider.'
  : /^404|model/i.test(detail)
    ? `The model "${model}" does not exist for this provider. Leave the model empty to use the default.`
  : /^429/.test(detail)
    ? 'The provider is rate-limiting us. Try again in a moment.'
  : /timeout|aborted/i.test(detail)
    ? 'The model took too long to answer. Try again.'
  : 'Could not reach the provider.';

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

/**
 * Whether a question would get an answer.
 *
 * A key is what the four named providers need. A server of one's own
 * needs an address and a model name instead, and often no key at all —
 * Ollama on a machine at home asks for nothing.
 */
const isReady = (ai: { provider: string; apiKey: string; base: string; model: string }): boolean =>
  ai.provider === 'custom' ? !!ai.base && !!ai.model : !!ai.apiKey;

// GET /api/ai/status
router.get('/status', async (_req: AuthRequest, res: Response) => {
  const ai = await resolveAi();
  const ready = isReady(ai);
  res.json({
    configured: ready,
    provider: ai.provider,
    model: ready ? ai.model : null,
  });
});

/**
 * The settings page for the assistant — admin only.
 *
 * It exists so that connecting a model, swapping a provider or replacing a
 * key that has been refused does not mean SSH, nano and a restart. The key
 * goes in encrypted and never comes back out: the page is told only that
 * there is one, and its last four characters.
 */
const PROVIDERS = AI_PROVIDERS;

/**
 * An address an admin typed, checked before anything is sent to it.
 *
 * http and https only: the point of the field is another company's API or
 * a machine on the home network, and anything else is a mistake or worse.
 */
const badAddress = (raw: string): string | null => {
  let url: URL;
  try { url = new URL(raw); } catch { return 'That is not a web address. It should look like https://api.example.com/v1'; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'The address must start with http:// or https://';
  if (!url.hostname) return 'That address has no server name in it.';
  return null;
};



router.get('/settings', adminMiddleware, async (_req: AuthRequest, res: Response) => {
  const cfg = await loadAiConfig();
  const ai = await resolveAi();
  res.json({
    provider: ai.provider,
    model: ai.model,
    defaultModel: aiDefaultModel(ai.provider),
    hasKey: !!ai.apiKey,
    keyHint: redacted(ai.apiKey),
    source: cfg.source,               // dashboard | environment | none
    providers: PROVIDERS,
    defaults: Object.fromEntries(PROVIDERS.map(p => [p, aiDefaultModel(p)])),
    // Which providers already have a key, so switching between them shows
    // what is set up without having to select each one and find out.
    keys: await savedKeyHints(PROVIDERS),
    models: Object.fromEntries(await Promise.all(
      PROVIDERS.map(async p => [p, (await configForProvider(p)).model] as const),
    )),
    bases: Object.fromEntries(await Promise.all(
      PROVIDERS.map(async p => [p, (await configForProvider(p)).baseUrl] as const),
    )),
  });
});

/**
 * The models this key is allowed to use, asked of the provider itself.
 *
 * The alternative is a list written here by hand, which is wrong the week
 * a new model ships and gives no hint that a key has been refused. This
 * asks the provider, and when it cannot (no key yet, no network) it says
 * so and hands back a short starter list — the field stays typeable, so an
 * id this does not know about is still allowed.
 *
 * A key may be passed in before it is saved, so the list can be seen while
 * deciding.
 */
router.post('/settings/models', adminMiddleware, async (req: AuthRequest, res: Response) => {
  const body = req.body as { provider?: string; apiKey?: string; baseUrl?: string };
  const provider = (body.provider || (await resolveAi()).provider).trim().toLowerCase();

  if (!PROVIDERS.includes(provider as typeof PROVIDERS[number])) {
    res.status(400).json({ error: 'bad_provider', message: `Provider must be one of: ${PROVIDERS.join(', ')}` });
    return;
  }

  const saved = await configForProvider(provider);
  const list = await listModels({
    provider: provider as ResolvedAi['provider'],
    model: '',
    apiKey: (body.apiKey || '').trim() || saved.apiKey,
    base: aiBaseFor(provider, (body.baseUrl || '').trim() || saved.baseUrl),
  });

  res.json({ provider, defaultModel: aiDefaultModel(provider), ...list });
});

router.put('/settings', adminMiddleware, async (req: AuthRequest, res: Response) => {
  const body = req.body as {
    provider?: unknown; model?: unknown; apiKey?: unknown;
    baseUrl?: unknown; activate?: unknown;
  };

  if (body.provider != null && !PROVIDERS.includes(String(body.provider).toLowerCase() as typeof PROVIDERS[number])) {
    res.status(400).json({ error: 'bad_provider', message: `Provider must be one of: ${PROVIDERS.join(', ')}` });
    return;
  }
  if (body.apiKey != null && typeof body.apiKey === 'string' && body.apiKey.trim() !== '' && body.apiKey.trim().length < 20) {
    res.status(400).json({ error: 'bad_key', message: 'That does not look like an API key.' });
    return;
  }
  if (body.baseUrl != null && String(body.baseUrl).trim() !== '') {
    const wrong = badAddress(String(body.baseUrl).trim());
    if (wrong) {
      res.status(400).json({ error: 'bad_base', message: wrong });
      return;
    }
  }
  // A server of one's own is only reachable if it has been named.
  const targetProvider = String(body.provider ?? (await resolveAi()).provider).toLowerCase();
  if (targetProvider === 'custom' && body.activate !== false) {
    const address = body.baseUrl != null
      ? String(body.baseUrl).trim()
      : (await configForProvider('custom')).baseUrl;
    if (!address) {
      res.status(400).json({ error: 'no_base', message: 'This one needs the address of the server that answers.' });
      return;
    }
  }

  await saveAiConfig({
    provider: body.provider != null ? String(body.provider) : undefined,
    model: body.model != null ? String(body.model) : undefined,
    apiKey: body.apiKey != null ? String(body.apiKey) : undefined,
    baseUrl: body.baseUrl != null ? String(body.baseUrl) : undefined,
    activate: body.activate !== false,
  }, req.user!.email);

  const ai = await resolveAi();
  const cfg = await loadAiConfig();
  logAudit(req.user!.id, 'ai_settings', 'ai', undefined,
    JSON.stringify({ provider: ai.provider, model: ai.model, keyChanged: body.apiKey != null }));

  res.json({
    provider: ai.provider, model: ai.model, hasKey: !!ai.apiKey,
    keyHint: redacted(ai.apiKey), source: cfg.source,
  });
});

/**
 * Try it, now, and say what happened.
 *
 * A saved key that is wrong looks exactly like a saved key that is right
 * until somebody asks a question. This asks the cheapest possible one —
 * and can test a key that has been typed but not yet saved, so a mistake
 * is caught before it is stored.
 */
router.post('/settings/test', adminMiddleware, async (req: AuthRequest, res: Response) => {
  const body = req.body as { provider?: string; model?: string; apiKey?: string; baseUrl?: string };
  const current = await resolveAi();

  const provider = (body.provider || current.provider) as ResolvedAi['provider'];
  // Not current.apiKey: the provider being tested may not be the selected
  // one, and testing Google with the OpenAI key would fail for the wrong
  // reason.
  const saved = await configForProvider(provider);
  const trial: ResolvedAi = {
    provider,
    model: (body.model || '').trim() || saved.model || aiDefaultModel(provider),
    apiKey: (body.apiKey || '').trim() || saved.apiKey,
    base: aiBaseFor(provider, (body.baseUrl || '').trim() || saved.baseUrl),
  };

  if (!trial.base) {
    res.status(400).json({ ok: false, message: 'There is no server address to test yet.' });
    return;
  }
  if (!trial.model) {
    res.status(400).json({ ok: false, message: 'Name the model this server should answer with.' });
    return;
  }
  // A server at home usually has no key, and that is not a mistake.
  if (!trial.apiKey && provider !== 'custom') {
    res.status(400).json({ ok: false, message: 'There is no key to test yet.' });
    return;
  }

  try {
    const started = Date.now();
    const answer = await askModel(
      'Reply with exactly: OK',
      [{ role: 'user', text: 'Say OK.' }],
      trial,
    );
    res.json({
      ok: true,
      ms: Date.now() - started,
      model: trial.model,
      said: answer.text.slice(0, 80),
      tokens: { in: answer.inputTokens, out: answer.outputTokens },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    res.json({ ok: false, message: explainProviderError(detail, trial.model), detail: detail.slice(0, 200) });
  }
});

/* ------------------------------------------------------------------ *
 * Conversations
 *
 * Everything here is scoped to the person asking. The service takes the
 * user id on every call rather than trusting an id from the browser.
 * ------------------------------------------------------------------ */

// GET /api/ai/chats — the list, newest first
router.get('/chats', async (req: AuthRequest, res: Response) => {
  res.json({ chats: await listChats(req.user!.id) });
});

// GET /api/ai/chats/:id — one conversation, in full
router.get('/chats/:id', async (req: AuthRequest, res: Response) => {
  const chat = await getChat(req.user!.id, String(req.params.id));
  if (!chat) {
    res.status(404).json({ error: 'not_found', message: 'That conversation is not there.' });
    return;
  }
  res.json(chat);
});

// DELETE /api/ai/chats/:id
router.delete('/chats/:id', async (req: AuthRequest, res: Response) => {
  const gone = await deleteChat(req.user!.id, String(req.params.id));
  if (!gone) {
    res.status(404).json({ error: 'not_found', message: 'That conversation is not there.' });
    return;
  }
  res.json({ ok: true });
});

// DELETE /api/ai/chats/:id/from/:messageId
//
// Editing a question, or asking again: the old question, the answer it
// got and anything after it go, and what comes next takes their place.
router.delete('/chats/:id/from/:messageId', async (req: AuthRequest, res: Response) => {
  const removed = await truncateFrom(req.user!.id, String(req.params.id), String(req.params.messageId));
  res.json({ removed });
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
  const body = req.body as {
    message?: unknown; images?: unknown; history?: unknown; language?: unknown; chatId?: unknown;
  };

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

  const ai = await resolveAi();
  if (!isReady(ai)) {
    res.status(503).json({
      error: 'not_configured',
      message: 'No AI provider is connected yet. An admin can add one in Settings → AI.',
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
    const answer = await askModel(systemPrompt(context.text, language), turns, ai);
    const ms = Date.now() - started;

    console.log(
      `[AI] ${ai.provider}/${ai.model} answered ${req.user!.email} in ${ms}ms ` +
      `(${answer.inputTokens ?? '?'} in, ${answer.outputTokens ?? '?'} out, ` +
      `${context.accounts} accounts, ${context.openOrders} open, ${checked.images.length} photo(s))`,
    );
    logAudit(req.user!.id, 'ai_chat', 'ai', undefined,
      JSON.stringify({ chars: message.length, images: checked.images.length, inputTokens: answer.inputTokens, outputTokens: answer.outputTokens }));

    if (!answer.text) {
      res.status(502).json({ error: 'empty_answer', message: 'The model answered with nothing. Try asking again.' });
      return;
    }

    // Written once the answer exists: a question stored on its own would
    // come back tomorrow as a conversation that stops mid-sentence.
    let saved: { chatId: string; questionId: string; answerId: string; at: Date } | null = null;
    try {
      saved = await saveTurn(req.user!.id, typeof body.chatId === 'string' ? body.chatId : null, {
        question: message,
        photos: checked.images.length,
        answer: answer.text,
        model: ai.model,
      });
    } catch (err) {
      // The answer is worth more than the record of it.
      console.error('[AI] could not save the conversation:', err instanceof Error ? err.message : err);
    }

    res.json({
      reply: answer.text,
      model: ai.model,
      tokens: { in: answer.inputTokens, out: answer.outputTokens },
      ...(saved && {
        chatId: saved.chatId,
        questionId: saved.questionId,
        answerId: saved.answerId,
        at: saved.at,
      }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[AI] failed for ${req.user!.email}: ${detail}`);

    // The provider's status code is the useful part: a key that is wrong,
    // a bill unpaid and a model that does not exist all look the same
    // otherwise, and each needs a different thing done about it.
    res.status(502).json({
      error: 'provider_failed',
      message: explainProviderError(detail, (await resolveAi()).model),
      detail: detail.slice(0, 200),
    });
  }
});

export default router;
