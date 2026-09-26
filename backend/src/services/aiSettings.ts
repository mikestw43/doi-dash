import prisma from '../lib/prisma';
import { encrypt, decrypt } from '../lib/encryption';

/**
 * Where the AI's credentials come from.
 *
 * Two places, in this order: what an admin saved from the dashboard, then
 * the environment. The dashboard wins because it is the one that can be
 * changed from a phone at the moment something is wrong; the environment
 * stays as the way to set this up before anyone can log in, and as the
 * answer for anyone who would rather keep secrets out of a database.
 *
 * The key and the model are stored per provider. A key is shown once by
 * the company that issued it and never again, so switching from OpenAI to
 * Google to see what it costs must not throw the OpenAI key away — coming
 * back has to be one tap, not a trip to a billing page. The model is kept
 * per provider for the same reason: a model id only means anything to the
 * provider it belongs to.
 *
 * The key is encrypted at rest with the same key as the Telegram tokens,
 * and never leaves the server: every read for the browser goes through
 * `redacted()`.
 */

const PROVIDER_KEY = 'ai.provider';
const modelKey = (provider: string) => `ai.model.${provider}`;
const apiKeyKey = (provider: string) => `ai.apiKey.${provider}`;
// Only 'custom' normally needs one, but any provider may be pointed at a
// proxy, and it is one row either way.
const baseKey = (provider: string) => `ai.base.${provider}`;

// Before the settings were per provider there was one of each. They are
// moved to the provider that was current at the time, on first read.
const LEGACY_MODEL = 'ai.model';
const LEGACY_KEY = 'ai.apiKey';

export interface AiConfig {
  provider: string;
  model: string;
  apiKey: string;
  /** The address to talk to, when it is not the provider's own. */
  baseUrl: string;
  /** Where the key came from, for the settings page to show. */
  source: 'dashboard' | 'environment' | 'none';
}

// Read once, then kept: this is asked for on every question, and a SQLite
// round trip per question is a waste. Every write clears it.
let cached: AiConfig | null = null;

const read = async (key: string): Promise<string | null> => {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? null;
};

const write = (key: string, value: string, who: string) =>
  prisma.appSetting.upsert({
    where: { key },
    update: { value, updatedBy: who },
    create: { key, value, updatedBy: who },
  });

const currentProvider = async (): Promise<string> =>
  ((await read(PROVIDER_KEY)) || process.env.AI_PROVIDER || 'anthropic').trim().toLowerCase();

/** One-time move of the pre-per-provider rows onto the provider they were
 *  saved under, which is whichever one is selected now. */
const migrateLegacy = async (provider: string): Promise<void> => {
  const [oldModel, oldKey] = await Promise.all([read(LEGACY_MODEL), read(LEGACY_KEY)]);
  if (oldModel == null && oldKey == null) return;

  if (oldModel != null && (await read(modelKey(provider))) == null) {
    await write(modelKey(provider), oldModel, 'migration');
  }
  if (oldKey != null && (await read(apiKeyKey(provider))) == null) {
    await write(apiKeyKey(provider), oldKey, 'migration');   // already encrypted
  }
  await prisma.appSetting.deleteMany({ where: { key: { in: [LEGACY_MODEL, LEGACY_KEY] } } });
};

/** What is saved for one provider, whether or not it is the selected one. */
export const configForProvider = async (provider: string): Promise<AiConfig> => {
  const p = provider.trim().toLowerCase();
  const [model, storedKey, base] = await Promise.all([
    read(modelKey(p)), read(apiKeyKey(p)), read(baseKey(p)),
  ]);

  const fromDashboard = storedKey ? decrypt(storedKey) : '';
  // The environment holds one key, for whichever provider it names.
  const envProvider = (process.env.AI_PROVIDER || 'anthropic').trim().toLowerCase();
  const fromEnv = envProvider === p ? (process.env.AI_API_KEY?.trim() ?? '') : '';

  return {
    provider: p,
    model: (model || (envProvider === p ? process.env.AI_MODEL ?? '' : '')).trim(),
    apiKey: fromDashboard || fromEnv,
    baseUrl: (base ?? '').trim(),
    source: fromDashboard ? 'dashboard' : fromEnv ? 'environment' : 'none',
  };
};

export const loadAiConfig = async (): Promise<AiConfig> => {
  if (cached) return cached;
  const provider = await currentProvider();
  await migrateLegacy(provider);
  cached = await configForProvider(provider);
  return cached;
};

export const saveAiConfig = async (
  next: {
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    /** false edits that provider's settings without selecting it — clearing
     *  the key of a provider you are only looking at should not switch the
     *  assistant over to it. */
    activate?: boolean;
  },
  who: string,
): Promise<void> => {
  // A model or a key in this call belongs to the provider the call selects,
  // not to the one that happened to be selected before it.
  const target = (next.provider ?? await currentProvider()).trim().toLowerCase();
  await migrateLegacy(await currentProvider());

  if (next.provider != null && next.activate !== false) await write(PROVIDER_KEY, target, who);
  if (next.model != null) await write(modelKey(target), next.model.trim(), who);
  if (next.baseUrl != null) {
    const url = next.baseUrl.trim().replace(/\/+$/, '');
    if (url === '') await prisma.appSetting.deleteMany({ where: { key: baseKey(target) } });
    else await write(baseKey(target), url, who);
  }

  if (next.apiKey != null) {
    const trimmed = next.apiKey.trim();
    if (trimmed === '') {
      // Clearing it falls back to the environment, if there is one there.
      await prisma.appSetting.deleteMany({ where: { key: apiKeyKey(target) } });
    } else {
      await write(apiKeyKey(target), encrypt(trimmed), who);
    }
  }

  cached = null;
};

/** What the browser may know about the key: that there is one, and its last
 *  four characters, which is enough to tell two keys apart and no use to
 *  anybody else. */
export const redacted = (apiKey: string): string | null =>
  apiKey ? `••••${apiKey.slice(-4)}` : null;

/** A hint per provider, so the page can show which ones are already set up
 *  before anything is selected. */
export const savedKeyHints = async (providers: readonly string[]): Promise<Record<string, string | null>> => {
  const entries = await Promise.all(
    providers.map(async p => [p, redacted((await configForProvider(p)).apiKey)] as const),
  );
  return Object.fromEntries(entries);
};

export const forgetAiConfig = (): void => { cached = null; };
