import { PrismaClient } from '../generated/prisma/client';

// SQLite — DATABASE_URL points at a file (backend/.env: file:./doi-dash.db).
const prisma = new PrismaClient();

/**
 * SQLite tuning, applied once at startup.
 *  - WAL: readers (dashboard/WebSocket) no longer block on writers (EA pushes).
 *  - busy_timeout: wait instead of throwing SQLITE_BUSY when a write is in flight.
 *  - synchronous=NORMAL: safe with WAL, far fewer fsyncs on a small VPS disk.
 * Failures are non-fatal — the app still runs on SQLite defaults.
 */
export async function applySqlitePragmas(): Promise<void> {
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000;');
    await prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
  } catch (e) {
    console.error('[DB] PRAGMA setup skipped:', (e as Error).message);
  }
}

export default prisma;
