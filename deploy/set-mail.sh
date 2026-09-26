#!/bin/bash
# ============================================
# OnlyFunds — choose how email is sent
#
#   bash /opt/onlyfunds/deploy/set-mail.sh brevo
#   bash /opt/onlyfunds/deploy/set-mail.sh resend
#
# It asks for the key rather than taking it on the command line: an
# argument is kept in root's shell history, and a mail key posts as you.
# Nothing here is ever printed back.
#
# Switching is reversible — the other provider's key stays in .env, so
# going back is this script again with the other name.
# ============================================

set -euo pipefail

PROJECT_DIR="/opt/onlyfunds"
ENV_FILE="$PROJECT_DIR/backend/.env"

PROVIDER="${1:-}"
if [ "$PROVIDER" != "brevo" ] && [ "$PROVIDER" != "resend" ]; then
  echo "Usage: bash $0 brevo|resend"
  exit 1
fi

[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE — is this the server?"; exit 1; }

set_env() {
  local key="$1" value="$2"
  if grep -q "^$key=" "$ENV_FILE"; then
    sed -i "s|^$key=.*|$key=$value|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

current_from="$(grep '^MAIL_FROM=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' || true)"

echo "=============================="
echo "  OnlyFunds — email provider"
echo "=============================="
echo "  Switching to: $PROVIDER"
echo ""

if [ "$PROVIDER" = "brevo" ]; then
  echo "Brevo sends from one address you have verified with them."
  echo "Add it first at brevo.com -> Senders, and click the link they email you."
  echo ""
  read -r -p "The verified sender address (e.g. you@gmail.com): " ADDR
  [ -n "$ADDR" ] || { echo "Nothing entered — stopping, nothing changed."; exit 1; }
  read -r -p "Brevo API key (starts with xkeysib-): " KEY
  [ -n "$KEY" ] || { echo "Nothing entered — stopping, nothing changed."; exit 1; }

  cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
  set_env BREVO_API_KEY "$KEY"
  set_env MAIL_PROVIDER brevo
  set_env MAIL_FROM "\"OnlyFunds <$ADDR>\""
  echo ""
  echo "Saved. Sending as OnlyFunds <$ADDR> through Brevo."
else
  echo "Resend is already configured if you set it up before."
  echo "Leave the key blank to keep the one already saved."
  echo ""
  read -r -p "Resend API key (blank = keep current): " KEY
  cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
  [ -n "$KEY" ] && set_env RESEND_API_KEY "$KEY"
  set_env MAIL_PROVIDER resend

  # Resend will not send as gmail.com or any other mailbox provider — only
  # from a domain verified with them, or from its shared test address. Coming
  # back from Brevo the sender is exactly such an address, and leaving it
  # would make every send fail with a refusal nobody expects, so it goes back
  # to the test address here rather than at the first password reset.
  case "$current_from" in
    ""|*@resend.dev*|*gmail.com*|*googlemail.com*|*hotmail.com*|*outlook.com*|*live.com*|*yahoo.com*|*icloud.com*|*proton.me*|*protonmail.com*)
      set_env MAIL_FROM "\"OnlyFunds <onboarding@resend.dev>\""
      echo ""
      echo "Sender set back to onboarding@resend.dev — Resend cannot send as a"
      echo "Gmail or Outlook address, only from a domain verified with them."
      ;;
  esac
  echo ""
  echo "Saved. Sending through Resend."
fi

echo ""
echo "Restarting the API..."
pm2 restart onlyfunds-api --update-env >/dev/null
sleep 4

echo ""
echo "What the server says about it:"
pm2 --no-color logs onlyfunds-api --lines 40 --nostream 2>/dev/null | grep -i '\[Email\]' | tail -3 || true

echo ""
echo "'ready' above means it is set. Anything else is the reason it is not —"
echo "an unverified sender is the usual one. Test it from the website:"
echo "Forgot password, then Admin -> EMAIL LOG."
