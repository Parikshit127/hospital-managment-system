-- AlterTable: mark an organization as a simulation environment.
--
-- Set at provisioning time (Superadmin -> Add Hospital -> Create as Simulation
-- Environment). The background activity engine will only write to an organization with
-- this flag set, AND only when SIM_ENABLED=1 is present in the deploy environment, AND
-- never to an organization on the protected list in scripts/sim/guard.ts.
--
-- Table name is the @@map target ("organization_configs"), not the Prisma model name.
ALTER TABLE "organization_configs"
    ADD COLUMN IF NOT EXISTS "simulation_enabled" BOOLEAN NOT NULL DEFAULT false;
