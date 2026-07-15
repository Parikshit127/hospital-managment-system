-- CreateTable
CREATE TABLE "ipd_package_tpa_rates" (
    "id" SERIAL NOT NULL,
    "package_id" INTEGER NOT NULL,
    "provider_id" INTEGER NOT NULL,
    "tpa_amount" DECIMAL(65,30) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ipd_package_tpa_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ipd_package_tpa_rates_organizationId_idx" ON "ipd_package_tpa_rates"("organizationId");

-- CreateIndex
CREATE INDEX "ipd_package_tpa_rates_provider_id_idx" ON "ipd_package_tpa_rates"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "ipd_package_tpa_rates_package_id_provider_id_organizationId_key" ON "ipd_package_tpa_rates"("package_id", "provider_id", "organizationId");

-- AddForeignKey
ALTER TABLE "ipd_package_tpa_rates" ADD CONSTRAINT "ipd_package_tpa_rates_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "ipd_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ipd_package_tpa_rates" ADD CONSTRAINT "ipd_package_tpa_rates_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "insurance_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ipd_package_tpa_rates" ADD CONSTRAINT "ipd_package_tpa_rates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
