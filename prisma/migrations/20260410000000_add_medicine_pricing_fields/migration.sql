-- Add pricing, formulation and traceability fields to pharmacy_medicine_master
-- and pharmacy_batch_inventory. The legacy price_per_unit / tax_rate columns are
-- retained for backward compatibility and kept in sync by the application layer.

BEGIN;

-- pharmacy_medicine_master: new pricing + metadata columns
ALTER TABLE "pharmacy_medicine_master"
    ADD COLUMN IF NOT EXISTS "mrp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "purchase_price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "selling_price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "gst_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "strength" TEXT,
    ADD COLUMN IF NOT EXISTS "form" TEXT,
    ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

-- pharmacy_batch_inventory: manufacture date, cost, supplier traceability
ALTER TABLE "pharmacy_batch_inventory"
    ADD COLUMN IF NOT EXISTS "manufacture_date" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "cost_price" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "supplier_name" TEXT;

COMMIT;
