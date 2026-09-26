#!/bin/bash
# ============================================
# OnlyFunds — the site is not picking up new code
#
#   bash /opt/onlyfunds/deploy/fix-deploy.sh
#
# Says what the last deploy did, fixes the usual cause (no room to build),
# and deploys again with the output on screen so a real error cannot hide.
# ============================================

set -uo pipefail
PROJECT_DIR="/opt/onlyfunds"
LOG_FILE="/var/log/onlyfunds-auto-update.log"
FAILED_FILE="/var/lib/onlyfunds-auto-update.failed"

echo "=============================="
echo "  What happened last time"
echo "=============================="
[[ -f "$LOG_FILE" ]] && tail -n 25 "$LOG_FILE" || echo "  no log yet — auto-update may never have run"

echo ""
echo "=============================="
echo "  This machine"
echo "=============================="
free -h
echo ""
df -h / | tail -2
echo ""
if crontab -l 2>/dev/null | grep -q 'deploy/auto-update.sh'; then
  echo "  auto-update: installed"
else
  echo "  auto-update: NOT INSTALLED — turn it on with:"
  echo "               bash $PROJECT_DIR/deploy/auto-update.sh --install"
fi
[[ -f "$FAILED_FILE" ]] && echo "  last failed commit: $(cut -c1-7 < "$FAILED_FILE")"

echo ""
echo "=============================="
echo "  Fixing and deploying"
echo "=============================="
bash "$PROJECT_DIR/deploy/ensure-swap.sh" 2

# A commit that failed once is skipped by cron until a new one arrives.
# This run is the retry, so the marker goes.
rm -f "$FAILED_FILE"

cd "$PROJECT_DIR"
git checkout -- backend/package-lock.json frontend/package-lock.json 2>/dev/null || true
git pull || { echo ""; echo "  git pull failed — read the message above."; exit 1; }

if bash deploy/update.sh; then
  echo ""
  echo "=============================="
  echo "  Done — the site is on $(git rev-parse --short HEAD)"
  echo "=============================="
else
  echo ""
  echo "=============================="
  echo "  The deploy failed. The error is above this line."
  echo "=============================="
  exit 1
fi
