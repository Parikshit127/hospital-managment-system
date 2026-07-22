-- How a refund was actually paid back to the patient, which is not necessarily
-- the mode it was collected in (a NEFT receipt refunded in cash at the counter
-- was previously reported as NEFT, understating the cash book).
--
-- refunds.payment_method already exists on some environments (added out-of-band
-- by 20260721000000_add_refund_payment_method, which is not in this repo's
-- history), so both columns are added defensively.
-- Nullable: legacy refunds have no recorded payout mode and fall back to the
-- original payment's method in reports.
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "refund_ref" TEXT;

-- Cancelling a deposit previously only flipped its status, leaving no reason
-- and no named user. All nullable — existing cancelled rows keep working.
ALTER TABLE "patient_deposits" ADD COLUMN IF NOT EXISTS "cancelled_reason" TEXT;
ALTER TABLE "patient_deposits" ADD COLUMN IF NOT EXISTS "cancelled_by" TEXT;
ALTER TABLE "patient_deposits" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
