#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# HospitalOS — EC2 Server Setup Script
# Run this on a fresh Ubuntu 22.04 LTS EC2 instance
# Usage: chmod +x ec2-setup.sh && sudo ./ec2-setup.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

echo "╔══════════════════════════════════════════════════════╗"
echo "║     HospitalOS — EC2 Production Server Setup        ║"
echo "╚══════════════════════════════════════════════════════╝"

# ── 1. System Update ─────────────────────────────────────────────────────────
echo ""
echo "► Step 1/7: Updating system packages..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git build-essential nginx certbot python3-certbot-nginx ufw htop

# ── 2. Node.js 20 LTS ───────────────────────────────────────────────────────
echo ""
echo "► Step 2/7: Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
echo "   Node: $(node --version) | npm: $(npm --version)"

# ── 3. PM2 (Process Manager) ────────────────────────────────────────────────
echo ""
echo "► Step 3/7: Installing PM2..."
npm install -g pm2
pm2 startup systemd -u ubuntu --hp /home/ubuntu
echo "   PM2 installed and configured to start on boot"

# ── 4. PostgreSQL Client (for backups) ───────────────────────────────────────
echo ""
echo "► Step 4/7: Installing PostgreSQL client..."
apt-get install -y postgresql-client-14

# ── 5. AWS CLI (for S3 backups) ──────────────────────────────────────────────
echo ""
echo "► Step 5/7: Installing AWS CLI..."
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip -q awscliv2.zip && ./aws/install && rm -rf aws awscliv2.zip
echo "   AWS CLI: $(aws --version)"

# ── 6. Firewall ─────────────────────────────────────────────────────────────
echo ""
echo "► Step 6/7: Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "   Firewall enabled: SSH, HTTP, HTTPS only"

# ── 7. Create app directory ─────────────────────────────────────────────────
echo ""
echo "► Step 7/7: Creating application directory..."
mkdir -p /home/ubuntu/hospitalos
chown ubuntu:ubuntu /home/ubuntu/hospitalos

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Setup Complete!                         ║"
echo "║                                                      ║"
echo "║  Next steps (as ubuntu user):                        ║"
echo "║  1. Clone your repo to ~/hospitalos                  ║"
echo "║  2. Create .env file with production values          ║"
echo "║  3. Run: npm ci && npx prisma generate               ║"
echo "║  4. Run: npm run build                               ║"
echo "║  5. Run: pm2 start ecosystem.config.js               ║"
echo "║  6. Configure Nginx (see nginx.conf)                 ║"
echo "║  7. Run: sudo certbot --nginx -d yourdomain.com      ║"
echo "╚══════════════════════════════════════════════════════╝"
