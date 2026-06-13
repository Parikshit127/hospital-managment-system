-- Purchase Order line items: capture full supplier-invoice columns
-- (pack, batch, expiry, MRP, discount, CGST/SGST split, computed amount).
-- Additive + idempotent + nullable/defaulted: safe to re-run, sane values for historical rows.
BEGIN;

ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "pack"         TEXT;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "batch_no"     TEXT;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "expiry"       TEXT;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "mrp"          DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "discount_pct" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "cgst_rate"    DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "sgst_rate"    DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "amount"       DOUBLE PRECISION NOT NULL DEFAULT 0;

COMMIT;
