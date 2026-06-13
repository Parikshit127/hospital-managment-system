-- Add nationality + government ID proof to patient registration
ALTER TABLE "OPD_REG" ADD COLUMN IF NOT EXISTS "nationality" TEXT;
ALTER TABLE "OPD_REG" ADD COLUMN IF NOT EXISTS "govt_id_type" TEXT;
ALTER TABLE "OPD_REG" ADD COLUMN IF NOT EXISTS "govt_id_number" TEXT;
