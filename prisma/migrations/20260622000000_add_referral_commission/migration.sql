-- Referral & Commission feature

-- Patient -> referrer link (null = Self)
ALTER TABLE "OPD_REG" ADD COLUMN IF NOT EXISTS "referrer_id" TEXT;

-- Referrer roster
CREATE TABLE IF NOT EXISTS "referrers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "category" TEXT NOT NULL DEFAULT 'others',
    "pan_number" TEXT,
    "bank_account" TEXT,
    "ifsc" TEXT,
    "commission_type" TEXT NOT NULL DEFAULT 'flat_percent',
    "flat_percent" DOUBLE PRECISION,
    "fixed_amount_per_patient" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "referrers_pkey" PRIMARY KEY ("id")
);

-- Per-service rates (when commission_type = per_service)
CREATE TABLE IF NOT EXISTS "referrer_service_rates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "referrer_service_rates_pkey" PRIMARY KEY ("id")
);

-- Commission accrual ledger
CREATE TABLE IF NOT EXISTS "referral_commissions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "invoice_type" TEXT NOT NULL,
    "eligible_base" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "rate_applied" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commission_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'accrued',
    "statement_id" TEXT,
    "accrued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "referral_commissions_pkey" PRIMARY KEY ("id")
);

-- Periodic payout statements
CREATE TABLE IF NOT EXISTS "referral_payout_statements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "total_commission" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "paid_at" TIMESTAMP(3),
    "paid_amount" DECIMAL(65,30),
    "payment_mode" TEXT,
    "payment_reference" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "referral_payout_statements_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "opd_reg_organizationId_referrer_id_idx" ON "OPD_REG"("organizationId", "referrer_id");

CREATE INDEX IF NOT EXISTS "referrers_organizationId_idx" ON "referrers"("organizationId");
CREATE INDEX IF NOT EXISTS "referrers_organizationId_category_idx" ON "referrers"("organizationId", "category");
CREATE INDEX IF NOT EXISTS "referrers_organizationId_is_active_idx" ON "referrers"("organizationId", "is_active");

CREATE UNIQUE INDEX IF NOT EXISTS "referrer_service_rates_referrer_id_service_type_key" ON "referrer_service_rates"("referrer_id", "service_type");
CREATE INDEX IF NOT EXISTS "referrer_service_rates_organizationId_idx" ON "referrer_service_rates"("organizationId");

CREATE UNIQUE INDEX IF NOT EXISTS "referral_commissions_invoice_id_key" ON "referral_commissions"("invoice_id");
CREATE INDEX IF NOT EXISTS "referral_commissions_organizationId_idx" ON "referral_commissions"("organizationId");
CREATE INDEX IF NOT EXISTS "referral_commissions_referrer_id_status_idx" ON "referral_commissions"("referrer_id", "status");
CREATE INDEX IF NOT EXISTS "referral_commissions_patient_id_idx" ON "referral_commissions"("patient_id");
CREATE INDEX IF NOT EXISTS "referral_commissions_statement_id_idx" ON "referral_commissions"("statement_id");

CREATE INDEX IF NOT EXISTS "referral_payout_statements_organizationId_referrer_id_idx" ON "referral_payout_statements"("organizationId", "referrer_id");

-- Foreign keys
ALTER TABLE "OPD_REG" ADD CONSTRAINT "opd_reg_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "referrers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "referrers" ADD CONSTRAINT "referrers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "referrer_service_rates" ADD CONSTRAINT "referrer_service_rates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referrer_service_rates" ADD CONSTRAINT "referrer_service_rates_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "referrers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "referrers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "referral_payout_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "referral_payout_statements" ADD CONSTRAINT "referral_payout_statements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_payout_statements" ADD CONSTRAINT "referral_payout_statements_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "referrers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
