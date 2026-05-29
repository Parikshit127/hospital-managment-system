# HospitalOS — Project Handoff Document

**Project**: HospitalOS (Axten Hospitals)
**Client**: TAH Global Healthcare Pvt. Ltd.
**Domain**: axtenhospitals.com
**Date**: May 29, 2026
**Prepared by**: Parikshit Kaushal (Team Lead, Agentic AI & Web Development)

---

## 1. Project Overview

HospitalOS is a full-stack hospital ERP system built for Axten Hospitals (a unit of TAH Global Healthcare Pvt. Ltd.). It covers patient management, appointments, billing, pharmacy, IPD, lab, finance, and administration — designed to go into production for real hospital operations.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (React), Tailwind CSS |
| Backend | Next.js API Routes, Server Actions |
| ORM | Prisma |
| Database | PostgreSQL (AWS RDS) |
| Auth | JWT-based sessions with role-based access control |
| Payments | Razorpay (checkout + webhooks) |
| Email | Nodemailer via Gmail SMTP |
| Process Manager | PM2 (cluster mode) |
| Reverse Proxy | Nginx |
| Hosting | AWS EC2 (t3.medium, ap-south-1) |
| Domain Registrar | GoDaddy |

### Modules

- **Reception**: Patient registration, appointments, walk-ins
- **Doctor Portal**: Consultations, prescriptions, video calls
- **Billing**: OPD/IPD invoicing, GST-compliant tax invoices, Razorpay payments
- **Pharmacy**: Inventory, dispensing, supplier management
- **IPD**: Admissions, ward/bed management, discharge settlement
- **Lab**: Test ordering, results, reports
- **Finance**: GL, journal entries, vendor ledger, expense tracking, Tally export
- **Admin**: User management, master data, settings, audit logs
- **Patient Portal**: Self-service appointments, records, online payments
- **Superadmin**: Multi-org management, impersonation

---

## 2. AWS Architecture

### Infrastructure Diagram

```
                        ┌─────────────┐
                        │   GoDaddy   │
                        │  DNS (A rec)│
                        └──────┬──────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │  Elastic IP      │
                    │  13.234.242.13   │
                    └────────┬─────────┘
                             │
                             ▼
               ┌─────────────────────────┐
               │     EC2 (t3.medium)     │
               │     Ubuntu 22.04        │
               │     ap-south-1          │
               │                         │
               │  ┌───────────────────┐  │
               │  │      Nginx        │  │
               │  │   Port 80/443     │  │
               │  │  (reverse proxy)  │  │
               │  └────────┬──────────┘  │
               │           │             │
               │           ▼             │
               │  ┌───────────────────┐  │
               │  │    PM2 Cluster    │  │
               │  │  Next.js :3000    │  │
               │  │  (2 instances)    │  │
               │  └────────┬──────────┘  │
               └───────────┼─────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │     AWS RDS            │
              │  PostgreSQL (db.t3)    │
              │  database-1            │
              │  Port 5432             │
              └────────────────────────┘
```

### AWS Resources

| Resource | Details |
|----------|---------|
| EC2 Instance | t3.medium, Ubuntu 22.04, ap-south-1 |
| Elastic IP | 13.234.242.13 |
| RDS Instance | database-1.cfmygyosw8fp.ap-south-1.rds.amazonaws.com |
| RDS Engine | PostgreSQL, port 5432 |
| RDS DB Name | database-1 |
| RDS User | Avani112 |
| Region | ap-south-1 (Mumbai) |

### Security Groups

| Security Group | Port | Source | Purpose |
|---------------|------|--------|---------|
| EC2 SG | 22 | My IP | SSH access |
| EC2 SG | 80 | 0.0.0.0/0 | HTTP |
| EC2 SG | 443 | 0.0.0.0/0 | HTTPS |
| RDS SG | 5432 | EC2 SG ID | Database access (restrict to EC2 only) |

**Important**: RDS security group should ONLY allow port 5432 from the EC2 security group — never 0.0.0.0/0.

---

## 3. Domain & DNS Setup

**Domain**: axtenhospitals.com (GoDaddy)

### DNS Records

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | 13.234.242.13 | 1 Hour |
| CNAME | www | axtenhospitals.com | 1 Hour |
| TXT | @ | v=spf1 include:_spf.google.com ~all | 1 Hour |
| TXT | _dmarc | v=DMARC1; p=none; rua=mailto:admin@axtenhospitals.com | 1 Hour |

### SSL Setup (Certbot)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d axtenhospitals.com -d www.axtenhospitals.com
```

Auto-renewal verification:
```bash
sudo certbot renew --dry-run
```

---

## 4. Server Configuration

### Nginx Config

**File**: `/etc/nginx/sites-available/hospitalos`

```nginx
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;

server {
    listen 80;
    server_name axtenhospitals.com www.axtenhospitals.com 13.234.242.13;

    location /_next/static/ {
        alias /home/ubuntu/hospitalos/.next/static/;
        expires 365d;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/auth {
        limit_req zone=login burst=3 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### PM2 Configuration

```bash
# Start app
pm2 start npm --name hospitalos -i 2 -- start

# Auto-restart on reboot
pm2 save
pm2 startup

# Useful commands
pm2 list              # Check status
pm2 logs hospitalos   # View logs
pm2 reload hospitalos # Zero-downtime restart
pm2 monit             # Real-time monitoring
```

### Log Rotation

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
```

---

## 5. Environment Variables

**File**: `~/hospitalos/.env`

Key variables (sensitive values redacted):

```env
NODE_ENV="production"
DATABASE_URL="postgresql://Avani112:****@database-1.cfmygyosw8fp.ap-south-1.rds.amazonaws.com:5432/database-1?sslmode=require"
APP_BASE_URL="https://axtenhospitals.com"       # Update after SSL
NEXT_PUBLIC_APP_URL="https://axtenhospitals.com" # Update after SSL

# SMTP
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="admin@axtenhospitals.com"
SMTP_PASS="****"

# Razorpay
RAZORPAY_KEY_ID="****"
RAZORPAY_KEY_SECRET="****"

# JWT
JWT_SECRET="****"
```

**Critical note**: `NEXT_PUBLIC_*` variables are baked into the build. Any change requires `npm run build` followed by `pm2 reload hospitalos`.

---

## 6. Organization Details (Database)

| Field | Value |
|-------|-------|
| Org ID | org-axten-production |
| Legal Name | TAH Global Healthcare Pvt. Ltd. |
| Trade Name | Axten Hospitals |
| GSTIN | 07AALCT3380Q1ZK |
| GST State Code | 07 (Delhi) |
| Address | B-162, East Of Kailash Road, New Delhi, South Delhi, Delhi - 110065 |
| Email | admin@axtenhospitals.com |
| Website | https://axtenhospitals.com |
| Directors | Gautam Chhabra, Rajni Chhabra |

Updated via:
```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.organization.update({
  where: { id: 'org-axten-production' },
  data: {
    name: 'TAH Global Healthcare Pvt. Ltd.',
    address: 'B-162, East Of Kailash Road, New Delhi, South Delhi, Delhi - 110065',
    registration_number: '07AALCT3380Q1ZK',
    organization_gstin: '07AALCT3380Q1ZK',
    gst_state_code: '07',
    website: 'https://axtenhospitals.com'
  }
}).then(o => { console.log('Updated'); p.\$disconnect(); });
"
```

---

## 7. Authentication & Session Management

### Architecture

- JWT-based authentication with HTTP-only cookies
- Role-based access: superadmin, admin, doctor, receptionist, finance, lab_tech, ipd_manager, pharmacist, nurse
- Separate patient portal auth
- Session timeout: 15 minutes (staff), 30 minutes (patients)

### Key Files

| File | Purpose |
|------|---------|
| `app/lib/session.ts` | Session creation, verification, cookie management |
| `middleware.ts` | Route protection, JWT verification, role-based access |
| `app/login/actions.ts` | Staff login logic |
| `app/patient/login/actions.ts` | Patient login logic |

### Known Issue: Secure Cookie Flag

The `session.ts` and `middleware.ts` files set cookies with `secure: process.env.NODE_ENV === 'production'`. When running on HTTP (no SSL), browsers reject Secure cookies, causing login redirect loops.

**Fix** (apply if SSL is not configured):
```bash
sed -i "s/secure: process.env.NODE_ENV === 'production'/secure: process.env.APP_BASE_URL?.startsWith('https') ?? false/g" app/lib/session.ts
sed -i 's/secure: process.env.NODE_ENV === "production"/secure: process.env.APP_BASE_URL?.startsWith("https") ?? false/g' middleware.ts
npm run build && pm2 reload hospitalos
```

This makes the secure flag depend on the actual URL protocol rather than NODE_ENV, so it works on HTTP during development and HTTPS in production.

---

## 8. Billing & Invoice System

### Invoice PDF Generation

**File**: `app/api/invoice/[id]/pdf/route.ts`

- Generates HTML-based tax invoices
- Pulls hospital name, address, GSTIN from the `Organization` table
- Supports OPD and IPD invoices
- GST-compliant with CGST/SGST/IGST breakdowns
- Grouped by service category with HSN/SAC codes
- Amount in words (Indian numbering: Lakh, Crore)
- Payment history and credit note tracking

### CSP for Razorpay

**File**: `next.config.ts`

The Content-Security-Policy header must include all Razorpay domains:

```typescript
"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://cdn.razorpay.com https://*.razorpay.com",
"connect-src 'self' https://*.supabase.co https://*.razorpay.com https://api.razorpay.com https://lumberjack.razorpay.com https://lumberjack-cx.razorpay.com https://cdn.razorpay.com",
```

---

## 9. Email Configuration

| Setting | Value |
|---------|-------|
| SMTP Host | smtp.gmail.com |
| Port | 587 |
| Secure | false (STARTTLS) |
| User | admin@axtenhospitals.com |
| Auth | Google App Password |

### DNS Records for Email Deliverability

- **SPF**: `v=spf1 include:_spf.google.com ~all` (TXT record on @)
- **DMARC**: `v=DMARC1; p=none; rua=mailto:admin@axtenhospitals.com` (TXT record on _dmarc)
- **DKIM**: Configure via Google Workspace Admin

Without SPF and DMARC, emails land in spam.

---

## 10. Deployment Workflow

### Standard Update Process

```bash
# 1. SSH into EC2
ssh -i "/path/to/Avani His.pem" ubuntu@13.234.242.13

# 2. Pull latest code
cd ~/hospitalos
git pull origin main

# 3. Install dependencies (if package.json changed)
npm install

# 4. Run migrations (if schema changed)
npx prisma migrate deploy
npx prisma generate

# 5. Build and restart
npm run build
pm2 reload hospitalos
```

### If Git Pull Has Conflicts

```bash
git stash
git pull origin main
npm run build
pm2 reload hospitalos
```

### If Seed Files Cause Build Errors

Prisma seed `.ts` files in the `prisma/` directory get picked up by Next.js TypeScript compilation, causing redeclaration errors:

```bash
mv prisma/seed-production.ts prisma/seed-production.bak
mv prisma/seed-extra.ts prisma/seed-extra.bak
npm run build
```

---

## 11. Troubleshooting Guide

### Login Redirect Loop (Clicking any button goes back to login)

**Cause**: Secure cookies over HTTP. Browser ignores `Secure` cookies on non-HTTPS connections.
**Fix**: Set up SSL, or change the secure flag in `session.ts` and `middleware.ts` (see Section 7).

### ERR_CONNECTION_REFUSED

**Check in order**:
```bash
pm2 list                    # App running?
sudo systemctl status nginx # Nginx running?
sudo ufw status             # Ports 80/443 open?
curl http://localhost:3000   # App responding?
```

### CSS/JS MIME Type Errors (Unstyled page)

**Cause**: Stale `.next` build cache or Nginx not serving static files correctly.
**Fix**:
```bash
rm -rf .next
npm run build
pm2 reload hospitalos
```

### Database Connection Refused

**Check**:
1. RDS instance status (must be "Available" in AWS Console)
2. RDS security group allows port 5432 from EC2
3. Test connectivity: `nc -z -v database-1.cfmygyosw8fp.ap-south-1.rds.amazonaws.com 5432`

### Razorpay CSP Errors

**Cause**: Content-Security-Policy in `next.config.ts` missing Razorpay domains.
**Fix**: Ensure `script-src` and `connect-src` include `https://*.razorpay.com`.

---

## 12. Security Checklist (Pre-Production)

- [ ] SSL certificate installed via Certbot
- [ ] HTTP → HTTPS redirect in Nginx
- [ ] RDS security group locked to EC2 SG only (no 0.0.0.0/0)
- [ ] Strong JWT_SECRET (32+ random characters)
- [ ] SMTP using App Password (not regular password)
- [ ] Rate limiting on auth endpoints
- [ ] PM2 auto-startup enabled (`pm2 save && pm2 startup`)
- [ ] RDS automated backups enabled (7-day retention)
- [ ] RDS deletion protection enabled
- [ ] PM2 log rotation configured
- [ ] `.env` URLs updated to `https://axtenhospitals.com`
- [ ] SPF and DMARC DNS records added
- [ ] HSTS header enabled after SSL
- [ ] `NODE_ENV=production` set
- [ ] No debug/verbose flags in .env

---

## 13. Key SSH & Access Commands

```bash
# SSH into EC2
ssh -i "/Users/parikshitkaushal/Downloads/Avani His.pem" ubuntu@13.234.242.13

# Connect to RDS
psql -h database-1.cfmygyosw8fp.ap-south-1.rds.amazonaws.com -U Avani112 -d database-1 -p 5432

# Prisma Studio (visual DB browser)
cd ~/hospitalos && npx prisma studio --port 5555

# SSH tunnel for Prisma Studio (run on local machine)
ssh -i "/Users/parikshitkaushal/Downloads/Avani His.pem" -L 5555:localhost:5555 ubuntu@13.234.242.13

# View superadmin credentials
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.findMany({where:{role:'superadmin'},select:{username:true,email:true,role:true,full_name:true}}).then(u=>{console.log(JSON.stringify(u,null,2));p.\$disconnect()});"

# Health check
curl -s http://localhost:3000/api/health
```

---

## 14. Pending Items

| Item | Status | Priority |
|------|--------|----------|
| SSL via Certbot | DNS added, certbot not run | Critical |
| Update .env URLs to https | After SSL | Critical |
| Lock RDS security group | Currently 0.0.0.0/0 | Critical |
| DKIM setup in Google Workspace | Not done | High |
| S3 bucket for file storage | Not created | Medium |
| IAM Role for EC2→S3 | Not configured | Medium |
| RDS automated backups | Not verified | High |
| RDS deletion protection | Not enabled | High |

---

## 15. Repository

**GitHub**: https://github.com/Parikshit127/hospital-managment-system
**Branch**: main
**Server Path**: ~/hospitalos

---

*This document was generated as part of the HospitalOS deployment and configuration session. Keep it updated as infrastructure changes are made.*
