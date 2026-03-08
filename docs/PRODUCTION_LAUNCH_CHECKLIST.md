# HospitalOS Production Launch Checklist

This checklist maps to the 8–12 week production rollout plan and documents what is implemented in-repo vs. what must be configured in infrastructure.

## 1) Release-Stopper Controls (Implemented)

- Removed destructive deploy command from `vercel.json` (`db push --accept-data-loss` removed).
- Added production env validation (`app/lib/env.ts`) and startup checks in critical server modules.
- Locked internal verification endpoint behind environment + token check (`app/api/verify-lab-pharmacy/route.ts`).

## 2) Tenant + Access Hardening (Implemented)

- Added centralized tenant/role helpers:
  - `backend/tenant.ts` (`requireRoleAndTenant`)
  - `app/lib/route-auth.ts` (staff/patient route auth resolver)
- Added route-level auth and tenant ownership checks for all sensitive PDF/report endpoints:
  - `app/api/invoice/[id]/pdf/route.ts`
  - `app/api/discharge/[admissionId]/pdf/route.ts`
  - `app/api/reports/lab/pdf/route.ts`
  - `app/api/reports/prescription/pdf/route.ts`
  - `app/api/reports/financial/pdf/route.ts`

## 3) Payment Integrity Hardening (Implemented)

- `POST /api/razorpay/create-order` now derives payable amount from invoice balance server-side.
- `POST /api/razorpay/verify-payment` now validates against server-created order intents.
- Added idempotency + org-scoped verification checks.
- Added `PaymentOrderIntent` persistence model in Prisma schema.

## 4) Patient Credential Security (Implemented)

- Replaced plaintext temporary-password delivery with one-time setup links.
- Added token lifecycle helpers in `app/lib/password-setup.ts`.
- Added patient setup page + server action:
  - `app/patient/setup-password/page.tsx`
  - `app/patient/setup-password/actions.ts`
- Updated registration + triage flows to issue setup links instead of exposing passwords.

## 5) Schema Changes (Implemented in Prisma)

Updated `prisma/schema.prisma` with production hardening models/fields:

- Added `organizationId` to:
  - `invoice_items`
  - `payments`
  - `user_mfa` (nullable with relation)
- Added new models:
  - `PaymentOrderIntent`
  - `PatientPasswordSetupToken`

## 6) CI Gate Improvements (Implemented)

- Added scripts:
  - `npm run check:prisma`
  - `npm run typecheck`
  - `npm run lint:ci`
- Updated GitHub Actions CI pipeline to run:
  1. Prisma generate
  2. Prisma validate
  3. Typecheck
  4. Scoped strict lint
  5. Production build

## 7) Infrastructure Tasks (Manual, Outside Repo)

Complete these in AWS/Supabase before pilot go-live:

1. Provision ECS Fargate service in 2+ AZ behind ALB + WAF + ACM TLS.
2. Store all secrets in AWS Secrets Manager and runtime config in SSM.
3. Configure CloudWatch alarms + incident routing (SNS/PagerDuty).
4. Provision per-hospital Postgres projects (hybrid isolated DB model).
5. Configure backup retention + PITR and run restore drills.
6. Enforce branch protection in GitHub settings:
   - Required PR approvals
   - Required passing CI checks
   - No direct pushes to `main`

## 8) Go-Live Readiness Evidence

Before onboarding the first paid hospital, collect artifacts for:

- UAT signoff (OPD/IPD/lab/pharmacy/finance/discharge)
- Restore drill evidence (RPO/RTO achieved)
- Access control validation (role-based and tenant-based)
- Payment tamper test evidence (replay/mismatch/duplicate handling)
- Incident runbook dry-run logs

