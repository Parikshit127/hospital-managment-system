-- Flag services (e.g. Procedure) whose billing line item must carry a rendering doctor for commission attribution.
ALTER TABLE "ipd_service_master" ADD COLUMN IF NOT EXISTS "requires_rendered_by" BOOLEAN NOT NULL DEFAULT false;
