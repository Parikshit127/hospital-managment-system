-- Per-TPA package naming + exclusive packages (belong to one TPA only).
-- All additive/nullable — safe on existing rows.

-- AlterTable: mark a package as visible only to one TPA (null = shared/cash package)
ALTER TABLE "ipd_packages" ADD COLUMN "exclusive_provider_id" INTEGER;

-- CreateIndex
CREATE INDEX "ipd_packages_exclusive_provider_id_idx" ON "ipd_packages"("exclusive_provider_id");

-- AddForeignKey
ALTER TABLE "ipd_packages" ADD CONSTRAINT "ipd_packages_exclusive_provider_id_fkey" FOREIGN KEY ("exclusive_provider_id") REFERENCES "insurance_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: this TPA's own name for a shared package (null = fall back to package_name)
ALTER TABLE "ipd_package_tpa_rates" ADD COLUMN "tpa_package_name" TEXT;

-- AlterTable: snapshot of the resolved display name at the moment a package was applied
ALTER TABLE "ipd_admission_packages" ADD COLUMN "applied_package_name" TEXT;
