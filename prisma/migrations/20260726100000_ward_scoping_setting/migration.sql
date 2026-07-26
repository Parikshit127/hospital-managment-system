-- Per-hospital switch for ward-first nursing screens.
--
-- Defaults to false, i.e. exactly today's behaviour, so applying this changes
-- nothing until a hospital turns it on.
ALTER TABLE "organization_configs"
    ADD COLUMN IF NOT EXISTS "ward_scoping_enabled" BOOLEAN NOT NULL DEFAULT false;
