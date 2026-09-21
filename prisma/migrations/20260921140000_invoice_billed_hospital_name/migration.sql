-- Per-bill "billed to hospital" name — head-office org only. Each bill is
-- issued to a different receiving hospital, so this lives on the invoice
-- itself (edited via EditInvoiceModal "Header Details"), not on org branding.
-- Supersedes the earlier org-level organization_brandings.patient_header_label
-- attempt (20260921120000), which is now unused dead code/column.
-- Nullable, additive column — safe for existing rows.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "billed_hospital_name" TEXT;
