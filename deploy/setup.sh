#!/bin/bash
# ============================================
# DOI DASH — VPS setup (Ubuntu 22.04 / 24.04)
# Run as root on a fresh VPS:
#   bash /opt/doi-dash/deploy/setup.sh
# Optionally pass the domain:
#   bash /opt/doi-dash/deploy/setup.sh dash.example.com
# Re-running is safe — it never overwrites backend/.env or the database.
# ============================================

set -euo pipefail

PROJECT_DIR="/opt/doi-dash"
APP_NAME="doi-dash-api"
DB_FILE="$PROJECT_DIR/backend/doi-dash.db"

DOMAIN="${1:-${DOMAIN:-}}"
if [ -z "$DOMAIN" ]; then
  read -r -p "Domain or server IP for the dashboard (e.g. dash.example.com): " DOMAIN
fi
if [ -z "$DOMAIN" ]; then
  echo "ERROR: no domain given." >&2
  exit 1
fi

# An IP address cannot get a Let's Encrypt certificate — HTTP only.
if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  IS_IP=1
  SCHEME="http"
else
  IS_IP=0
  SCHEME="https"
fi

echo "=============================="
echo "  DOI DASH — VPS setup"
echo "  Target: $SCHEME://$DOMAIN"
echo "=============================="

# --- 1. System packages ---
echo ""
echo "[1/9] Updating system..."
export DEBIAN_FRONTEND=noninteractive
apt update && apt upgrade -y
apt install -y curl git sqlite3 openssl ca-certificates

# --- 2. Swap (vite/tsc builds OOM on a 1 GB VPS without it) ---
echo ""
echo "[2/9] Checking swap..."
if [ "$(swapon --show --noheadings | wc -l)" -eq 0 ]; then
  echo "  Creating 2G swapfile..."
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  echo "  Swap already present."
fi

# --- 3. Node.js 22 LTS (matches .nvmrc) ---
echo ""
echo "[3/9] Installing Node.js 22..."
if ! command -v node &> /dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
fi
echo "  Node.js $(node -v)"

# --- 4. PM2, Nginx, Certbot ---
echo ""
echo "[4/9] Installing PM2, Nginx, Certbot..."
command -v pm2 &> /dev/null || npm install -g pm2
apt install -y nginx certbot python3-certbot-nginx
systemctl enable nginx

# --- 5. Project check ---
echo ""
echo "[5/9] Checking project..."
if [ ! -d "$PROJECT_DIR" ]; then
  echo "  ERROR: project not found at $PROJECT_DIR"
  echo "  Clone it first:"
  echo "    git clone https://github.com/mikestw43/doi-dash.git $PROJECT_DIR"
  exit 1
fi
cd "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR/logs" "$PROJECT_DIR/backups"

# --- 6. Environment files ---
echo ""
echo "[6/9] Configuring environment..."
if [ ! -f backend/.env ]; then
  echo "  Creating backend/.env with fresh secrets..."
  cat > backend/.env << EOF
PORT=4000
NODE_ENV=production
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
CORS_ORIGIN=$SCHEME://$DOMAIN
DATABASE_URL="file:$DB_FILE"
EOF
else
  echo "  backend/.env exists — updating CORS_ORIGIN and DATABASE_URL only."
  if grep -q '^CORS_ORIGIN=' backend/.env; then
    sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=$SCHEME://$DOMAIN|" backend/.env
  else
    echo "CORS_ORIGIN=$SCHEME://$DOMAIN" >> backend/.env
  fi
  if grep -q '^DATABASE_URL=' backend/.env; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"file:$DB_FILE\"|" backend/.env
  else
    echo "DATABASE_URL=\"file:$DB_FILE\"" >> backend/.env
  fi
fi

# Frontend build-time vars. Same-origin API, so VITE_API_URL stays empty.
if [ ! -f frontend/.env ]; then
  cat > frontend/.env << 'EOF'
# Same-origin API through Nginx — leave these empty.
VITE_API_URL=
VITE_WS_URL=
# Fill in only if you use Google sign-in:
VITE_GOOGLE_CLIENT_ID=
EOF
  echo "  Created frontend/.env (add VITE_GOOGLE_CLIENT_ID if you use Google login)."
fi

# --- 7. Build ---
echo ""
echo "[7/9] Building backend..."
cd "$PROJECT_DIR/backend"
FRESH_DB=0
[ -f "$DB_FILE" ] || FRESH_DB=1
npm install                       # dev deps required: tsc builds dist/
npx prisma generate
npx prisma db push
npm run build

if [ "$FRESH_DB" -eq 1 ]; then
  echo "  Fresh database — seeding admin user..."
  npx tsx prisma/seed.ts
fi

echo ""
echo "  Building frontend..."
cd "$PROJECT_DIR/frontend"
npm install
npm run build

# --- 8. Nginx ---
echo ""
echo "[8/9] Configuring Nginx..."
sed "s|__DOMAIN__|$DOMAIN|g" "$PROJECT_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/doi-dash
ln -sf /etc/nginx/sites-available/doi-dash /etc/nginx/sites-enabled/doi-dash
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# --- 9. PM2 + backups ---
echo ""
echo "[9/9] Starting the API..."
cd "$PROJECT_DIR"
pm2 delete "$APP_NAME" 2>/dev/null || true
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# Nightly SQLite backup at 03:00
CRON_LINE="0 3 * * * bash $PROJECT_DIR/deploy/backup.sh >> $PROJECT_DIR/logs/backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'deploy/backup.sh' ; echo "$CRON_LINE" ) | crontab -
echo "  Nightly backup scheduled (03:00)."

# --- SSL ---
if [ "$IS_IP" -eq 0 ]; then
  echo ""
  echo "Setting up HTTPS for $DOMAIN"
  echo "  DNS for $DOMAIN must already point to this server."
  read -r -p "  DNS ready? Run Certbot now? (y/n): " -n 1 REPLY
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" --redirect
    echo "  Certificate installed (auto-renews via the certbot timer)."
  else
    echo "  Skipped. Run later: certbot --nginx -d $DOMAIN"
  fi
else
  echo ""
  echo "  $DOMAIN is an IP address — skipping HTTPS."
  echo "  Point a domain at this server and re-run this script to enable it."
fi

echo ""
echo "=============================="
echo "  DOI DASH is live"
echo "=============================="
echo "  Dashboard: $SCHEME://$DOMAIN"
echo "  Health:    $SCHEME://$DOMAIN/api/health"
if [ "$FRESH_DB" -eq 1 ]; then
echo "  Login:     admin@doi-dash.com / password   <-- change this now"
fi
echo ""
echo "  pm2 status                 — service status"
echo "  pm2 logs $APP_NAME         — live logs"
echo "  pm2 restart $APP_NAME      — restart the API"
echo "  bash deploy/update.sh      — deploy new code"
echo "  bash deploy/backup.sh      — back up the database now"
echo ""
