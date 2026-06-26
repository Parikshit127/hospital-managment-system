-- Pharmacy purchase invoice workflow fields for inventory 3-way match

ALTER TABLE "pharmacy_purchase_invoices" ADD COLUMN IF NOT EXISTS "variance_approved_by" TEXT;
ALTER TABLE "pharmacy_purchase_invoices" ADD COLUMN IF NOT EXISTS "matched_at" TIMESTAMP(3);
ALTER TABLE "pharmacy_purchase_invoices" ADD COLUMN IF NOT EXISTS "posted_at" TIMESTAMP(3);
