#!/bin/bash
# ============================================
# OnlyFunds — point the site at a new domain
#
#   bash /opt/onlyfunds/deploy/set-domain.sh onlyfunds.com
#
# Everything a domain change touches, in one command, because the person
# doing it is usually holding a phone: the web console cannot be pasted into
# and a long command cannot reasonably be typed on a touch keyboard.
#
# It changes:
#   nginx        serves the new name (and keeps the old one working)
#   HTTPS        a certificate for both names, via certbot
#   CORS_ORIGIN  the browser is allowed to call the API from the new name
#   SITE_URL     links inside emails point at the new name
#   MAIL_FROM    mail is sent from the new domain, once it is verified
#
# It does NOT touch the database, the EAs, or any secret already in .env.
# Run it as often as you like — it is safe to repeat.
# ============================================

set -euo pipefail

PROJECT_DIR="/opt/onlyfunds"
ENV_FILE="$PROJECT_DIR/backend/.env"
NGINX_SITE="/etc/nginx/sites-available/onlyfunds"

DOMAIN="${1:-}"
MAIL_LOCAL="${2:-noreply}"

if [ -z "$DOMAIN" ]; then
  echo "Usage: bash $0 yourdomain.com [mail-user]"
  echo "Example: bash $0 onlyfunds.com noreply   →  mail from noreply@onlyfunds.com"
  exit 1
fi

# A domain, not a URL and not an IP. Catching this here saves a broken nginx.
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
if ! [[ "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$ ]]; then
  echo "\"$DOMAIN\" does not look like a domain name."
  exit 1
fi
if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "$DOMAIN is an IP address. Certificates and email verification both"
  echo "need a real name — this script is for the day you have one."
  exit 1
fi

cd "$PROJECT_DIR"

echo "=============================="
echo "  OnlyFunds — new domain"
echo "=============================="
echo "  Domain:    $DOMAIN"
echo "  Mail from: $MAIL_LOCAL@$DOMAIN"
echo ""

# ---------------------------------------------------------------- DNS check
# certbot will fail anyway if the name does not point here, but it fails
# after touching nginx. Better to say so first, in words.
MY_IP="$(curl -4 -s --max-time 10 https://api.ipify.org || true)"
DNS_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)"
echo "[1/5] Checking DNS..."
echo "      this server: ${MY_IP:-unknown}"
echo "      $DOMAIN → ${DNS_IP:-nothing yet}"
if [ -z "$DNS_IP" ]; then
  echo ""
  echo "      $DOMAIN does not point anywhere yet."
  echo "      Add an A record for it pointing at ${MY_IP:-this server}, wait a"
  echo "      few minutes, then run this again."
  exit 1
fi
if [ -n "$MY_IP" ] && [ "$DNS_IP" != "$MY_IP" ]; then
  echo ""
  echo "      $DOMAIN points at $DNS_IP, not at this server ($MY_IP)."
  echo "      HTTPS cannot be issued until it points here. Fix the A record"
  echo "      and run this again."
  exit 1
fi
echo "      OK."

# ------------------------------------------------------------------- nginx
# The old name keeps working. Links, bookmarks and the Google sign-in origin
# all still carry it, and breaking them to gain nothing would be rude.
echo ""
echo "[2/5] Pointing nginx at $DOMAIN..."
OLD_NAMES="$(awk '/server_name/ {sub(/;.*/,""); $1=""; print; exit}' "$NGINX_SITE" 2>/dev/null | xargs || true)"
ALL_NAMES="$DOMAIN"
for n in $OLD_NAMES; do
  [ "$n" = "$DOMAIN" ] && continue
  [ "$n" = "_" ] && continue
  # An IP address as a server_name is noise once there is a real domain.
  [[ "$n" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && continue
  ALL_NAMES="$ALL_NAMES $n"
done
echo "      server_name: $ALL_NAMES"
sed "s|__DOMAIN__|$ALL_NAMES|g" "$PROJECT_DIR/deploy/nginx.conf" > "$NGINX_SITE"
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/onlyfunds
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "      nginx reloaded."

# -------------------------------------------------------------------- HTTPS
echo ""
echo "[3/5] Getting an HTTPS certificate..."
CERT_ARGS=()
for n in $ALL_NAMES; do CERT_ARGS+=(-d "$n"); done
if certbot --nginx "${CERT_ARGS[@]}" --non-interactive --agree-tos \
     --email "admin@$DOMAIN" --redirect --expand; then
  echo "      Certificate installed. It renews itself."
else
  echo "      certbot failed. The site still works on http://$DOMAIN —"
  echo "      fix DNS and run this script again."
fi

# ---------------------------------------------------------------------- env
# set_env writes a key without disturbing anything else in the file, and
# never prints the file: it holds JWT_SECRET and ENCRYPTION_KEY.
set_env() {
  local key="$1" value="$2"
  if grep -q "^$key=" "$ENV_FILE"; then
    sed -i "s|^$key=.*|$key=$value|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
  echo "      $key=$value"
}

echo ""
echo "[4/5] Updating backend settings..."
cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
set_env CORS_ORIGIN "https://$DOMAIN"
set_env SITE_URL "https://$DOMAIN"
set_env MAIL_FROM "\"OnlyFunds <$MAIL_LOCAL@$DOMAIN>\""

# ------------------------------------------------------------------ restart
echo ""
echo "[5/5] Restarting the API..."
pm2 restart onlyfunds-api --update-env >/dev/null
sleep 3
pm2 --no-color logs onlyfunds-api --lines 30 --nostream 2>/dev/null | grep -i '\[Email\]' | tail -3 || true

echo ""
echo "=============================="
echo "  Done — https://$DOMAIN"
echo "=============================="
echo ""
echo "Two things left, both in a browser, neither on this server:"
echo ""
echo "  1. Resend → Domains → add $DOMAIN, copy the DNS records it gives you"
echo "     into your domain's DNS, and wait for it to say Verified."
echo "     Until then mail still goes out from the shared test address."
echo ""
echo "  2. Google Cloud Console → Credentials → your OAuth client:"
echo "     add https://$DOMAIN to Authorized JavaScript origins."
echo "     Without it the Google sign-in button stops working on the new name."
echo ""
