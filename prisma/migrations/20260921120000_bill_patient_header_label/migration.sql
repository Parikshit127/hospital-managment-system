-- Editable hospital-name label rendered above the patient name on OPD/IPD bills
-- (for a head-office org that bills on behalf of multiple hospitals). Was
-- previously hardcoded to a single organization ID in app code.
-- Nullable, additive column — safe for existing rows (renders nothing until set).
ALTER TABLE "organization_brandings" ADD COLUMN IF NOT EXISTS "patient_header_label" TEXT;
