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

export type AiProvider = 'anthropic' | 'openai' | 'google' | 'openrouter';

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
};

const DEFAULT_BASE: Record<AiProvider, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com',
  openrouter: 'https://openrouter.ai/api/v1',
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

const asProvider = (raw: string): AiProvider =>
  (['anthropic', 'openai', 'google', 'openrouter'].includes(raw) ? raw : 'anthropic') as AiProvider;

export const resolveAi = async (): Promise<ResolvedAi> => {
  const cfg = await loadAiConfig();
  const provider = asProvider(cfg.provider);
  return {
    provider,
    model: cfg.model || DEFAULT_MODEL[provider],
    apiKey: cfg.apiKey,
    base: (process.env.AI_API_BASE?.trim() || DEFAULT_BASE[provider]).replace(/\/+$/, ''),
  };
};

export const aiDefaultModel = (provider: string): string => DEFAULT_MODEL[asProvider(provider)];

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
  switch (ai.provider) {
    case 'anthropic': return askAnthropic(ai, system, turns);
    case 'google':    return askGoogle(ai, system, turns);
    default:          return askOpenAiShaped(ai, system, turns);
  }
};
