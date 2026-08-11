-- CreateTable
CREATE TABLE "hospital_bank_accounts" (
    "id" SERIAL NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "ifsc_code" TEXT NOT NULL,
    "branch_name" TEXT,
    "account_holder_name" TEXT NOT NULL,
    "bank_upi_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hospital_bank_accounts_organizationId_idx" ON "hospital_bank_accounts"("organizationId");

-- AddForeignKey
ALTER TABLE "hospital_bank_accounts" ADD CONSTRAINT "hospital_bank_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
