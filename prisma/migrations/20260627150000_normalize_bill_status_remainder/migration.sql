-- Second-pass normalization of invoices.status to the 3-value lifecycle.
--
-- The first pass (20260627120000) relabelled the finalised payment statuses
-- (Paid / Partial / Partially Paid / Overdue / Refunded) to Final. This pass
-- catches the remaining legacy values that aren't payment-finalised:
--
--   Unpaid / Pending / Proforma  -> Draft     (new, never-finalised bills)
--   Finalized (legacy typo)      -> Final
--   Voided                       -> Cancelled (a void is a cancellation)
--
-- Source bugs (now fixed in code): patient "Pay at Visit" booking created OPD
-- bills as 'Unpaid'; fee-receipt void set 'Voided'. Amounts (paid_amount /
-- balance_due) are untouched. Idempotent — a second run matches zero rows.

UPDATE "invoices" SET "status" = 'Draft'
WHERE "status" IN ('Unpaid', 'Pending', 'Proforma');

UPDATE "invoices" SET "status" = 'Final'
WHERE "status" = 'Finalized';

UPDATE "invoices" SET "status" = 'Cancelled'
WHERE "status" = 'Voided';
