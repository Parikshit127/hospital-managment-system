-- HR employee portal foundation.
--  * every staff user gets an Employee row (1:1) so each person has an HR portal
--  * employee_code unique per organization (was global -> cross-tenant collisions)
--  * attendance unique per employee per day + raw punch log + regularization + holidays
--  * leave: half-day, computed working days, review trail
-- Additive except: duplicate attendance rows are collapsed (latest id wins) so the
-- new unique index can be created, and the global employee_code unique is replaced.

-- ── Employee: new profile columns ───────────────────────────────────────────
ALTER TABLE "employees"
    ADD COLUMN IF NOT EXISTS "branch_id" TEXT,
    ADD COLUMN IF NOT EXISTS "employment_type" TEXT NOT NULL DEFAULT 'PERMANENT',
    ADD COLUMN IF NOT EXISTS "reporting_manager_id" INTEGER,
    ADD COLUMN IF NOT EXISTS "gender" TEXT,
    ADD COLUMN IF NOT EXISTS "date_of_birth" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "blood_group" TEXT,
    ADD COLUMN IF NOT EXISTS "address" TEXT,
    ADD COLUMN IF NOT EXISTS "emergency_contact_name" TEXT,
    ADD COLUMN IF NOT EXISTS "emergency_contact_phone" TEXT,
    ADD COLUMN IF NOT EXISTS "date_of_exit" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "exit_reason" TEXT;

-- employee_code: global unique -> unique per organization
DROP INDEX IF EXISTS "employees_employee_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "employees_organizationId_employee_code_key" ON "employees"("organizationId", "employee_code");
CREATE INDEX IF NOT EXISTS "employees_branch_id_idx" ON "employees"("branch_id");
CREATE INDEX IF NOT EXISTS "employees_reporting_manager_id_idx" ON "employees"("reporting_manager_id");

ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_reporting_manager_id_fkey";
ALTER TABLE "employees" ADD CONSTRAINT "employees_reporting_manager_id_fkey"
    FOREIGN KEY ("reporting_manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Attendance: source/late + one row per employee per day ──────────────────
ALTER TABLE "attendances"
    ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS "late_minutes" INTEGER NOT NULL DEFAULT 0;

-- Collapse historical duplicates (race on the old find-then-create) before the unique index.
DELETE FROM "attendances" a
USING "attendances" b
WHERE a."employee_id" = b."employee_id"
  AND a."date" = b."date"
  AND a."id" < b."id";

CREATE UNIQUE INDEX IF NOT EXISTS "attendances_employee_id_date_key" ON "attendances"("employee_id", "date");

-- ── Raw punch log ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "attendance_events" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_m" DOUBLE PRECISION,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "attendance_events_organizationId_idx" ON "attendance_events"("organizationId");
CREATE INDEX IF NOT EXISTS "attendance_events_employee_id_occurred_at_idx" ON "attendance_events"("employee_id", "occurred_at");
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Regularization requests ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "attendance_regularizations" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "requested_in" TIMESTAMP(3),
    "requested_out" TIMESTAMP(3),
    "requested_status" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "attendance_regularizations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "attendance_regularizations_organizationId_idx" ON "attendance_regularizations"("organizationId");
CREATE INDEX IF NOT EXISTS "attendance_regularizations_employee_id_idx" ON "attendance_regularizations"("employee_id");
CREATE INDEX IF NOT EXISTS "attendance_regularizations_status_idx" ON "attendance_regularizations"("status");
ALTER TABLE "attendance_regularizations" ADD CONSTRAINT "attendance_regularizations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_regularizations" ADD CONSTRAINT "attendance_regularizations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Holidays ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "holidays" (
    "id" SERIAL NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PUBLIC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "holidays_organizationId_date_name_key" ON "holidays"("organizationId", "date", "name");
CREATE INDEX IF NOT EXISTS "holidays_organizationId_idx" ON "holidays"("organizationId");
CREATE INDEX IF NOT EXISTS "holidays_date_idx" ON "holidays"("date");
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Leave ───────────────────────────────────────────────────────────────────
ALTER TABLE "leave_types"
    ADD COLUMN IF NOT EXISTS "is_paid" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "leave_requests"
    ADD COLUMN IF NOT EXISTS "is_half_day" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "days" DOUBLE PRECISION NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "review_note" TEXT;

-- Existing requests: derive days from the date range (inclusive) so balances stay right.
UPDATE "leave_requests"
SET "days" = GREATEST(1, ("to_date"::date - "from_date"::date) + 1)
WHERE "days" = 1 AND "to_date"::date <> "from_date"::date;

-- ── Backfill: every staff user gets an Employee ─────────────────────────────
-- Codes continue after the highest EMP-nnnnn already used in that organization.
-- Developer / dev-admin accounts are platform staff, not hospital employees.
WITH existing AS (
    SELECT "organizationId",
           COALESCE(MAX(NULLIF(regexp_replace("employee_code", '\D', '', 'g'), '')::INTEGER), 0) AS max_n
    FROM "employees"
    GROUP BY "organizationId"
),
missing AS (
    SELECT u."id", u."organizationId", u."name", u."username", u."role", u."designation",
           u."date_of_joining", u."createdAt", u."phone", u."email", u."branch_id", u."gender",
           ROW_NUMBER() OVER (PARTITION BY u."organizationId" ORDER BY u."createdAt", u."id") AS rn
    FROM "users" u
    WHERE NOT EXISTS (SELECT 1 FROM "employees" e WHERE e."user_id" = u."id")
      AND u."is_dev_admin" = false
      AND u."is_developer" = false
)
INSERT INTO "employees" ("user_id", "employee_code", "name", "designation", "date_of_joining",
                         "is_active", "phone", "email", "organizationId", "branch_id", "gender", "updated_at")
SELECT m."id",
       'EMP-' || LPAD((COALESCE(x.max_n, 0) + m.rn)::TEXT, 5, '0'),
       COALESCE(NULLIF(m."name", ''), m."username"),
       COALESCE(NULLIF(m."designation", ''), m."role"),
       COALESCE(m."date_of_joining", m."createdAt"),
       true, m."phone", m."email", m."organizationId", m."branch_id", m."gender", CURRENT_TIMESTAMP
FROM missing m
LEFT JOIN existing x ON x."organizationId" = m."organizationId";
