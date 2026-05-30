-- Cash compliance: capture PAN on high-value cash receipts (Rule 1).
-- Additive + idempotent + nullable: safe to re-run, NULL for all historical payments.
BEGIN;

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "payer_pan_number" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "payer_pan_name"   TEXT;

COMMIT;
