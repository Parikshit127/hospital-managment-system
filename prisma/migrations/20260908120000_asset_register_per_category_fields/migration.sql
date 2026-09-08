-- Asset Register: per-category columns + a dependable row key.
--
-- The hospital's IT inventory sheet (Computer/Laptop) carries RAM, Storage,
-- Operating System, Vendor, Condition and a working Status as their own
-- columns, and an "Asset ID" the hospital types itself. Because that Asset ID
-- is hand-assigned and re-used, `s_no` becomes the register's identity and the
-- key bulk imports match on.

ALTER TABLE "fixed_assets"
  ADD COLUMN IF NOT EXISTS "s_no"             INTEGER,
  ADD COLUMN IF NOT EXISTS "asset_type"       TEXT,
  ADD COLUMN IF NOT EXISTS "ram"              TEXT,
  ADD COLUMN IF NOT EXISTS "storage"          TEXT,
  ADD COLUMN IF NOT EXISTS "operating_system" TEXT,
  ADD COLUMN IF NOT EXISTS "vendor_name"      TEXT,
  ADD COLUMN IF NOT EXISTS "working_status"   TEXT,
  ADD COLUMN IF NOT EXISTS "condition"        TEXT;

-- Backfill s_no per organization, oldest asset first, so existing registers get
-- a stable 1..n before the unique index goes on.
WITH numbered AS (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "organizationId" ORDER BY "created_at", "id") AS rn
  FROM "fixed_assets"
  WHERE "s_no" IS NULL
)
UPDATE "fixed_assets" f
   SET "s_no" = n.rn
  FROM numbered n
 WHERE f."id" = n."id";

CREATE UNIQUE INDEX IF NOT EXISTS "fixed_assets_s_no_organizationId_key"
  ON "fixed_assets" ("s_no", "organizationId");
