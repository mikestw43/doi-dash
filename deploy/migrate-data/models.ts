/**
 * Tables in dependency order — parents first, so foreign keys always resolve
 * on import. Mirrors backend/prisma/schema.prisma.
 */
export const MODELS = [
  'user',
  'accountGroup',
  'account',
  'equitySnapshot',
  'closedTrade',
  'notificationLog',
  'auditLog',
] as const;

export type ModelName = (typeof MODELS)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** JSON has no Date type — turn ISO strings back into Date objects. */
export function reviveDates<T>(row: T): T {
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value === 'string' && ISO_DATE.test(value)) out[key] = new Date(value);
  }
  return out as T;
}
