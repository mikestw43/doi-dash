import prisma from '../lib/prisma';

/**
 * What the assistant is told about this person on every question.
 *
 * It does not learn. The model answering tomorrow is the one that
 * answered today, and it remembers nothing in between — so "learning"
 * here means a short list of facts, handed over with every question.
 *
 * Short on purpose. It is read in full every time, which makes a page
 * of notes a page of notes paid for on every question, and a long list
 * also buries the two lines that matter.
 */

const MAX_ENTRIES = 40;
const MAX_LENGTH = 300;

export const listMemories = (userId: string) =>
  prisma.aiMemory.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, text: true, source: true, createdAt: true },
  });

export const addMemory = async (
  userId: string,
  text: string,
  source: 'you' | 'ai' = 'you',
): Promise<{ id: string; text: string; source: string; createdAt: Date } | { error: string }> => {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
  if (clean.length < 3) return { error: 'That is too short to be worth remembering.' };

  const count = await prisma.aiMemory.count({ where: { userId } });
  if (count >= MAX_ENTRIES) {
    return { error: `That is ${MAX_ENTRIES} things to remember, which is the limit. Delete one first.` };
  }

  // The same note twice is noise in every future question.
  const existing = await prisma.aiMemory.findFirst({
    where: { userId, text: clean },
    select: { id: true, text: true, source: true, createdAt: true },
  });
  if (existing) return existing;

  return prisma.aiMemory.create({
    data: { userId, text: clean, source },
    select: { id: true, text: true, source: true, createdAt: true },
  });
};

export const forgetMemory = async (userId: string, id: string): Promise<boolean> => {
  const { count } = await prisma.aiMemory.deleteMany({ where: { id, userId } });
  return count > 0;
};

/** The block that goes into the prompt, or '' when there is nothing. */
export const memoryText = async (userId: string): Promise<string> => {
  const rows = await listMemories(userId);
  if (rows.length === 0) return '';
  return [
    'WHAT THIS PERSON HAS ASKED YOU TO REMEMBER',
    ...rows.map(r => `- ${r.text}`),
    'These are standing instructions from them. Follow them without being',
    'reminded, and without repeating them back unless asked.',
    '',
  ].join('\n');
};
