-- Align pharmacy_purchase_invoice_lines with Prisma schema (discount_pct was missing in DB)
ALTER TABLE "pharmacy_purchase_invoice_lines" ADD COLUMN IF NOT EXISTS "discount_pct" DOUBLE PRECISION NOT NULL DEFAULT 0;
