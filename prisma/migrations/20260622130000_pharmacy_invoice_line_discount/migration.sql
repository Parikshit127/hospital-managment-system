-- Pharmacy purchase-invoice line: flat trade discount + scheme amount (₹)
-- so distributor bills reconcile exactly (taxable = qty*rate - pct_disc - discount_amount - scheme_amount).
ALTER TABLE "pharmacy_purchase_invoice_lines" ADD COLUMN IF NOT EXISTS "discount_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "pharmacy_purchase_invoice_lines" ADD COLUMN IF NOT EXISTS "scheme_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;
