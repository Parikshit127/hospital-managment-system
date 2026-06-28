-- A cancelled invoice carries no receivable, so it must not contribute any
-- outstanding balance to patient ledgers, finance dashboards, or MIS reports.
--
-- Going forward, cancelInvoice() and voidFeeReceipt() set balance_due = 0 at the
-- moment of cancellation. This backfill clears the stale outstanding on invoices
-- that were cancelled BEFORE that code change shipped.
--
-- Safe: cancellation already requires paid_amount = 0 (money-collected bills must
-- be refunded / credit-noted instead), and revertInvoice() recomputes balance_due
-- from net_amount - paid_amount, so reverting a cancelled bill restores it correctly.
-- Idempotent — a second run matches zero rows.

UPDATE "invoices"
SET "balance_due" = 0
WHERE "status" = 'Cancelled'
  AND "balance_due" <> 0;
