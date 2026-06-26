-- Inventory PRD completion: PO generalization, kits, consignment, CSSD stub, surgery movement link

ALTER TABLE "purchase_order_items" ALTER COLUMN "medicine_id" DROP NOT NULL;
ALTER TABLE "pharmacy_purchase_invoice_lines" ALTER COLUMN "medicine_id" DROP NOT NULL;
ALTER TABLE "pharmacy_returns" ALTER COLUMN "medicine_id" DROP NOT NULL;

ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "uom" TEXT;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "conversion_to_base" DOUBLE PRECISION DEFAULT 1.0;

ALTER TABLE "surgery_consumables" ADD COLUMN IF NOT EXISTS "movement_id" INTEGER;

ALTER TABLE "item_batches" ADD COLUMN IF NOT EXISTS "is_consignment" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "inventory_movements" ADD COLUMN IF NOT EXISTS "gl_posted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "item_kits" (
    "id" SERIAL NOT NULL,
    "kit_item_id" INTEGER NOT NULL,
    "organizationId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "item_kits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "item_kit_components" (
    "id" SERIAL NOT NULL,
    "kit_id" INTEGER NOT NULL,
    "component_item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "item_kit_components_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cssd_instruments" (
    "id" SERIAL NOT NULL,
    "instrument_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "store_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Available',
    "last_sterilized_at" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cssd_instruments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "item_kits_kit_item_id_organizationId_key" ON "item_kits"("kit_item_id", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "cssd_instruments_instrument_code_organizationId_key" ON "cssd_instruments"("instrument_code", "organizationId");

ALTER TABLE "item_kits" ADD CONSTRAINT "item_kits_kit_item_id_fkey" FOREIGN KEY ("kit_item_id") REFERENCES "item_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "item_kits" ADD CONSTRAINT "item_kits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "item_kit_components" ADD CONSTRAINT "item_kit_components_kit_id_fkey" FOREIGN KEY ("kit_id") REFERENCES "item_kits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "item_kit_components" ADD CONSTRAINT "item_kit_components_component_item_id_fkey" FOREIGN KEY ("component_item_id") REFERENCES "item_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cssd_instruments" ADD CONSTRAINT "cssd_instruments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cssd_instruments" ADD CONSTRAINT "cssd_instruments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
