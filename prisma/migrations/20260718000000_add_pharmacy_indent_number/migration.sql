-- Pharmacy / nursing indent requisition number (e.g. AVS-IND-26-27-001).
-- Nullable so existing rows remain valid until backfilled; unique so a number
-- is never reused. Postgres permits multiple NULLs under a unique index.
ALTER TABLE "pharmacy_orders" ADD COLUMN "indent_number" TEXT;
CREATE UNIQUE INDEX "pharmacy_orders_indent_number_key" ON "pharmacy_orders"("indent_number");
