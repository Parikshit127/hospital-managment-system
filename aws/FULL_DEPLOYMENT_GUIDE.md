# HospitalOS — Complete AWS Deployment Guide

> **Stack:** EC2 (t3.medium) + RDS PostgreSQL + S3 + Nginx + SSL + Automated Backups  
> **Region:** ap-south-1 (Mumbai)  
> **Estimated monthly cost:** ~$50–65/mo

---

## Pre-Deployment Checklist

Before you begin, have these ready:

- [ ] AWS account with admin access
- [ ] A domain name (e.g., `hims.yourhospital.com`)
- [ ] GitHub repo URL for HospitalOS
- [ ] SMTP credentials (Gmail app password works)
- [ ] Razorpay API keys (if using payments)
- [ ] OpenAI API key (optional, for AI features)

---

## Step 1: Create an Elastic IP

You need a static IP that won't change when the EC2 restarts.

1. Go to **AWS Console → EC2 → Elastic IPs** (left sidebar, under Network & Security)
2. Click **"Allocate Elastic IP address"**
3. Region: `ap-south-1`, click **Allocate**
4. Note down the IP: `_______________`
5. **Don't associate it yet** — we'll do that after launching EC2

> **Point your domain to this IP now.** Go to your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.) and create an **A record**:
> - **Host:** `hims` (or `@` for root domain)
> - **Value:** the Elastic IP you just got
> - **TTL:** 300

---

## Step 2: Create the S3 Bucket (Patient Documents)

1. Go to **AWS Console → S3**
2. Click **"Create bucket"**
3. Configure:
   - **Bucket name:** `hospitalos-production-documents`
   - **Region:** `ap-south-1`
   - **Block all public access:** ✅ ON (keep it checked — files are served via signed URLs)
   - **Bucket Versioning:** Enable
   - **Default encryption:** SSE-S3 (Amazon S3 managed keys)
4. Click **Create bucket**

### Add a Lifecycle Rule (move old files to cheaper storage)

1. Open the bucket → **Management** tab → **Create lifecycle rule**
2. Rule name: `archive-old-records`
3. Apply to all objects
4. Transitions:
   - Move to **Standard-IA** after **90 days**
   - Move to **Glacier Flexible** after **365 days**
5. Click **Create rule**

---

## Step 3: Create the RDS PostgreSQL Database

1. Go to **AWS Console → RDS → Create database**
2. Choose **Standard create**
3. Configuration:

| Setting | Value |
|---------|-------|
| Engine | PostgreSQL |
| Engine version | 16.x (latest) |
| Template | **Free tier** (if eligible) or **Production** |
| DB instance identifier | `hospitalos-db` |
| Master username | `postgres` |
| Master password | **Choose a strong password** — write it down! |
| DB instance class | `db.t3.micro` (free tier) or `db.t3.small` ($25/mo) |
| Storage | 20 GB, gp3, enable autoscaling (max 100 GB) |
| Availability | Single-AZ (saves money; switch to Multi-AZ later for HA) |
| VPC | Default VPC |
| Public access | **No** (we'll connect from EC2 in the same VPC) |
| VPC security group | Create new → name it `hospitalos-db-sg` |
| Database name | `hospitalos` |
| Backup retention | 7 days |
| Enable encryption | Yes |
| Enable Performance Insights | Yes (free tier) |

4. Click **Create database** (takes 5-10 minutes)

### Configure Security Group for RDS

After the DB is created:

1. Go to **RDS → hospitalos-db → Connectivity & security**
2. Click the security group link (`hospitalos-db-sg`)
3. **Inbound rules → Edit inbound rules**
4. Add rule:
   - Type: **PostgreSQL** (port 5432)
   - Source: **The security group of your EC2** (we'll create EC2 next, come back to this step)
5. Save rules

> **Note the RDS endpoint** — it looks like: `hospitalos-db.xxxxxxxxx.ap-south-1.rds.amazonaws.com`

---

## Step 4: Create IAM Role for EC2 (S3 Access)

This lets your EC2 instance access S3 without storing AWS keys.

1. Go to **AWS Console → IAM → Roles → Create role**
2. **Trusted entity type:** AWS service
3. **Use case:** EC2
4. Click **Next**
5. Add these policies:
   - Search `AmazonS3FullAccess` → check it
   - Search `CloudWatchAgentServerPolicy` → check it (for monitoring)
6. Click **Next**
7. **Role name:** `HospitalOS-EC2-Role`
8. Click **Create role**

---

## Step 5: Launch the EC2 Instance

1. Go to **AWS Console → EC2 → Launch instance**
2. Configure:

| Setting | Value |
|---------|-------|
| Name | `HospitalOS-Production` |
| AMI | Ubuntu Server 22.04 LTS (64-bit x86) |
| Instance type | `t3.medium` (2 vCPU, 4 GB RAM) |
| Key pair | Create new or use existing — **download the .pem file!** |
| VPC | Default VPC (same as RDS) |
| Subnet | Any public subnet in ap-south-1 |
| Auto-assign public IP | Enable |
| Security group | Create new: `hospitalos-ec2-sg` |
| — Inbound Rule 1 | SSH (22) — My IP |
| — Inbound Rule 2 | HTTP (80) — Anywhere (0.0.0.0/0) |
| — Inbound Rule 3 | HTTPS (443) — Anywhere (0.0.0.0/0) |
| Storage | **30 GB gp3** (root volume only, nothing else) |
| IAM instance profile | `HospitalOS-EC2-Role` (created in Step 4) |

3. Click **Launch instance**

### Associate Elastic IP

1. Go to **EC2 → Elastic IPs**
2. Select your Elastic IP → **Actions → Associate**
3. Choose your `HospitalOS-Production` instance
4. Click **Associate**

### Fix RDS Security Group (Step 3 continuation)

Now go back to the RDS security group:

1. **RDS → hospitalos-db → Connectivity → Security group**
2. Edit inbound rules
3. Source for PostgreSQL rule: select **`hospitalos-ec2-sg`** (the EC2 security group)
4. Save

This allows only your EC2 to talk to the database.

---

## Step 6: SSH into EC2 and Deploy

Open your terminal (macOS/Linux) or PowerShell (Windows):

```bash
# Make key file secure
chmod 400 your-key.pem

# SSH into the instance
ssh -i your-key.pem ubuntu@YOUR_ELASTIC_IP
```

### Option A: Run the automated deployment script

```bash
# Download and run the all-in-one script
cd /tmp
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git hospitalos-setup
sudo bash hospitalos-setup/aws/deploy-full.sh
```

The script will:
- Install all system packages (Node.js, PM2, Nginx, AWS CLI)
- Set up the firewall
- Clone your repo
- Prompt you for all environment variables interactively
- Run database migrations on RDS
- Build the production app
- Start PM2 + Nginx
- Set up SSL with Let's Encrypt
- Configure automated daily backups to S3

### Option B: Manual step-by-step

If you prefer doing it manually:

#### 6a. Install packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx certbot python3-certbot-nginx ufw htop postgresql-client-14

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# PM2
sudo npm install -g pm2
pm2 startup systemd -u ubuntu --hp /home/ubuntu

# AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install && rm -rf aws awscliv2.zip
```

#### 6b. Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

#### 6c. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git ~/hospitalos
cd ~/hospitalos
npm ci
```

#### 6d. Create .env

```bash
nano ~/hospitalos/.env
```

Paste this and fill in your values:

```env
# Database (RDS)
DATABASE_URL="postgresql://postgres:YOUR_RDS_PASSWORD@hospitalos-db.xxxx.ap-south-1.rds.amazonaws.com:5432/hospitalos?sslmode=require"
DIRECT_URL="postgresql://postgres:YOUR_RDS_PASSWORD@hospitalos-db.xxxx.ap-south-1.rds.amazonaws.com:5432/hospitalos?sslmode=require"

# Application
APP_BASE_URL="https://hims.yourhospital.com"
NEXT_PUBLIC_APP_URL="https://hims.yourhospital.com"
HOSPITAL_NAME="Your Hospital Name"
ORGANIZATION_ID="generate-a-uuid"

# Auth (auto-generate these)
JWT_SECRET="PASTE_OUTPUT_OF: openssl rand -base64 64"
CONFIG_ENCRYPTION_KEY="PASTE_OUTPUT_OF: openssl rand -base64 64"

# SMTP
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-gmail-app-password"

# Razorpay
RAZORPAY_KEY_ID="rzp_live_xxxx"
RAZORPAY_KEY_SECRET="your-secret"
NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_live_xxxx"

# AI (optional)
OPENAI_API_KEY="sk-..."

# WhatsApp (optional)
COMBIRDS_BASE_URL="https://backend.aisensy.com/campaign/t1/api"
AISENSY_API_KEY="your-key"
WHATSAPP_VERIFY_TOKEN="PASTE_OUTPUT_OF: openssl rand -base64 16"

# AWS S3
AWS_REGION="ap-south-1"
AWS_S3_BUCKET="hospitalos-production-documents"

# Cron
CRON_SECRET="PASTE_OUTPUT_OF: openssl rand -base64 32"
INTERNAL_VERIFY_TOKEN="PASTE_OUTPUT_OF: openssl rand -base64 32"
```

Lock it down:

```bash
chmod 600 ~/hospitalos/.env
```

#### 6e. Database migration & build

```bash
cd ~/hospitalos
npx prisma generate
npx prisma migrate deploy
npm run build
```

#### 6f. Start with PM2

```bash
mkdir -p ~/hospitalos/logs
pm2 start ecosystem.config.js
pm2 save
```

Verify it's running:

```bash
pm2 list
curl http://localhost:3000
```

#### 6g. Configure Nginx

```bash
sudo cp ~/hospitalos/aws/nginx.conf /etc/nginx/sites-available/hospitalos

# Edit the domain — replace hims.yourhospital.com with your actual domain
sudo nano /etc/nginx/sites-available/hospitalos

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/hospitalos /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 6h. SSL Certificate

```bash
sudo certbot --nginx -d hims.yourhospital.com
```

Follow the prompts. Certbot will auto-configure HTTPS redirect.

#### 6i. Automated backups

```bash
# Copy backup script
cp ~/hospitalos/aws/backup-db.sh ~/backup-db.sh
chmod +x ~/backup-db.sh

# Test it manually first
./backup-db.sh

# Schedule daily at 3 AM
crontab -e
# Add this line:
# 0 3 * * * /home/ubuntu/backup-db.sh >> /home/ubuntu/backups/backup.log 2>&1
```

#### 6j. PM2 log rotation

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

## Step 7: Verify Everything Works

Run these checks:

```bash
# 1. App is running
pm2 list                              # should show "online"

# 2. Database is connected
cd ~/hospitalos && npx prisma db execute --stdin <<< "SELECT count(*) FROM \"Organization\""

# 3. S3 access works (from IAM role)
aws s3 ls s3://hospitalos-production-documents/

# 4. HTTPS works
curl -I https://hims.yourhospital.com  # should return 200 or 302

# 5. Backup works
/home/ubuntu/backup-db.sh

# 6. Check S3 for the backup
aws s3 ls s3://hospitalos-production-documents/db-backups/
```

---

## Step 8: Seed Initial Data (First Time Only)

If this is a fresh database, you need to create the first organization and admin user.

Add these to your `.env` temporarily:

```bash
echo 'ALLOW_SEED="true"' >> ~/hospitalos/.env
echo 'SEED_ADMIN_PASSWORD="YourStrongPassword123!"' >> ~/hospitalos/.env
echo 'SEED_SUPERADMIN_PASSWORD="YourSuperAdminPass123!"' >> ~/hospitalos/.env
```

Run the seed:

```bash
cd ~/hospitalos
npx prisma db seed
```

**Remove seed variables immediately after:**

```bash
sed -i '/ALLOW_SEED/d' ~/hospitalos/.env
sed -i '/SEED_ADMIN_PASSWORD/d' ~/hospitalos/.env
sed -i '/SEED_SUPERADMIN_PASSWORD/d' ~/hospitalos/.env
pm2 restart hospitalos
```

---

## Day-to-Day Operations

### Deploy updates

```bash
cd ~/hospitalos
git pull origin main
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 restart hospitalos
```

Or use the script:

```bash
bash ~/hospitalos/aws/deploy-ec2.sh
```

### View logs

```bash
pm2 logs hospitalos          # Live logs
pm2 logs hospitalos --lines 100  # Last 100 lines
sudo tail -f /var/log/nginx/error.log  # Nginx errors
```

### Manual backup

```bash
/home/ubuntu/backup-db.sh
```

### Restore from backup

```bash
# List available backups
aws s3 ls s3://hospitalos-production-documents/db-backups/

# Download a specific backup
aws s3 cp s3://hospitalos-production-documents/db-backups/hospitalos_20260520_030000.dump ~/restore.dump

# Restore to RDS (drops and recreates)
pg_restore --clean --no-owner --no-acl \
  -d "postgresql://postgres:PASSWORD@hospitalos-db.xxxx.ap-south-1.rds.amazonaws.com:5432/hospitalos?sslmode=require" \
  ~/restore.dump
```

### Monitor resources

```bash
pm2 monit       # CPU/Memory per process
htop            # System overview
df -h           # Disk space
```

---

## Monthly Cost Breakdown

| Service | Spec | Cost/mo |
|---------|------|---------|
| EC2 | t3.medium (2 vCPU, 4 GB) | ~$30 |
| RDS | db.t3.micro (free tier year 1) | $0–$15 |
| S3 | ~10 GB documents + backups | ~$1 |
| Elastic IP | (free while attached to running EC2) | $0 |
| Data transfer | ~50 GB/mo | ~$4 |
| SSL | Let's Encrypt | Free |
| **Total** | | **~$35–50/mo** |

After free tier expires, RDS db.t3.small adds ~$25/mo → total ~$60–75/mo.

---

## Security Checklist

- [x] RDS not publicly accessible (EC2 security group only)
- [x] S3 bucket blocks all public access (signed URLs only)
- [x] UFW firewall allows only SSH/HTTP/HTTPS
- [x] .env file has 600 permissions (owner read/write only)
- [x] Nginx blocks .env, .git, .sql, .dump files
- [x] SSL/TLS 1.2+ with HSTS
- [x] Rate limiting on login endpoint
- [x] IAM Role for S3 (no hardcoded AWS keys)
- [x] RDS encryption at rest enabled
- [x] S3 AES-256 server-side encryption
- [x] Daily automated backups to S3
- [x] Security headers (X-Frame-Options, CSP, etc.)
