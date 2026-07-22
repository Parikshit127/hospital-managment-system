-- Human-readable doctor payout invoice number (e.g. AVS-DRI-26-27-001) so a
-- generated doctor invoice can be referenced, reprinted and reconciled like any
-- other financial document. Nullable: statements created before numbering
-- existed keep a NULL number rather than being back-stamped with a fake one.
ALTER TABLE "doctor_payout_statements" ADD COLUMN IF NOT EXISTS "statement_number" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "doctor_payout_statements_statement_number_key"
    ON "doctor_payout_statements" ("statement_number");
