---
name: Hospital OS Security Audit Findings
description: Key security patterns and vulnerability locations discovered in the hospital-os Next.js project
type: project
---

Security audit conducted 2026-04-02 on hospital-os (Next.js 16.1.6 + Prisma + PostgreSQL/Supabase, multi-tenant).

Key architecture: multi-tenant via getTenantPrisma() Prisma extension (auto-injects organizationId). JWT sessions (jose), bcrypt passwords, in-memory rate limiting, MFA via speakeasy TOTP for admin/doctor/finance roles.

**Critical findings:**
- .env file contains LIVE credentials (DB password, OpenAI API key, Razorpay secret, SMTP app password, WhatsApp tokens) — file exists on disk, .gitignore set but it must be confirmed never committed
- Raw SQL queries in admin-actions.ts (getRevenueBreakdown, getPatientFlow) bypass the Prisma tenant extension (db.$queryRaw has no organizationId filter) — cross-tenant data leak for revenue and patient counts
- Raw query in patient/appointments/actions.ts line 28 fetches ALL doctors across ALL organizations without org scope

**High findings:**
- Unauthenticated cron endpoint: /api/cron/pill-reminders — auth is commented out
- HTML injection in lab PDF, prescription PDF, invoice PDF — DB values (test_type, result_value, medicine_name, etc.) interpolated into HTML without escaping
- CSP uses 'unsafe-inline' and 'unsafe-eval' weakening XSS protection
- In-memory rate limiting resets on serverless cold starts
- Next.js 16.1.6 has 5 known vulnerabilities (should be >=16.1.7), xlsx <0.19.3 has 2 HIGH CVEs

**Medium findings:**
- /api/verify-lab-pharmacy dev-only route uses DEFAULT_ORG hardcoded — if NODE_ENV check bypassed creates test data in prod org
- error.message returned directly to clients in many server actions (Prisma internals potentially exposed)
- Patient session JWT expiry is 7 days (too long for healthcare PHI)
- receipt_number uses Math.random() — not cryptographically unique, collision risk
- APP_BASE_URL in .env has double "https://" — would break all password setup email links

**Auth architecture:**
- Middleware: /middleware.ts — JWT verification with jose, role/permission check per route prefix
- /api/razorpay/, /api/zealthix/, /api/reports/, /api/invoice/, /api/discharge/, /api/verify-lab-pharmacy bypass middleware (handle own auth)
- Tenant scoping: backend/db.ts getTenantPrisma() — Prisma extension injects organizationId
- Rate limiting: app/lib/login-rate-limit.ts (staff), app/patient/login/actions.ts (patient) — both in-memory

**Why:** Audit initiated by user to check all OWASP Top 10 categories in a hospital management system handling PHI.
**How to apply:** In future audits focus on raw query locations and HTML generation endpoints as highest risk areas.
