-- Refund payout tender (Cash/UPI/Bank Transfer/etc). Nullable so existing
-- refunds remain valid; collection reports fall back to the original
-- payment's tender, then "Cash", for rows recorded before this column existed.
ALTER TABLE "refunds" ADD COLUMN "payment_method" TEXT;
