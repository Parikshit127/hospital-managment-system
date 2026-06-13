-- Bill-level (final) discount on invoices — flat amount off the whole bill
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "bill_discount" DECIMAL(65,30) NOT NULL DEFAULT 0;
