-- Doctor invoicing upgrade: editable per-bill amounts, invoice-level adjustment,
-- and a payment ledger (part-payments with exact time, mode, reference).

ALTER TABLE "doctor_commissions"
    ADD COLUMN IF NOT EXISTS "computed_amount" DECIMAL(65,30),
    ADD COLUMN IF NOT EXISTS "is_adjusted" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "adjust_note" TEXT,
    ADD COLUMN IF NOT EXISTS "line_breakdown" JSONB;

ALTER TABLE "doctor_payout_statements"
    ADD COLUMN IF NOT EXISTS "adjustment_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "adjustment_note" TEXT,
    ADD COLUMN IF NOT EXISTS "invoice_date" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "doctor_payout_payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_mode" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "recorded_by" TEXT,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "voided_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "doctor_payout_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "doctor_payout_payments_organizationId_doctor_id_idx" ON "doctor_payout_payments"("organizationId", "doctor_id");
CREATE INDEX IF NOT EXISTS "doctor_payout_payments_statement_id_idx" ON "doctor_payout_payments"("statement_id");

ALTER TABLE "doctor_payout_payments" ADD CONSTRAINT "doctor_payout_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_payout_payments" ADD CONSTRAINT "doctor_payout_payments_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "doctor_payout_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every statement already marked paid becomes one payment row, so the
-- new payment history and balances are right for historical invoices too.
-- net_payable = 0 on pre-TDS statements, hence the total_commission fallback.
INSERT INTO "doctor_payout_payments"
    ("id", "organizationId", "statement_id", "doctor_id", "amount", "paid_at", "payment_mode", "reference", "notes", "recorded_by")
SELECT
    gen_random_uuid()::text,
    s."organizationId",
    s."id",
    s."doctor_id",
    COALESCE(s."paid_amount", NULLIF(s."net_payable", 0), s."total_commission"),
    COALESCE(s."paid_at", s."updated_at"),
    s."payment_mode",
    s."payment_reference",
    NULL,
    s."created_by"
FROM "doctor_payout_statements" s
WHERE s."status" = 'paid'
  AND NOT EXISTS (SELECT 1 FROM "doctor_payout_payments" p WHERE p."statement_id" = s."id");

-- Statements settled before TDS support carry the column default (10%) but never
-- had any TDS withheld (total_tds = 0, net_payable = 0). Zero their rate so that
-- editing or re-deriving one of them later cannot silently start deducting tax.
UPDATE "doctor_payout_statements"
SET "tds_rate_percent" = 0
WHERE "total_tds" = 0 AND "net_payable" = 0 AND "total_commission" > 0;
