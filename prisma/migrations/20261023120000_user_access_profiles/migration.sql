-- Per-employee access profiles (ACCESS_PROFILES_PLAN.md).
--
-- PURELY ADDITIVE and inert: one new table. Nothing existing is altered. The application reads it inside
-- try/catch, so code that ships before this migration is applied simply sees "nobody has a profile".
-- Idempotent (safe to re-run). Apply with `prisma migrate deploy` - never `migrate dev` (shared dev DB has drift).

CREATE TABLE IF NOT EXISTS "user_access_profiles" (
    "user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "preset" TEXT NOT NULL,
    "modules" TEXT[],
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "note" TEXT,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_access_profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE INDEX IF NOT EXISTS "user_access_profiles_company_id_idx" ON "user_access_profiles"("company_id");

DO $$ BEGIN
    ALTER TABLE "user_access_profiles" ADD CONSTRAINT "user_access_profiles_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
