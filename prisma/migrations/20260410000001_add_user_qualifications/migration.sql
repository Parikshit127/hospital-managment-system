-- Add qualifications column to users table (used by Doctor Master)
BEGIN;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "qualifications" TEXT;

COMMIT;
