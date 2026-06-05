-- Tally bill-wise: link GL journal receivable lines to the invoice they settle.
-- Additive + idempotent + nullable.
BEGIN;

ALTER TABLE "gl_journal_lines" ADD COLUMN IF NOT EXISTS "bill_reference"  TEXT;
ALTER TABLE "gl_journal_lines" ADD COLUMN IF NOT EXISTS "bill_alloc_type" TEXT;

COMMIT;
