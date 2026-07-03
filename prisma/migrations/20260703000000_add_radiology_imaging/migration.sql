-- Create radiology_imaging table
CREATE TABLE "radiology_imaging" (
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
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "radiology_imaging_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create unique index
CREATE UNIQUE INDEX "radiology_imaging_procedure_name_organizationId_key" ON "radiology_imaging"("procedure_name", "organizationId");

-- Create index for organization
CREATE INDEX "radiology_imaging_organizationId_idx" ON "radiology_imaging"("organizationId");
