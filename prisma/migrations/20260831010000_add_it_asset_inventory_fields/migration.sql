-- IT Asset Inventory columns on the asset register.
-- All nullable, no defaults -> additive and safe to run against a populated table.
ALTER TABLE "fixed_assets"
  ADD COLUMN IF NOT EXISTS "assigned_to"     TEXT,
  ADD COLUMN IF NOT EXISTS "cpu_details"     TEXT,
  ADD COLUMN IF NOT EXISTS "hardware_specs"  TEXT,
  ADD COLUMN IF NOT EXISTS "peripherals"     TEXT,
  ADD COLUMN IF NOT EXISTS "printer_details" TEXT,
  ADD COLUMN IF NOT EXISTS "ups_network"     TEXT,
  ADD COLUMN IF NOT EXISTS "notes"           TEXT,
  -- Stored encrypted (enc:v1:… via app/lib/secure-config.ts), never plaintext.
  ADD COLUMN IF NOT EXISTS "access_code"     TEXT;
