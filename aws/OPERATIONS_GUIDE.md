# HospitalOS — Production Operations Guide

> **Server:** EC2 t3.medium (ap-south-1) | **DB:** RDS PostgreSQL | **Storage:** S3 | **Process Manager:** PM2  
> **App URL:** `http://YOUR_ELASTIC_IP` (update when domain is added)  
> **SSH:** `ssh -i your-key.pem ubuntu@YOUR_ELASTIC_IP`

---

## 1. Day-to-Day Commands (Quick Reference)

```bash
# SSH into server
ssh -i your-key.pem ubuntu@YOUR_IP

# App status
pm2 list                          # Process status
pm2 monit                         # Live CPU/Memory dashboard
curl http://localhost:3000/api/health  # Health check (DB + app)

# Logs
pm2 logs hospitalos               # Live tail
pm2 logs hospitalos --lines 200   # Last 200 lines
pm2 logs hospitalos --err         # Errors only

# Restart app
pm2 restart hospitalos            # Graceful restart
pm2 reload hospitalos             # Zero-downtime reload (preferred)

# System
free -h                           # Memory usage
df -h                             # Disk space
htop                              # Process monitor (q to quit)
```

---

## 2. Deploying Code Updates

### Standard Deploy (from GitHub)

```bash
cd ~/hospitalos

# Pull latest code
git pull origin main

# Install any new packages
npm ci

# Regenerate Prisma client (always do this)
npx prisma generate

# Run new migrations (if any)
npx prisma migrate deploy

# Build production app
npm run build

# Zero-downtime reload
pm2 reload hospitalos

# Verify
curl http://localhost:3000/api/health
```

### Quick Deploy Script

Create this once:

```bash
cat > ~/deploy.sh << 'EOF'
#!/bin/bash
set -e
cd ~/hospitalos
echo "→ Pulling latest code..."
git pull origin main
echo "→ Installing dependencies..."
npm ci
echo "→ Generating Prisma client..."
npx prisma generate
echo "→ Running migrations..."
npx prisma migrate deploy
echo "→ Building..."
npm run build
echo "→ Reloading PM2..."
pm2 reload hospitalos
sleep 5
echo "→ Health check..."
curl -s http://localhost:3000/api/health
echo ""
echo "✓ Deploy complete!"
EOF
chmod +x ~/deploy.sh
```

Then deploy with one command:

```bash
~/deploy.sh
```

### Rolling Back

If a deploy breaks something:

```bash
cd ~/hospitalos

# See recent commits
git log --oneline -10

# Roll back to a specific commit
git checkout <commit-hash> .
npm run build
pm2 reload hospitalos

# Or revert to the previous commit
git revert HEAD --no-edit
npm run build
pm2 reload hospitalos
```

---

## 3. Database Management

### Connect to Database

```bash
source ~/hospitalos/.env
psql "$DIRECT_URL"
```

### Common Queries

```sql
-- List all tables
\dt

-- Count records by table
SELECT 'Users' as table_name, count(*) FROM "User"
UNION ALL SELECT 'Patients', count(*) FROM "OPD_REG"
UNION ALL SELECT 'Appointments', count(*) FROM "appointments"
UNION ALL SELECT 'Invoices', count(*) FROM "invoices"
UNION ALL SELECT 'Organizations', count(*) FROM "Organization";

-- List all staff users
SELECT username, name, role, email, is_active FROM "User" ORDER BY role, name;

-- Find a patient
SELECT patient_id, name, phone, email FROM "OPD_REG" WHERE name ILIKE '%search_name%';

-- Check recent appointments
SELECT a.id, p.name, a.date, a.status
FROM "appointments" a
JOIN "OPD_REG" p ON a."patient_id" = p."patient_id"
ORDER BY a.date DESC LIMIT 20;

-- Database size
SELECT pg_size_pretty(pg_database_size(current_database()));

-- Table sizes
SELECT relname AS table, pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15;

-- Exit
\q
```

### Prisma Studio (Visual DB Browser)

```bash
# Start Prisma Studio on the server
cd ~/hospitalos && npx prisma studio &

# From your Mac, create an SSH tunnel
ssh -i your-key.pem -L 5555:localhost:5555 ubuntu@YOUR_IP

# Open in browser: http://localhost:5555
# When done, kill it on the server
kill %1
```

### Schema Changes / Migrations

```bash
# Check migration status
cd ~/hospitalos
npx prisma migrate status

# Apply pending migrations
npx prisma migrate deploy

# If migration fails on production, mark it resolved manually
npx prisma migrate resolve --applied <migration_name>

# DANGER: Full schema reset (destroys ALL data)
# Only use on a fresh database with no real patient data
npx prisma db push --force-reset
```

---

## 4. User Management

### Add a New Staff User

```bash
cd ~/hospitalos
cat > /tmp/add-user.ts << 'EOF'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
    const password = await bcrypt.hash(process.env.USER_PASS, 10);
    const user = await prisma.user.create({
        data: {
            username: process.env.USER_NAME,
            password,
            role: process.env.USER_ROLE,
            name: process.env.USER_DISPLAY,
            email: process.env.USER_EMAIL || null,
            organizationId: 'org-axten-production',
            is_active: true,
        },
    });
    console.log('Created:', user.username, user.role);
}
main().finally(() => prisma.$disconnect());
EOF

# Example: Add a new doctor
USER_NAME="dr.newdoc" USER_PASS="NewDoc@31" USER_ROLE="doctor" USER_DISPLAY="Dr. New Doctor" USER_EMAIL="newdoc@axtenhospitals.com" npx ts-node /tmp/add-user.ts
```

Available roles: `admin`, `doctor`, `receptionist`, `lab_technician`, `pharmacist`, `finance`, `ipd_manager`, `nurse`, `opd_manager`, `hr`, `coordinator`

### Disable a User

```bash
source ~/hospitalos/.env
psql "$DIRECT_URL" -c "UPDATE \"User\" SET is_active = false WHERE username = 'USERNAME_HERE';"
```

### Reset a User's Password

```bash
cd ~/hospitalos
node -e "
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
    const hash = await bcrypt.hash('NewPassword@31', 10);
    await prisma.user.update({ where: { username: 'USERNAME_HERE' }, data: { password: hash } });
    console.log('Password reset done');
    await prisma.\$disconnect();
})();
"
```

### List All Users

```bash
source ~/hospitalos/.env
psql "$DIRECT_URL" -c "SELECT username, name, role, email, is_active FROM \"User\" ORDER BY role, name;"
```

---

## 5. Backups & Restore

### Manual Backup

```bash
~/backup-db.sh
```

### Check Backup History

```bash
ls -lh ~/backups/
cat ~/backups/backup.log
```

### Backup Schedule

Backups run automatically at 3:00 AM daily via cron.

```bash
# View cron schedule
crontab -l

# Edit schedule
crontab -e
# The backup line looks like: 0 3 * * * /home/ubuntu/backup-db.sh >> ...
```

### Restore from Backup

```bash
source ~/hospitalos/.env

# List available backups
ls -lh ~/backups/hospitalos_*.dump

# Stop the app first
pm2 stop hospitalos

# Restore (replace filename with your backup)
pg_restore --clean --no-owner --no-acl -d "$DIRECT_URL" ~/backups/hospitalos_20260520_030000.dump

# Restart
pm2 start hospitalos
```

### Copy Backup to Your Local Machine

From your Mac:

```bash
scp -i your-key.pem ubuntu@YOUR_IP:~/backups/hospitalos_latest.dump ./
```

---

## 6. S3 Storage (Patient Documents)

### Create the S3 Bucket (if not done yet)

```bash
# Create bucket
aws s3 mb s3://hospitalos-production-documents --region ap-south-1

# Block public access
aws s3api put-public-access-block --bucket hospitalos-production-documents \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Enable versioning
aws s3api put-bucket-versioning --bucket hospitalos-production-documents \
    --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption --bucket hospitalos-production-documents \
    --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
```

### Check S3 Access (from EC2)

```bash
# Test that IAM role works
aws s3 ls s3://hospitalos-production-documents/

# List patient documents
aws s3 ls s3://hospitalos-production-documents/patient-records/ --recursive

# Check bucket size
aws s3 ls s3://hospitalos-production-documents/ --recursive --summarize | tail -2
```

### Download a Specific File

```bash
aws s3 cp s3://hospitalos-production-documents/patient-records/org/file.pdf ~/downloads/
```

---

## 7. Monitoring & Troubleshooting

### Health Check

```bash
# Quick health check
curl -s http://localhost:3000/api/health | python3 -m json.tool

# Check from outside (replace YOUR_IP)
curl -s http://YOUR_IP/api/health
```

### PM2 Monitoring

```bash
pm2 list                    # Status overview
pm2 monit                   # Live dashboard (CPU, Memory, Logs)
pm2 describe hospitalos     # Detailed process info
pm2 prettylist              # JSON process details
```

### System Monitoring

```bash
# Memory
free -h

# Disk
df -h

# CPU and processes
htop

# Network connections
ss -tlnp | grep -E '3000|80|443'

# Check swap usage
swapon --show
```

### Nginx

```bash
# Test config
sudo nginx -t

# Reload after config change
sudo systemctl reload nginx

# View access logs
sudo tail -f /var/log/nginx/access.log

# View error logs
sudo tail -f /var/log/nginx/error.log

# Check status
sudo systemctl status nginx
```

### Common Issues & Fixes

**App won't start / keeps crashing:**
```bash
pm2 logs hospitalos --err --lines 50    # Check errors
pm2 delete hospitalos                    # Remove process
npm run build                            # Rebuild
pm2 start ecosystem.config.js            # Start fresh
```

**Out of memory (OOM kill):**
```bash
free -h                                  # Check memory
swapon --show                            # Check swap exists
# If no swap:
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

**Database connection error:**
```bash
source ~/hospitalos/.env
psql "$DIRECT_URL" -c "SELECT 1"         # Test connection
# Check RDS is running in AWS Console
# Check security group allows EC2 → RDS on port 5432
```

**Disk full:**
```bash
df -h                                    # Check disk
du -sh ~/hospitalos/.next/               # Build cache size
du -sh ~/hospitalos/node_modules/        # node_modules size
pm2 flush                                # Clear all PM2 logs
sudo journalctl --vacuum-size=100M       # Clear system logs
```

**Nginx 502 Bad Gateway:**
```bash
pm2 list                                 # Is the app running?
curl http://localhost:3000               # Can you reach it locally?
sudo nginx -t                            # Is nginx config valid?
sudo systemctl restart nginx             # Restart nginx
```

---

## 8. SSL Setup (When You Get a Domain)

```bash
# 1. Point your domain A record to your Elastic IP

# 2. Update Nginx config with your domain
sudo sed -i 's/server_name _;/server_name yourdomain.com;/' /etc/nginx/sites-available/hospitalos
sudo nginx -t && sudo systemctl reload nginx

# 3. Get SSL certificate
sudo certbot --nginx -d yourdomain.com

# 4. Update .env
nano ~/hospitalos/.env
# Change:
#   APP_BASE_URL="https://yourdomain.com"
#   NEXT_PUBLIC_APP_URL="https://yourdomain.com"

# 5. Rebuild and restart (NEXT_PUBLIC vars are baked into the build)
npm run build
pm2 reload hospitalos

# SSL auto-renews via certbot timer — verify:
sudo systemctl status certbot.timer
```

---

## 9. Scaling (When You Need More Power)

### Vertical Scaling (Bigger Instance)

1. Stop the EC2 in AWS Console
2. Change instance type (e.g., t3.medium → t3.large)
3. Start it again
4. SSH in and run `pm2 start ecosystem.config.js`

### Horizontal Scaling (More PM2 Workers)

PM2 is already in cluster mode using all CPU cores. When you upgrade to more cores, PM2 automatically uses them:

```bash
pm2 scale hospitalos 0    # Stop all
pm2 scale hospitalos max  # Use all available cores
pm2 save
```

### Database Scaling

1. AWS Console → RDS → Modify
2. Change instance class (e.g., db.t3.micro → db.t3.small → db.t3.medium)
3. Apply during next maintenance window or immediately

---

## 10. Security Checklist (Monthly Review)

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Check firewall rules
sudo ufw status

# Check who's logged in
who
last -10

# Check for failed SSH attempts
sudo grep "Failed password" /var/log/auth.log | tail -20

# Verify .env permissions
ls -la ~/hospitalos/.env    # Should be -rw------- (600)

# Verify backups are running
ls -lt ~/backups/ | head -5
cat ~/backups/backup.log | tail -10

# Check SSL expiry (when domain is set up)
sudo certbot certificates

# Update Node.js (if needed)
node --version
# To update: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt install -y nodejs
```

---

## 11. Important File Locations

| What | Path |
|------|------|
| App code | `~/hospitalos/` |
| Environment vars | `~/hospitalos/.env` |
| PM2 config | `~/hospitalos/ecosystem.config.js` |
| Nginx config | `/etc/nginx/sites-available/hospitalos` |
| PM2 logs | `~/hospitalos/logs/` |
| Nginx logs | `/var/log/nginx/` |
| DB backups | `~/backups/` |
| Backup script | `~/backup-db.sh` |
| Deploy script | `~/deploy.sh` (create from section 2) |
| Swap file | `/swapfile` |
| Seed scripts | `~/hospitalos/prisma/seed-production.ts`, `seed-extra.ts` |

---

## 12. Emergency Contacts & Procedures

### App is Down

```bash
ssh -i key.pem ubuntu@YOUR_IP
pm2 list                          # Check if processes are running
pm2 restart hospitalos             # Quick restart
pm2 logs hospitalos --err          # Check what went wrong
```

### Database is Down

1. Check AWS Console → RDS → Events for maintenance or failure
2. If RDS is healthy but app can't connect → check security groups
3. If RDS failed → restore from automatic RDS snapshot in AWS Console

### Server is Unreachable

1. Check AWS Console → EC2 → Instance state
2. If stopped → Start it, re-associate Elastic IP
3. If running but unreachable → check Security Group rules (SSH port 22 open?)
4. Reboot via AWS Console → Actions → Reboot

### Need to Restore Everything from Scratch

1. Launch new EC2 (same config as before)
2. Run the setup script: `sudo bash deploy-full.sh`
3. Restore database: `pg_restore --clean --no-owner -d "$DIRECT_URL" backup.dump`
4. Patient documents are safe in S3 (independent of EC2)
