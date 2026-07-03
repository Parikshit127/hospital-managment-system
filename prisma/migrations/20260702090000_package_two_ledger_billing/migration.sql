-- Two-ledger IPD package billing (IPD_PACKAGE_BILLING_DESIGN.md).
-- STRICTLY ADDITIVE: no column drops, no data deletes, no changes to invoices,
-- invoice_items, expenses or any historical billing rows. Existing charge
-- postings keep their exact semantics via the 'billed' default.

-- ── ipd_charge_postings: consumption-ledger fields ──────────────────────────
ALTER TABLE "ipd_charge_postings" ADD COLUMN "disposition" TEXT NOT NULL DEFAULT 'billed';
ALTER TABLE "ipd_charge_postings" ADD COLUMN "admission_package_id" INTEGER;
ALTER TABLE "ipd_charge_postings" ADD COLUMN "service_category" TEXT;
ALTER TABLE "ipd_charge_postings" ADD COLUMN "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "ipd_charge_postings" ADD COLUMN "unit_price" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "ipd_charge_postings" ADD COLUMN "tax_rate" DECIMAL(65,30) NOT NULL DEFAULT 0;

CREATE INDEX "ipd_charge_postings_admission_package_id_idx" ON "ipd_charge_postings"("admission_package_id");
CREATE INDEX "ipd_charge_postings_admission_id_disposition_idx" ON "ipd_charge_postings"("admission_id", "disposition");

ALTER TABLE "ipd_charge_postings" ADD CONSTRAINT "ipd_charge_postings_admission_package_id_fkey"
  FOREIGN KEY ("admission_package_id") REFERENCES "ipd_admission_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── ipd_admission_packages: explicit lifecycle ───────────────────────────────
ALTER TABLE "ipd_admission_packages" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "ipd_admission_packages" ADD COLUMN "closed_at" TIMESTAMP(3);
ALTER TABLE "ipd_admission_packages" ADD COLUMN "expense_id" INTEGER;

CREATE INDEX "ipd_admission_packages_admission_id_status_idx" ON "ipd_admission_packages"("admission_id", "status");

-- Metadata alignment only (no billing figures touched):
-- 1) packages already broken open map to the new lifecycle value;
UPDATE "ipd_admission_packages" SET "status" = 'broken_open' WHERE "is_broken_open" = true;
-- 2) packages on already-discharged admissions are closed, so the new
--    posting-time router can NEVER pick them up — this is what guarantees
--    historical / backdated admissions are unaffected by the new behavior.
UPDATE "ipd_admission_packages" p
SET    "status" = 'closed', "closed_at" = a."discharge_date"
FROM   "admissions" a
WHERE  a."admission_id" = p."admission_id"
  AND  a."status" = 'Discharged'
  AND  p."is_broken_open" = false;
