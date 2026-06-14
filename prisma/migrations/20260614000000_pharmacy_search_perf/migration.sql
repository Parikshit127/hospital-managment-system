-- Pharmacy search performance: trigram + composite indexes.
--
-- Why: pharmacy_medicine_master has ~7k rows per tenant. Search uses
-- Prisma `contains` + `mode: 'insensitive'` which becomes ILIKE '%q%'.
-- A trigram GIN index is the only thing Postgres can use to accelerate
-- substring ILIKE. The composite B-trees cover the dominant
-- "tenant + active + name" listing queries.
--
-- Apply against DIRECT_URL (port 5432). PgBouncer transaction-pooling
-- mode (port 6543) cannot run CREATE EXTENSION.
--
-- CREATE INDEX (non-CONCURRENT) locks each table briefly. At ~7k rows
-- this is sub-second per index and safe inside `prisma migrate deploy`.
-- If running on a much larger dataset, rerun by hand with
-- `CREATE INDEX CONCURRENTLY` against DIRECT_URL via psql.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── pharmacy_medicine_master ──

CREATE INDEX IF NOT EXISTS "pharmacy_medicine_master_organizationId_is_active_brand_name_idx"
    ON "pharmacy_medicine_master" ("organizationId", "is_active", "brand_name");

CREATE INDEX IF NOT EXISTS "pharmacy_medicine_master_organizationId_generic_name_idx"
    ON "pharmacy_medicine_master" ("organizationId", "generic_name");

CREATE INDEX IF NOT EXISTS "pharmacy_medicine_master_organizationId_category_idx"
    ON "pharmacy_medicine_master" ("organizationId", "category");

CREATE INDEX IF NOT EXISTS "pharmacy_medicine_brand_trgm_idx"
    ON "pharmacy_medicine_master" USING GIN ("brand_name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "pharmacy_medicine_generic_trgm_idx"
    ON "pharmacy_medicine_master" USING GIN ("generic_name" gin_trgm_ops);

-- ── pharmacy_batch_inventory ──

CREATE INDEX IF NOT EXISTS "pharmacy_batch_inventory_medicine_id_idx"
    ON "pharmacy_batch_inventory" ("medicine_id");

-- Partial index for the hot "in stock" predicate. Every billing /
-- inventory / dispense query filters on current_stock > 0.
CREATE INDEX IF NOT EXISTS "pharmacy_batch_in_stock_idx"
    ON "pharmacy_batch_inventory" ("medicine_id", "expiry_date")
    WHERE "current_stock" > 0;

-- Expiring-soon partial index for the dashboard/alerts queries.
CREATE INDEX IF NOT EXISTS "pharmacy_batch_expiring_idx"
    ON "pharmacy_batch_inventory" ("expiry_date")
    WHERE "current_stock" > 0;
