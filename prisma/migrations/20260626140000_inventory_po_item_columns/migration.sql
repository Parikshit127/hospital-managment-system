-- Inventory procurement: PO/GRN/invoice columns referenced in schema but missing from earlier migrations

ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "itemMasterId" INTEGER;

ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "vendor_id" INTEGER;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "storeId" INTEGER;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "purchaseRequisitionId" INTEGER;

ALTER TABLE "goods_receipt_notes" ADD COLUMN IF NOT EXISTS "storeId" INTEGER;

ALTER TABLE "pharmacy_purchase_invoice_lines" ADD COLUMN IF NOT EXISTS "itemMasterId" INTEGER;

ALTER TABLE "pharmacy_returns" ADD COLUMN IF NOT EXISTS "itemMasterId" INTEGER;
ALTER TABLE "pharmacy_returns" ADD COLUMN IF NOT EXISTS "storeId" INTEGER;

CREATE INDEX IF NOT EXISTS "purchase_order_items_itemMasterId_idx" ON "purchase_order_items"("itemMasterId");
CREATE INDEX IF NOT EXISTS "purchase_orders_vendor_id_idx" ON "purchase_orders"("vendor_id");
CREATE INDEX IF NOT EXISTS "purchase_orders_storeId_idx" ON "purchase_orders"("storeId");
CREATE INDEX IF NOT EXISTS "purchase_orders_purchaseRequisitionId_idx" ON "purchase_orders"("purchaseRequisitionId");
CREATE INDEX IF NOT EXISTS "goods_receipt_notes_storeId_idx" ON "goods_receipt_notes"("storeId");
CREATE INDEX IF NOT EXISTS "pharmacy_purchase_invoice_lines_itemMasterId_idx" ON "pharmacy_purchase_invoice_lines"("itemMasterId");
CREATE INDEX IF NOT EXISTS "pharmacy_returns_itemMasterId_idx" ON "pharmacy_returns"("itemMasterId");
CREATE INDEX IF NOT EXISTS "pharmacy_returns_storeId_idx" ON "pharmacy_returns"("storeId");

DO $$ BEGIN
  ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_itemMasterId_fkey"
    FOREIGN KEY ("itemMasterId") REFERENCES "item_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_purchaseRequisitionId_fkey"
    FOREIGN KEY ("purchaseRequisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_purchase_invoice_lines" ADD CONSTRAINT "pharmacy_purchase_invoice_lines_itemMasterId_fkey"
    FOREIGN KEY ("itemMasterId") REFERENCES "item_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_returns" ADD CONSTRAINT "pharmacy_returns_itemMasterId_fkey"
    FOREIGN KEY ("itemMasterId") REFERENCES "item_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_returns" ADD CONSTRAINT "pharmacy_returns_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
