-- Add structured address fields to OPD_REG (city, state, country, pincode)
ALTER TABLE "OPD_REG" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "OPD_REG" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "OPD_REG" ADD COLUMN IF NOT EXISTS "country" TEXT DEFAULT 'India';
ALTER TABLE "OPD_REG" ADD COLUMN IF NOT EXISTS "pincode" TEXT;

CREATE INDEX IF NOT EXISTS "OPD_REG_organizationId_city_idx" ON "OPD_REG"("organizationId", "city");
CREATE INDEX IF NOT EXISTS "OPD_REG_organizationId_pincode_idx" ON "OPD_REG"("organizationId", "pincode");
