-- Attribute each payment to the staff user who collected it (for the cashier column).
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "received_by" TEXT;
