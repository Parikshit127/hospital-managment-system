-- TPA & Insurance Upgrade — Finance Receivables
-- Additive migration: new columns on existing insurance/invoice/payment models +
-- six new tables (receipts, allocations, dispatch, denial reasons, short-pay, SLA).
-- Idempotent (IF NOT EXISTS) so it is safe to re-run on staging.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Column additions on existing tables
-- ─────────────────────────────────────────────────────────────────────────────

-- invoices: TPA receipt reconciliation (disallowed / TDS)
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tpa_disallowed_amount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tpa_tds_amount" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- insurance_providers: document checklist + denial follow-up cadence
ALTER TABLE "insurance_providers" ADD COLUMN IF NOT EXISTS "document_checklist" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "insurance_providers" ADD COLUMN IF NOT EXISTS "denial_followup_cadence_days" INTEGER NOT NULL DEFAULT 7;

-- insurance_policies: copay terms + eligibility snapshot
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "copay_percent" DECIMAL(65,30);
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "copay_fixed" DECIMAL(65,30);
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "eligibility_snapshot" JSONB;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "ecard_key" TEXT;

-- insurance_claims: sanction reconciliation, denial taxonomy, resubmission, SLA
ALTER TABLE "insurance_claims" ADD COLUMN IF NOT EXISTS "sanctioned_amount" DECIMAL(65,30);
ALTER TABLE "insurance_claims" ADD COLUMN IF NOT EXISTS "short_pay_amount" DECIMAL(65,30);
ALTER TABLE "insurance_claims" ADD COLUMN IF NOT EXISTS "denial_reason_code" TEXT;
ALTER TABLE "insurance_claims" ADD COLUMN IF NOT EXISTS "resubmission_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "insurance_claims" ADD COLUMN IF NOT EXISTS "original_claim_id" INTEGER;
ALTER TABLE "insurance_claims" ADD COLUMN IF NOT EXISTS "appeal_status" TEXT;
ALTER TABLE "insurance_claims" ADD COLUMN IF NOT EXISTS "dispatch_id" TEXT;
ALTER TABLE "insurance_claims" ADD COLUMN IF NOT EXISTS "sla_due_at" TIMESTAMP(3);

-- payment_splits: link to the receipt allocation that settled it
ALTER TABLE "payment_splits" ADD COLUMN IF NOT EXISTS "receipt_allocation_id" TEXT;

-- insurance_preauths: consolidate the previously-orphaned preAuthorization refs
ALTER TABLE "insurance_preauths" ADD COLUMN IF NOT EXISTS "provider_id" INTEGER;
ALTER TABLE "insurance_preauths" ADD COLUMN IF NOT EXISTS "corporate_id" TEXT;
ALTER TABLE "insurance_preauths" ADD COLUMN IF NOT EXISTS "valid_until" TIMESTAMP(3);
ALTER TABLE "insurance_preauths" ADD COLUMN IF NOT EXISTS "query_due_at" TIMESTAMP(3);
ALTER TABLE "insurance_preauths" ADD COLUMN IF NOT EXISTS "document_checklist" JSONB;
ALTER TABLE "insurance_preauths" ADD COLUMN IF NOT EXISTS "remarks" TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) New tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "insurance_receipts" (
    "id" SERIAL NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "payer_type" TEXT NOT NULL,
    "provider_id" INTEGER,
    "corporate_id" TEXT,
    "instrument" TEXT NOT NULL DEFAULT 'NEFT',
    "reference_number" TEXT NOT NULL,
    "receipt_date" TIMESTAMP(3) NOT NULL,
    "total_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "allocated_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unmapped_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tds_total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "remarks" TEXT,
    "gl_posted" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "insurance_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "insurance_receipt_allocations" (
    "id" SERIAL NOT NULL,
    "receipt_id" INTEGER NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "claim_id" INTEGER,
    "allocated_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "disallowed_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tds_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "disallowance_reason" TEXT,
    "payment_id" INTEGER,
    "payment_split_id" TEXT,
    "organizationId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "insurance_receipt_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "claim_dispatches" (
    "id" TEXT NOT NULL,
    "claim_id" INTEGER NOT NULL,
    "dispatch_mode" TEXT NOT NULL DEFAULT 'Portal',
    "reference_awb" TEXT,
    "cover_letter_key" TEXT,
    "dispatched_by" TEXT,
    "dispatched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ack_received" BOOLEAN NOT NULL DEFAULT false,
    "ack_date" TIMESTAMP(3),
    "remarks" TEXT,
    "organizationId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "claim_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "denial_reasons" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "is_recoverable" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT NOT NULL,
    CONSTRAINT "denial_reasons_pkey" PRIMARY KEY ("organizationId","code")
);

CREATE TABLE IF NOT EXISTS "claim_short_pays" (
    "id" SERIAL NOT NULL,
    "claim_id" INTEGER,
    "invoice_id" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "denial_reason_code" TEXT,
    "disposition" TEXT NOT NULL DEFAULT 'PendingReview',
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "gl_posted" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "claim_short_pays_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payer_sla_configs" (
    "id" SERIAL NOT NULL,
    "provider_id" INTEGER,
    "corporate_id" TEXT,
    "submission_tat_hours" INTEGER NOT NULL DEFAULT 48,
    "payment_terms_days" INTEGER NOT NULL DEFAULT 45,
    "followup_cadence_days" INTEGER NOT NULL DEFAULT 7,
    "ageing_alert_days" INTEGER NOT NULL DEFAULT 60,
    "organizationId" TEXT NOT NULL,
    CONSTRAINT "payer_sla_configs_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Indexes & unique constraints
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "insurance_receipts_org_number_key" ON "insurance_receipts" ("organizationId","receipt_number");
CREATE UNIQUE INDEX IF NOT EXISTS "insurance_receipts_org_reference_key" ON "insurance_receipts" ("organizationId","reference_number");
CREATE INDEX IF NOT EXISTS "insurance_receipts_org_idx" ON "insurance_receipts" ("organizationId");
CREATE INDEX IF NOT EXISTS "insurance_receipts_payer_type_idx" ON "insurance_receipts" ("payer_type");
CREATE INDEX IF NOT EXISTS "insurance_receipts_status_idx" ON "insurance_receipts" ("status");

CREATE INDEX IF NOT EXISTS "insurance_receipt_allocations_org_idx" ON "insurance_receipt_allocations" ("organizationId");
CREATE INDEX IF NOT EXISTS "insurance_receipt_allocations_receipt_idx" ON "insurance_receipt_allocations" ("receipt_id");
CREATE INDEX IF NOT EXISTS "insurance_receipt_allocations_invoice_idx" ON "insurance_receipt_allocations" ("invoice_id");

CREATE INDEX IF NOT EXISTS "claim_dispatches_org_idx" ON "claim_dispatches" ("organizationId");
CREATE INDEX IF NOT EXISTS "claim_dispatches_claim_idx" ON "claim_dispatches" ("claim_id");

CREATE INDEX IF NOT EXISTS "denial_reasons_org_idx" ON "denial_reasons" ("organizationId");

CREATE INDEX IF NOT EXISTS "claim_short_pays_org_idx" ON "claim_short_pays" ("organizationId");
CREATE INDEX IF NOT EXISTS "claim_short_pays_invoice_idx" ON "claim_short_pays" ("invoice_id");
CREATE INDEX IF NOT EXISTS "claim_short_pays_disposition_idx" ON "claim_short_pays" ("disposition");

CREATE INDEX IF NOT EXISTS "payer_sla_configs_org_idx" ON "payer_sla_configs" ("organizationId");

CREATE INDEX IF NOT EXISTS "invoices_org_billtype_claimstatus_idx" ON "invoices" ("organizationId","billing_patient_type","tpa_claim_status");
CREATE INDEX IF NOT EXISTS "insurance_claims_invoice_idx" ON "insurance_claims" ("invoice_id");
CREATE INDEX IF NOT EXISTS "insurance_claims_status_idx" ON "insurance_claims" ("status");
CREATE INDEX IF NOT EXISTS "insurance_preauths_status_idx" ON "insurance_preauths" ("status");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Foreign keys (added only if missing)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "insurance_receipts" ADD CONSTRAINT "insurance_receipts_provider_fk" FOREIGN KEY ("provider_id") REFERENCES "insurance_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "insurance_receipts" ADD CONSTRAINT "insurance_receipts_corporate_fk" FOREIGN KEY ("corporate_id") REFERENCES "corporate_masters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "insurance_receipts" ADD CONSTRAINT "insurance_receipts_org_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "insurance_receipt_allocations" ADD CONSTRAINT "ira_receipt_fk" FOREIGN KEY ("receipt_id") REFERENCES "insurance_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "insurance_receipt_allocations" ADD CONSTRAINT "ira_invoice_fk" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "insurance_receipt_allocations" ADD CONSTRAINT "ira_claim_fk" FOREIGN KEY ("claim_id") REFERENCES "insurance_claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "insurance_receipt_allocations" ADD CONSTRAINT "ira_org_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "claim_dispatches" ADD CONSTRAINT "claim_dispatches_claim_fk" FOREIGN KEY ("claim_id") REFERENCES "insurance_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "claim_dispatches" ADD CONSTRAINT "claim_dispatches_org_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "denial_reasons" ADD CONSTRAINT "denial_reasons_org_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "claim_short_pays" ADD CONSTRAINT "csp_invoice_fk" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "claim_short_pays" ADD CONSTRAINT "csp_claim_fk" FOREIGN KEY ("claim_id") REFERENCES "insurance_claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "claim_short_pays" ADD CONSTRAINT "csp_org_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payer_sla_configs" ADD CONSTRAINT "psc_provider_fk" FOREIGN KEY ("provider_id") REFERENCES "insurance_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payer_sla_configs" ADD CONSTRAINT "psc_corporate_fk" FOREIGN KEY ("corporate_id") REFERENCES "corporate_masters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payer_sla_configs" ADD CONSTRAINT "psc_org_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- insurance_claims self-relation (resubmission) + preauth payer FKs
DO $$ BEGIN
  ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_original_fk" FOREIGN KEY ("original_claim_id") REFERENCES "insurance_claims"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "insurance_preauths" ADD CONSTRAINT "insurance_preauths_provider_fk" FOREIGN KEY ("provider_id") REFERENCES "insurance_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "insurance_preauths" ADD CONSTRAINT "insurance_preauths_corporate_fk" FOREIGN KEY ("corporate_id") REFERENCES "corporate_masters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
