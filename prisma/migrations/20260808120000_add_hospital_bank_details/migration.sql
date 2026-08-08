-- Hospital's own receiving bank account (single account per organization),
-- printed on bills / TPA invoices / receipts. All nullable, additive.
ALTER TABLE "organizations" ADD COLUMN "bank_name" TEXT;
ALTER TABLE "organizations" ADD COLUMN "bank_account_name" TEXT;
ALTER TABLE "organizations" ADD COLUMN "bank_account_number" TEXT;
ALTER TABLE "organizations" ADD COLUMN "bank_ifsc" TEXT;
ALTER TABLE "organizations" ADD COLUMN "bank_branch" TEXT;
ALTER TABLE "organizations" ADD COLUMN "bank_upi_id" TEXT;
