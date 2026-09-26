import prisma from '../lib/prisma';

/**
 * Who may ask the assistant, how often, and what it has cost.
 *
 * Every question is paid for by whoever owns the API key — the person
 * running the dashboard, not the person asking — so access is off until
 * it is switched on for someone, and comes with a number of questions a
 * day. An admin is never limited: they are the one paying.
 *
 * The usage rows are also the only honest answer to "is this getting
 * expensive?", which is the question a limit is supposed to protect
 * against being surprised by.
 */

/** A day in the server's own timezone: the day the person asking is in. */
export const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export type Refusal = { ok: false; code: 'ai_off' | 'ai_quota'; message: string; used?: number; limit?: number };
export type Allowed = { ok: true; used: number; limit: number };

export const mayAsk = async (userId: string): Promise<Allowed | Refusal> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, aiEnabled: true, aiDailyLimit: true },
  });
  if (!user) return { ok: false, code: 'ai_off', message: 'No such account.' };

  // The person who pays is not rationed.
  if (user.role === 'admin') return { ok: true, used: 0, limit: 0 };

  if (!user.aiEnabled) {
    return {
      ok: false,
      code: 'ai_off',
      message: 'The assistant is not switched on for this account yet. An admin can turn it on.',
    };
  }

  const limit = user.aiDailyLimit ?? 0;
  if (limit <= 0) return { ok: true, used: 0, limit: 0 };

  const row = await prisma.aiUsage.findUnique({
    where: { userId_day: { userId, day: today() } },
    select: { questions: true },
  });
  const used = row?.questions ?? 0;
  if (used >= limit) {
    return {
      ok: false,
      code: 'ai_quota',
      message: `That is ${limit} questions today, which is this account's daily limit. It starts again tomorrow.`,
      used,
      limit,
    };
  }
  return { ok: true, used, limit };
};

/** One answered question, with what it cost in tokens. */
export const recordAsk = async (userId: string, inTokens = 0, outTokens = 0): Promise<void> => {
  const day = today();
  await prisma.aiUsage.upsert({
    where: { userId_day: { userId, day } },
    update: {
      questions: { increment: 1 },
      inTokens: { increment: inTokens },
      outTokens: { increment: outTokens },
    },
    create: { userId, day, questions: 1, inTokens, outTokens },
  });
};

export interface UsageRow {
  userId: string;
  questions: number;
  inTokens: number;
  outTokens: number;
  today: number;
}

/** This month per person, with today's count for the limit to be read
 *  against. */
export const usageThisMonth = async (): Promise<UsageRow[]> => {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const rows = await prisma.aiUsage.findMany({
    where: { day: { gte: from } },
    select: { userId: true, day: true, questions: true, inTokens: true, outTokens: true },
  });

  const day = today();
  const byUser = new Map<string, UsageRow>();
  for (const r of rows) {
    const acc = byUser.get(r.userId) ?? { userId: r.userId, questions: 0, inTokens: 0, outTokens: 0, today: 0 };
    acc.questions += r.questions;
    acc.inTokens += r.inTokens;
    acc.outTokens += r.outTokens;
    if (r.day === day) acc.today += r.questions;
    byUser.set(r.userId, acc);
  }
  return [...byUser.values()];
};

/** Old usage rows are only of interest as a total, and the total is the
 *  provider's bill. A year is more than enough. */
export const cleanOldUsage = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const day = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  const { count } = await prisma.aiUsage.deleteMany({ where: { day: { lt: day } } });
  return count;
};
