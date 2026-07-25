-- Referential integrity between the nursing/EMR tables and admissions.
--
-- These five referenced admission_id as a plain string, so nothing stopped an
-- order, a dose or a note pointing at an admission that does not exist, and a
-- deleted admission left its clinical records behind. IPDVitals, NursingAssessment
-- and NursingTask were already related properly; this brings the rest in line.
--
-- Added NOT VALID deliberately. That enforces the constraint on every new and
-- updated row from the moment it is applied, WITHOUT scanning the existing table
-- — so a deploy cannot fail on legacy rows, and it takes only a brief lock.
-- The demo database has zero orphans across all five tables; production may
-- differ, so validation is a separate, resumable step the team can run when
-- ready (and after clearing anything it reports):
--
--   ALTER TABLE "clinical_orders"            VALIDATE CONSTRAINT "clinical_orders_admission_id_fkey";
--   ALTER TABLE "physician_orders"           VALIDATE CONSTRAINT "physician_orders_admission_id_fkey";
--   ALTER TABLE "active_medications"         VALIDATE CONSTRAINT "active_medications_admission_id_fkey";
--   ALTER TABLE "medication_administrations" VALIDATE CONSTRAINT "medication_administrations_admission_id_fkey";
--   ALTER TABLE "nursing_notes"              VALIDATE CONSTRAINT "nursing_notes_admission_id_fkey";
--
-- To find what would block validation first:
--   SELECT t.* FROM "<table>" t
--   LEFT JOIN "admissions" a ON a."admission_id" = t."admission_id"
--   WHERE a."admission_id" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_orders_admission_id_fkey') THEN
    ALTER TABLE "clinical_orders"
      ADD CONSTRAINT "clinical_orders_admission_id_fkey"
      FOREIGN KEY ("admission_id") REFERENCES "admissions"("admission_id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'physician_orders_admission_id_fkey') THEN
    ALTER TABLE "physician_orders"
      ADD CONSTRAINT "physician_orders_admission_id_fkey"
      FOREIGN KEY ("admission_id") REFERENCES "admissions"("admission_id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'active_medications_admission_id_fkey') THEN
    ALTER TABLE "active_medications"
      ADD CONSTRAINT "active_medications_admission_id_fkey"
      FOREIGN KEY ("admission_id") REFERENCES "admissions"("admission_id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medication_administrations_admission_id_fkey') THEN
    ALTER TABLE "medication_administrations"
      ADD CONSTRAINT "medication_administrations_admission_id_fkey"
      FOREIGN KEY ("admission_id") REFERENCES "admissions"("admission_id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nursing_notes_admission_id_fkey') THEN
    ALTER TABLE "nursing_notes"
      ADD CONSTRAINT "nursing_notes_admission_id_fkey"
      FOREIGN KEY ("admission_id") REFERENCES "admissions"("admission_id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;

-- These tables are read per admission on every ward screen.
CREATE INDEX IF NOT EXISTS "clinical_orders_admission_id_idx"    ON "clinical_orders"("admission_id");
CREATE INDEX IF NOT EXISTS "physician_orders_admission_id_idx"   ON "physician_orders"("admission_id");
CREATE INDEX IF NOT EXISTS "active_medications_admission_id_idx" ON "active_medications"("admission_id");
