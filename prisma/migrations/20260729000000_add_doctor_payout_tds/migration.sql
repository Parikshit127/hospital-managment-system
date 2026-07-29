-- TDS (Tax Deducted at Source, Section 194J) on doctor commission payouts.
-- The hospital withholds tax before paying a doctor's commission; rate defaults
-- to the statutory 10% but stays editable per invoice. Existing rows default to
-- 10%/0 so already-paid statements are unaffected until re-touched.
ALTER TABLE "doctor_commissions"
    ADD COLUMN IF NOT EXISTS "tds_rate_percent" DOUBLE PRECISION NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS "tds_amount" DECIMAL(65,30) NOT NULL DEFAULT 0;

ALTER TABLE "doctor_payout_statements"
    ADD COLUMN IF NOT EXISTS "tds_rate_percent" DOUBLE PRECISION NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS "total_tds" DECIMAL(65,30) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "net_payable" DECIMAL(65,30) NOT NULL DEFAULT 0;
