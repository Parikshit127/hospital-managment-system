-- Structured NABH-format discharge summary: add a JSON column for the doctor-authored
-- sections (diagnosis, complaints, procedure, operative notes, course, meds, etc.),
-- a prepared_by field, and an updated_at timestamp. `generated_summary` is retained
-- for backward-compatible consumers (older PDF route).
ALTER TABLE "discharge_summaries" ADD COLUMN IF NOT EXISTS "data" JSONB;
ALTER TABLE "discharge_summaries" ADD COLUMN IF NOT EXISTS "prepared_by" TEXT;
ALTER TABLE "discharge_summaries" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "discharge_summaries_admission_id_idx" ON "discharge_summaries"("admission_id");
