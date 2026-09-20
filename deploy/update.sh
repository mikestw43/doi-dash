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

echo ""
echo "=============================="
echo "  Update complete"
echo "=============================="
echo "  Check: pm2 logs onlyfunds-api"
echo ""
