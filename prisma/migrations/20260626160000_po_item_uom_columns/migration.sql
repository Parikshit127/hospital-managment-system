-- Align purchase_order_items with Prisma schema (inventory PO line fields)
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "uom" TEXT;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "conversion_to_base" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
