-- Align live pharmacy tables with the Prisma schema used by pharmacy queues
-- and controlled substance register pages.

ALTER TABLE "pharmacy_batch_inventory"
  ADD COLUMN IF NOT EXISTS "actual_cost" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "vendor_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "is_quarantined" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "NarcoticRegister"
  ADD COLUMN IF NOT EXISTS "medicine_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "batch_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "source_type" TEXT,
  ADD COLUMN IF NOT EXISTS "source_id" TEXT;

CREATE INDEX IF NOT EXISTS "NarcoticRegister_medicine_id_idx"
  ON "NarcoticRegister"("medicine_id");

CREATE INDEX IF NOT EXISTS "NarcoticRegister_source_type_idx"
  ON "NarcoticRegister"("source_type");

CREATE INDEX IF NOT EXISTS "pharmacy_batch_inventory_vendor_id_idx"
  ON "pharmacy_batch_inventory"("vendor_id");
