#!/bin/bash
# ============================================
# OnlyFunds — deploy the latest code
#   bash /opt/onlyfunds/deploy/update.sh
# ============================================

set -euo pipefail

PROJECT_DIR="/opt/onlyfunds"
cd "$PROJECT_DIR"

echo "=============================="
echo "  OnlyFunds — update"
echo "=============================="

echo ""
echo "[1/5] Backing up the database first..."
bash deploy/backup.sh

echo ""
echo "[2/5] Pulling latest code..."
# npm rewrites the lockfiles during install, so the working tree is dirty by
# the time the next deploy runs. Left alone, the first upstream lockfile
# change turns `git pull` into a merge conflict on a file nobody edited.
git checkout -- backend/package-lock.json frontend/package-lock.json 2>/dev/null || true
git pull

echo ""
echo "[3/5] Building backend..."
cd backend
npm install
npx prisma generate
npx prisma db push
npm run build
cd ..

echo ""
echo "[4/5] Building frontend..."
cd frontend
npm install
npm run build
cd ..

echo ""
echo "[5/5] Restarting the API..."
pm2 restart onlyfunds-api

# Nginx: make sure index.html is served uncached. Without the header, browsers
# (iOS Safari especially) keep showing the previous build after a deploy.
#
# The live site file belongs to certbot once HTTPS is set up — it rewrote it to
# add the TLS block — so patch the one line in place rather than re-rendering
# deploy/nginx.conf over the top of it and losing HTTPS. Idempotent: the grep
# skips it once the header is there.
SITE=/etc/nginx/sites-available/onlyfunds

# The EA repository accepts files far larger than the original 5m cap, and
# nginx rejects an oversized body before Express ever sees it. Same in-place
# patch as below: certbot owns this file after the first HTTPS run.
if [ -f "$SITE" ] && grep -q 'client_max_body_size 5m;' "$SITE"; then
  echo ""
  echo "[nginx] Raising the upload limit for the EA repository..."
  cp "$SITE" "$SITE.size.bak"
  sed -i 's|client_max_body_size 5m;|client_max_body_size 64m;|' "$SITE"
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx
    echo "        done — uploads up to 64MB per request"
  else
    mv "$SITE.size.bak" "$SITE"
    echo "        config did not validate; reverted, nothing changed"
  fi
fi

if [ -f "$SITE" ] && ! grep -q 'no-store' "$SITE"; then
  echo ""
  echo "[nginx] Teaching nginx not to cache index.html..."
  cp "$SITE" "$SITE.bak"
  sed -i 's|\(try_files \$uri \$uri/ /index.html;\)|\1\n        add_header Cache-Control "no-store, must-revalidate" always;|' "$SITE"
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx
    echo "        done — browsers will pick up new builds immediately"
  else
    mv "$SITE.bak" "$SITE"
    echo "        config did not validate; reverted, nothing changed"
  fi
fi

echo ""
echo "=============================="
echo "  Update complete"
echo "=============================="
echo "  Check: pm2 logs onlyfunds-api"
echo ""
