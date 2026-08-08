-- Per-receipt snapshot of the hospital's receiving bank account, captured when a
-- TPA receipt is recorded (opt-in). Printed on that receipt only; old receipts
-- (null) stay blank. All additive/nullable.
ALTER TABLE "insurance_receipts" ADD COLUMN "bank_name" TEXT;
ALTER TABLE "insurance_receipts" ADD COLUMN "bank_account_name" TEXT;
ALTER TABLE "insurance_receipts" ADD COLUMN "bank_account_number" TEXT;
ALTER TABLE "insurance_receipts" ADD COLUMN "bank_ifsc" TEXT;
ALTER TABLE "insurance_receipts" ADD COLUMN "bank_branch" TEXT;
ALTER TABLE "insurance_receipts" ADD COLUMN "bank_upi_id" TEXT;
