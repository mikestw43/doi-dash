#!/bin/bash
# ============================================
# DOI DASH — deploy the latest code
#   bash /opt/doi-dash/deploy/update.sh
# ============================================

set -euo pipefail

PROJECT_DIR="/opt/doi-dash"
cd "$PROJECT_DIR"

echo "=============================="
echo "  DOI DASH — update"
echo "=============================="

echo ""
echo "[1/5] Backing up the database first..."
bash deploy/backup.sh

echo ""
echo "[2/5] Pulling latest code..."
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
pm2 restart doi-dash-api

echo ""
echo "=============================="
echo "  Update complete"
echo "=============================="
echo "  Check: pm2 logs doi-dash-api"
echo ""
