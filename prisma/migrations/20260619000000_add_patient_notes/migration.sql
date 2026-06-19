-- AlterTable
ALTER TABLE "patient_deposits" ADD COLUMN     "payer_pan_name" TEXT,
ADD COLUMN     "payer_pan_number" TEXT;

-- CreateTable
CREATE TABLE "PatientNote" (
    "id" SERIAL NOT NULL,
    "patient_id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "source" TEXT DEFAULT 'profile',
    "created_by" TEXT,
    "created_by_name" TEXT,
    "created_by_role" TEXT,
    "organizationId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientNote_organizationId_idx" ON "PatientNote"("organizationId");

-- CreateIndex
CREATE INDEX "PatientNote_patient_id_idx" ON "PatientNote"("patient_id");

-- CreateIndex
CREATE INDEX "PatientNote_organizationId_patient_id_idx" ON "PatientNote"("organizationId", "patient_id");

-- AddForeignKey
ALTER TABLE "PatientNote" ADD CONSTRAINT "PatientNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientNote" ADD CONSTRAINT "PatientNote_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "OPD_REG"("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE;

