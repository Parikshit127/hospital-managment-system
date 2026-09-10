-- Tracks who finalized (locked) an invoice, so the bill can print "Finalized by"
-- with a name, not just a status flip.
-- Nullable, additive columns — safe for existing rows (backfilled as NULL,
-- rendered as blank on bills finalized before this feature).
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "finalized_by" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "finalized_by_name" TEXT;
