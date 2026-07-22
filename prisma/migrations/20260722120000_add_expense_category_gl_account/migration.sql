-- Link expense categories to a specific GL ledger account so postExpenseToGL
-- can post to the right sub-ledger instead of a single hardcoded account.
-- Additive/nullable — safe on existing rows; NULL falls back to account 8000.

ALTER TABLE "expense_categories" ADD COLUMN "gl_expense_account_id" TEXT;

CREATE INDEX "expense_categories_gl_expense_account_id_idx" ON "expense_categories"("gl_expense_account_id");

ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_gl_expense_account_id_fkey"
  FOREIGN KEY ("gl_expense_account_id") REFERENCES "gl_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
