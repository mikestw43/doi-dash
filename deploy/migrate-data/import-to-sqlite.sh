#!/bin/bash
# ============================================
# DOI DASH — load railway-dump.json into the VPS SQLite database
#   bash /opt/doi-dash/deploy/migrate-data/import-to-sqlite.sh
#
# Stops the API, optionally sets the current database aside, imports, restarts.
# Safe to re-run: rows that already exist are skipped.
# ============================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_FILE="$ROOT/backend/doi-dash.db"
DUMP="$ROOT/deploy/migrate-data/railway-dump.json"

[ -f "$DUMP" ] || {
  echo "ERROR: $DUMP not found — run export-from-railway.sh first." >&2
  exit 1
}

pm2 stop doi-dash-api 2>/dev/null || true

# A database seeded by setup.sh already holds admin@doi-dash.com. Keeping it
# would make the import skip the real admin row coming from Railway, so offer
# to set the fresh database aside first.
if [ -f "$DB_FILE" ]; then
  echo ""
  echo "A database already exists at $DB_FILE"
  echo "If it is the empty one setup.sh just created, set it aside so the"
  echo "imported users land cleanly. If it already holds real data, keep it."
  read -r -p "  Set the current database aside and start from empty? (y/n): " -n 1 REPLY
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    mkdir -p "$ROOT/backups"
    STAMP=$(date +%Y%m%d-%H%M%S)
    mv "$DB_FILE" "$ROOT/backups/pre-import-$STAMP.db"
    rm -f "$DB_FILE-wal" "$DB_FILE-shm"
    echo "  Moved to backups/pre-import-$STAMP.db"
  fi
fi

cd "$ROOT/backend"
npx prisma generate
npx prisma db push
npx tsx ../deploy/migrate-data/import.ts

pm2 start doi-dash-api 2>/dev/null || pm2 start "$ROOT/deploy/ecosystem.config.js"

echo ""
echo "Import complete. Check the dashboard, then:  pm2 logs doi-dash-api"
