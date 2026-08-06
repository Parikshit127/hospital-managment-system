-- Pack size never reached a pharmacy bill because it had nowhere to live on the
-- sale side. `pack` existed only on purchase_order_items / pharmacy_purchase_invoice_lines
-- (the buying side), so the bill's PACK column read `item.pack_size` — a field that
-- exists on no model — and printed "—" on every line ever raised.
--
-- Pack size is a property of the product, not of a batch (same as hsn_sac_code),
-- so it belongs on the medicine master.
ALTER TABLE "pharmacy_medicine_master" ADD COLUMN IF NOT EXISTS "pack" TEXT;

-- Backfill 1: the pack the hospital already typed on its purchase invoices —
-- most recent line per medicine wins.
UPDATE "pharmacy_medicine_master" m
SET "pack" = s."pack"
FROM (
    SELECT DISTINCT ON (l."medicine_id") l."medicine_id", l."pack"
    FROM "pharmacy_purchase_invoice_lines" l
    WHERE l."pack" IS NOT NULL AND btrim(l."pack") <> ''
    ORDER BY l."medicine_id", l."id" DESC
) s
WHERE m."id" = s."medicine_id" AND m."pack" IS NULL;

-- Backfill 2: same, from purchase order lines, for medicines not covered above.
UPDATE "pharmacy_medicine_master" m
SET "pack" = s."pack"
FROM (
    SELECT DISTINCT ON (i."medicine_id") i."medicine_id", i."pack"
    FROM "purchase_order_items" i
    WHERE i."pack" IS NOT NULL AND btrim(i."pack") <> ''
    ORDER BY i."medicine_id", i."id" DESC
) s
WHERE m."id" = s."medicine_id" AND m."pack" IS NULL;

-- Backfill 3: catalogue imports carried the pack inside the brand name itself,
-- e.g. "STEMETIL MD 5MG-.-OTHER1 (Packing: 15)". Lift it back out.
UPDATE "pharmacy_medicine_master"
SET "pack" = btrim((regexp_match("brand_name", '\(Packing\s*:\s*([^)]+)\)', 'i'))[1])
WHERE "pack" IS NULL AND "brand_name" ~* '\(Packing\s*:\s*[^)]+\)';
