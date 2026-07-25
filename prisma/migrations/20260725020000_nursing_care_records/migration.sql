-- Nursing care records.
--
-- Eight capabilities a ward needs that the system had no place to record at all:
-- care plans, fluid balance, wound care, invasive devices, transfusion, clinical
-- incidents, patient education, and nurse-to-patient shift assignment.
--
-- Purely additive: new tables only, nothing existing is altered or backfilled.
-- Every statement uses IF NOT EXISTS so the migration is re-runnable.
--
-- Foreign keys to admissions are added NOT VALID for the same reason as the
-- previous migration — these are new tables so there is nothing to validate,
-- but keeping the pattern consistent means a restore of older rows cannot block
-- a deploy. They can be validated at any time with VALIDATE CONSTRAINT.

-- ── Care plans (ADPIE) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "nursing_care_plans" (
    "id"             TEXT PRIMARY KEY,
    "admission_id"   TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assessment"     TEXT NOT NULL,
    "diagnosis"      TEXT NOT NULL,
    "goal"           TEXT NOT NULL,
    "target_date"    TIMESTAMP(3),
    "interventions"  JSONB,
    "evaluations"    JSONB,
    "priority"       TEXT NOT NULL DEFAULT 'routine',
    "status"         TEXT NOT NULL DEFAULT 'active',
    "opened_by"      TEXT NOT NULL,
    "opened_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by"      TEXT,
    "closed_at"      TIMESTAMP(3),
    "closure_note"   TEXT
);
CREATE INDEX IF NOT EXISTS "nursing_care_plans_organizationId_idx" ON "nursing_care_plans"("organizationId");
CREATE INDEX IF NOT EXISTS "nursing_care_plans_admission_id_idx"   ON "nursing_care_plans"("admission_id");
CREATE INDEX IF NOT EXISTS "nursing_care_plans_status_idx"         ON "nursing_care_plans"("status");

-- ── Fluid balance ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fluid_balance_entries" (
    "id"             TEXT PRIMARY KEY,
    "admission_id"   TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "direction"      TEXT NOT NULL,
    "route"          TEXT NOT NULL,
    "volume_ml"      INTEGER NOT NULL,
    "description"    TEXT,
    "recorded_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shift"          TEXT,
    "recorded_by"    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "fluid_balance_entries_organizationId_idx" ON "fluid_balance_entries"("organizationId");
CREATE INDEX IF NOT EXISTS "fluid_balance_entries_admission_id_recorded_at_idx" ON "fluid_balance_entries"("admission_id", "recorded_at");

-- ── Wound care ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "wound_care_records" (
    "id"             TEXT PRIMARY KEY,
    "admission_id"   TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "wound_type"     TEXT NOT NULL,
    "location"       TEXT NOT NULL,
    "stage"          TEXT,
    "measurements"   JSONB,
    "appearance"     TEXT,
    "exudate"        TEXT,
    "dressing_used"  TEXT,
    "pain_score"     INTEGER,
    "intervention"   TEXT,
    "next_review_at" TIMESTAMP(3),
    "status"         TEXT NOT NULL DEFAULT 'open',
    "assessed_by"    TEXT NOT NULL,
    "assessed_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "wound_care_records_organizationId_idx" ON "wound_care_records"("organizationId");
CREATE INDEX IF NOT EXISTS "wound_care_records_admission_id_idx"   ON "wound_care_records"("admission_id");
CREATE INDEX IF NOT EXISTS "wound_care_records_status_idx"         ON "wound_care_records"("status");

-- ── Invasive devices ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "patient_devices" (
    "id"              TEXT PRIMARY KEY,
    "admission_id"    TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "device_type"     TEXT NOT NULL,
    "site"            TEXT NOT NULL,
    "size"            TEXT,
    "inserted_at"     TIMESTAMP(3) NOT NULL,
    "inserted_by"     TEXT NOT NULL,
    "due_at"          TIMESTAMP(3),
    "removed_at"      TIMESTAMP(3),
    "removed_by"      TEXT,
    "removal_reason"  TEXT,
    "last_site_check" TEXT,
    "last_checked_at" TIMESTAMP(3),
    "status"          TEXT NOT NULL DEFAULT 'in_situ'
);
CREATE INDEX IF NOT EXISTS "patient_devices_organizationId_idx" ON "patient_devices"("organizationId");
CREATE INDEX IF NOT EXISTS "patient_devices_admission_id_idx"   ON "patient_devices"("admission_id");
CREATE INDEX IF NOT EXISTS "patient_devices_status_idx"         ON "patient_devices"("status");

-- ── Transfusion ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "transfusion_records" (
    "id"                TEXT PRIMARY KEY,
    "admission_id"      TEXT NOT NULL,
    "organizationId"    TEXT NOT NULL,
    "component"         TEXT NOT NULL,
    "unit_number"       TEXT NOT NULL,
    "blood_group"       TEXT NOT NULL,
    "crossmatch_ref"    TEXT,
    "consent_taken"     BOOLEAN NOT NULL DEFAULT false,
    "consent_by"        TEXT,
    "checked_by"        TEXT,
    "witness_id"        TEXT,
    "started_at"        TIMESTAMP(3),
    "completed_at"      TIMESTAMP(3),
    "volume_ml"         INTEGER,
    "observations"      JSONB,
    "reaction_occurred" BOOLEAN NOT NULL DEFAULT false,
    "reaction_details"  TEXT,
    "status"            TEXT NOT NULL DEFAULT 'prepared'
);
CREATE INDEX IF NOT EXISTS "transfusion_records_organizationId_idx" ON "transfusion_records"("organizationId");
CREATE INDEX IF NOT EXISTS "transfusion_records_admission_id_idx"   ON "transfusion_records"("admission_id");
CREATE INDEX IF NOT EXISTS "transfusion_records_status_idx"         ON "transfusion_records"("status");

-- ── Clinical incidents ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "clinical_incidents" (
    "id"                TEXT PRIMARY KEY,
    "organizationId"    TEXT NOT NULL,
    "admission_id"      TEXT,
    "patient_id"        TEXT,
    "incident_type"     TEXT NOT NULL,
    "severity"          TEXT NOT NULL,
    "occurred_at"       TIMESTAMP(3) NOT NULL,
    "location"          TEXT,
    "description"       TEXT NOT NULL,
    "immediate_action"  TEXT,
    "patient_informed"  BOOLEAN NOT NULL DEFAULT false,
    "reported_by"       TEXT NOT NULL,
    "reported_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status"            TEXT NOT NULL DEFAULT 'open',
    "review_notes"      TEXT,
    "root_cause"        TEXT,
    "preventive_action" TEXT,
    "closed_by"         TEXT,
    "closed_at"         TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "clinical_incidents_organizationId_idx"  ON "clinical_incidents"("organizationId");
CREATE INDEX IF NOT EXISTS "clinical_incidents_admission_id_idx"    ON "clinical_incidents"("admission_id");
CREATE INDEX IF NOT EXISTS "clinical_incidents_status_idx"          ON "clinical_incidents"("status");
CREATE INDEX IF NOT EXISTS "clinical_incidents_incident_type_idx"   ON "clinical_incidents"("incident_type");

-- ── Patient education ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "patient_education_records" (
    "id"                    TEXT PRIMARY KEY,
    "admission_id"          TEXT NOT NULL,
    "organizationId"        TEXT NOT NULL,
    "topic"                 TEXT NOT NULL,
    "content"               TEXT NOT NULL,
    "method"                TEXT,
    "audience"              TEXT NOT NULL DEFAULT 'patient',
    "language"              TEXT,
    "understanding"         TEXT,
    "repeat_required"       BOOLEAN NOT NULL DEFAULT false,
    "taught_by"             TEXT NOT NULL,
    "taught_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_discharge_teaching" BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS "patient_education_records_organizationId_idx" ON "patient_education_records"("organizationId");
CREATE INDEX IF NOT EXISTS "patient_education_records_admission_id_idx"   ON "patient_education_records"("admission_id");

-- ── Nurse shift assignment ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "nurse_shift_assignments" (
    "id"             TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "nurse_id"       TEXT NOT NULL,
    "ward_id"        INTEGER NOT NULL,
    "shift_date"     TIMESTAMP(3) NOT NULL,
    "shift_type"     TEXT NOT NULL,
    "admission_ids"  JSONB,
    "acuity_total"   INTEGER,
    "assigned_by"    TEXT NOT NULL,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "nurse_shift_assignments_organizationId_idx"     ON "nurse_shift_assignments"("organizationId");
CREATE INDEX IF NOT EXISTS "nurse_shift_assignments_ward_id_shift_date_idx" ON "nurse_shift_assignments"("ward_id", "shift_date");
CREATE INDEX IF NOT EXISTS "nurse_shift_assignments_nurse_id_idx"           ON "nurse_shift_assignments"("nurse_id");

-- ── Foreign keys ────────────────────────────────────────────────────────────
DO $$
DECLARE
    t TEXT;
    org_tables TEXT[] := ARRAY[
        'nursing_care_plans','fluid_balance_entries','wound_care_records',
        'patient_devices','transfusion_records','clinical_incidents',
        'patient_education_records','nurse_shift_assignments'
    ];
    adm_tables TEXT[] := ARRAY[
        'nursing_care_plans','fluid_balance_entries','wound_care_records',
        'patient_devices','transfusion_records','clinical_incidents',
        'patient_education_records'
    ];
BEGIN
    FOREACH t IN ARRAY org_tables LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_organizationId_fkey') THEN
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID',
                t, t || '_organizationId_fkey');
        END IF;
    END LOOP;

    FOREACH t IN ARRAY adm_tables LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_admission_id_fkey') THEN
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("admission_id") REFERENCES "admissions"("admission_id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID',
                t, t || '_admission_id_fkey');
        END IF;
    END LOOP;
END $$;
