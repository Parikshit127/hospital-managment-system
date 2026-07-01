-- Add nullable ticket assignee (relation to User).
-- Idempotent + additive: the column and FK may already exist on the live DB
-- (added by a parallel branch), while fresh databases get the full definition.
-- No destructive changes to unrelated tables.

ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "assigned_to_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tickets_assigned_to_id_fkey'
  ) THEN
    ALTER TABLE "tickets"
      ADD CONSTRAINT "tickets_assigned_to_id_fkey"
      FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "tickets_assigned_to_id_idx" ON "tickets"("assigned_to_id");
