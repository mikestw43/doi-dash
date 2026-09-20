#!/bin/bash
# ============================================
# OnlyFunds — SQLite backup
#   bash /opt/onlyfunds/deploy/backup.sh
# Run nightly by cron (installed by setup.sh). Keeps the last 14 copies.
# ============================================

set -euo pipefail

PROJECT_DIR="/opt/onlyfunds"
DB_FILE="$PROJECT_DIR/backend/onlyfunds.db"
BACKUP_DIR="$PROJECT_DIR/backups"
KEEP=14

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_FILE" ]; then
  echo "[backup] No database at $DB_FILE — nothing to do."
  exit 0
fi

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/onlyfunds-$STAMP.db"

# .backup is safe on a live database — unlike copying the file.
sqlite3 "$DB_FILE" ".backup '$OUT'"
gzip -f "$OUT"
echo "[backup] Wrote $OUT.gz"

# Keep only the newest $KEEP archives
ls -1t "$BACKUP_DIR"/onlyfunds-*.db.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
