-- AlterTable: operator controls for the synthetic background activity generator.
--
-- Staging only. These columns are one of TWO required keys — the engine additionally
-- requires SIM_ENABLED=1 and a matching SIM_ORG_ID in the environment (see
-- scripts/sim/guard.ts), so applying this migration to a deploy without those variables
-- leaves the generator completely inert.
--
-- Table name is the @@map target ("organization_configs"), not the Prisma model name.
ALTER TABLE "organization_configs"
    ADD COLUMN IF NOT EXISTS "activity_generator_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "organization_configs"
    ADD COLUMN IF NOT EXISTS "activity_generator_intensity" TEXT NOT NULL DEFAULT 'moderate';
