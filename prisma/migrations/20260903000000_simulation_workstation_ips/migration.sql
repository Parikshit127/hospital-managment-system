-- AlterTable: per-simulation map of simulated username -> workstation address.
--
-- Built at clone time from the SHAPE of the source hospital's traffic (which network
-- blocks its staff actually appear from), not from the addresses themselves. Real audit
-- rows hold public ISP addresses belonging to identifiable people; copying those into a
-- simulation would move real location data into a prop environment.
ALTER TABLE "organization_configs"
    ADD COLUMN IF NOT EXISTS "simulation_workstation_ips" JSONB;
