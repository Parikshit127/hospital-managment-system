-- Cash compliance: capture PAN on high-value cash deposits (Rule 1).
-- Additive + idempotent + nullable: safe to re-run, NULL for all historical deposits.
BEGIN;

ALTER TABLE "patient_deposits" ADD COLUMN IF NOT EXISTS "payer_pan_number" TEXT;
ALTER TABLE "patient_deposits" ADD COLUMN IF NOT EXISTS "payer_pan_name"   TEXT;

COMMIT;
