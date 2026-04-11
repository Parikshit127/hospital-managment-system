-- Add IPD Upgrade fields to admissions and beds tables
-- Fixes P2022 runtime errors: beds.is_isolation, admissions.admission_category missing
BEGIN;

-- beds: IPD Upgrade fields
ALTER TABLE "beds" ADD COLUMN IF NOT EXISTS "is_isolation"          BOOLEAN   NOT NULL DEFAULT false;
ALTER TABLE "beds" ADD COLUMN IF NOT EXISTS "cleaning_started_at"   TIMESTAMP(3);
ALTER TABLE "beds" ADD COLUMN IF NOT EXISTS "cleaning_completed_at" TIMESTAMP(3);
ALTER TABLE "beds" ADD COLUMN IF NOT EXISTS "last_occupied_by"      TEXT;

-- admissions: IPD Upgrade fields
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "admission_category"        TEXT;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "expected_discharge_date"   TIMESTAMP(3);
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "fit_for_discharge_at"      TIMESTAMP(3);
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "fit_for_discharge_by"      TEXT;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "discharge_checklist"       JSONB;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "fall_risk_score"           INTEGER;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "pressure_ulcer_risk"       INTEGER;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "code_status"               TEXT;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "news_score_latest"         INTEGER;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "attending_doctor_id"       TEXT;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "admission_source"          TEXT;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "discharge_type"            TEXT;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "discharge_disposition"     TEXT;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "patient_class"             TEXT;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "primary_diagnosis_icd"     TEXT;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "secondary_diagnoses"       JSONB;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "isolation_type"            TEXT;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "medication_reconciliation" JSONB;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "discharge_instructions"    TEXT;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "allergy_alerts"            JSONB;
ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "version"                   INTEGER NOT NULL DEFAULT 0;

COMMIT;
