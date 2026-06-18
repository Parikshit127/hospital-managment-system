-- Hard edit-lock on bills (reception "Lock Bill"; Admin/Finance can unlock).
-- Additive + idempotent so it is safe to apply on top of an existing database.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "is_locked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "locked_by" TEXT;
