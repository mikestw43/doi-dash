#!/bin/bash
# ============================================
# OnlyFunds — database + uploaded files backup
#   bash /opt/onlyfunds/deploy/backup.sh
# Run nightly by cron (installed by setup.sh). Keeps the last 14 copies.
# ============================================

set -euo pipefail

PROJECT_DIR="/opt/onlyfunds"
DB_FILE="$PROJECT_DIR/backend/onlyfunds.db"
UPLOAD_DIR="$PROJECT_DIR/uploads"
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

# The EA repository stores its files on disk with only their paths in the
# database, so a database-only backup restores rows pointing at nothing.
if [ -d "$UPLOAD_DIR" ] && [ -n "$(ls -A "$UPLOAD_DIR" 2>/dev/null)" ]; then
  FILES_OUT="$BACKUP_DIR/uploads-$STAMP.tar.gz"
  tar -czf "$FILES_OUT" -C "$PROJECT_DIR" uploads
  echo "[backup] Wrote $FILES_OUT"
fi

# Keep only the newest $KEEP archives
# Same trap: with fewer than $KEEP archives the pipeline yields nothing and
# would abort the script on its last line, so cron would log a failure nightly.
ls -1t "$BACKUP_DIR"/onlyfunds-*.db.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f || true
ls -1t "$BACKUP_DIR"/uploads-*.tar.gz  2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f || true
