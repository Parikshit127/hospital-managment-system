-- Settlement-advice breakdown on insurance receipts (MEDNET-style columns).
-- Additive + idempotent + non-null with defaults: safe to re-run.
BEGIN;

ALTER TABLE "insurance_receipts" ADD COLUMN IF NOT EXISTS "claim_amount"      DECIMAL NOT NULL DEFAULT 0;
ALTER TABLE "insurance_receipts" ADD COLUMN IF NOT EXISTS "sanctioned_amount" DECIMAL NOT NULL DEFAULT 0;
ALTER TABLE "insurance_receipts" ADD COLUMN IF NOT EXISTS "service_charge"    DECIMAL NOT NULL DEFAULT 0;

COMMIT;
