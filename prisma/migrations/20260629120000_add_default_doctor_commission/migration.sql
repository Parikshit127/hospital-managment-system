-- Org-wide fallback commission rate for doctors with no DoctorCommissionConfig.
-- Additive, non-destructive: a nullable-free Float defaulting to 0 (disabled),
-- so existing rows get 0 and behaviour is unchanged until finance sets a rate.

ALTER TABLE "organization_configs"
ADD COLUMN "default_doctor_commission_percent" DOUBLE PRECISION NOT NULL DEFAULT 0;
