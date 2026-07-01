-- CreateEnum
CREATE TYPE "TicketNoteVisibility" AS ENUM ('INTERNAL', 'HOSPITAL_VISIBLE');

-- CreateTable
CREATE TABLE "ticket_notes" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "TicketNoteVisibility" NOT NULL DEFAULT 'INTERNAL',
    "organizationId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_notes_ticket_id_idx" ON "ticket_notes"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_notes_organizationId_idx" ON "ticket_notes"("organizationId");

-- CreateIndex
CREATE INDEX "ticket_notes_visibility_idx" ON "ticket_notes"("visibility");

-- AddForeignKey
ALTER TABLE "ticket_notes" ADD CONSTRAINT "ticket_notes_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_notes" ADD CONSTRAINT "ticket_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_notes" ADD CONSTRAINT "ticket_notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

