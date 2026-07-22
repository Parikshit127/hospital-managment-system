-- Per-named-service commission rates.
--
-- Until now a rate could only target one of the five invoice_type buckets
-- (OPD/IPD/Pharmacy/Lab/Procedure). Hospitals pay a different cut per PROCEDURE,
-- so a rate can now optionally name a specific service. service_name = '' keeps
-- the old bucket-wide behaviour, so every existing row stays valid and unchanged.
ALTER TABLE "doctor_service_rates"   ADD COLUMN IF NOT EXISTS "service_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "referrer_service_rates" ADD COLUMN IF NOT EXISTS "service_name" TEXT NOT NULL DEFAULT '';

-- Widen the uniqueness so one doctor can hold both a bucket rate and several
-- named-service rates within the same bucket.
DROP INDEX IF EXISTS "doctor_service_rates_doctor_id_service_type_key";
DROP INDEX IF EXISTS "referrer_service_rates_referrer_id_service_type_key";

CREATE UNIQUE INDEX IF NOT EXISTS "doctor_service_rates_doctor_id_service_type_service_name_key"
    ON "doctor_service_rates" ("doctor_id", "service_type", "service_name");
CREATE UNIQUE INDEX IF NOT EXISTS "referrer_service_rates_referrer_id_service_type_service_name_key"
    ON "referrer_service_rates" ("referrer_id", "service_type", "service_name");
