-- Create radiology_imaging table
CREATE TABLE IF NOT EXISTS "radiology_imaging" (
  "id" SERIAL NOT NULL PRIMARY KEY,
  "procedure_name" TEXT NOT NULL,
  "procedure_code" TEXT,
  "price" DOUBLE PRECISION NOT NULL,
  "category" TEXT,
  "description" TEXT,
  "is_available" BOOLEAN NOT NULL DEFAULT true,
  "hsn_sac_code" TEXT,
  "tax_rate" DOUBLE PRECISION DEFAULT 0,
  "turnaround_time" TEXT,
  "requires_prescription" BOOLEAN NOT NULL DEFAULT false,
  "modality" TEXT,
  "body_part" TEXT,
  "organizationId" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraint only if Organization table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Organization') THEN
    ALTER TABLE "radiology_imaging" 
    ADD CONSTRAINT "radiology_imaging_organizationId_fkey" 
    FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") 
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Create unique index if not exists
CREATE UNIQUE INDEX IF NOT EXISTS "radiology_imaging_procedure_name_organizationId_key" 
ON "radiology_imaging"("procedure_name", "organizationId");

-- Create index for organization if not exists
CREATE INDEX IF NOT EXISTS "radiology_imaging_organizationId_idx" 
ON "radiology_imaging"("organizationId");
