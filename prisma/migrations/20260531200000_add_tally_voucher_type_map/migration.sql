-- Tally: optional per-hospital override of default voucher-type names (JSON).
-- Additive + idempotent + nullable.
BEGIN;

ALTER TABLE "organization_configs" ADD COLUMN IF NOT EXISTS "tally_voucher_type_map" TEXT;

COMMIT;
