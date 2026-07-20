-- AI Voice Call Assistant — Phase 1
-- Additive-only: extends CallLog with voice-assistant fields and adds the
-- transcript-only CallTranscript store. No destructive changes.

-- AlterTable: extend CallLog (all nullable / defaulted, safe on existing rows)
ALTER TABLE "CallLog" ADD COLUMN     "callback_lead_id" TEXT,
ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "direction" TEXT,
ADD COLUMN     "ended_at" TIMESTAMP(3),
ADD COLUMN     "from_number" TEXT,
ADD COLUMN     "handoff_status" TEXT,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "patient_id" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "provider_call_id" TEXT,
ADD COLUMN     "started_at" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'completed',
ADD COLUMN     "to_number" TEXT,
ADD COLUMN     "verification_status" TEXT DEFAULT 'unverified';

-- CreateTable: transcript-only PHI store (audio is never persisted)
CREATE TABLE "CallTranscript" (
    "id" TEXT NOT NULL,
    "call_log_id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "turns" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "language" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CallTranscript_call_log_id_key" ON "CallTranscript"("call_log_id");
CREATE INDEX "CallTranscript_organizationId_idx" ON "CallTranscript"("organizationId");
CREATE INDEX "CallTranscript_call_log_id_idx" ON "CallTranscript"("call_log_id");
CREATE UNIQUE INDEX "CallLog_provider_call_id_key" ON "CallLog"("provider_call_id");
CREATE INDEX "CallLog_patient_id_idx" ON "CallLog"("patient_id");
CREATE INDEX "CallLog_provider_call_id_idx" ON "CallLog"("provider_call_id");
CREATE INDEX "CallLog_organizationId_created_at_idx" ON "CallLog"("organizationId", "created_at");

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "OPD_REG"("patient_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("appointment_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallTranscript" ADD CONSTRAINT "CallTranscript_call_log_id_fkey" FOREIGN KEY ("call_log_id") REFERENCES "CallLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallTranscript" ADD CONSTRAINT "CallTranscript_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
