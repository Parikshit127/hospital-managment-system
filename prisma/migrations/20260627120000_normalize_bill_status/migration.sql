-- Normalize invoices.status to the 3-value lifecycle: Draft / Final / Cancelled.
--
-- The status field previously doubled as a payment flag (Paid/Partial/Partially
-- Paid/Overdue/Refunded were auto-written when money was recorded). Payment state
-- is now read exclusively from the paid_amount / balance_due decimal columns, so
-- those legacy payment labels are relabelled to Final (the finalised-bill state).
--
-- Draft and Cancelled rows are left untouched. paid_amount / balance_due are NOT
-- changed — only the label. Safe to re-run (a second run matches zero rows).
UPDATE "invoices"
SET "status" = 'Final'
WHERE "status" IN ('Paid', 'Partial', 'Partially Paid', 'Overdue', 'Refunded');
