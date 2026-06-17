-- Allow fractional invoice line quantities (e.g. 1.5 days of room charges).
-- Widening Int -> double precision is lossless; existing values are preserved.
ALTER TABLE "invoice_items" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;
