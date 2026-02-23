# HospitalOS — Production Upgrade Plan
### Avani Enterprise · February 2026 · Confidential

> **How to use this file:** Every task has a checkbox. Check it off as you complete it.
> Every task references the exact file to create or edit. Nothing is vague.
> Work top to bottom — the order matters (security before features).

---

## Current State Snapshot

| What you have | Status |
|---|---|
| Next.js 15 + Prisma 5 + Supabase | ✅ Solid foundation |
| 7 RBAC roles + JWT auth (jose + bcryptjs) | ✅ Working |
| OPD registration + AI triage | ✅ Done |
| Doctor EHR, lab orders, pharmacy dispensing | ✅ Done |
| IPD admission, beds, wards, vitals | ✅ Done |
| Finance dashboard + Razorpay integration | ✅ Done |
| Insurance claims schema | ✅ Schema exists |
| Audit logs (partial) | ⚠️ Partial |
| Session timeout | ❌ Missing |
| Row-Level Security (RLS) | ❌ Missing |
| MFA | ❌ Missing |
| CI/CD pipeline | ❌ Missing |
| Staging environment | ❌ Missing |
| Error monitoring | ❌ Missing |
| WhatsApp integration | ❌ Missing |
| Drug interaction checker | ❌ Missing |
| PDF invoice generation | ❌ Missing |
| ICD-10 code lookup | ❌ Missing |

---

## Phase 0 — Security Lock (Week 1) 🔴 DO THIS BEFORE ANYTHING ELSE

These are non-negotiable. Any hospital that does an IT audit will reject you without these.

---

### 0.1 — Session Timeout Middleware

**Why:** NABH + HIPAA both require automatic session expiry on inactivity. Right now a logged-in browser tab stays alive forever.

**File to create:** `middleware.ts` (project root, next to `package.json`)

```ts
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SESSION_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes

export function middleware(request: NextRequest) {
  const session = request.cookies.get('session')
  const lastActivity = request.cookies.get('last_activity')
  const isAuthPage = request.nextUrl.pathname === '/login'

  if (isAuthPage) return NextResponse.next()

  // No session → redirect to login
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Session expired by inactivity
  if (lastActivity) {
    const elapsed = Date.now() - parseInt(lastActivity.value)
    if (elapsed > SESSION_TIMEOUT_MS) {
      const response = NextResponse.redirect(new URL('/login?reason=timeout', request.url))
      response.cookies.delete('session')
      response.cookies.delete('last_activity')
      return response
    }
  }

  // Update last activity timestamp on every request
  const response = NextResponse.next()
  response.cookies.set('last_activity', Date.now().toString(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  })
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)']
}
```

- [ ] Create `middleware.ts` in project root with the above code
- [ ] Show timeout message on login page when `?reason=timeout` is in URL (`app/login/page.tsx`)

---

### 0.2 — Security Headers

**Why:** Prevents XSS, clickjacking, and MIME sniffing attacks. Takes 10 minutes.

**File to edit:** `next.config.ts` (or `next.config.js` — create if missing)

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https:",
              "connect-src 'self' https://*.supabase.co https://api.razorpay.com",
              "frame-src https://api.razorpay.com",
            ].join('; ')
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          }
        ]
      }
    ]
  }
}

export default nextConfig
```

- [ ] Create/update `next.config.ts` with security headers
- [ ] Test that Razorpay checkout still works after CSP is applied

---

### 0.3 — Fix Session Cookie Security

**Why:** The current session cookie in `app/login/actions.ts` doesn't set `sameSite` or `maxAge`. This allows CSRF attacks and sessions that never expire.

**File to edit:** `app/login/actions.ts` — update the `cookieStore.set()` call:

```ts
// Replace the existing cookieStore.set call with:
cookieStore.set('session', JSON.stringify({
  id: user.id,
  username: user.username,
  role: user.role,
  name: user.name
}), {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 8, // 8 hours max session life
  path: '/'
})

// Also set last_activity cookie
cookieStore.set('last_activity', Date.now().toString(), {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/'
})
```

- [ ] Update `app/login/actions.ts` cookie settings

---

### 0.4 — Expand Audit Logging to ALL Critical Actions

**Why:** Your `system_audit_logs` table exists but only login is logged. NABH requires every clinical mutation to be audited.

**File to create:** `app/lib/audit.ts` (shared audit helper)

```ts
// app/lib/audit.ts
import { PrismaClient } from '@prisma/client'
import { cookies } from 'next/headers'

const prisma = new PrismaClient()

export async function logAudit({
  action,
  module,
  entity_type,
  entity_id,
  details,
}: {
  action: string
  module: string
  entity_type?: string
  entity_id?: string
  details?: string
}) {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('session')
    const session = sessionCookie ? JSON.parse(sessionCookie.value) : null

    await prisma.system_audit_logs.create({
      data: {
        user_id: session?.id ?? 'system',
        username: session?.username ?? 'unknown',
        role: session?.role ?? 'unknown',
        action,
        module,
        entity_type: entity_type ?? null,
        entity_id: entity_id ?? null,
        details: details ?? null,
        // Note: IP address requires request object — pass from route handler if needed
      }
    })
  } catch (err) {
    // Audit log failure should NEVER crash the main operation
    console.error('[AUDIT LOG FAILED]', err)
  }
}
```

**Then add `logAudit()` calls to these files:**

- [ ] `app/actions/register-patient.ts` → after successful patient creation: `logAudit({ action: 'PATIENT_REGISTERED', module: 'OPD', entity_type: 'patient', entity_id: patient.patient_id })`
- [ ] `app/actions/ipd-actions.ts` → after admission: `logAudit({ action: 'PATIENT_ADMITTED', module: 'IPD', ... })`
- [ ] `app/actions/ipd-actions.ts` → after discharge: `logAudit({ action: 'PATIENT_DISCHARGED', module: 'IPD', ... })`
- [ ] `app/actions/finance-actions.ts` → after payment: `logAudit({ action: 'PAYMENT_PROCESSED', module: 'Finance', ... })`
- [ ] `app/actions/finance-actions.ts` → after discount applied: `logAudit({ action: 'DISCOUNT_APPLIED', module: 'Finance', ... })`
- [ ] `app/actions/lab-actions.ts` → after result entry: `logAudit({ action: 'LAB_RESULT_ENTERED', module: 'Lab', ... })`
- [ ] `app/actions/pharmacy-actions.ts` → after dispensing: `logAudit({ action: 'MEDICINE_DISPENSED', module: 'Pharmacy', ... })`
- [ ] `app/actions/discharge-actions.ts` → already partially done, verify all paths log

---

### 0.5 — Enable Supabase Row-Level Security

**Why:** Without RLS, a logged-in lab technician can query the finance table. Every role should see only what they're allowed to see — enforced at the database level, not just the UI.

**Steps:**
1. Go to Supabase Dashboard → your project → Table Editor
2. For each table, click the table → "RLS" tab → "Enable RLS"
3. Add policies:

```sql
-- Example: Only finance role can read invoices
-- Run these in Supabase SQL Editor

-- invoices: only accessible to finance and admin
CREATE POLICY "finance_admin_only" ON invoices
  FOR ALL USING (
    auth.jwt() ->> 'role' IN ('finance', 'admin')
  );

-- OPD_REG: receptionist, doctor, admin, finance can read
CREATE POLICY "patient_access" ON "OPD_REG"
  FOR SELECT USING (
    auth.jwt() ->> 'role' IN ('receptionist', 'doctor', 'admin', 'finance', 'ipd_manager')
  );

-- vital_signs: only doctor, ipd_manager, admin can write
CREATE POLICY "vitals_write" ON vital_signs
  FOR INSERT WITH CHECK (
    auth.jwt() ->> 'role' IN ('doctor', 'ipd_manager', 'admin')
  );
```

- [ ] Enable RLS on `OPD_REG`, `invoices`, `payments`, `insurance_claims`, `vital_signs`, `Clinical_EHR`, `lab_orders`, `pharmacy_orders`
- [ ] Add SELECT, INSERT, UPDATE policies per role for each table
- [ ] Test each role login to confirm they can't access unauthorized data

---

### 0.6 — Environment Variable Audit

**Why:** Secrets must never be in code. Your `.env` is gitignored but let's make sure.

- [ ] Confirm `.env` is in `.gitignore` (check now)
- [ ] Audit all secrets — every API key, DB URL, Razorpay secret — confirm they're in `.env` only
- [ ] Add a `.env.example` file with placeholder values (so future developers know what's needed)
- [ ] For production: move secrets to Vercel Environment Variables / GCP Secret Manager — never hardcode

```bash
# .env.example — commit this file, not .env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
RAZORPAY_KEY_ID="rzp_live_..."
RAZORPAY_KEY_SECRET="your_secret"
OPENAI_API_KEY="sk-..."
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
WHATSAPP_API_TOKEN=""
WHATSAPP_PHONE_NUMBER_ID=""
```

- [ ] Create `.env.example`
- [ ] Verify `.gitignore` includes `.env`

---

## Phase 1 — Feature Completion (Weeks 2–5) 🟡

These are the features hospitals ask about in every sales demo.

---

### 1.1 — Real-Time Bed Matrix Dashboard

**Why:** You have `beds` and `wards` tables but no real-time visual board. Every hospital's first question is "can I see bed availability live?"

**File to create:** `app/ipd/bed-matrix/page.tsx`

Features to build:
- Grid of all wards with bed cards (color-coded: green=Available, red=Occupied, yellow=Cleaning, blue=Reserved)
- Each occupied bed shows: patient name, admission date, doctor, days stayed
- One-click bed assignment from the grid
- Auto-refresh every 30 seconds (or use `router.refresh()` with a timer)
- Summary bar at top: Total Beds / Occupied / Available / Cleaning

Schema reference — your existing models:
- `wards` → ward name, total beds, ward type
- `beds` → bed number, ward_id, status, current patient
- `admissions` → patient_id, bed_id, admission_date, doctor_name

- [ ] Create bed matrix page with ward grid UI
- [ ] Add color-coded bed status cards
- [ ] Add auto-refresh (30-second polling or `setInterval` with router.refresh)
- [ ] Add "Quick Admit" button on each available bed

---

### 1.2 — PDF Invoice Generation

**Why:** Hospitals need a printable, professional bill. "Print Invoice" is clicked after every discharge and after every payment.

**Package to install:** `npm install @react-pdf/renderer` OR use server-side `puppeteer` for full HTML→PDF

**Simpler option — use `puppeteer` for server-side rendering:**

```bash
npm install puppeteer
```

**File to create:** `app/api/invoice/[id]/pdf/route.ts`

```ts
// app/api/invoice/[id]/pdf/route.ts
import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const invoice = await prisma.invoices.findUnique({
    where: { id: parseInt(params.id) },
    include: { items: true, patient: true, payments: true }
  })

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const html = generateInvoiceHTML(invoice) // Write this function

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle0' })
  const pdf = await page.pdf({ format: 'A4', printBackground: true })
  await browser.close()

  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${invoice.id}.pdf"`,
    }
  })
}
```

- [ ] Install `puppeteer` or `@react-pdf/renderer`
- [ ] Create `app/api/invoice/[id]/pdf/route.ts`
- [ ] Write `generateInvoiceHTML()` function with hospital header, patient details, line items, totals, GST breakdown
- [ ] Add "Print Invoice" button to `app/finance/dashboard/page.tsx` and `app/discharge/admin/page.tsx`

---

### 1.3 — GST-Compliant Billing

**Why:** Indian hospitals must separate medical services (0% GST) from non-medical services (18% GST) on every invoice.

**File to edit:** `app/actions/finance-actions.ts`

Add GST computation when creating/finalizing invoices:

```ts
// Add this utility function
function computeGST(items: InvoiceItem[]) {
  const taxableItems = items.filter(i =>
    ['Consumables', 'Accommodation', 'Housekeeping'].includes(i.department)
  )
  const gstableAmount = taxableItems.reduce((sum, i) => sum + Number(i.net_price), 0)
  const gst = gstableAmount * 0.18 // 18% GST on non-medical services
  return { gstableAmount, gst, cgst: gst / 2, sgst: gst / 2 }
}
```

- [ ] Add GST computation to invoice finalization action
- [ ] Add `gst_amount`, `cgst`, `sgst` fields to invoice PDF output
- [ ] Show GST breakdown in finance dashboard invoice view

---

### 1.4 — WhatsApp Business API Integration

**Why:** Highest-demand feature in Indian hospitals. Patients expect appointment reminders and reports on WhatsApp.

**Sign up at:** `business.whatsapp.com` → Get API access → Get `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_API_TOKEN`

**File to create:** `app/lib/whatsapp.ts`

```ts
// app/lib/whatsapp.ts
const WA_API_URL = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`

export async function sendWhatsAppMessage(to: string, message: string) {
  const response = await fetch(WA_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/\D/g, ''), // Strip non-digits
      type: 'text',
      text: { body: message }
    })
  })
  return response.json()
}

// Appointment reminder
export async function sendAppointmentReminder(phone: string, patientName: string, doctorName: string, time: string) {
  return sendWhatsAppMessage(phone,
    `🏥 *Avani Hospital Reminder*\n\nDear ${patientName},\n\nYour appointment with *Dr. ${doctorName}* is confirmed for *${time}*.\n\nPlease bring your Patient ID card.\n\nFor queries, call: +91-XXXXXXXXXX`
  )
}

// Lab report ready
export async function sendLabReportReady(phone: string, patientName: string, testName: string) {
  return sendWhatsAppMessage(phone,
    `🔬 *Avani Hospital — Lab Report Ready*\n\nDear ${patientName},\n\nYour *${testName}* report is ready. Please collect from the Lab or view online at [portal link].\n\nThank you.`
  )
}

// Discharge summary
export async function sendDischargeSummary(phone: string, patientName: string) {
  return sendWhatsAppMessage(phone,
    `📋 *Avani Hospital — Discharge Summary*\n\nDear ${patientName},\n\nYour discharge summary has been prepared. Please collect from the reception or we will email it to you shortly.\n\nWishing you a speedy recovery! 🌿`
  )
}
```

**Wire it into existing actions:**
- [ ] Add `sendAppointmentReminder()` call in `app/actions/register-patient.ts` after appointment creation
- [ ] Add `sendLabReportReady()` call in `app/actions/lab-actions.ts` after result upload
- [ ] Add `sendDischargeSummary()` call in `app/actions/discharge-actions.ts` after discharge
- [ ] Add `WHATSAPP_API_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` to `.env`

---

### 1.5 — Drug Interaction Checker

**Why:** Patient safety. Also a NABH requirement. Your pharmacy currently dispenses without checking.

**API to use:** OpenFDA Drug Interaction API (free, no key needed for basic use)

**File to create:** `app/lib/drug-safety.ts`

```ts
// app/lib/drug-safety.ts
export async function checkDrugInteractions(drugNames: string[]): Promise<{
  hasInteractions: boolean
  interactions: string[]
}> {
  if (drugNames.length < 2) return { hasInteractions: false, interactions: [] }

  try {
    const query = drugNames.slice(0, 4).join('+AND+') // OpenFDA limit
    const res = await fetch(
      `https://api.fda.gov/drug/label.json?search=drug_interactions:${encodeURIComponent(query)}&limit=3`,
      { next: { revalidate: 3600 } } // Cache for 1 hour
    )
    const data = await res.json()

    if (data.results?.length > 0) {
      const interactions = data.results
        .map((r: any) => r.drug_interactions?.[0])
        .filter(Boolean)
        .slice(0, 3)
      return { hasInteractions: interactions.length > 0, interactions }
    }
    return { hasInteractions: false, interactions: [] }
  } catch {
    return { hasInteractions: false, interactions: [] } // Fail safe — don't block dispensing
  }
}
```

- [ ] Create `app/lib/drug-safety.ts`
- [ ] Call `checkDrugInteractions()` in pharmacy dispensing action before confirming order
- [ ] Show warning banner in pharmacy UI if interactions detected (don't block, just warn with override option)
- [ ] Log drug interaction warnings in `system_audit_logs`

---

### 1.6 — ICD-10 Code Lookup in Doctor EHR

**Why:** Required for insurance claims. Doctors need to assign ICD-10 codes at time of diagnosis entry.

**Approach:** Embed a searchable ICD-10 list using a free dataset.

**File to create:** `app/lib/icd10.ts`

```ts
// app/lib/icd10.ts
// Use WHO ICD-10 API (free)
export async function searchICD10(query: string) {
  const res = await fetch(
    `https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?sf=code,name&terms=${encodeURIComponent(query)}&maxList=10`,
    { next: { revalidate: 86400 } } // Cache for 24 hours
  )
  const [, , , results] = await res.json()
  // Returns: [code, description] pairs
  return results?.map(([code, name]: string[]) => ({ code, name })) ?? []
}
```

- [ ] Create `app/lib/icd10.ts` using NLM Clinical Tables API
- [ ] Add ICD-10 search field to doctor's EHR note form in `app/doctor/dashboard/page.tsx`
- [ ] Store selected ICD-10 code in `Clinical_EHR` table (add `icd10_code` column to schema)
- [ ] Display ICD-10 code on discharge summary

---

### 1.7 — Discharge Summary PDF

**Why:** The HTML discharge summary at `/discharge/admin` needs to be downloadable as a professional PDF for the patient.

- [ ] Add "Download PDF" button to `app/discharge/admin/page.tsx`
- [ ] Create `app/api/discharge/[admissionId]/pdf/route.ts` using puppeteer (same pattern as invoice PDF)
- [ ] Include: patient demographics, admission/discharge dates, diagnosis + ICD-10 code, procedures, medications on discharge, follow-up instructions, doctor signature line
- [ ] Trigger WhatsApp delivery of summary link after PDF is generated

---

### 1.8 — Audit Trail Viewer Page

**Why:** Your audit logs are being written but there's no UI to read them. Admins need to review access logs for compliance.

**File to create:** `app/admin/audit/page.tsx`

Features:
- Paginated table of `system_audit_logs`
- Filter by: module, action, user, date range
- Export to CSV button
- Highlight critical actions (PAYMENT_REVERSED, DISCOUNT_APPLIED, DELETE) in red
- Only accessible by `admin` role

- [ ] Create `app/admin/audit/page.tsx`
- [ ] Add to admin dashboard navigation
- [ ] Add CSV export functionality
- [ ] Add role-guard: if `session.role !== 'admin'` → redirect to login

---

## Phase 2 — Reliability & Infrastructure (Week 5–8) 🟠

Your system needs to survive production before you take on paying hospitals.

---

### 2.1 — Set Up Error Monitoring (Sentry)

**Why:** Without error monitoring you're flying blind in production. You won't know something broke until a hospital calls you.

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

- [ ] Install Sentry and run the wizard (it auto-creates `sentry.client.config.ts`, `sentry.server.config.ts`)
- [ ] Add `SENTRY_DSN` to `.env`
- [ ] Create a Sentry project at `sentry.io` (free tier is fine to start)
- [ ] Test by throwing a deliberate error and confirming it appears in Sentry dashboard

---

### 2.2 — Set Up CI/CD Pipeline

**Why:** Manual deployments in a hospital setting are dangerous. A broken push can take down a live hospital system.

**File to create:** `.github/workflows/deploy.yml`

```yaml
# .github/workflows/deploy.yml
name: Deploy HospitalOS

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit   # Type-check without building

  # Add deploy job here when you're ready for automated deployment
  # (Vercel, Railway, or Cloud Run)
```

- [ ] Create `.github/workflows/deploy.yml`
- [ ] Connect repo to Vercel (simplest) or Railway for auto-deploy from `main` branch
- [ ] Set all environment variables in Vercel dashboard (never in code)
- [ ] Create a `staging` branch that deploys to a staging URL

---

### 2.3 — Database Backup Strategy

**Why:** If Supabase has an outage or data corruption, you need a backup. Patient data loss is catastrophic.

**Supabase steps:**
1. Supabase Dashboard → Settings → Database → Daily Backups → Enable (Pro plan required)
2. Enable Point-in-Time Recovery (PITR) on Pro plan

**Manual backup script — add to your project:**

```bash
# scripts/backup-db.sh
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backup_${DATE}.sql"

pg_dump "$DATABASE_URL" > "$BACKUP_FILE"
gzip "$BACKUP_FILE"
echo "Backup created: ${BACKUP_FILE}.gz"

# TODO: Upload to S3/GCS for offsite storage
```

- [ ] Upgrade Supabase to Pro plan (required for daily backups)
- [ ] Enable Point-in-Time Recovery in Supabase
- [ ] Test a restore: actually restore from backup to a test database to confirm it works
- [ ] Set reminder to test restore every 3 months

---

### 2.4 — Performance: Add Caching with Unstable Cache

**Why:** Your admin dashboard and bed matrix queries run on every page load. With 50+ concurrent users these DB queries will slow everything down.

**Add to heavy queries in server actions:**

```ts
import { unstable_cache } from 'next/cache'

// Wrap expensive queries
const getBedMatrixCached = unstable_cache(
  async (wardId: string) => {
    return prisma.beds.findMany({ where: { ward_id: wardId }, include: { ... } })
  },
  ['bed-matrix'],
  { revalidate: 30 } // Refresh every 30 seconds
)
```

- [ ] Add `unstable_cache` to admin dashboard stats query in `app/actions/admin-actions.ts`
- [ ] Add caching to bed matrix query (30-second revalidation)
- [ ] Add caching to charge catalog / medicine master (these don't change often — 1 hour TTL)

---

### 2.5 — Database Indexes for Performance

**Why:** As patient records grow (10,000+ patients), unindexed queries will become slow. Add indexes now before you have data.

**File to create:** `prisma/migrations/add_indexes.sql`

```sql
-- Run in Supabase SQL Editor or via prisma migration
CREATE INDEX IF NOT EXISTS idx_opd_reg_phone ON "OPD_REG"(phone);
CREATE INDEX IF NOT EXISTS idx_opd_reg_created ON "OPD_REG"(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date DESC);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_status ON lab_orders(status);
CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON system_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON system_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_vital_signs_patient ON vital_signs(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admissions_status ON admissions(status);
CREATE INDEX IF NOT EXISTS idx_beds_status ON beds(status);
```

- [ ] Run index SQL in Supabase SQL Editor
- [ ] Add these as Prisma schema `@@index` annotations to keep schema in sync

---

### 2.6 — Dedicated PostgreSQL (Migrate Away from Supabase Shared)

**Why:** Supabase free tier has connection limits and is shared infrastructure. For a paying hospital, you need dedicated infra.

Options:
- **Easiest:** Supabase Pro plan — dedicated database, no connection limits, daily backups
- **More control:** Neon.tech (serverless Postgres, great DX) or Railway Postgres
- **Enterprise:** GCP Cloud SQL (Mumbai region for India data residency)

- [ ] Upgrade to Supabase Pro OR migrate to Neon/Railway
- [ ] Update `DATABASE_URL` in production environment
- [ ] Run `npx prisma migrate deploy` on new database
- [ ] Run `npx prisma db seed` with demo data
- [ ] Test all features on new database before cutting over

---

## Phase 3 — Key Feature Upgrades (Weeks 8–16) 🟢

These turn HospitalOS from "good" to "enterprise-grade."

---

### 3.1 — Multi-Tenant Architecture (hospital_id on all tables)

**Why:** To sell to more than one hospital as a SaaS, every record must be scoped to a hospital.

**Schema changes needed:**

```prisma
// Add to prisma/schema.prisma

model Hospital {
  id          String   @id @default(uuid())
  name        String
  code        String   @unique
  address     String?
  phone       String?
  license_no  String?
  logo_url    String?
  is_active   Boolean  @default(true)
  created_at  DateTime @default(now())

  @@map("hospitals")
}

// Add hospital_id to EVERY major table:
// OPD_REG, appointments, admissions, beds, wards,
// invoices, lab_orders, pharmacy_orders, etc.
```

**Implementation approach:**
1. Add `hospital_id String` to every table
2. Create a "default hospital" record with a fixed ID for your current single-hospital setup
3. Update all queries to filter by `hospital_id` from session
4. Add `hospital_id` to JWT session token

- [ ] Add `Hospital` model to `prisma/schema.prisma`
- [ ] Add `hospital_id` column to all major tables
- [ ] Create migration with default hospital record
- [ ] Update all Prisma queries to include `where: { hospital_id }` filter
- [ ] Add `hospital_id` to session cookie on login

---

### 3.2 — AI Discharge Summary (LLM-Powered)

**Why:** Doctors spend 20–30 minutes writing discharge summaries. AI can do it in 5 seconds with doctor review.

**File to edit:** `app/actions/discharge-actions.ts`

```ts
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateAISummary(admissionId: string) {
  // 1. Fetch all clinical data for this admission
  const admission = await prisma.admissions.findUnique({
    where: { admission_id: admissionId },
    include: { patient: true }
  })
  const vitals = await prisma.vital_signs.findMany({ where: { patient_id: admission.patient_id } })
  const labOrders = await prisma.lab_orders.findMany({ where: { patient_id: admission.patient_id } })
  const ehrNotes = await prisma.clinical_EHR.findMany({ where: { patient_id: admission.patient_id } })

  // 2. Build prompt
  const prompt = `
You are a senior physician writing a hospital discharge summary.
Based on the following clinical data, write a concise, professional discharge summary.

Patient: ${admission.patient.full_name}, Age: ${admission.patient.age}
Admission Date: ${admission.admission_date}
Diagnosis: ${ehrNotes[0]?.diagnosis ?? 'Not recorded'}
Doctor Notes: ${ehrNotes.map(n => n.doctor_notes).join('. ')}
Vitals on Admission: ${JSON.stringify(vitals[0])}
Lab Results: ${labOrders.map(l => `${l.test_type}: ${l.result_value ?? 'Pending'}`).join(', ')}

Write the discharge summary with these sections:
1. Chief Complaint
2. Hospital Course
3. Significant Findings
4. Discharge Diagnosis
5. Medications on Discharge
6. Follow-up Instructions

Keep it clinical, concise, and professional.`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1000,
  })

  return completion.choices[0].message.content
}
```

- [ ] Add `generateAISummary()` to discharge actions
- [ ] Add "Generate AI Summary" button to `app/discharge/admin/page.tsx`
- [ ] Show AI summary in editable textarea for doctor review before finalizing
- [ ] Store finalized summary in `discharge_summaries` table
- [ ] Log AI generation as audit event

---

### 3.3 — Insurance Claim Workflow UI

**Why:** Your schema for insurance claims is complete but there's no UI to submit, track, or manage claims.

**File to create:** `app/insurance/claims/page.tsx`

Features:
- List all claims with status (Submitted / UnderReview / Approved / Rejected)
- Submit new claim from finalized invoice
- Update claim status (approval, rejection, partial approval)
- Revenue leakage alert: invoices with insurance patients that don't have a claim
- Filter by: insurance provider, status, date range, amount

- [ ] Create `app/insurance/claims/page.tsx` with claim list and status badges
- [ ] Create claim submission form linking invoice → insurance policy
- [ ] Add claim status update action to `app/actions/insurance-actions.ts`
- [ ] Add "Revenue Leakage" alert: `SELECT * FROM invoices WHERE patient has insurance_policy AND no insurance_claim`
- [ ] Add to navigation for Finance Admin role

---

### 3.4 — Patient UHID (Unique Hospital ID) Standardization

**Why:** Your current `patient_id` is a random string. Indian hospitals use UHID format: `HOSP-YYYY-XXXXX`.

**File to edit:** `app/actions/register-patient.ts`

```ts
async function generateUHID(): Promise<string> {
  const year = new Date().getFullYear()
  const count = await prisma.oPD_REG.count()
  const seq = String(count + 1).padStart(5, '0')
  return `AVN-${year}-${seq}` // AVN for Avani
}

// Use in patient creation:
const patient_id = await generateUHID()
```

- [ ] Update `register-patient.ts` to use UHID format
- [ ] Update all UI displays to show UHID instead of raw UUID
- [ ] Print UHID on patient registration slip, invoices, lab reports

---

### 3.5 — MFA for Admin, Doctor, Finance Roles

**Why:** HIPAA requires strong authentication for clinical users. Supabase makes this easy.

Note: Currently you use Prisma/bcryptjs for auth, not Supabase Auth. Two options:
- **Option A (simpler):** Add TOTP via `speakeasy` npm package to your existing auth
- **Option B (better long-term):** Migrate auth to Supabase Auth which has built-in MFA

**Option A — Quick TOTP with speakeasy:**

```bash
npm install speakeasy qrcode
```

```ts
// New table needed in schema:
model user_mfa {
  user_id    String  @id
  secret     String  // TOTP secret (store encrypted)
  enabled    Boolean @default(false)
  created_at DateTime @default(now())
}
```

- [ ] Add `user_mfa` table to Prisma schema
- [ ] Create MFA setup flow: generate TOTP secret → show QR code → verify first code
- [ ] Add TOTP verification step to login for admin/doctor/finance roles
- [ ] Create backup codes (10 single-use codes) in case device is lost

---

## Phase 4 — Polish & Scale (Weeks 16–24) 🔵

---

### 4.1 — Patient Mobile App (React Native / PWA)

**Why:** Patients want to book appointments, see reports, and pay bills from their phones.

**Recommended approach:** Start with a PWA (Progressive Web App) — it works in mobile browser, no app store needed.

- [ ] Add PWA manifest to `public/manifest.json`
- [ ] Add service worker for offline support
- [ ] Create patient-facing routes: `/patient/login`, `/patient/appointments`, `/patient/reports`, `/patient/bills`
- [ ] Add JWT-based patient auth (separate from staff auth)
- [ ] Test on mobile Chrome (PWA install prompt)

---

### 4.2 — HR Module (Staff Master + Duty Roster)

**New Prisma models needed:**
```prisma
model staff {
  id           String   @id @default(uuid())
  employee_id  String   @unique
  name         String
  designation  String
  department   String
  phone        String?
  email        String?
  join_date    DateTime
  is_active    Boolean  @default(true)
  created_at   DateTime @default(now())
}

model duty_roster {
  id         Int      @id @default(autoincrement())
  staff_id   String
  date       DateTime
  shift      String   // Morning, Afternoon, Night
  ward       String?
  is_present Boolean  @default(false)
  created_at DateTime @default(now())
}
```

- [ ] Add `staff` and `duty_roster` models to schema
- [ ] Create `app/admin/hr/page.tsx` with staff list and roster calendar
- [ ] Add shift assignment UI with drag-and-drop calendar

---

### 4.3 — FHIR R4 API Layer

**Why:** Required for ABDM/Ayushman Bharat Digital Mission integration. Hospitals increasingly ask for this.

- [ ] Install `@medplum/fhirtypes` for TypeScript FHIR types
- [ ] Create `app/api/fhir/Patient/[id]/route.ts` — return FHIR Patient resource
- [ ] Create `app/api/fhir/Encounter/[id]/route.ts` — return FHIR Encounter for OPD visit
- [ ] Create `app/api/fhir/Observation/[id]/route.ts` — return vital signs as FHIR Observations
- [ ] Document the FHIR API in a Swagger spec
- [ ] Register with ABDM sandbox for ABHA health ID integration

---

### 4.4 — Analytics Dashboard Upgrades

Current admin dashboard has good KPIs. Upgrade with:

- [ ] ALOS (Average Length of Stay) chart by ward and month
- [ ] Revenue trend: 12-month bar chart by department
- [ ] Payer mix pie chart (Cash / UPI / Card / Insurance / Corporate)
- [ ] Bed occupancy trend (daily for last 30 days)
- [ ] Lab TAT (Turnaround Time) by test type
- [ ] Readmission rate (patients re-admitted within 30 days)
- [ ] Top 10 diagnoses (ICD-10 codes) this month
- [ ] Install `recharts` or `chart.js` for chart rendering

---

## Quick Reference: File Map

| Task | File |
|---|---|
| Session timeout | `middleware.ts` (create at root) |
| Security headers | `next.config.ts` |
| Cookie security | `app/login/actions.ts` |
| Audit logging helper | `app/lib/audit.ts` (create) |
| WhatsApp API | `app/lib/whatsapp.ts` (create) |
| Drug interaction check | `app/lib/drug-safety.ts` (create) |
| ICD-10 search | `app/lib/icd10.ts` (create) |
| Invoice PDF | `app/api/invoice/[id]/pdf/route.ts` (create) |
| Discharge PDF | `app/api/discharge/[id]/pdf/route.ts` (create) |
| Bed matrix UI | `app/ipd/bed-matrix/page.tsx` (create) |
| Audit trail viewer | `app/admin/audit/page.tsx` (create) |
| Insurance claims UI | `app/insurance/claims/page.tsx` (create) |
| AI discharge summary | `app/actions/discharge-actions.ts` (edit) |
| UHID generation | `app/actions/register-patient.ts` (edit) |
| GST billing | `app/actions/finance-actions.ts` (edit) |
| CI/CD pipeline | `.github/workflows/deploy.yml` (create) |
| Environment template | `.env.example` (create) |
| DB indexes | `prisma/migrations/add_indexes.sql` (create) |

---

## Progress Tracker

| Phase | Tasks | Done |
|---|---|---|
| Phase 0 — Security Lock | 12 tasks | 0/12 |
| Phase 1 — Feature Completion | 28 tasks | 0/28 |
| Phase 2 — Infrastructure | 16 tasks | 0/16 |
| Phase 3 — Enterprise Features | 20 tasks | 0/20 |
| Phase 4 — Scale | 16 tasks | 0/16 |
| **Total** | **92 tasks** | **0/92** |

---

## First Day Priority Order

If you're starting today, do these 5 things in order:

1. **Create `middleware.ts`** — session timeout (2 hours)
2. **Create `next.config.ts`** with security headers (1 hour)
3. **Fix cookie in `app/login/actions.ts`** — add `sameSite` + `maxAge` (30 min)
4. **Create `app/lib/audit.ts`** and wire it into 3 key actions (3 hours)
5. **Create `app/lib/whatsapp.ts`** and wire into registration + lab result (3 hours)

That's one solid day of work and your project goes from "demo-ready" to "pilot-hospital-ready."

---

*HospitalOS Production Upgrade Plan · Avani Enterprise · February 2026*
*Update this file as you complete tasks. Keep it the single source of truth for the upgrade.*
