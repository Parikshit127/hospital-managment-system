-- Tracks who created an IPD admission and who finalized its discharge/billing,
-- so the discharge bill can print "Admission created by" / "Discharge billed by"
-- with a name and username, not just an anonymous printout.
-- All nullable, additive columns — safe for existing rows (backfilled as NULL,
-- rendered as "-" on older admissions predating this feature).
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "created_by" TEXT;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "created_by_name" TEXT;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "discharged_by" TEXT;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "discharged_by_name" TEXT;
