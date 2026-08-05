-- Pharmacy bill lines need the dispensed batch's identity on the invoice itself.
-- Until now batch/expiry/MRP lived only on pharmacy_batch_inventory and the batch
-- number was smuggled inside the line description, so the EXP. column on every
-- pharmacy bill printed blank (and went stale once the batch was consumed or the
-- MRP was revised). Persist them per line at dispense time instead.
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "batch_no" TEXT;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "expiry_date" TIMESTAMP(3);
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "mrp" DECIMAL(65,30);
