-- AlterTable
ALTER TABLE "admissions" ADD COLUMN "cancellation_reason" TEXT;
ALTER TABLE "admissions" ADD COLUMN "cancellation_date" TIMESTAMP(3);
ALTER TABLE "admissions" ADD COLUMN "cancelled_by" TEXT;
