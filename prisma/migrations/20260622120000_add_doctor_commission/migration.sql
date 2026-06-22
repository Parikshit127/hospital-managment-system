-- Doctor Commission feature

CREATE TABLE IF NOT EXISTS "doctor_commission_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "commission_type" TEXT NOT NULL DEFAULT 'flat_percent',
    "flat_percent" DOUBLE PRECISION,
    "fixed_amount_per_bill" DOUBLE PRECISION,
    "pan_number" TEXT,
    "bank_account" TEXT,
    "ifsc" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "doctor_commission_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "doctor_service_rates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "doctor_service_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "doctor_commissions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
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
    CONSTRAINT "doctor_commissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "doctor_payout_statements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
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
    CONSTRAINT "doctor_payout_statements_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "doctor_commission_configs_organizationId_doctor_id_key" ON "doctor_commission_configs"("organizationId", "doctor_id");
CREATE INDEX IF NOT EXISTS "doctor_commission_configs_organizationId_idx" ON "doctor_commission_configs"("organizationId");

CREATE UNIQUE INDEX IF NOT EXISTS "doctor_service_rates_doctor_id_service_type_key" ON "doctor_service_rates"("doctor_id", "service_type");
CREATE INDEX IF NOT EXISTS "doctor_service_rates_organizationId_idx" ON "doctor_service_rates"("organizationId");
CREATE INDEX IF NOT EXISTS "doctor_service_rates_organizationId_doctor_id_idx" ON "doctor_service_rates"("organizationId", "doctor_id");

CREATE UNIQUE INDEX IF NOT EXISTS "doctor_commissions_invoice_id_key" ON "doctor_commissions"("invoice_id");
CREATE INDEX IF NOT EXISTS "doctor_commissions_organizationId_idx" ON "doctor_commissions"("organizationId");
CREATE INDEX IF NOT EXISTS "doctor_commissions_doctor_id_status_idx" ON "doctor_commissions"("doctor_id", "status");
CREATE INDEX IF NOT EXISTS "doctor_commissions_patient_id_idx" ON "doctor_commissions"("patient_id");
CREATE INDEX IF NOT EXISTS "doctor_commissions_statement_id_idx" ON "doctor_commissions"("statement_id");

CREATE INDEX IF NOT EXISTS "doctor_payout_statements_organizationId_doctor_id_idx" ON "doctor_payout_statements"("organizationId", "doctor_id");

-- Foreign keys
ALTER TABLE "doctor_commission_configs" ADD CONSTRAINT "doctor_commission_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "doctor_service_rates" ADD CONSTRAINT "doctor_service_rates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_service_rates" ADD CONSTRAINT "doctor_service_rates_org_doctor_fkey" FOREIGN KEY ("organizationId", "doctor_id") REFERENCES "doctor_commission_configs"("organizationId", "doctor_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "doctor_commissions" ADD CONSTRAINT "doctor_commissions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_commissions" ADD CONSTRAINT "doctor_commissions_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "doctor_payout_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "doctor_payout_statements" ADD CONSTRAINT "doctor_payout_statements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
