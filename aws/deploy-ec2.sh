#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# HospitalOS — EC2 Deployment Script
# Run this on the EC2 instance to deploy or update the application
# Usage: ./deploy-ec2.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

APP_DIR="/home/ubuntu/hospitalos"
BACKUP_DIR="/home/ubuntu/backups"
LOG_DIR="$APP_DIR/logs"

echo "╔══════════════════════════════════════════════════════╗"
echo "║        HospitalOS — Deploying to Production          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Create directories ───────────────────────────────────────────────────────
mkdir -p "$LOG_DIR" "$BACKUP_DIR"

cd "$APP_DIR"

# ── Pull latest code ────────────────────────────────────────────────────────
echo "► Pulling latest code..."
git pull origin main

# ── Install dependencies ────────────────────────────────────────────────────
echo "► Installing dependencies..."
npm ci --no-audit --no-fund

# ── Generate Prisma client ──────────────────────────────────────────────────
echo "► Generating Prisma client..."
npx prisma generate

# ── Run migrations ──────────────────────────────────────────────────────────
echo "► Running database migrations..."
npx prisma migrate deploy

# ── Build Next.js ───────────────────────────────────────────────────────────
echo "► Building Next.js application..."
npm run build

# ── Restart PM2 ─────────────────────────────────────────────────────────────
echo "► Restarting application..."
if pm2 describe hospitalos > /dev/null 2>&1; then
    pm2 reload ecosystem.config.js --update-env
else
    pm2 start ecosystem.config.js
fi
pm2 save

# ── Health check ────────────────────────────────────────────────────────────
echo "► Waiting for health check..."
sleep 5
if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✓ Health check passed!"
else
    echo "✗ Health check failed! Check logs: pm2 logs hospitalos"
    exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           Deployment Complete!                       ║"
echo "║                                                      ║"
echo "║  App:     http://localhost:3000                      ║"
echo "║  Logs:    pm2 logs hospitalos                        ║"
echo "║  Monitor: pm2 monit                                  ║"
echo "║  Status:  pm2 status                                 ║"
echo "╚══════════════════════════════════════════════════════╝"
