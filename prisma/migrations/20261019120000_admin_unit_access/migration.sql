-- Per-admin unit-switcher scope. Until now every admin could enter every active
-- unit; now an admin sees their home unit plus the units granted here, or all
-- units when users.can_access_all_units is set. Additive and nullable-safe.
-- Backfill keeps today's behaviour for existing admins (all units) so nobody
-- loses access on deploy; Super Admin can then narrow it per admin.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "can_access_all_units" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "user_unit_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "granted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_unit_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_unit_access_userId_organizationId_key" ON "user_unit_access"("userId", "organizationId");
CREATE INDEX IF NOT EXISTS "user_unit_access_organizationId_idx" ON "user_unit_access"("organizationId");

ALTER TABLE "user_unit_access" ADD CONSTRAINT "user_unit_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_unit_access" ADD CONSTRAINT "user_unit_access_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "users" SET "can_access_all_units" = true WHERE "role" = 'admin';
