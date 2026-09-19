/**
 * Load the JSON dump produced by export.ts into the new SQLite database.
 * Run from the backend directory, after `npx prisma db push`:
 *
 *   npx tsx ../deploy/migrate-data/import.ts
 *
 * Rows that already exist are skipped, so re-running is safe.
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '../../backend/src/generated/prisma/client';
import { MODELS, reviveDates } from './models';

const IN_FILE = path.resolve(__dirname, 'railway-dump.json');

async function main() {
  if (!fs.existsSync(IN_FILE)) {
    console.error(`[import] No dump at ${IN_FILE} — run export-from-railway.sh first.`);
    process.exit(1);
  }

  const dump = JSON.parse(fs.readFileSync(IN_FILE, 'utf8')) as Record<string, unknown[]>;
  const prisma = new PrismaClient();

  for (const model of MODELS) {
    const rows = dump[model] ?? [];
    let inserted = 0;
    let skipped = 0;

    for (const row of rows) {
      try {
        // @ts-expect-error — indexing the client by model name
        await prisma[model].create({ data: reviveDates(row) });
        inserted++;
      } catch (e) {
        // P2002 = unique constraint: the row is already there from an earlier run.
        if ((e as { code?: string }).code === 'P2002') skipped++;
        else throw e;
      }
    }
    console.log(`[import] ${model}: ${inserted} inserted, ${skipped} already present`);
  }

  await prisma.$disconnect();
  console.log('[import] Done.');
}

main().catch((e) => {
  console.error('[import] FAILED:', e);
  process.exit(1);
});
