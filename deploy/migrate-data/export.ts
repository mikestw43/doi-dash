/**
 * Dump every table from the old Railway Postgres database into one JSON file.
 * Driven by deploy/migrate-data/export-from-railway.sh — run that, not this.
 *
 *   DATABASE_URL=<railway postgres url> npx tsx ../deploy/migrate-data/export.ts
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '../../backend/src/generated/prisma-pg/client';
import { MODELS } from './models';

const OUT_FILE = path.resolve(__dirname, 'railway-dump.json');

async function main() {
  const prisma = new PrismaClient();
  const dump: Record<string, unknown[]> = {};

  for (const model of MODELS) {
    // @ts-expect-error — indexing the client by model name
    const rows = await prisma[model].findMany();
    dump[model] = rows;
    console.log(`[export] ${model}: ${rows.length} rows`);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(dump, null, 2));
  console.log(`[export] Wrote ${OUT_FILE}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[export] FAILED:', e);
  process.exit(1);
});
