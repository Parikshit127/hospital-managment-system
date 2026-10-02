#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# HospitalOS — Azure VM Setup Script
# Run this on the fresh Ubuntu 22.04 VM created by provision.sh
# Usage: chmod +x vm-setup.sh && sudo ./vm-setup.sh
# Same role as aws/ec2-setup.sh, swapping AWS CLI for Azure CLI.
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# The user who ran `sudo ./vm-setup.sh` — not root. This is whatever admin
# username you set when creating the VM (e.g. azureuser, parikshit889, ...).
VM_USER="${SUDO_USER:-$(logname 2>/dev/null || whoami)}"
VM_HOME="/home/$VM_USER"

echo "╔══════════════════════════════════════════════════════╗"
echo "║     HospitalOS — Azure Test VM Setup                 ║"
echo "╚══════════════════════════════════════════════════════╝"
echo "   Setting up for user: $VM_USER"

# ── 1. System Update ─────────────────────────────────────────────────────────
echo ""
echo "► Step 1/7: Updating system packages..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git build-essential nginx certbot python3-certbot-nginx ufw htop

# ── 2. Node.js 22 LTS (matches package.json engines) ─────────────────────────
echo ""
echo "► Step 2/7: Installing Node.js 22 LTS..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
echo "   Node: $(node --version) | npm: $(npm --version)"

# ── 3. PM2 (Process Manager) ────────────────────────────────────────────────
echo ""
echo "► Step 3/7: Installing PM2..."
npm install -g pm2
pm2 startup systemd -u "$VM_USER" --hp "$VM_HOME"
echo "   PM2 installed and configured to start on boot"

# ── 4. PostgreSQL Client (for backups / one-off queries) ────────────────────
echo ""
echo "► Step 4/7: Installing PostgreSQL client..."
apt-get install -y postgresql-client

# ── 5. Azure CLI (for Blob backups) ──────────────────────────────────────────
echo ""
echo "► Step 5/7: Installing Azure CLI..."
curl -sL https://aka.ms/InstallAzureCLIDeb | bash
echo "   az CLI: $(az version --output tsv --query '\"azure-cli\"' 2>/dev/null || echo installed)"

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
mkdir -p "$VM_HOME/hospitalos"
chown "$VM_USER:$VM_USER" "$VM_HOME/hospitalos"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Setup Complete!                         ║"
echo "║                                                      ║"
echo "║  Next steps (as $VM_USER):"
echo "║  1. Clone your repo to ~/hospitalos                  ║"
echo "║  2. Create .env from azure/.env.azure.example         ║"
echo "║  3. Run: npm ci && npx prisma generate               ║"
echo "║  4. Run: npm run build                               ║"
echo "║  5. Run: pm2 start azure/ecosystem.azure.config.js   ║"
echo "║  6. Configure Nginx (see azure/nginx.conf)            ║"
echo "║  7. Run: sudo certbot --nginx -d yourtestdomain.com  ║"
echo "╚══════════════════════════════════════════════════════╝"
