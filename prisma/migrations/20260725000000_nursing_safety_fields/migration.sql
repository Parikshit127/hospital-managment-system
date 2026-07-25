-- Nursing safety + auditability columns.
-- All additive and nullable (or defaulted), no rewrites, no constraints on
-- existing data, and every statement is IF NOT EXISTS so this is re-runnable.

-- NEWS2 needs the air/oxygen parameter and the single-parameter trigger.
ALTER TABLE "ipd_vitals" ADD COLUMN IF NOT EXISTS "on_supplemental_oxygen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ipd_vitals" ADD COLUMN IF NOT EXISTS "news_max_single_param" INTEGER;

-- eMAR: a dose that was not given must record why; controlled/high-alert drugs
-- need a second-nurse witness; an administration over a known allergy needs a
-- recorded justification.
ALTER TABLE "medication_administrations" ADD COLUMN IF NOT EXISTS "not_given_reason" TEXT;
ALTER TABLE "medication_administrations" ADD COLUMN IF NOT EXISTS "witness_id" TEXT;
ALTER TABLE "medication_administrations" ADD COLUMN IF NOT EXISTS "allergy_override_reason" TEXT;

-- Nursing tasks: who closed it, and what generated it (an order, or manual entry).
ALTER TABLE "nursing_tasks" ADD COLUMN IF NOT EXISTS "completed_by" TEXT;
ALTER TABLE "nursing_tasks" ADD COLUMN IF NOT EXISTS "source_type" TEXT;
ALTER TABLE "nursing_tasks" ADD COLUMN IF NOT EXISTS "source_id" TEXT;
ALTER TABLE "nursing_tasks" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'routine';

-- Tasks are read per admission on every ward screen; this was a sequential scan.
CREATE INDEX IF NOT EXISTS "nursing_tasks_admission_id_idx" ON "nursing_tasks"("admission_id");
