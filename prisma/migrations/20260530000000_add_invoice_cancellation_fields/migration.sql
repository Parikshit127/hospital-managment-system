-- Master Billing: soft-cancellation audit fields on invoices
-- Reason is also written to system_audit_logs (action = CANCEL_INVOICE); these
-- dedicated columns power the "This invoice has been cancelled" banner and let
-- cancelled bills be queried/filtered without parsing the notes string.
-- Additive + idempotent: safe to re-run, NULL for all historical records.
BEGIN;

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "cancelled_at"        TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "cancelled_by"        TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT;

COMMIT;
