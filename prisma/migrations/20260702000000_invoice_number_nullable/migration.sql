-- Drafts are numberless: the bill number is assigned only at finalization
-- (continuing the ongoing OPD/IPD series). Make invoice_number optional.
-- Non-destructive: dropping NOT NULL never loses data. The existing UNIQUE
-- index continues to treat NULLs as distinct, so many numberless drafts coexist.
ALTER TABLE "invoices" ALTER COLUMN "invoice_number" DROP NOT NULL;
