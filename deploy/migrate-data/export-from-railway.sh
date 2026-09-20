#!/bin/bash
# ============================================
# OnlyFunds — export the old Railway Postgres data
#
#   bash deploy/migrate-data/export-from-railway.sh "postgresql://user:pass@host:port/db"
#
# Writes deploy/migrate-data/railway-dump.json.
# Copy the connection string from Railway → Postgres → Variables →
# DATABASE_PUBLIC_URL (the public one, not the internal .railway.internal host).
# ============================================

set -euo pipefail

PG_URL="${1:-${PG_URL:-}}"
if [ -z "$PG_URL" ]; then
  read -r -p "Railway DATABASE_PUBLIC_URL: " PG_URL
fi
[ -n "$PG_URL" ] || { echo "ERROR: no connection string given." >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG_SCHEMA="$ROOT/backend/prisma/schema.postgres.prisma"

# A throwaway Postgres-flavoured copy of the schema, so one Prisma client can
# read the old database while the real client stays on SQLite.
sed -e 's/provider = "sqlite"/provider = "postgresql"/' \
    -e 's|output   = "../src/generated/prisma"|output   = "../src/generated/prisma-pg"|' \
    "$ROOT/backend/prisma/schema.prisma" > "$PG_SCHEMA"

cd "$ROOT/backend"
npm install
DATABASE_URL="$PG_URL" npx prisma generate --schema prisma/schema.postgres.prisma
DATABASE_URL="$PG_URL" npx tsx ../deploy/migrate-data/export.ts

rm -f "$PG_SCHEMA"
echo ""
echo "Export complete: deploy/migrate-data/railway-dump.json"
echo "Next: on the VPS, run  bash deploy/migrate-data/import-to-sqlite.sh"
