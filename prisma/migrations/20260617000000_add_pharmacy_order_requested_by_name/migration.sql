-- Add nurse/requester display name to pharmacy_orders
ALTER TABLE "pharmacy_orders" ADD COLUMN IF NOT EXISTS "requested_by_name" TEXT;
