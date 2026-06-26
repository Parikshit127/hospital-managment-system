-- CreateTable
CREATE TABLE IF NOT EXISTS "invoice_snapshots" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "snapshot_data" JSONB NOT NULL,
    "changed_by" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "change_summary" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "invoice_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoice_snapshots_invoice_id_idx" ON "invoice_snapshots"("invoice_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoice_snapshots_organizationId_idx" ON "invoice_snapshots"("organizationId");

-- AddForeignKey
ALTER TABLE "invoice_snapshots"
    ADD CONSTRAINT "invoice_snapshots_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
