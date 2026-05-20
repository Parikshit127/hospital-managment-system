#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# HospitalOS — Complete EC2 Production Deployment
#
# This script automates the FULL deployment:
#   1. System packages (Node.js 20, PM2, Nginx, PostgreSQL client, AWS CLI)
#   2. Firewall (UFW)
#   3. Clone repo & install dependencies
#   4. Interactive .env setup (RDS, S3, SMTP, Razorpay, etc.)
#   5. Prisma migrations
#   6. Production build
#   7. PM2 startup
#   8. Nginx reverse proxy
#   9. SSL certificate (Let's Encrypt)
#   10. Automated DB backups (cron)
#
# Usage:
#   curl -sL https://raw.githubusercontent.com/YOUR_REPO/main/aws/deploy-full.sh | bash
#   — OR —
#   chmod +x deploy-full.sh && sudo bash deploy-full.sh
#
# Prerequisites:
#   - Fresh Ubuntu 22.04 LTS EC2 (t3.medium recommended)
#   - IAM Role attached with S3 access
#   - Security Group: ports 22, 80, 443 open
#   - RDS PostgreSQL already created (see instructions below)
#   - Domain pointing to EC2 Elastic IP
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

APP_DIR="/home/ubuntu/hospitalos"
BACKUP_DIR="/home/ubuntu/backups"
LOG_DIR="$APP_DIR/logs"

print_banner() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}HospitalOS — Full Production Deployment${NC}                     ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  EC2 + RDS PostgreSQL + S3 + Nginx + SSL + Backups          ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}► $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_warn() {
    echo -e "${YELLOW}  ⚠  $1${NC}"
}

print_ok() {
    echo -e "${GREEN}  ✓  $1${NC}"
}

print_info() {
    echo -e "${CYAN}  ℹ  $1${NC}"
}

ask_value() {
    local prompt="$1"
    local default="$2"
    local result=""
    if [ -n "$default" ]; then
        read -rp "  $prompt [$default]: " result
        echo "${result:-$default}"
    else
        while [ -z "$result" ]; do
            read -rp "  $prompt: " result
        done
        echo "$result"
    fi
}

ask_secret() {
    local prompt="$1"
    local result=""
    while [ -z "$result" ]; do
        read -srp "  $prompt: " result
        echo ""
    done
    echo "$result"
}

# ═══════════════════════════════════════════════════════════════════════════════
# PRE-FLIGHT CHECKS
# ═══════════════════════════════════════════════════════════════════════════════

print_banner

if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}ERROR: Run this script as root: sudo bash deploy-full.sh${NC}"
    exit 1
fi

echo -e "${YELLOW}This script will set up a COMPLETE production environment.${NC}"
echo -e "${YELLOW}Make sure you have:${NC}"
echo "  1. An RDS PostgreSQL instance already created"
echo "  2. A domain name pointing to this server's Elastic IP"
echo "  3. Your SMTP credentials (Gmail app password or similar)"
echo "  4. Your Razorpay API keys"
echo "  5. Your GitHub repo URL for HospitalOS"
echo ""
read -rp "Ready to proceed? (y/n): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1: SYSTEM PACKAGES
# ═══════════════════════════════════════════════════════════════════════════════

print_step "Phase 1/10: Installing system packages..."

apt-get update -y && apt-get upgrade -y
apt-get install -y \
    curl git build-essential unzip \
    nginx certbot python3-certbot-nginx \
    ufw htop jq \
    postgresql-client-14

print_ok "System packages installed"


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2: NODE.JS 20 LTS
# ═══════════════════════════════════════════════════════════════════════════════

print_step "Phase 2/10: Installing Node.js 20 LTS..."

if command -v node &> /dev/null && [[ "$(node --version)" == v20* ]]; then
    print_ok "Node.js $(node --version) already installed"
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    print_ok "Node.js $(node --version) installed"
fi

echo "  npm: $(npm --version)"


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3: PM2
# ═══════════════════════════════════════════════════════════════════════════════

print_step "Phase 3/10: Installing PM2 process manager..."

npm install -g pm2
pm2 startup systemd -u ubuntu --hp /home/ubuntu
print_ok "PM2 installed and set to start on boot"


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4: AWS CLI
# ═══════════════════════════════════════════════════════════════════════════════

print_step "Phase 4/10: Installing AWS CLI..."

if command -v aws &> /dev/null; then
    print_ok "AWS CLI already installed: $(aws --version)"
else
    curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip -q awscliv2.zip && ./aws/install && rm -rf aws awscliv2.zip
    print_ok "AWS CLI installed: $(aws --version)"
fi


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 5: FIREWALL
# ═══════════════════════════════════════════════════════════════════════════════

print_step "Phase 5/10: Configuring firewall..."

ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
print_ok "Firewall enabled — SSH, HTTP, HTTPS only"


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 6: CLONE REPO & INSTALL DEPENDENCIES
# ═══════════════════════════════════════════════════════════════════════════════

print_step "Phase 6/10: Cloning repository & installing dependencies..."

mkdir -p "$APP_DIR" "$LOG_DIR" "$BACKUP_DIR"

REPO_URL=$(ask_value "GitHub repo URL (HTTPS)" "")

if [ -d "$APP_DIR/.git" ]; then
    print_warn "Repository already cloned. Pulling latest..."
    cd "$APP_DIR"
    sudo -u ubuntu git pull origin main
else
    sudo -u ubuntu git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

chown -R ubuntu:ubuntu "$APP_DIR" "$BACKUP_DIR"

print_info "Installing npm dependencies (this takes 2-3 minutes)..."
sudo -u ubuntu bash -c "cd $APP_DIR && npm ci"
print_ok "Dependencies installed"


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 7: INTERACTIVE .ENV SETUP
# ═══════════════════════════════════════════════════════════════════════════════

print_step "Phase 7/10: Setting up environment variables..."

echo ""
echo -e "${BOLD}  --- Database (RDS PostgreSQL) ---${NC}"
print_info "Get these from AWS Console → RDS → Your instance → Connectivity"

RDS_HOST=$(ask_value "RDS endpoint (e.g. hospitalos-db.xxxx.ap-south-1.rds.amazonaws.com)" "")
RDS_PORT=$(ask_value "RDS port" "5432")
RDS_DB=$(ask_value "Database name" "hospitalos")
RDS_USER=$(ask_value "Master username" "postgres")
RDS_PASS=$(ask_secret "Master password")

DATABASE_URL="postgresql://${RDS_USER}:${RDS_PASS}@${RDS_HOST}:${RDS_PORT}/${RDS_DB}?sslmode=require"
DIRECT_URL="$DATABASE_URL"

echo ""
echo -e "${BOLD}  --- Application ---${NC}"
DOMAIN=$(ask_value "Your domain (e.g. hims.yourhospital.com)" "")
HOSPITAL_NAME=$(ask_value "Hospital name (display name)" "")
ORG_ID=$(ask_value "Organization ID (UUID, or press enter to auto-generate)" "")
if [ -z "$ORG_ID" ]; then
    ORG_ID=$(cat /proc/sys/kernel/random/uuid)
    print_info "Auto-generated: $ORG_ID"
fi

echo ""
echo -e "${BOLD}  --- Security ---${NC}"
JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
print_ok "JWT_SECRET auto-generated"
CONFIG_ENCRYPTION_KEY=$(openssl rand -base64 64 | tr -d '\n')
print_ok "CONFIG_ENCRYPTION_KEY auto-generated"
CRON_SECRET=$(openssl rand -base64 32 | tr -d '\n')
print_ok "CRON_SECRET auto-generated"
INTERNAL_VERIFY_TOKEN=$(openssl rand -base64 32 | tr -d '\n')
print_ok "INTERNAL_VERIFY_TOKEN auto-generated"

echo ""
echo -e "${BOLD}  --- Email (SMTP) ---${NC}"
SMTP_HOST=$(ask_value "SMTP host" "smtp.gmail.com")
SMTP_PORT=$(ask_value "SMTP port" "587")
SMTP_SECURE=$(ask_value "SMTP secure (true/false)" "false")
SMTP_USER=$(ask_value "SMTP email" "")
SMTP_PASS=$(ask_secret "SMTP password (app password)")

echo ""
echo -e "${BOLD}  --- Payments (Razorpay) ---${NC}"
print_info "Leave blank to skip if not using payments yet"
read -rp "  Razorpay Key ID [skip]: " RAZORPAY_KEY_ID
read -rp "  Razorpay Key Secret [skip]: " RAZORPAY_KEY_SECRET

echo ""
echo -e "${BOLD}  --- AI Features (Optional) ---${NC}"
read -rp "  OpenAI API Key [skip]: " OPENAI_API_KEY

echo ""
echo -e "${BOLD}  --- WhatsApp / AiSensy (Optional) ---${NC}"
read -rp "  AiSensy API Key [skip]: " AISENSY_API_KEY
WHATSAPP_VERIFY_TOKEN=$(openssl rand -base64 16 | tr -d '\n')

echo ""
echo -e "${BOLD}  --- AWS S3 ---${NC}"
S3_BUCKET=$(ask_value "S3 bucket name for patient documents" "hospitalos-production-documents")
AWS_REGION=$(ask_value "AWS region" "ap-south-1")
print_info "Using IAM Role for S3 access (no keys needed on EC2)"

# Write .env file
cat > "$APP_DIR/.env" << ENVEOF
# ═══════════════════════════════════════════════════════════════════════
# HospitalOS — Production Environment
# Generated: $(date)
# ═══════════════════════════════════════════════════════════════════════

# ── Database (RDS PostgreSQL) ──────────────────────────────────────────
DATABASE_URL="${DATABASE_URL}"
DIRECT_URL="${DIRECT_URL}"

# ── Application ────────────────────────────────────────────────────────
APP_BASE_URL="https://${DOMAIN}"
NEXT_PUBLIC_APP_URL="https://${DOMAIN}"
HOSPITAL_NAME="${HOSPITAL_NAME}"
ORGANIZATION_ID="${ORG_ID}"

# ── Authentication ─────────────────────────────────────────────────────
JWT_SECRET="${JWT_SECRET}"
CONFIG_ENCRYPTION_KEY="${CONFIG_ENCRYPTION_KEY}"

# ── Email (SMTP) ───────────────────────────────────────────────────────
SMTP_HOST="${SMTP_HOST}"
SMTP_PORT="${SMTP_PORT}"
SMTP_SECURE="${SMTP_SECURE}"
SMTP_USER="${SMTP_USER}"
SMTP_PASS="${SMTP_PASS}"

# ── Payments (Razorpay) ───────────────────────────────────────────────
RAZORPAY_KEY_ID="${RAZORPAY_KEY_ID:-}"
RAZORPAY_KEY_SECRET="${RAZORPAY_KEY_SECRET:-}"
NEXT_PUBLIC_RAZORPAY_KEY_ID="${RAZORPAY_KEY_ID:-}"

# ── AI Features ──────────────────────────────────────────────────────
OPENAI_API_KEY="${OPENAI_API_KEY:-}"

# ── WhatsApp (AiSensy) ───────────────────────────────────────────────
COMBIRDS_BASE_URL="https://backend.aisensy.com/campaign/t1/api"
AISENSY_API_KEY="${AISENSY_API_KEY:-}"
WHATSAPP_VERIFY_TOKEN="${WHATSAPP_VERIFY_TOKEN}"

# ── AWS S3 (Patient Documents) ───────────────────────────────────────
AWS_REGION="${AWS_REGION}"
AWS_S3_BUCKET="${S3_BUCKET}"
# IAM Role provides credentials automatically on EC2

# ── Scheduled Jobs ───────────────────────────────────────────────────
CRON_SECRET="${CRON_SECRET}"
INTERNAL_VERIFY_TOKEN="${INTERNAL_VERIFY_TOKEN}"
ENVEOF

chmod 600 "$APP_DIR/.env"
chown ubuntu:ubuntu "$APP_DIR/.env"
print_ok ".env file created with 600 permissions (owner-only read)"


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 8: DATABASE MIGRATION & BUILD
# ═══════════════════════════════════════════════════════════════════════════════

print_step "Phase 8/10: Running database migration & building app..."

print_info "Generating Prisma client..."
sudo -u ubuntu bash -c "cd $APP_DIR && npx prisma generate"

print_info "Testing database connection..."
if sudo -u ubuntu bash -c "cd $APP_DIR && npx prisma db execute --stdin <<< 'SELECT 1'" 2>/dev/null; then
    print_ok "Database connection successful"
else
    print_warn "Could not verify DB connection — will try migration anyway"
fi

print_info "Running database migrations..."
sudo -u ubuntu bash -c "cd $APP_DIR && npx prisma migrate deploy"
print_ok "Migrations applied"

print_info "Building Next.js production app (this takes 3-5 minutes)..."
sudo -u ubuntu bash -c "cd $APP_DIR && npm run build"
print_ok "Production build complete"


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 9: PM2 + NGINX + SSL
# ═══════════════════════════════════════════════════════════════════════════════

print_step "Phase 9/10: Starting app & configuring Nginx..."

# Start PM2
print_info "Starting app with PM2..."
sudo -u ubuntu bash -c "cd $APP_DIR && pm2 start ecosystem.config.js"
sudo -u ubuntu bash -c "pm2 save"
print_ok "App running on port 3000"

# Configure Nginx
print_info "Setting up Nginx reverse proxy..."

# Create Nginx config with actual domain
cat > /etc/nginx/sites-available/hospitalos << NGINXEOF
# HospitalOS — Nginx Reverse Proxy
# Generated: $(date)

limit_req_zone \$binary_remote_addr zone=login:10m rate=5r/s;

upstream hospitalos {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name ${DOMAIN};

    # Let Certbot handle redirect after SSL setup
    location / {
        proxy_pass http://hospitalos;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/session {
        limit_req zone=login burst=10 nodelay;
        proxy_pass http://hospitalos;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/health {
        proxy_pass http://hospitalos;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        access_log off;
    }

    location /_next/static/ {
        proxy_pass http://hospitalos;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    client_max_body_size 50M;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    # Block sensitive files
    location ~ /\. { deny all; return 404; }
    location ~ \.(env|git|bak|sql|dump)$ { deny all; return 404; }
}
NGINXEOF

# Enable site
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/hospitalos /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
print_ok "Nginx configured for ${DOMAIN}"

# SSL
print_info "Setting up SSL certificate with Let's Encrypt..."
echo ""
echo -e "${YELLOW}  Certbot will now request an SSL certificate.${NC}"
echo -e "${YELLOW}  Make sure your domain (${DOMAIN}) points to this server's IP!${NC}"
echo ""
read -rp "  Proceed with SSL setup? (y/n): " ssl_confirm

if [[ "$ssl_confirm" == "y" || "$ssl_confirm" == "Y" ]]; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$(ask_value "Email for SSL notifications" "$SMTP_USER")" --redirect
    print_ok "SSL certificate installed — HTTPS active"

    # Add HSTS and security headers to the SSL block
    # Certbot creates its own server block, we'll add headers
    if ! grep -q "Strict-Transport-Security" /etc/nginx/sites-available/hospitalos; then
        sed -i '/listen 443/a\    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;' /etc/nginx/sites-available/hospitalos
    fi

    # Add timeout config for PDF generation
    if ! grep -q "proxy_read_timeout" /etc/nginx/sites-available/hospitalos; then
        sed -i '/proxy_set_header X-Forwarded-Proto/a\        proxy_connect_timeout 60s;\n        proxy_send_timeout 60s;\n        proxy_read_timeout 120s;' /etc/nginx/sites-available/hospitalos
    fi

    nginx -t && systemctl reload nginx
else
    print_warn "Skipped SSL — run this later: sudo certbot --nginx -d $DOMAIN"
fi


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 10: BACKUPS & MONITORING
# ═══════════════════════════════════════════════════════════════════════════════

print_step "Phase 10/10: Setting up automated backups & monitoring..."

# Create backup script for RDS
cat > /home/ubuntu/backup-db.sh << 'BACKUPEOF'
#!/bin/bash
set -euo pipefail

source /home/ubuntu/hospitalos/.env

BACKUP_DIR="/home/ubuntu/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="hospitalos_${TIMESTAMP}.dump"
S3_BACKUP_BUCKET="${AWS_S3_BUCKET}"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting database backup..."

# Dump from RDS
PGPASSWORD=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p') \
pg_dump "$DIRECT_URL" \
    --format=custom \
    --no-owner \
    --no-acl \
    --file="$BACKUP_DIR/$FILENAME"

FILESIZE=$(du -sh "$BACKUP_DIR/$FILENAME" | cut -f1)
echo "[$(date)] Backup created: $FILENAME ($FILESIZE)"

# Upload to S3
aws s3 cp "$BACKUP_DIR/$FILENAME" "s3://${S3_BACKUP_BUCKET}/db-backups/$FILENAME"
echo "[$(date)] Uploaded to S3: s3://${S3_BACKUP_BUCKET}/db-backups/$FILENAME"

# Keep only last 7 local copies
cd "$BACKUP_DIR"
ls -t hospitalos_*.dump 2>/dev/null | tail -n +8 | xargs -r rm
echo "[$(date)] Cleanup done (keeping last 7 local copies)"

echo "[$(date)] Backup complete!"
BACKUPEOF

chmod +x /home/ubuntu/backup-db.sh
chown ubuntu:ubuntu /home/ubuntu/backup-db.sh

# Add to crontab — daily at 3 AM IST
(sudo -u ubuntu crontab -l 2>/dev/null || true; echo "0 3 * * * /home/ubuntu/backup-db.sh >> /home/ubuntu/backups/backup.log 2>&1") | sort -u | sudo -u ubuntu crontab -
print_ok "Daily backup scheduled at 3:00 AM (cron)"

# Auto-renew SSL
(crontab -l 2>/dev/null || true; echo "0 4 * * * certbot renew --quiet") | sort -u | crontab -
print_ok "SSL auto-renewal scheduled"

# PM2 log rotation
sudo -u ubuntu bash -c "pm2 install pm2-logrotate && pm2 set pm2-logrotate:max_size 50M && pm2 set pm2-logrotate:retain 7 && pm2 set pm2-logrotate:compress true"
print_ok "PM2 log rotation configured (50MB max, 7 days retention)"


# ═══════════════════════════════════════════════════════════════════════════════
# FINAL VERIFICATION
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}► Running final health checks...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

sleep 3

# Check PM2
if sudo -u ubuntu pm2 list | grep -q "online"; then
    print_ok "PM2: App is running"
else
    print_warn "PM2: App may not be running — check: pm2 logs hospitalos"
fi

# Check Nginx
if systemctl is-active --quiet nginx; then
    print_ok "Nginx: Active"
else
    print_warn "Nginx: Not running"
fi

# Check HTTP response
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" =~ ^(200|302|301)$ ]]; then
    print_ok "App: Responding (HTTP $HTTP_CODE)"
else
    print_warn "App: HTTP $HTTP_CODE — may still be starting up. Check: pm2 logs hospitalos"
fi

# Check UFW
if ufw status | grep -q "active"; then
    print_ok "Firewall: Active"
fi


# ═══════════════════════════════════════════════════════════════════════════════
# DONE
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}${GREEN}DEPLOYMENT COMPLETE!${NC}                                        ${CYAN}║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}                                                              ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}Your app:${NC}  https://${DOMAIN}                     ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                              ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}Useful commands:${NC}                                              ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}   pm2 logs hospitalos      — View app logs                   ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}   pm2 monit                 — CPU/Memory monitor              ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}   pm2 restart hospitalos    — Restart app                     ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}   sudo nginx -t             — Test Nginx config               ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}   /home/ubuntu/backup-db.sh — Manual backup                   ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                              ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}Backups:${NC}  Daily at 3 AM → S3 + local (7-day retention)       ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}SSL:${NC}      Auto-renews via Certbot                              ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}Logs:${NC}     Auto-rotated (50MB, 7-day retention)                 ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                              ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
