-- Rule 1/3: official "Final Bill No." assigned only at finalization.
ALTER TABLE "invoices" ADD COLUMN "final_bill_number" TEXT;
CREATE UNIQUE INDEX "invoices_final_bill_number_key" ON "invoices"("final_bill_number");
