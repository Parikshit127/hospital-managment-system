-- Closed-loop response to a deteriorating patient.
--
-- A NEWS alert previously produced a notification and a nursing task and
-- required no reply: the ward could not tell whether the doctor had seen it,
-- and nothing happened when nobody answered. This table owns the alert, the
-- acknowledgement, the instructions that came back, and the chase-up.
--
-- Additive only: one new table with no changes to existing ones, so it can be
-- applied ahead of the code with no effect on anything running.

CREATE TABLE IF NOT EXISTS "news_escalations" (
    "id"                TEXT NOT NULL,
    "organizationId"    TEXT NOT NULL,
    "admission_id"      TEXT NOT NULL,
    "patient_id"        TEXT NOT NULL,
    "news_score"        INTEGER NOT NULL,
    "news_level"        TEXT,
    "band"              TEXT NOT NULL,
    "raised_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raised_by"         TEXT NOT NULL,
    "target_doctor_id"  TEXT,
    "status"            TEXT NOT NULL DEFAULT 'awaiting',
    "due_at"            TIMESTAMP(3) NOT NULL,
    "acknowledged_at"   TIMESTAMP(3),
    "acknowledged_by"   TEXT,
    "instructions"      TEXT,
    "escalation_level"  INTEGER NOT NULL DEFAULT 0,
    "last_escalated_at" TIMESTAMP(3),
    "closed_at"         TIMESTAMP(3),
    "closed_by"         TEXT,
    CONSTRAINT "news_escalations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "news_escalations_organizationId_idx" ON "news_escalations"("organizationId");
CREATE INDEX IF NOT EXISTS "news_escalations_admission_id_idx"   ON "news_escalations"("admission_id");
-- The timeout sweep reads exactly this pair; without it the job scans the table.
CREATE INDEX IF NOT EXISTS "news_escalations_status_due_at_idx"  ON "news_escalations"("status", "due_at");

-- Table names, not Prisma model names: Organization is mapped to organizations.
ALTER TABLE "news_escalations"
    ADD CONSTRAINT "news_escalations_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "news_escalations"
    ADD CONSTRAINT "news_escalations_admission_id_fkey"
    FOREIGN KEY ("admission_id") REFERENCES "admissions"("admission_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
