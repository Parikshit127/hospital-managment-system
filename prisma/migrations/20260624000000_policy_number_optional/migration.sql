-- Policy number is optional at the patient level (mandatory only at billing for
-- TPA patients). Drop NOT NULL; the unique index stays and Postgres permits
-- multiple NULLs under it. Idempotent / non-destructive.
ALTER TABLE "insurance_policies" ALTER COLUMN "policy_number" DROP NOT NULL;
