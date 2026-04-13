/**
 * migrate-audit-logs-to-gl.ts
 *
 * Migration script: creates GL journal entries for any existing invoices,
 * payments, and expenses that don't already have corresponding GL entries.
 *
 * The system_audit_logs table exists but stores GL events only as free-text
 * action/details strings with no structured line-item data, so reconstruction
 * from audit logs is not viable. This script uses the source documents instead.
 *
 * Posting rules:
 *   Invoice  : Dr. Patient Receivables (1130)  / Cr. Revenue (6000) + GST payable (2300)
 *   Payment  : Dr. Cash (1110) or Bank (1120)  / Cr. Patient Receivables (1130)
 *   Expense  : Dr. Operating Expenses (8000)   / Cr. Cash (1110) or Payables (2100)
 *
 * Usage:
 *   npx ts-node scripts/migrate-audit-logs-to-gl.ts [--dry-run]
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAccountByCode(
  organizationId: string,
  code: string,
): Promise<{ id: string; account_name: string } | null> {
  return prisma.gL_Account.findFirst({
    where: { organizationId, account_code: code, is_active: true },
    select: { id: true, account_name: true },
  });
}

async function nextJournalNumber(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const last = await prisma.gL_JournalEntry.findFirst({
    where: {
      organizationId,
      journal_number: { startsWith: `JV-${year}-` },
    },
    orderBy: { journal_number: 'desc' },
    select: { journal_number: true },
  });

  let nextNumber = 1;
  if (last) {
    const match = last.journal_number.match(/JV-\d{4}-(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }
  return `JV-${year}-${nextNumber.toString().padStart(4, '0')}`;
}

function assertBalance(
  lines: { debit: Prisma.Decimal; credit: Prisma.Decimal }[],
  ref: string,
): void {
  const totalDebit = lines.reduce(
    (s, l) => s.add(l.debit),
    new Prisma.Decimal(0),
  );
  const totalCredit = lines.reduce(
    (s, l) => s.add(l.credit),
    new Prisma.Decimal(0),
  );
  if (!totalDebit.equals(totalCredit)) {
    throw new Error(
      `Double-entry imbalance for ${ref}: Dr ${totalDebit} != Cr ${totalCredit}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

interface Stats {
  invoicesProcessed: number;
  invoicesSkipped: number;
  paymentsProcessed: number;
  paymentsSkipped: number;
  expensesProcessed: number;
  expensesSkipped: number;
  errors: string[];
}

const stats: Stats = {
  invoicesProcessed: 0,
  invoicesSkipped: 0,
  paymentsProcessed: 0,
  paymentsSkipped: 0,
  expensesProcessed: 0,
  expensesSkipped: 0,
  errors: [],
};

// ---------------------------------------------------------------------------
// Invoice migration
// ---------------------------------------------------------------------------

async function migrateInvoices(): Promise<void> {
  console.log('\n--- Migrating Invoices ---');

  const invoices = await prisma.invoices.findMany({
    where: {
      status: { in: ['Finalized', 'Paid', 'Partial'] },
      is_archived: false,
    },
    select: {
      id: true,
      invoice_number: true,
      organizationId: true,
      net_amount: true,
      cgst_amount: true,
      sgst_amount: true,
      igst_amount: true,
      created_at: true,
    },
  });

  for (const invoice of invoices) {
    try {
      // Check if a GL entry already exists for this invoice
      const existing = await prisma.gL_JournalEntry.findFirst({
        where: {
          organizationId: invoice.organizationId,
          reference_type: 'Invoice',
          reference_id: String(invoice.id),
        },
        select: { id: true },
      });

      if (existing) {
        stats.invoicesSkipped++;
        continue;
      }

      const receivableAccount = await getAccountByCode(
        invoice.organizationId,
        '1130',
      );
      const revenueAccount = await getAccountByCode(
        invoice.organizationId,
        '6000',
      );

      if (!receivableAccount || !revenueAccount) {
        stats.errors.push(
          `Invoice ${invoice.invoice_number}: required accounts (1130 / 6000) not found in org ${invoice.organizationId}`,
        );
        stats.invoicesSkipped++;
        continue;
      }

      const totalGst = new Prisma.Decimal(invoice.cgst_amount ?? 0)
        .add(new Prisma.Decimal(invoice.sgst_amount ?? 0))
        .add(new Prisma.Decimal(invoice.igst_amount ?? 0));

      const netAmount = new Prisma.Decimal(invoice.net_amount);
      const taxableAmount = netAmount.sub(totalGst);

      // Build line items
      type LineInput = {
        debit: Prisma.Decimal;
        credit: Prisma.Decimal;
        accountId: string;
        description: string;
      };

      const lines: LineInput[] = [];

      // Dr. Patient Receivables (full invoice amount)
      lines.push({
        accountId: receivableAccount.id,
        debit: netAmount,
        credit: new Prisma.Decimal(0),
        description: `Patient Receivable - ${invoice.invoice_number}`,
      });

      // Cr. Revenue (taxable portion)
      lines.push({
        accountId: revenueAccount.id,
        debit: new Prisma.Decimal(0),
        credit: taxableAmount,
        description: `Revenue - ${invoice.invoice_number}`,
      });

      // Cr. GST Payable (if applicable)
      if (totalGst.greaterThan(0)) {
        const gstPayableAccount = await getAccountByCode(
          invoice.organizationId,
          '2300',
        );

        if (!gstPayableAccount) {
          stats.errors.push(
            `Invoice ${invoice.invoice_number}: GST payable account (2300) not found — posting tax amount to revenue instead`,
          );
          // Fallback: add GST to revenue credit
          lines[1].credit = lines[1].credit.add(totalGst);
        } else {
          lines.push({
            accountId: gstPayableAccount.id,
            debit: new Prisma.Decimal(0),
            credit: totalGst,
            description: `GST Payable - ${invoice.invoice_number}`,
          });
        }
      }

      assertBalance(
        lines.map((l) => ({ debit: l.debit, credit: l.credit })),
        `Invoice ${invoice.invoice_number}`,
      );

      const totalDebit = lines.reduce(
        (s, l) => s.add(l.debit),
        new Prisma.Decimal(0),
      );
      const totalCredit = lines.reduce(
        (s, l) => s.add(l.credit),
        new Prisma.Decimal(0),
      );

      if (!DRY_RUN) {
        const journalNumber = await nextJournalNumber(invoice.organizationId);

        await prisma.gL_JournalEntry.create({
          data: {
            organizationId: invoice.organizationId,
            journal_number: journalNumber,
            entry_date: invoice.created_at,
            entry_type: 'Invoice',
            reference_type: 'Invoice',
            reference_id: String(invoice.id),
            reference_number: invoice.invoice_number,
            narration: `Invoice - ${invoice.invoice_number} [migrated]`,
            total_debit: totalDebit,
            total_credit: totalCredit,
            status: 'Posted',
            lines: {
              create: lines.map((l, idx) => ({
                organizationId: invoice.organizationId,
                line_number: idx + 1,
                account_id: l.accountId,
                debit_amount: l.debit,
                credit_amount: l.credit,
                description: l.description,
              })),
            },
          },
        });
      }

      stats.invoicesProcessed++;
      console.log(
        `  [${DRY_RUN ? 'DRY' : 'OK'}] Invoice ${invoice.invoice_number}: Dr ${totalDebit} / Cr ${totalCredit}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push(`Invoice id=${invoice.id}: ${msg}`);
      stats.invoicesSkipped++;
      console.error(`  [ERR] Invoice id=${invoice.id}: ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Payment migration
// ---------------------------------------------------------------------------

async function migratePayments(): Promise<void> {
  console.log('\n--- Migrating Payments ---');

  const payments = await prisma.payments.findMany({
    where: { status: 'Completed' },
    select: {
      id: true,
      receipt_number: true,
      organizationId: true,
      amount: true,
      payment_method: true,
      created_at: true,
      invoice: {
        select: { invoice_number: true },
      },
    },
  });

  for (const payment of payments) {
    try {
      const existing = await prisma.gL_JournalEntry.findFirst({
        where: {
          organizationId: payment.organizationId,
          reference_type: 'Payment',
          reference_id: String(payment.id),
        },
        select: { id: true },
      });

      if (existing) {
        stats.paymentsSkipped++;
        continue;
      }

      const isCash =
        payment.payment_method?.toLowerCase() === 'cash';
      const bankOrCashCode = isCash ? '1110' : '1120';

      const bankOrCashAccount = await getAccountByCode(
        payment.organizationId,
        bankOrCashCode,
      );
      const receivableAccount = await getAccountByCode(
        payment.organizationId,
        '1130',
      );

      if (!bankOrCashAccount || !receivableAccount) {
        stats.errors.push(
          `Payment ${payment.receipt_number}: required accounts (${bankOrCashCode} / 1130) not found`,
        );
        stats.paymentsSkipped++;
        continue;
      }

      const amount = new Prisma.Decimal(payment.amount);
      const lines = [
        {
          debit: amount,
          credit: new Prisma.Decimal(0),
          accountId: bankOrCashAccount.id,
          description: `${isCash ? 'Cash' : 'Bank'} receipt - ${payment.receipt_number}`,
        },
        {
          debit: new Prisma.Decimal(0),
          credit: amount,
          accountId: receivableAccount.id,
          description: `Receivable cleared - ${payment.invoice?.invoice_number ?? payment.receipt_number}`,
        },
      ];

      assertBalance(
        lines.map((l) => ({ debit: l.debit, credit: l.credit })),
        `Payment ${payment.receipt_number}`,
      );

      if (!DRY_RUN) {
        const journalNumber = await nextJournalNumber(payment.organizationId);

        await prisma.gL_JournalEntry.create({
          data: {
            organizationId: payment.organizationId,
            journal_number: journalNumber,
            entry_date: payment.created_at,
            entry_type: 'Payment',
            reference_type: 'Payment',
            reference_id: String(payment.id),
            reference_number: payment.receipt_number,
            narration: `Payment - ${payment.receipt_number} [migrated]`,
            total_debit: amount,
            total_credit: amount,
            status: 'Posted',
            lines: {
              create: lines.map((l, idx) => ({
                organizationId: payment.organizationId,
                line_number: idx + 1,
                account_id: l.accountId,
                debit_amount: l.debit,
                credit_amount: l.credit,
                description: l.description,
              })),
            },
          },
        });
      }

      stats.paymentsProcessed++;
      console.log(
        `  [${DRY_RUN ? 'DRY' : 'OK'}] Payment ${payment.receipt_number}: Dr ${amount} / Cr ${amount}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push(`Payment id=${payment.id}: ${msg}`);
      stats.paymentsSkipped++;
      console.error(`  [ERR] Payment id=${payment.id}: ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Expense migration
// ---------------------------------------------------------------------------

async function migrateExpenses(): Promise<void> {
  console.log('\n--- Migrating Expenses ---');

  const expenses = await prisma.expense.findMany({
    where: {
      status: { in: ['Approved', 'Paid'] },
    },
    select: {
      id: true,
      expense_number: true,
      organizationId: true,
      total_amount: true,
      payment_method: true,
      status: true,
      description: true,
      created_at: true,
    },
  });

  for (const expense of expenses) {
    try {
      const existing = await prisma.gL_JournalEntry.findFirst({
        where: {
          organizationId: expense.organizationId,
          reference_type: 'Expense',
          reference_id: String(expense.id),
        },
        select: { id: true },
      });

      if (existing) {
        stats.expensesSkipped++;
        continue;
      }

      const expenseAccount = await getAccountByCode(
        expense.organizationId,
        '8000',
      );

      const isCash =
        expense.status === 'Paid' &&
        expense.payment_method?.toLowerCase() === 'cash';
      const creditCode = expense.status === 'Paid' ? (isCash ? '1110' : '1120') : '2100';
      const creditAccount = await getAccountByCode(
        expense.organizationId,
        creditCode,
      );

      if (!expenseAccount || !creditAccount) {
        stats.errors.push(
          `Expense ${expense.expense_number}: required accounts (8000 / ${creditCode}) not found`,
        );
        stats.expensesSkipped++;
        continue;
      }

      const amount = new Prisma.Decimal(expense.total_amount);
      const lines = [
        {
          debit: amount,
          credit: new Prisma.Decimal(0),
          accountId: expenseAccount.id,
          description: `Expense - ${expense.description ?? expense.expense_number}`,
        },
        {
          debit: new Prisma.Decimal(0),
          credit: amount,
          accountId: creditAccount.id,
          description:
            expense.status === 'Paid' ? 'Cash/Bank paid' : 'Payable recorded',
        },
      ];

      assertBalance(
        lines.map((l) => ({ debit: l.debit, credit: l.credit })),
        `Expense ${expense.expense_number}`,
      );

      if (!DRY_RUN) {
        const journalNumber = await nextJournalNumber(expense.organizationId);

        await prisma.gL_JournalEntry.create({
          data: {
            organizationId: expense.organizationId,
            journal_number: journalNumber,
            entry_date: expense.created_at,
            entry_type: 'Expense',
            reference_type: 'Expense',
            reference_id: String(expense.id),
            reference_number: expense.expense_number,
            narration: `Expense - ${expense.description ?? expense.expense_number} [migrated]`,
            total_debit: amount,
            total_credit: amount,
            status: 'Posted',
            lines: {
              create: lines.map((l, idx) => ({
                organizationId: expense.organizationId,
                line_number: idx + 1,
                account_id: l.accountId,
                debit_amount: l.debit,
                credit_amount: l.credit,
                description: l.description,
              })),
            },
          },
        });
      }

      stats.expensesProcessed++;
      console.log(
        `  [${DRY_RUN ? 'DRY' : 'OK'}] Expense ${expense.expense_number}: Dr ${amount} / Cr ${amount}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push(`Expense id=${expense.id}: ${msg}`);
      stats.expensesSkipped++;
      console.error(`  [ERR] Expense id=${expense.id}: ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  GL Migration: source documents → GL_JournalEntry');
  console.log(
    `  Mode: ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE (writing to DB)'}`,
  );
  console.log('='.repeat(60));

  // Check whether system_audit_logs has any GL-specific records.
  // The table exists but stores only free-text; we report the count for info.
  const auditGlCount = await prisma.system_audit_logs.count({
    where: {
      OR: [
        { action: { contains: 'gl_journal' } },
        { action: { contains: 'journal_entry' } },
        { module: { contains: 'GL' } },
        { module: { contains: 'gl' } },
      ],
    },
  });
  console.log(
    `\nNote: system_audit_logs contains ${auditGlCount} GL-related audit events.`,
  );
  console.log(
    'These are free-text records without structured line-item data.',
  );
  console.log(
    'Migration proceeds from source documents (invoices / payments / expenses).\n',
  );

  await migrateInvoices();
  await migratePayments();
  await migrateExpenses();

  console.log('\n' + '='.repeat(60));
  console.log('  Migration Report');
  console.log('='.repeat(60));
  console.log(
    `  Invoices  : ${stats.invoicesProcessed} migrated, ${stats.invoicesSkipped} skipped`,
  );
  console.log(
    `  Payments  : ${stats.paymentsProcessed} migrated, ${stats.paymentsSkipped} skipped`,
  );
  console.log(
    `  Expenses  : ${stats.expensesProcessed} migrated, ${stats.expensesSkipped} skipped`,
  );

  const total =
    stats.invoicesProcessed +
    stats.paymentsProcessed +
    stats.expensesProcessed;
  console.log(`  Total GL entries created: ${DRY_RUN ? 0 : total} (would create: ${total})`);

  if (stats.errors.length > 0) {
    console.log(`\n  Errors (${stats.errors.length}):`);
    stats.errors.forEach((e) => console.log(`    - ${e}`));
  } else {
    console.log('\n  No errors.');
  }
  console.log('='.repeat(60));
}

// ---------------------------------------------------------------------------
// Entry point guard
// ---------------------------------------------------------------------------

if (require.main === module) {
  main()
    .catch((e) => {
      console.error('Fatal error:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { main as migrateAuditLogsToGL };
