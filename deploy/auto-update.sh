#!/bin/bash
# ============================================
# OnlyFunds — deploy automatically when main moves
#
# Meant for cron, not for typing. It looks at GitHub, and only when main
# carries a commit the server does not have does it hand over to update.sh.
# A quiet repo costs one fetch, so this is cheap to run every few minutes —
# but a real deploy is not, so the "nothing new" exit has to come first.
#
#   Install (once):  bash /opt/onlyfunds/deploy/auto-update.sh --install
#   Remove:          bash /opt/onlyfunds/deploy/auto-update.sh --uninstall
#   Watch the log:   tail -f /var/log/onlyfunds-auto-update.log
# ============================================

set -euo pipefail

PROJECT_DIR="/opt/onlyfunds"
BRANCH="main"
LOG_FILE="/var/log/onlyfunds-auto-update.log"
LOCK_FILE="/tmp/onlyfunds-auto-update.lock"
# Remembers the commit whose deploy failed, so a commit that cannot build is
# reported once instead of rebuilt every 5 minutes on a 1GB box.
FAILED_FILE="/var/lib/onlyfunds-auto-update.failed"
CRON_LINE="*/5 * * * * /bin/bash $PROJECT_DIR/deploy/auto-update.sh >> $LOG_FILE 2>&1"

# ── Install / uninstall the cron entry ────────────────────────────────────
if [[ "${1:-}" == "--install" ]]; then
  if ! command -v crontab >/dev/null; then
    echo "crontab is missing. Install it first:  apt install -y cron" >&2
    exit 1
  fi
  # `crontab -l` exits 1 on an empty crontab and grep exits 1 when it filters
  # everything out; under `set -e` either would kill the script mid-edit.
  ( crontab -l 2>/dev/null | grep -v 'deploy/auto-update.sh' || true ; echo "$CRON_LINE" ) | crontab -
  touch "$LOG_FILE"
  echo "=============================="
  echo "  Auto-update is ON"
  echo "=============================="
  echo "  Checks GitHub every 5 minutes and deploys only when main moves."
  echo "  Log:  tail -f $LOG_FILE"
  echo "  Off:  bash $PROJECT_DIR/deploy/auto-update.sh --uninstall"
  exit 0
fi

if [[ "${1:-}" == "--uninstall" ]]; then
  ( crontab -l 2>/dev/null | grep -v 'deploy/auto-update.sh' || true ) | crontab -
  echo "Auto-update is OFF. Deploy by hand with: bash $PROJECT_DIR/deploy/update.sh"
  exit 0
fi

# ── The scheduled run ─────────────────────────────────────────────────────
cd "$PROJECT_DIR"

# A deploy takes longer than the gap between runs, so without this a slow
# build would have a second cron tick pulling out from under it.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[$(date '+%F %T')] previous deploy still running — skipping"
  exit 0
fi

if ! git fetch origin "$BRANCH" --quiet 2>/dev/null; then
  echo "[$(date '+%F %T')] could not reach GitHub — will retry next run"
  exit 0
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [[ "$LOCAL" == "$REMOTE" ]]; then
  exit 0   # nothing new — stay silent so the log stays readable
fi

if [[ -f "$FAILED_FILE" && "$(cat "$FAILED_FILE")" == "$REMOTE" ]]; then
  exit 0   # this commit already failed; the log says so. Wait for the next one.
fi

echo ""
echo "[$(date '+%F %T')] new commit ${REMOTE:0:7} — deploying"
git log --oneline "$LOCAL..$REMOTE" | sed 's/^/    /'

if ! bash deploy/update.sh; then
  echo "[$(date '+%F %T')] DEPLOY FAILED — the site is still on ${LOCAL:0:7}"
  echo "                      Not retrying ${REMOTE:0:7}. Fix it, push again, or run"
  echo "                      bash $PROJECT_DIR/deploy/update.sh by hand to see the error."
  mkdir -p "$(dirname "$FAILED_FILE")" && echo "$REMOTE" > "$FAILED_FILE"
  exit 1
fi

# update.sh owns the pull, so confirm it actually landed. Without this a pull
# that quietly no-ops reads as a success and cron redeploys the same commit
# every five minutes.
NOW=$(git rev-parse HEAD)
if [[ "$NOW" != "$REMOTE" ]]; then
  echo "[$(date '+%F %T')] update.sh finished but HEAD is ${NOW:0:7}, not ${REMOTE:0:7}"
  echo "                      Check the working tree for a conflict."
  mkdir -p "$(dirname "$FAILED_FILE")" && echo "$REMOTE" > "$FAILED_FILE"
  exit 1
fi

rm -f "$FAILED_FILE"
echo "[$(date '+%F %T')] deployed ${REMOTE:0:7}"
