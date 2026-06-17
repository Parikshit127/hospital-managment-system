-- TPA approval lifecycle fields
-- Separates "what TPA promised" (tpa_approved_amount, immutable) from
-- "what we've actually received" (tpa_settled_amount, accumulator).
ALTER TABLE "invoices"
  ADD COLUMN "tpa_approved_amount" DECIMAL(65, 30) NOT NULL DEFAULT 0,
  ADD COLUMN "tpa_approved_at" TIMESTAMP(3),
  ADD COLUMN "tpa_settled_at" TIMESTAMP(3);

-- Backfill legacy approved/settled rows so partials aren't under-stated.
-- For rows already in flight, approved = current outstanding receivable + already settled.
UPDATE "invoices"
SET "tpa_approved_amount" = "tpa_payable" + "tpa_settled_amount"
WHERE "tpa_claim_status" IN ('approved','settled','partially_settled')
  AND "tpa_approved_amount" = 0;

UPDATE "invoices"
SET "tpa_approved_at" = "updated_at"
WHERE "tpa_claim_status" IN ('approved','settled','partially_settled')
  AND "tpa_approved_at" IS NULL;

UPDATE "invoices"
SET "tpa_settled_at" = "updated_at"
WHERE "tpa_claim_status" = 'settled'
  AND "tpa_settled_at" IS NULL;
