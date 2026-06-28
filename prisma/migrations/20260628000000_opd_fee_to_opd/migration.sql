-- Fold the legacy OPD_FEE invoice sub-type into plain OPD.
-- 1) Add the new fee-receipt discriminator flag.
-- 2) Backfill it for all existing OPD_FEE bills (preserves Fee Receipts / OPD
--    dashboard / patient-history behaviour, which previously keyed off OPD_FEE).
-- 3) Rewrite invoice_type 'OPD_FEE' -> 'OPD' so the type column only ever shows OPD.

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "is_fee_receipt" BOOLEAN NOT NULL DEFAULT false;

UPDATE "invoices" SET "is_fee_receipt" = true WHERE "invoice_type" = 'OPD_FEE';

UPDATE "invoices" SET "invoice_type" = 'OPD' WHERE "invoice_type" = 'OPD_FEE';
