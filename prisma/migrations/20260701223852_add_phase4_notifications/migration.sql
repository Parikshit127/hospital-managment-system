-- CreateEnum
CREATE TYPE "BroadcastAudience" AS ENUM ('ALL_FACILITIES', 'FACILITY', 'ROLE');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('SCHEDULED', 'SENT');

-- AlterTable
ALTER TABLE "release_notes" ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "file_name" TEXT,
ADD COLUMN     "file_url" TEXT,
ADD COLUMN     "is_published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mime_type" TEXT,
ADD COLUMN     "published_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "BroadcastAudience" NOT NULL,
    "facility_id" TEXT,
    "target_role" TEXT,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'SENT',
    "scheduled_for" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "release_note_id" TEXT,
    "created_by" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_receipts" (
    "id" TEXT NOT NULL,
    "broadcast_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "broadcasts_organizationId_idx" ON "broadcasts"("organizationId");

-- CreateIndex
CREATE INDEX "broadcasts_status_scheduled_for_idx" ON "broadcasts"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "notification_receipts_user_id_read_at_idx" ON "notification_receipts"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notification_receipts_organizationId_idx" ON "notification_receipts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_receipts_broadcast_id_user_id_key" ON "notification_receipts"("broadcast_id", "user_id");

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_release_note_id_fkey" FOREIGN KEY ("release_note_id") REFERENCES "release_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_receipts" ADD CONSTRAINT "notification_receipts_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_receipts" ADD CONSTRAINT "notification_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_receipts" ADD CONSTRAINT "notification_receipts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

