-- AlterTable: per-simulation master-data settings.
--
-- simulation_source_org_id is the important one: a cloned environment previously had no
-- record of where it came from, so there was nothing for a daily re-sync to read from.
--
-- Table name is the @@map target ("organization_configs"), not the Prisma model name.
ALTER TABLE "organization_configs"
    ADD COLUMN IF NOT EXISTS "simulation_source_org_id" TEXT;

ALTER TABLE "organization_configs"
    ADD COLUMN IF NOT EXISTS "simulation_use_master_data" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "organization_configs"
    ADD COLUMN IF NOT EXISTS "simulation_master_synced_at" TIMESTAMP(3);

ALTER TABLE "organization_configs"
    ADD COLUMN IF NOT EXISTS "simulation_complaint_style" TEXT NOT NULL DEFAULT 'general';

ALTER TABLE "organization_configs"
    ADD COLUMN IF NOT EXISTS "simulation_department_mode" TEXT NOT NULL DEFAULT 'clone';
