-- Per-line-item doctor attribution: a service line can now carry its own rendering
-- doctor (distinct from invoices.doctor_id, the bill-level attending/consulting doctor),
-- so a single bill can pay commission to more than one doctor.
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "rendered_by_doctor_id" TEXT;
ALTER TABLE "ipd_charge_postings" ADD COLUMN IF NOT EXISTS "rendered_by_doctor_id" TEXT;

-- doctor_commissions moves from one row per invoice to one row per (invoice, doctor).
DROP INDEX IF EXISTS "doctor_commissions_invoice_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "doctor_commissions_invoice_id_doctor_id_key" ON "doctor_commissions"("invoice_id", "doctor_id");
