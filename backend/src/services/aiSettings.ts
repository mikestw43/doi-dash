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
 * The key is encrypted at rest with the same key as the Telegram tokens,
 * and never leaves the server: every read for the browser goes through
 * `redacted()`.
 */

const KEYS = {
  provider: 'ai.provider',
  model: 'ai.model',
  apiKey: 'ai.apiKey',
} as const;

export interface AiConfig {
  provider: string;
  model: string;
  apiKey: string;
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

export const loadAiConfig = async (): Promise<AiConfig> => {
  if (cached) return cached;

  const [provider, model, storedKey] = await Promise.all([
    read(KEYS.provider), read(KEYS.model), read(KEYS.apiKey),
  ]);

  const fromDashboard = storedKey ? decrypt(storedKey) : '';
  const fromEnv = process.env.AI_API_KEY?.trim() ?? '';

  cached = {
    provider: (provider || process.env.AI_PROVIDER || 'anthropic').trim().toLowerCase(),
    model: (model || process.env.AI_MODEL || '').trim(),
    apiKey: fromDashboard || fromEnv,
    source: fromDashboard ? 'dashboard' : fromEnv ? 'environment' : 'none',
  };
  return cached;
};

export const saveAiConfig = async (
  next: { provider?: string; model?: string; apiKey?: string },
  who: string,
): Promise<void> => {
  const write = (key: string, value: string) =>
    prisma.appSetting.upsert({
      where: { key },
      update: { value, updatedBy: who },
      create: { key, value, updatedBy: who },
    });

  if (next.provider != null) await write(KEYS.provider, next.provider.trim().toLowerCase());
  if (next.model != null) await write(KEYS.model, next.model.trim());

  if (next.apiKey != null) {
    const trimmed = next.apiKey.trim();
    if (trimmed === '') {
      // Clearing it falls back to the environment, if there is one there.
      await prisma.appSetting.deleteMany({ where: { key: KEYS.apiKey } });
    } else {
      await write(KEYS.apiKey, encrypt(trimmed));
    }
  }

  cached = null;
};

/** What the browser may know about the key: that there is one, and its last
 *  four characters, which is enough to tell two keys apart and no use to
 *  anybody else. */
export const redacted = (apiKey: string): string | null =>
  apiKey ? `••••${apiKey.slice(-4)}` : null;

export const forgetAiConfig = (): void => { cached = null; };
