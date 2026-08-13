#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# HospitalOS — EC2 Deployment Script (Memory-Safe Edition)
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

# ── Ensure 2GB Swap space exists on EC2 to prevent OOM 502 crashes ──────────
if [ ! -f /swapfile ]; then
    echo "► Setting up 2GB swap space for memory safety..."
    sudo fallocate -l 2G /swapfile 2>/dev/null || true
    sudo chmod 600 /swapfile 2>/dev/null || true
    sudo mkswap /swapfile 2>/dev/null || true
    sudo swapon /swapfile 2>/dev/null || true
fi

# ── Create directories ───────────────────────────────────────────────────────
mkdir -p "$LOG_DIR" "$BACKUP_DIR"

cd "$APP_DIR"

# ── Pull latest code ────────────────────────────────────────────────────────
echo "► Pulling latest code..."
git pull origin main

# ── Install dependencies ────────────────────────────────────────────────────
echo "► Installing dependencies..."
npm ci --no-audit --no-fund --prefer-offline

# ── Generate Prisma client ──────────────────────────────────────────────────
echo "► Generating Prisma client..."
npx prisma generate

# ── Run migrations ──────────────────────────────────────────────────────────
echo "► Running database migrations..."
npx prisma migrate deploy

# ── Build Next.js ───────────────────────────────────────────────────────────
echo "► Building Next.js application (Memory-capped)..."
NODE_OPTIONS="--max-old-space-size=2048" npx next build

# ── Restart PM2 ─────────────────────────────────────────────────────────────
echo "► Restarting application in PM2..."
if npx pm2 describe hospitalos > /dev/null 2>&1; then
    npx pm2 reload ecosystem.config.js --update-env || npx pm2 restart hospitalos
else
    npx pm2 start ecosystem.config.js
fi
npx pm2 save

# ── Health check ────────────────────────────────────────────────────────────
echo "► Waiting for health check..."
sleep 5
if curl -sf http://localhost:3000/api/health > /dev/null 2>&1 || curl -sf http://localhost:3000/ > /dev/null 2>&1; then
    echo "✓ Health check passed!"
else
    echo "✗ Health check warning! Check status: npx pm2 status"
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           Deployment Complete!                       ║"
echo "║                                                      ║"
echo "║  App:     http://localhost:3000                      ║"
echo "║  Logs:    npx pm2 logs hospitalos                    ║"
echo "║  Status:  npx pm2 status                             ║"
echo "╚══════════════════════════════════════════════════════╝"
