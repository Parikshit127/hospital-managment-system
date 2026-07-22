-- Human-readable number for a referrer/consultant payout invoice (e.g. AVS-CNI-26-27-001),
-- mirroring doctor_payout_statements.statement_number. Nullable so statements created
-- before numbering existed stay valid.
ALTER TABLE "referral_payout_statements" ADD COLUMN IF NOT EXISTS "statement_number" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "referral_payout_statements_statement_number_key"
    ON "referral_payout_statements" ("statement_number");
