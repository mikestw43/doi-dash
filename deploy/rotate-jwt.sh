#!/bin/bash
# ============================================
# OnlyFunds — give the session key a new value
#
#   bash /opt/onlyfunds/deploy/rotate-jwt.sh
#
# Everyone signed in is signed out. Nothing else changes: no data is
# touched, no password is reset, nobody has to be re-approved.
#
# It exists because the one-line sed people copy from chat cannot say
# whether it worked. This prints a fingerprint of the key before and
# after — a hash, never the key — so "it changed" is something you can
# see rather than assume.
# ============================================

set -euo pipefail

PROJECT_DIR="/opt/onlyfunds"
ENV_FILE="$PROJECT_DIR/backend/.env"

[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE — is this the server?"; exit 1; }

# A short hash of the value, safe to print. Same value, same fingerprint.
fingerprint() {
  local key="$1"
  local line
  line="$(grep "^$key=" "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  if [ -z "$line" ]; then
    echo "MISSING"
  else
    printf '%s' "$line" | sha256sum | cut -c1-12
  fi
}

length_of() {
  local line
  line="$(grep "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' || true)"
  printf '%s' "${#line}"
}

echo "=============================="
echo "  OnlyFunds — rotate JWT_SECRET"
echo "=============================="
echo ""

# Telegram bot tokens are encrypted with ENCRYPTION_KEY, and only fall back
# to JWT_SECRET when that is missing. Rotating without it would make every
# stored bot token unreadable, so this refuses rather than find out later.
if [ "$(fingerprint ENCRYPTION_KEY)" = "MISSING" ]; then
  echo "ENCRYPTION_KEY is not set in .env."
  echo ""
  echo "Stored Telegram bot tokens are encrypted with it, and without it they"
  echo "fall back to JWT_SECRET — so changing JWT_SECRET now would make them"
  echo "unreadable. Set ENCRYPTION_KEY first, then run this again."
  exit 1
fi

BEFORE="$(fingerprint JWT_SECRET)"
echo "[1/4] Before : JWT_SECRET fingerprint $BEFORE (length $(length_of JWT_SECRET))"

cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
NEW="$(openssl rand -hex 32)"

echo "[2/4] Writing the new key..."
if grep -q '^JWT_SECRET=' "$ENV_FILE"; then
  # A pipe as the delimiter: hex cannot contain one, so nothing can break out.
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$NEW|" "$ENV_FILE"
else
  printf 'JWT_SECRET=%s\n' "$NEW" >> "$ENV_FILE"
fi
unset NEW

AFTER="$(fingerprint JWT_SECRET)"
echo "      After  : JWT_SECRET fingerprint $AFTER (length $(length_of JWT_SECRET))"

if [ "$AFTER" = "$BEFORE" ] || [ "$(length_of JWT_SECRET)" != "64" ]; then
  echo ""
  echo "  THAT DID NOT WORK — the file still holds the old value."
  echo "  Nothing was restarted. Your backup is $ENV_FILE.bak.*"
  exit 1
fi

echo "[3/4] Restarting the API..."
pm2 restart onlyfunds-api --update-env >/dev/null
sleep 4

echo "[4/4] Checking it came back..."
CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/api/health || true)"
echo "      /api/health answered $CODE"

echo ""
if [ "$CODE" = "200" ]; then
  echo "=============================="
  echo "  Done. The fingerprint changed and the API is up."
  echo "=============================="
  echo ""
  echo "The proof you can see for yourself: open the website. You are signed"
  echo "out and have to log in again — that is the old token being refused."
  echo "Your password has not changed."
else
  echo "The API did not answer. Check: pm2 logs onlyfunds-api --lines 30"
  echo "To undo: copy the newest $ENV_FILE.bak.* back over .env and restart."
fi
