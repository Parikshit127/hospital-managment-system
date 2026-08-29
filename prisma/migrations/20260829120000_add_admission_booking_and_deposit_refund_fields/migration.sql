-- AlterTable: add refund_payment_method to patient_deposits
ALTER TABLE "patient_deposits" ADD COLUMN IF NOT EXISTS "refund_payment_method" TEXT;

-- AlterTable: add cancellation and timestamp fields to AdmissionBooking
ALTER TABLE "AdmissionBooking" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
ALTER TABLE "AdmissionBooking" ADD COLUMN IF NOT EXISTS "cancelled_by" TEXT;
ALTER TABLE "AdmissionBooking" ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT;
ALTER TABLE "AdmissionBooking" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
