-- Tally Integration: per-hospital connection config + sync state/log tables.
-- Additive + idempotent: safe to re-run.
BEGIN;

-- Per-hospital Tally connection config (password stored encrypted at app layer).
ALTER TABLE "organization_configs" ADD COLUMN IF NOT EXISTS "tally_enabled"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organization_configs" ADD COLUMN IF NOT EXISTS "tally_url"          TEXT;
ALTER TABLE "organization_configs" ADD COLUMN IF NOT EXISTS "tally_company"      TEXT;
ALTER TABLE "organization_configs" ADD COLUMN IF NOT EXISTS "tally_username"     TEXT;
ALTER TABLE "organization_configs" ADD COLUMN IF NOT EXISTS "tally_password"     TEXT;
ALTER TABLE "organization_configs" ADD COLUMN IF NOT EXISTS "tally_auto_sync"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organization_configs" ADD COLUMN IF NOT EXISTS "tally_last_sync_at" TIMESTAMP(3);

-- HIS ledger (GL_Account) <-> Tally ledger sync state.
CREATE TABLE IF NOT EXISTS "tally_ledger_mapping" (
  "id"                TEXT NOT NULL,
  "organizationId"    TEXT NOT NULL,
  "gl_account_id"     TEXT NOT NULL,
  "his_ledger_name"   TEXT NOT NULL,
  "tally_ledger_name" TEXT,
  "tally_group"       TEXT,
  "tally_guid"        TEXT,
  "sync_status"       TEXT NOT NULL DEFAULT 'pending',
  "error_message"     TEXT,
  "last_synced_at"    TIMESTAMP(3),
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tally_ledger_mapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tally_ledger_mapping_org_account_key" ON "tally_ledger_mapping"("organizationId", "gl_account_id");
CREATE INDEX IF NOT EXISTS "tally_ledger_mapping_org_idx"    ON "tally_ledger_mapping"("organizationId");
CREATE INDEX IF NOT EXISTS "tally_ledger_mapping_status_idx" ON "tally_ledger_mapping"("sync_status");

-- HIS voucher (GL_JournalEntry) <-> Tally voucher sync state.
CREATE TABLE IF NOT EXISTS "tally_voucher_mapping" (
  "id"                   TEXT NOT NULL,
  "organizationId"       TEXT NOT NULL,
  "gl_journal_entry_id"  TEXT NOT NULL,
  "voucher_type"         TEXT NOT NULL,
  "his_voucher_number"   TEXT NOT NULL,
  "tally_voucher_number" TEXT,
  "tally_guid"           TEXT,
  "sync_status"          TEXT NOT NULL DEFAULT 'pending',
  "error_message"        TEXT,
  "last_synced_at"       TIMESTAMP(3),
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tally_voucher_mapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tally_voucher_mapping_org_entry_key" ON "tally_voucher_mapping"("organizationId", "gl_journal_entry_id");
CREATE INDEX IF NOT EXISTS "tally_voucher_mapping_org_idx"    ON "tally_voucher_mapping"("organizationId");
CREATE INDEX IF NOT EXISTS "tally_voucher_mapping_status_idx" ON "tally_voucher_mapping"("sync_status");

-- Per-sync request/response diagnostics log.
CREATE TABLE IF NOT EXISTS "tally_sync_logs" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "entity_type"      TEXT NOT NULL,
  "entity_id"        TEXT,
  "action"           TEXT NOT NULL,
  "status"           TEXT NOT NULL,
  "request_payload"  TEXT,
  "response_payload" TEXT,
  "error_message"    TEXT,
  "records_count"    INTEGER NOT NULL DEFAULT 0,
  "created_by"       TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tally_sync_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "tally_sync_logs_org_idx"     ON "tally_sync_logs"("organizationId");
CREATE INDEX IF NOT EXISTS "tally_sync_logs_entity_idx"  ON "tally_sync_logs"("entity_type");
CREATE INDEX IF NOT EXISTS "tally_sync_logs_status_idx"  ON "tally_sync_logs"("status");
CREATE INDEX IF NOT EXISTS "tally_sync_logs_created_idx" ON "tally_sync_logs"("created_at");

COMMIT;
