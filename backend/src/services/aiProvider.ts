/**
 * The one place that knows which company answers.
 *
 * Everything else — the screens, the portfolio context, the routes — is the
 * same whichever model is behind it, which is what makes switching a change
 * of three variables and a restart:
 *
 *   AI_PROVIDER   anthropic | openai | google | openrouter
 *   AI_MODEL      the model id; each provider has a sensible default
 *   AI_API_KEY    lives on the server and nowhere else
 *   AI_API_BASE   optional, for a proxy or a test double
 *
 * No SDK. Each of these is one POST, and a dependency that wraps one POST
 * is a dependency to keep updated for nothing — the same reasoning as the
 * mail service.
 */

import { loadAiConfig } from './aiSettings';

export type AiProvider = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'custom';

export interface AiTurn {
  role: 'user' | 'assistant';
  text: string;
  /** data:image/...;base64,… — only ever on a user turn. */
  images?: string[];
}

export interface AiAnswer {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4o-mini',
  google: 'gemini-2.0-flash',
  openrouter: 'anthropic/claude-sonnet-5',
  // Nobody can guess what a server we have never seen calls its models.
  custom: '',
};

const DEFAULT_BASE: Record<AiProvider, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com',
  openrouter: 'https://openrouter.ai/api/v1',
  // 'custom' has no default: its address is the whole point, and is saved
  // with the rest of its settings.
  custom: '',
};

/** The settings an admin saved, or the environment behind them. Resolved
 *  per call, because a key saved from the dashboard has to take effect
 *  without a restart. */
export interface ResolvedAi {
  provider: AiProvider;
  model: string;
  apiKey: string;
  base: string;
}

export const AI_PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter', 'custom'] as const;

const asProvider = (raw: string): AiProvider =>
  (AI_PROVIDERS.includes(raw as AiProvider) ? raw : 'anthropic') as AiProvider;

/**
 * Anything that is not one of the four, reached by the shape almost
 * everyone copied.
 *
 * Most companies that came after OpenAI answer at /chat/completions with
 * OpenAI's own request and reply — DeepSeek, Groq, Together, Typhoon, and
 * Ollama or LM Studio running on a machine at home. So a fifth provider
 * that is only an address covers all of them without a release from us
 * each time a new one appears.
 */
export const isOpenAiShaped = (provider: AiProvider): boolean =>
  provider === 'openai' || provider === 'openrouter' || provider === 'custom';

export const resolveAi = async (): Promise<ResolvedAi> => {
  const cfg = await loadAiConfig();
  const provider = asProvider(cfg.provider);
  return {
    provider,
    model: cfg.model || DEFAULT_MODEL[provider],
    apiKey: cfg.apiKey,
    base: aiBaseFor(provider, cfg.baseUrl),
  };
};

export const aiDefaultModel = (provider: string): string => DEFAULT_MODEL[asProvider(provider)];

/** Where to reach a provider that is not the selected one — asking another
 *  provider for its model list, or testing a key before switching to it.
 *  AI_API_BASE, when set, points all of them at one stand-in. */
export const aiBaseFor = (provider: string, savedBase?: string): string =>
  (process.env.AI_API_BASE?.trim() || savedBase?.trim() || DEFAULT_BASE[asProvider(provider)])
    .replace(/\/+$/, '');

const MAX_OUTPUT_TOKENS = 1200;
const TIMEOUT_MS = 60_000;

/** "data:image/jpeg;base64,AAAA" → the two halves every API wants separately. */
const splitDataUrl = (url: string): { mediaType: string; data: string } | null => {
  const m = url.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  return m ? { mediaType: m[1].toLowerCase(), data: m[2] } : null;
};

const post = async (url: string, headers: Record<string, string>, body: unknown): Promise<unknown> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    // The provider's own words. They are the only thing that says whether
    // this is a bad key, a model that does not exist, or a bill unpaid.
    throw new Error(`${res.status} ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`answer was not JSON: ${text.slice(0, 200)}`);
  }
};

const askAnthropic = async (ai: ResolvedAi, system: string, turns: AiTurn[]): Promise<AiAnswer> => {
  const body = {
    model: ai.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system,
    messages: turns.map(turn => ({
      role: turn.role,
      content: [
        ...(turn.images ?? []).flatMap(url => {
          const img = splitDataUrl(url);
          return img ? [{ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } }] : [];
        }),
        { type: 'text', text: turn.text },
      ],
    })),
  };
  const json = await post(`${ai.base}/v1/messages`, {
    'x-api-key': ai.apiKey,
    'anthropic-version': '2023-06-01',
  }, body) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  return {
    text: (json.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('\n').trim(),
    inputTokens: json.usage?.input_tokens,
    outputTokens: json.usage?.output_tokens,
  };
};

/** OpenAI's shape, which OpenRouter also speaks. */
const askOpenAiShaped = async (ai: ResolvedAi, system: string, turns: AiTurn[]): Promise<AiAnswer> => {
  const body = {
    model: ai.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: system },
      ...turns.map(turn => ({
        role: turn.role,
        content: [
          { type: 'text', text: turn.text },
          ...(turn.images ?? []).map(url => ({ type: 'image_url', image_url: { url } })),
        ],
      })),
    ],
  };
  const json = await post(`${ai.base}/chat/completions`, {
    Authorization: `Bearer ${ai.apiKey}`,
  }, body) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: (json.choices?.[0]?.message?.content ?? '').trim(),
    inputTokens: json.usage?.prompt_tokens,
    outputTokens: json.usage?.completion_tokens,
  };
};

const askGoogle = async (ai: ResolvedAi, system: string, turns: AiTurn[]): Promise<AiAnswer> => {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: turns.map(turn => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [
        { text: turn.text },
        ...(turn.images ?? []).flatMap(url => {
          const img = splitDataUrl(url);
          return img ? [{ inline_data: { mime_type: img.mediaType, data: img.data } }] : [];
        }),
      ],
    })),
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
  };
  const json = await post(
    `${ai.base}/v1beta/models/${ai.model}:generateContent?key=${encodeURIComponent(ai.apiKey)}`,
    {}, body,
  ) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  return {
    text: (json.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('\n').trim(),
    inputTokens: json.usageMetadata?.promptTokenCount,
    outputTokens: json.usageMetadata?.candidatesTokenCount,
  };
};

/** Ask whichever provider is configured. Throws with the provider's own
 *  words, which the caller turns into something a person can act on. */
export const askModel = async (system: string, turns: AiTurn[], override?: ResolvedAi): Promise<AiAnswer> => {
  const ai = override ?? await resolveAi();
  if (!ai.base) throw new Error('no address is set for this server');
  switch (ai.provider) {
    case 'anthropic': return askAnthropic(ai, system, turns);
    case 'google':    return askGoogle(ai, system, turns);
    default:          return askOpenAiShaped(ai, system, turns);
  }
};

/* ------------------------------------------------------------------ *
 * Which models this key may use.
 *
 * Every provider will tell you, so the settings page asks them instead of
 * carrying a hand-written list that goes stale the week a new model ships.
 * Each answer is filtered down to the ones that can hold a conversation —
 * the raw lists also carry embeddings, speech and image models, which
 * would only be names to pick wrongly from.
 *
 * When the call fails (no key yet, no network, a provider that changed its
 * list endpoint) the caller still gets something to choose from, and the
 * field stays typeable either way.
 * ------------------------------------------------------------------ */

/** Enough to get started with if the provider cannot be asked. */
const FALLBACK_MODELS: Record<AiProvider, string[]> = {
  anthropic: ['claude-sonnet-5', 'claude-opus-5-5', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  google: ['gemini-2.0-flash', 'gemini-2.0-flash-lite'],
  openrouter: ['anthropic/claude-sonnet-5', 'openai/gpt-4o-mini', 'google/gemini-2.0-flash'],
  custom: [],
};

/** Names in the list that are not chat models, whatever the provider. */
const NOT_A_CHAT_MODEL =
  /embed|whisper|tts|audio|realtime|transcrib|moderation|image|dall-e|imagen|veo|rerank|aqa|guard/i;

const LIST_TIMEOUT_MS = 20_000;

const getJson = async (url: string, headers: Record<string, string>): Promise<unknown> => {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(LIST_TIMEOUT_MS) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
};

/** Default first, then alphabetical: the one to pick is at the top, and
 *  everything else is where the eye expects to find it. */
const tidy = (ids: string[], preferred: string): string[] => {
  const kept = [...new Set(ids.filter(id => id && !NOT_A_CHAT_MODEL.test(id)))].sort();
  return [...kept.filter(id => id === preferred), ...kept.filter(id => id !== preferred)];
};

export interface ModelList {
  models: string[];
  /** 'provider' — asked and answered. 'fallback' — could not ask. */
  source: 'provider' | 'fallback';
  /** Why the provider could not be asked, in its own words. */
  problem?: string;
}

export const listModels = async (ai: ResolvedAi): Promise<ModelList> => {
  const preferred = DEFAULT_MODEL[ai.provider];
  try {
    // OpenRouter lists without a key, and a server at home usually wants
    // no key at all — but it does need an address.
    if (!ai.base) throw new Error('no address for this server yet');
    if (!ai.apiKey && ai.provider !== 'openrouter' && ai.provider !== 'custom') {
      throw new Error('no key yet');
    }

    let ids: string[] = [];
    if (ai.provider === 'anthropic') {
      const json = await getJson(`${ai.base}/v1/models?limit=200`, {
        'x-api-key': ai.apiKey, 'anthropic-version': '2023-06-01',
      }) as { data?: { id?: string }[] };
      ids = (json.data ?? []).map(m => m.id ?? '');
    } else if (ai.provider === 'google') {
      const json = await getJson(
        `${ai.base}/v1beta/models?pageSize=200&key=${encodeURIComponent(ai.apiKey)}`, {},
      ) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
      ids = (json.models ?? [])
        .filter(m => (m.supportedGenerationMethods ?? []).includes('generateContent'))
        .map(m => (m.name ?? '').replace(/^models\//, ''));
    } else {
      // OpenAI and OpenRouter share the shape. OpenRouter lists every model
      // on the internet, so it is capped; the field still takes any id.
      const json = await getJson(`${ai.base}/models`, {
        ...(ai.apiKey ? { Authorization: `Bearer ${ai.apiKey}` } : {}),
      }) as { data?: { id?: string }[] };
      ids = (json.data ?? []).map(m => m.id ?? '');
      if (ai.provider === 'openai') ids = ids.filter(id => /^(gpt-|o[134]|chatgpt)/i.test(id));
    }

    const models = tidy(ids, preferred);
    if (models.length === 0) throw new Error('the list came back empty');
    return { models: models.slice(0, 120), source: 'provider' };
  } catch (err) {
    return {
      models: FALLBACK_MODELS[ai.provider],
      source: 'fallback',
      problem: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
    };
  }
};
