/**
 * Manual verification script for the expense -> GL posting lifecycle.
 * No test framework is installed in this repo — this follows the existing
 * scripts/*.ts convention (run via tsx, prints PASS/FAIL, cleans up after
 * itself).
 *
 * Prerequisites: tally-coa-import.ts and expense-category-seed.ts must have
 * already run for the target org.
 *
 * Usage: ORGANIZATION_ID=<id> npx tsx scripts/verify-expense-gl-posting.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const organizationId = process.env.ORGANIZATION_ID;
  if (!organizationId) {
    console.error('Usage: ORGANIZATION_ID=<id> npx tsx scripts/verify-expense-gl-posting.ts');
    process.exit(1);
  }

  const category = await prisma.expenseCategory.findFirst({
    where: { organizationId, name: 'ELECTRICITY EXPENSES' },
  });
  if (!category) {
    console.error('ELECTRICITY EXPENSES category not found for this org — run tally-coa-import.ts then expense-category-seed.ts first.');
    process.exit(1);
  }
  if (!category.gl_expense_account_id) {
    console.error('ELECTRICITY EXPENSES category has no gl_expense_account_id — mapping did not take.');
    process.exit(1);
  }
  const expectedAccount = await prisma.gL_Account.findUnique({ where: { id: category.gl_expense_account_id } });
  console.log(`Category "ELECTRICITY EXPENSES" maps to GL account ${expectedAccount?.account_code} ("${expectedAccount?.account_name}")`);

  const expense = await prisma.expense.create({
    data: {
      expense_number: `TEST-VERIFY-${Date.now()}`,
      category_id: category.id,
      description: 'Verification script test expense',
      amount: 1000,
      total_amount: 1000,
      organizationId,
      status: 'Pending',
    },
  });
  console.log(`Created expense ${expense.expense_number} (id ${expense.id}), status Pending.`);

  const preApprovalEntries = await prisma.gL_JournalEntry.count({
    where: { reference_type: 'Expense', reference_id: expense.id.toString() },
  });
  console.log(`GL entries before approval: ${preApprovalEntries} (expect 0 — GL posts on approval only, per design)`);
  if (preApprovalEntries !== 0) {
    console.error('FAIL: expected 0 GL entries before approval.');
    process.exit(1);
  }

  await prisma.expense.update({ where: { id: expense.id }, data: { status: 'Approved' } });
  const { postExpenseToGL, postExpensePaymentToGL } = await import('../app/actions/gl-actions');
  const postResult = await postExpenseToGL(expense.id);
  console.log('postExpenseToGL result:', postResult);
  if (!(postResult as any).success) {
    console.error('FAIL: postExpenseToGL did not succeed.');
    process.exit(1);
  }

  const journalLine = await prisma.gL_JournalLine.findFirst({
    where: { journal: { reference_type: 'Expense', reference_id: expense.id.toString() } },
    include: { account: true },
  });
  console.log(`Posted debit account: ${journalLine?.account.account_code} (expect ${expectedAccount?.account_code} — NOT the generic 8000 fallback)`);
  if (journalLine?.account.account_code !== expectedAccount?.account_code) {
    console.error(`FAIL: expected category-mapped account ${expectedAccount?.account_code}, got ${journalLine?.account.account_code}`);
    process.exit(1);
  }

  await prisma.expense.update({ where: { id: expense.id }, data: { status: 'Paid', payment_method: 'Cash' } });
  const paymentResult = await postExpensePaymentToGL(expense.id, 'Cash');
  console.log('postExpensePaymentToGL result:', paymentResult);
  if (!(paymentResult as any).success) {
    console.error('FAIL: postExpensePaymentToGL did not succeed.');
    process.exit(1);
  }

  const totalEntries = await prisma.gL_JournalEntry.count({
    where: {
      OR: [
        { reference_type: 'Expense', reference_id: expense.id.toString() },
        { reference_type: 'ExpensePayment', reference_id: expense.id.toString() },
      ],
    },
  });
  console.log(`Total GL entries for this expense lifecycle: ${totalEntries} (expect 2: approval + payment reclass)`);
  if (totalEntries !== 2) {
    console.error('FAIL: expected exactly 2 GL journal entries.');
    process.exit(1);
  }

  // Cleanup
  await prisma.gL_JournalLine.deleteMany({
    where: { journal: { OR: [
      { reference_type: 'Expense', reference_id: expense.id.toString() },
      { reference_type: 'ExpensePayment', reference_id: expense.id.toString() },
    ] } },
  });
  await prisma.gL_JournalEntry.deleteMany({
    where: { OR: [
      { reference_type: 'Expense', reference_id: expense.id.toString() },
      { reference_type: 'ExpensePayment', reference_id: expense.id.toString() },
    ] },
  });
  await prisma.expense.delete({ where: { id: expense.id } });
  console.log('Cleaned up test data. PASS.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
