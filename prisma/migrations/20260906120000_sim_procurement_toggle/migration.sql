-- Whether a simulation buys the stock it dispenses. Table name is the @@map target,
-- not the Prisma model name.
ALTER TABLE "organization_configs"
  ADD COLUMN IF NOT EXISTS "simulation_procurement_enabled" BOOLEAN NOT NULL DEFAULT true;
