-- A payer's UTR must be unique so the same bank transfer is never banked twice.
-- The constraint ignored status, though, so once a receipt was reversed its
-- reference stayed locked forever — and re-recording the corrected receipt under
-- its real UTR (the normal correction path) was impossible. Billers had to invent
-- a suffixed reference, which then no longer matched the bank statement.
--
-- Replace it with a PARTIAL unique index that only constrains live receipts, so a
-- reversed receipt releases its reference while active ones stay protected.
--
-- Relaxes a constraint only: no column is dropped, no row is touched, and any
-- data that satisfied the old rule satisfies the new one. Safe to run before the
-- new code is serving.

-- Prisma created this as a UNIQUE constraint; older/patched environments may have
-- it as a bare unique index instead, so drop both forms defensively.
ALTER TABLE "insurance_receipts"
    DROP CONSTRAINT IF EXISTS "insurance_receipts_organizationId_reference_number_key";
DROP INDEX IF EXISTS "insurance_receipts_organizationId_reference_number_key";

-- Lookups by reference (the duplicate check) still need an index.
CREATE INDEX IF NOT EXISTS "insurance_receipts_organizationId_reference_number_idx"
    ON "insurance_receipts" ("organizationId", "reference_number");

-- The real guard: one live receipt per reference per org. Reversed rows are
-- excluded, so their reference can be reused.
CREATE UNIQUE INDEX IF NOT EXISTS "insurance_receipts_org_reference_active_key"
    ON "insurance_receipts" ("organizationId", "reference_number")
    WHERE "status" <> 'Reversed';
