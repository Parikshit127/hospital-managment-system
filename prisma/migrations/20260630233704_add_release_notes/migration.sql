-- CreateTable
CREATE TABLE "release_notes" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "release_notes_organizationId_idx" ON "release_notes"("organizationId");

-- AddForeignKey
ALTER TABLE "release_notes" ADD CONSTRAINT "release_notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

