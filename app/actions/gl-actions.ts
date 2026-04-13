'use server';

import { prisma } from '@/backend/db';
import { revalidatePath } from 'next/cache';
import { Decimal } from '@prisma/client/runtime/library';

// ========================================
// Types & Interfaces
// ========================================

interface JournalLineInput {
  account_id: string;
  debit_amount: number;
  credit_amount: number;
  description?: string;
  cost_center?: string;
}

interface CreateJournalEntryInput {
  organizationId: string;
  entry_date: Date;
  entry_type: string;
  narration: string;
  lines: JournalLineInput[];
  reference_type?: string;
  reference_id?: string;
  reference_number?: string;
  period_id?: number;
  created_by?: string;
}

interface GLAccountInput {
  organizationId: string;
  account_code: string;
  account_name: string;
  account_type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  account_group: string;
  parent_id?: string;
  normal_balance: 'Debit' | 'Credit';
  opening_balance?: number;
  tally_ledger_name?: string;
  tally_group?: string;
}

// ========================================
// Chart of Accounts Management
// ========================================

export async function createGLAccount(data: GLAccountInput) {
  try {
    // Check if account code already exists
    const existing = await prisma.gL_Account.findFirst({
      where: {
        account_code: data.account_code,
        organizationId: data.organizationId,
      },
    });

    if (existing) {
      return {
        success: false,
        error: `Account code ${data.account_code} already exists`,
      };
    }

    const account = await prisma.gL_Account.create({
      data: {
        organizationId: data.organizationId,
        account_code: data.account_code,
        account_name: data.account_name,
        account_type: data.account_type,
        account_group: data.account_group,
        parent_id: data.parent_id,
        normal_balance: data.normal_balance,
        opening_balance: data.opening_balance || 0,
        current_balance: data.opening_balance || 0,
        tally_ledger_name: data.tally_ledger_name,
        tally_group: data.tally_group,
        is_active: true,
      },
    });

    revalidatePath('/finance/chart-of-accounts');
    return { success: true, account };
  } catch (error) {
    console.error('Error creating GL account:', error);
    return { success: false, error: 'Failed to create account' };
  }
}

export async function updateGLAccount(id: string, data: Partial<GLAccountInput> & { is_active?: boolean }) {
  try {
    const account = await prisma.gL_Account.update({
      where: { id },
      data: {
        account_name: data.account_name,
        account_group: data.account_group,
        parent_id: data.parent_id,
        tally_ledger_name: data.tally_ledger_name,
        tally_group: data.tally_group,
        is_active: data.is_active,
      },
    });

    revalidatePath('/finance/chart-of-accounts');
    return { success: true, account };
  } catch (error) {
    console.error('Error updating GL account:', error);
    return { success: false, error: 'Failed to update account' };
  }
}

export async function getGLAccounts(organizationId: string, filters?: {
  account_type?: string;
  is_active?: boolean;
  parent_id?: string | null;
}) {
  try {
    const accounts = await prisma.gL_Account.findMany({
      where: {
        organizationId,
        ...(filters?.account_type && { account_type: filters.account_type }),
        ...(filters?.is_active !== undefined && { is_active: filters.is_active }),
        ...(filters?.parent_id !== undefined && { parent_id: filters.parent_id }),
      },
      orderBy: { account_code: 'asc' },
    });

    return { success: true, accounts };
  } catch (error) {
    console.error('Error fetching GL accounts:', error);
    return { success: false, error: 'Failed to fetch accounts', accounts: [] };
  }
}

export async function getAccountHierarchy(organizationId: string) {
  try {
    const accounts = await prisma.gL_Account.findMany({
      where: { organizationId, is_active: true },
      include: {
        children: true,
      },
      orderBy: { account_code: 'asc' },
    });

    // Build tree structure
    const rootAccounts = accounts.filter((acc: any) => !acc.parent_id);

    return { success: true, accounts: rootAccounts };
  } catch (error) {
    console.error('Error fetching account hierarchy:', error);
    return { success: false, error: 'Failed to fetch hierarchy', accounts: [] };
  }
}

// ========================================
// Journal Entry Management
// ========================================

export async function createJournalEntry(data: CreateJournalEntryInput) {
  try {
    // Validate double-entry: total debit must equal total credit
    const totalDebit = data.lines.reduce((sum: number, line: any) => sum + line.debit_amount, 0);
    const totalCredit = data.lines.reduce((sum: number, line: any) => sum + line.credit_amount, 0);
    const tolerance = 0.01;

    if (Math.abs(totalDebit - totalCredit) > tolerance) {
      return {
        success: false,
        error: `Journal entry not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`,
      };
    }

    // Check if posting to a locked period
    if (data.period_id) {
      const period = await prisma.financialPeriod.findUnique({
        where: { id: data.period_id },
      });

      if (period?.status === 'Locked') {
        return {
          success: false,
          error: 'Cannot post to a locked financial period',
        };
      }
    }

    // Generate journal number
    const year = new Date(data.entry_date).getFullYear();
    const lastEntry = await prisma.gL_JournalEntry.findFirst({
      where: {
        organizationId: data.organizationId,
        journal_number: { startsWith: `JV-${year}-` },
      },
      orderBy: { journal_number: 'desc' },
    });

    let nextNumber = 1;
    if (lastEntry) {
      const match = lastEntry.journal_number.match(/JV-\d{4}-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }
    const journal_number = `JV-${year}-${nextNumber.toString().padStart(4, '0')}`;

    // Create journal entry with lines in a transaction
    const result = await prisma.$transaction(async (tx: any) => {
      const journal = await tx.gL_JournalEntry.create({
        data: {
          organizationId: data.organizationId,
          journal_number,
          entry_date: data.entry_date,
          period_id: data.period_id,
          entry_type: data.entry_type,
          reference_type: data.reference_type,
          reference_id: data.reference_id,
          reference_number: data.reference_number,
          narration: data.narration,
          total_debit: totalDebit,
          total_credit: totalCredit,
          status: 'Posted',
          created_by: data.created_by,
        },
      });

      // Create journal lines
      for (let i = 0; i < data.lines.length; i++) {
        const line = data.lines[i];
        await tx.gL_JournalLine.create({
          data: {
            organizationId: data.organizationId,
            journal_id: journal.id,
            line_number: i + 1,
            account_id: line.account_id,
            debit_amount: line.debit_amount,
            credit_amount: line.credit_amount,
            description: line.description,
            cost_center: line.cost_center,
          },
        });

        // Update account balance
        const account = await tx.gL_Account.findUnique({
          where: { id: line.account_id },
        });

        if (account) {
          const balanceChange = account.normal_balance === 'Debit'
            ? line.debit_amount - line.credit_amount
            : line.credit_amount - line.debit_amount;

          await tx.gL_Account.update({
            where: { id: line.account_id },
            data: {
              current_balance: {
                increment: balanceChange,
              },
            },
          });
        }
      }

      return journal;
    });

    revalidatePath('/finance/journal-entries');
    revalidatePath('/finance/gl-reports');
    return { success: true, journal: result };
  } catch (error) {
    console.error('Error creating journal entry:', error);
    return { success: false, error: 'Failed to create journal entry' };
  }
}

export async function reverseJournalEntry(journalId: string, reason: string, reversedBy?: string) {
  try {
    const originalJournal = await prisma.gL_JournalEntry.findUnique({
      where: { id: journalId },
      include: { lines: true },
    });

    if (!originalJournal) {
      return { success: false, error: 'Journal entry not found' };
    }

    if (originalJournal.status === 'Reversed') {
      return { success: false, error: 'Journal entry already reversed' };
    }

    // Create reversal entry with swapped debits/credits
    const reversalLines = originalJournal.lines.map(line => ({
      account_id: line.account_id,
      debit_amount: line.credit_amount.toNumber(),
      credit_amount: line.debit_amount.toNumber(),
      description: `Reversal: ${line.description || ''}`,
    }));

    const reversalResult = await createJournalEntry({
      organizationId: originalJournal.organizationId,
      entry_date: new Date(),
      entry_type: 'Adjustment',
      narration: `Reversal of ${originalJournal.journal_number}: ${reason}`,
      lines: reversalLines,
      reference_type: 'Journal',
      reference_id: originalJournal.id,
      reference_number: originalJournal.journal_number,
      period_id: originalJournal.period_id || undefined,
      created_by: reversedBy,
    });

    if (reversalResult.success && reversalResult.journal) {
      // Update original journal status
      await prisma.gL_JournalEntry.update({
        where: { id: journalId },
        data: {
          status: 'Reversed',
          reversal_entry_id: reversalResult.journal.id,
        },
      });
    }

    revalidatePath('/finance/journal-entries');
    revalidatePath('/finance/gl-reports');
    return { success: true, reversalJournal: reversalResult.journal };
  } catch (error) {
    console.error('Error reversing journal entry:', error);
    return { success: false, error: 'Failed to reverse journal entry' };
  }
}

export async function getJournalEntries(organizationId: string, filters?: {
  start_date?: Date;
  end_date?: Date;
  entry_type?: string;
  status?: string;
  reference_type?: string;
}) {
  try {
    const entries = await prisma.gL_JournalEntry.findMany({
      where: {
        organizationId,
        ...(filters?.start_date && { entry_date: { gte: filters.start_date } }),
        ...(filters?.end_date && { entry_date: { lte: filters.end_date } }),
        ...(filters?.entry_type && { entry_type: filters.entry_type }),
        ...(filters?.status && { status: filters.status }),
        ...(filters?.reference_type && { reference_type: filters.reference_type }),
      },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
      orderBy: { entry_date: 'desc' },
    });

    return { success: true, entries };
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    return { success: false, error: 'Failed to fetch entries', entries: [] };
  }
}

export async function getJournalEntryDetails(journalId: string) {
  try {
    const journal = await prisma.gL_JournalEntry.findUnique({
      where: { id: journalId },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
        reversal_entry: true,
      },
    });

    return { success: true, journal };
  } catch (error) {
    console.error('Error fetching journal details:', error);
    return { success: false, error: 'Failed to fetch journal details' };
  }
}

// ========================================
// Auto-posting Functions
// ========================================

export async function postInvoiceToGL(invoiceId: number) {
  try {
    const invoice = await prisma.invoices.findUnique({
      where: { id: invoiceId },
      include: {
      },
    });

    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    // Check if already posted
    const existingEntry = await prisma.gL_JournalEntry.findFirst({
      where: {
        reference_type: 'Invoice',
        reference_id: invoiceId.toString(),
        status: { not: 'Reversed' },
      },
    });

    if (existingEntry) {
      return { success: true, message: 'Invoice already posted to GL', journal: existingEntry };
    }

    // Get accounts
    const [receivableAccount, revenueAccount, gstPayableAccount] = await Promise.all([
      getAccountByCode(invoice.organizationId, '1130'), // Patient Receivables
      getAccountByCode(invoice.organizationId, '6000'), // Revenue (default)
      getAccountByCode(invoice.organizationId, '3120'), // GST Payable
    ]);

    if (!receivableAccount || !revenueAccount) {
      return { success: false, error: 'Required GL accounts not found' };
    }

    const lines: JournalLineInput[] = [];

    // Debit: Patient Receivables (Total amount including GST)
    lines.push({
      account_id: receivableAccount.id,
      debit_amount: invoice.total_amount.toNumber(),
      credit_amount: 0,
      description: `Patient Receivable - ${invoice.invoice_number}`,
    });

    // Credit: Revenue (Taxable amount)
    const taxableAmount = invoice.total_amount.toNumber() -
      (invoice.cgst_amount?.toNumber() || 0) -
      (invoice.sgst_amount?.toNumber() || 0) -
      (invoice.igst_amount?.toNumber() || 0);

    lines.push({
      account_id: revenueAccount.id,
      debit_amount: 0,
      credit_amount: taxableAmount,
      description: `Revenue - ${invoice.invoice_number}`,
    });

    // Credit: GST Payable (if applicable)
    const totalGST =
      (invoice.cgst_amount?.toNumber() || 0) +
      (invoice.sgst_amount?.toNumber() || 0) +
      (invoice.igst_amount?.toNumber() || 0);

    if (totalGST > 0 && gstPayableAccount) {
      lines.push({
        account_id: gstPayableAccount.id,
        debit_amount: 0,
        credit_amount: totalGST,
        description: `GST Payable - ${invoice.invoice_number}`,
      });
    }

    const result = await createJournalEntry({
      organizationId: invoice.organizationId,
      entry_date: invoice.created_at,
      entry_type: 'Invoice',
      narration: `Patient Invoice - ${invoice.invoice_number}`,
      lines,
      reference_type: 'Invoice',
      reference_id: invoiceId.toString(),
      reference_number: invoice.invoice_number,
    });

    return result;
  } catch (error) {
    console.error('Error posting invoice to GL:', error);
    return { success: false, error: 'Failed to post invoice to GL' };
  }
}

export async function postPaymentToGL(paymentId: number) {
  try {
    const payment = await prisma.payments.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return { success: false, error: 'Payment not found' };
    }

    // Check if already posted
    const existingEntry = await prisma.gL_JournalEntry.findFirst({
      where: {
        reference_type: 'Payment',
        reference_id: paymentId.toString(),
        status: { not: 'Reversed' },
      },
    });

    if (existingEntry) {
      return { success: true, message: 'Payment already posted to GL', journal: existingEntry };
    }

    // Get accounts based on payment method
    const bankOrCashAccount = payment.payment_method === 'Cash'
      ? await getAccountByCode(payment.organizationId, '1110') // Cash in Hand
      : await getAccountByCode(payment.organizationId, '1120'); // Bank Accounts

    const receivableAccount = await getAccountByCode(payment.organizationId, '1130'); // Patient Receivables

    if (!bankOrCashAccount || !receivableAccount) {
      return { success: false, error: 'Required GL accounts not found' };
    }

    const lines: JournalLineInput[] = [
      // Debit: Cash/Bank
      {
        account_id: bankOrCashAccount.id,
        debit_amount: payment.amount.toNumber(),
        credit_amount: 0,
        description: `Payment received - ${payment.payment_method}`,
      },
      // Credit: Patient Receivables
      {
        account_id: receivableAccount.id,
        debit_amount: 0,
        credit_amount: payment.amount.toNumber(),
        description: `Payment against receivables`,
      },
    ];

    const result = await createJournalEntry({
      organizationId: payment.organizationId,
      entry_date: payment.created_at,
      entry_type: 'Payment',
      narration: `Payment received - ${payment.payment_method} - Ref: ${payment.reference || 'N/A'}`,
      lines,
      reference_type: 'Payment',
      reference_id: paymentId.toString(),
      reference_number: payment.reference || undefined,
    });

    return result;
  } catch (error) {
    console.error('Error posting payment to GL:', error);
    return { success: false, error: 'Failed to post payment to GL' };
  }
}

export async function postExpenseToGL(expenseId: number) {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
    });

    if (!expense) {
      return { success: false, error: 'Expense not found' };
    }

    // Check if already posted
    const existingEntry = await prisma.gL_JournalEntry.findFirst({
      where: {
        reference_type: 'Expense',
        reference_id: expenseId.toString(),
        status: { not: 'Reversed' },
      },
    });

    if (existingEntry) {
      return { success: true, message: 'Expense already posted to GL', journal: existingEntry };
    }

    // Get accounts
    const expenseAccount = await getAccountByCode(expense.organizationId, '8000'); // Operating Expenses
    const cashOrPayableAccount = expense.status === 'Paid'
      ? await getAccountByCode(expense.organizationId, '1110') // Cash
      : await getAccountByCode(expense.organizationId, '3110'); // Vendors Payable

    if (!expenseAccount || !cashOrPayableAccount) {
      return { success: false, error: 'Required GL accounts not found' };
    }

    const lines: JournalLineInput[] = [
      // Debit: Expense
      {
        account_id: expenseAccount.id,
        debit_amount: expense.amount.toNumber(),
        credit_amount: 0,
        description: expense.description || 'Expense',
      },
      // Credit: Cash or Payable
      {
        account_id: cashOrPayableAccount.id,
        debit_amount: 0,
        credit_amount: expense.amount.toNumber(),
        description: expense.status === 'Paid' ? 'Cash paid' : 'Payable',
      },
    ];

    const result = await createJournalEntry({
      organizationId: expense.organizationId,
      entry_date: expense.created_at,
      entry_type: 'Expense',
      narration: `Expense - ${expense.description || 'N/A'}`,
      lines,
      reference_type: 'Expense',
      reference_id: expenseId.toString(),
    });

    return result;
  } catch (error) {
    console.error('Error posting expense to GL:', error);
    return { success: false, error: 'Failed to post expense to GL' };
  }
}

export async function postDepositToGL(depositId: number) {
  try {
    // Assuming deposit is a payment with deposit type
    const deposit = await prisma.payments.findUnique({
      where: { id: depositId },
    });

    if (!deposit) {
      return { success: false, error: 'Deposit not found' };
    }

    const bankOrCashAccount = deposit.payment_method === 'Cash'
      ? await getAccountByCode(deposit.organizationId, '1110')
      : await getAccountByCode(deposit.organizationId, '1120');

    const depositLiabilityAccount = await getAccountByCode(deposit.organizationId, '3140'); // Patient Deposits

    if (!bankOrCashAccount || !depositLiabilityAccount) {
      return { success: false, error: 'Required GL accounts not found' };
    }

    const lines: JournalLineInput[] = [
      // Debit: Cash/Bank
      {
        account_id: bankOrCashAccount.id,
        debit_amount: deposit.amount.toNumber(),
        credit_amount: 0,
        description: 'Deposit received',
      },
      // Credit: Patient Deposits (Liability)
      {
        account_id: depositLiabilityAccount.id,
        debit_amount: 0,
        credit_amount: deposit.amount.toNumber(),
        description: 'Patient advance deposit',
      },
    ];

    const result = await createJournalEntry({
      organizationId: deposit.organizationId,
      entry_date: deposit.created_at,
      entry_type: 'Deposit',
      narration: `Patient deposit received`,
      lines,
      reference_type: 'Deposit',
      reference_id: depositId.toString(),
    });

    return result;
  } catch (error) {
    console.error('Error posting deposit to GL:', error);
    return { success: false, error: 'Failed to post deposit to GL' };
  }
}

export async function postRefundToGL(refundId: number) {
  try {
    // Refund reverses revenue
    const refund = await prisma.payments.findUnique({
      where: { id: refundId },
    });

    if (!refund) {
      return { success: false, error: 'Refund not found' };
    }

    const cashOrBankAccount = await getAccountByCode(refund.organizationId, '1110');
    const revenueAccount = await getAccountByCode(refund.organizationId, '6000');

    if (!cashOrBankAccount || !revenueAccount) {
      return { success: false, error: 'Required GL accounts not found' };
    }

    const lines: JournalLineInput[] = [
      // Debit: Revenue (reduces revenue)
      {
        account_id: revenueAccount.id,
        debit_amount: refund.amount.toNumber(),
        credit_amount: 0,
        description: 'Refund to patient',
      },
      // Credit: Cash/Bank
      {
        account_id: cashOrBankAccount.id,
        debit_amount: 0,
        credit_amount: refund.amount.toNumber(),
        description: 'Cash refunded',
      },
    ];

    const result = await createJournalEntry({
      organizationId: refund.organizationId,
      entry_date: refund.created_at,
      entry_type: 'Refund',
      narration: `Refund to patient`,
      lines,
      reference_type: 'Refund',
      reference_id: refundId.toString(),
    });

    return result;
  } catch (error) {
    console.error('Error posting refund to GL:', error);
    return { success: false, error: 'Failed to post refund to GL' };
  }
}

// ========================================
// Reporting Functions
// ========================================

export async function getAccountBalance(accountId: string, asOfDate?: Date) {
  try {
    const account = await prisma.gL_Account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return { success: false, error: 'Account not found' };
    }

    // If no date specified, return current balance
    if (!asOfDate) {
      return {
        success: true,
        balance: account.current_balance.toNumber(),
        account,
      };
    }

    // Calculate balance as of specific date
    const lines = await prisma.gL_JournalLine.findMany({
      where: {
        account_id: accountId,
        journal: {
          entry_date: { lte: asOfDate },
          status: 'Posted',
        },
      },
      include: {
        journal: true,
      },
    });

    let balance = account.opening_balance.toNumber();
    for (const line of lines) {
      if (account.normal_balance === 'Debit') {
        balance += line.debit_amount.toNumber() - line.credit_amount.toNumber();
      } else {
        balance += line.credit_amount.toNumber() - line.debit_amount.toNumber();
      }
    }

    return { success: true, balance, account };
  } catch (error) {
    console.error('Error getting account balance:', error);
    return { success: false, error: 'Failed to get balance' };
  }
}

export async function getTrialBalance(organizationId: string, filters?: {
  as_of_date?: Date;
  period_id?: number;
}) {
  try {
    const accounts = await prisma.gL_Account.findMany({
      where: {
        organizationId,
        is_active: true,
      },
      orderBy: { account_code: 'asc' },
    });

    const balances = await Promise.all(
      accounts.map(async (account: any) => {
        const balanceResult = await getAccountBalance(
          account.id,
          filters?.as_of_date
        );
        return {
          account,
          balance: balanceResult.balance || 0,
        };
      })
    );

    // Calculate total debits and credits
    let totalDebit = 0;
    let totalCredit = 0;

    const trialBalanceData = balances.map(({ account, balance }: any) => {
      const debit = account.normal_balance === 'Debit' && balance > 0 ? balance : 0;
      const credit = account.normal_balance === 'Credit' && balance > 0 ? balance : 0;

      totalDebit += debit;
      totalCredit += credit;

      return {
        account_code: account.account_code,
        account_name: account.account_name,
        account_type: account.account_type,
        debit,
        credit,
      };
    });

    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

    return {
      success: true,
      trial_balance: trialBalanceData,
      total_debit: totalDebit,
      total_credit: totalCredit,
      is_balanced: isBalanced,
    };
  } catch (error) {
    console.error('Error generating trial balance:', error);
    return { success: false, error: 'Failed to generate trial balance' };
  }
}

export async function getBalanceSheet(organizationId: string, filters?: {
  as_of_date?: Date;
  period_id?: number;
}) {
  try {
    const asOfDate = filters?.as_of_date || new Date();

    const accounts = await prisma.gL_Account.findMany({
      where: {
        organizationId,
        is_active: true,
        account_type: { in: ['Asset', 'Liability', 'Equity'] },
      },
      orderBy: { account_code: 'asc' },
    });

    const balances = await Promise.all(
      accounts.map(async (account: any) => {
        const balanceResult = await getAccountBalance(account.id, asOfDate);
        return {
          ...account,
          balance: balanceResult.balance || 0,
        };
      })
    );

    const assets = balances.filter(a => a.account_type === 'Asset');
    const liabilities = balances.filter(a => a.account_type === 'Liability');
    const equity = balances.filter(a => a.account_type === 'Equity');

    const totalAssets = assets.reduce((sum: number, a: any) => sum + a.balance, 0);
    const totalLiabilities = liabilities.reduce((sum: number, a: any) => sum + a.balance, 0);
    const totalEquity = equity.reduce((sum: number, a: any) => sum + a.balance, 0);

    return {
      success: true,
      balance_sheet: {
        assets,
        liabilities,
        equity,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        total_equity: totalEquity,
        equation_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
      },
      as_of_date: asOfDate,
    };
  } catch (error) {
    console.error('Error generating balance sheet:', error);
    return { success: false, error: 'Failed to generate balance sheet' };
  }
}

export async function getProfitLossStatement(organizationId: string, filters?: {
  start_date?: Date;
  end_date?: Date;
  period_id?: number;
}) {
  try {
    const accounts = await prisma.gL_Account.findMany({
      where: {
        organizationId,
        is_active: true,
        account_type: { in: ['Revenue', 'Expense'] },
      },
      orderBy: { account_code: 'asc' },
    });

    // For P&L, we need to sum transactions in the period, not ending balance
    const revenueAccounts = [];
    const expenseAccounts = [];

    for (const account of accounts) {
      const lines = await prisma.gL_JournalLine.findMany({
        where: {
          account_id: account.id,
          journal: {
            entry_date: {
              ...(filters?.start_date && { gte: filters.start_date }),
              ...(filters?.end_date && { lte: filters.end_date }),
            },
            status: 'Posted',
          },
        },
      });

      let total = 0;
      for (const line of lines) {
        if (account.normal_balance === 'Credit') {
          // Revenue
          total += line.credit_amount.toNumber() - line.debit_amount.toNumber();
        } else {
          // Expense
          total += line.debit_amount.toNumber() - line.credit_amount.toNumber();
        }
      }

      if (account.account_type === 'Revenue') {
        revenueAccounts.push({ ...account, amount: total });
      } else {
        expenseAccounts.push({ ...account, amount: total });
      }
    }

    const totalRevenue = revenueAccounts.reduce((sum: number, a: any) => sum + a.amount, 0);
    const totalExpenses = expenseAccounts.reduce((sum: number, a: any) => sum + a.amount, 0);
    const netIncome = totalRevenue - totalExpenses;

    return {
      success: true,
      profit_loss: {
        revenue_accounts: revenueAccounts,
        expense_accounts: expenseAccounts,
        total_revenue: totalRevenue,
        total_expenses: totalExpenses,
        net_income: netIncome,
      },
      period: {
        start_date: filters?.start_date,
        end_date: filters?.end_date,
      },
    };
  } catch (error) {
    console.error('Error generating P&L statement:', error);
    return { success: false, error: 'Failed to generate P&L statement' };
  }
}

export async function getLedgerReport(accountId: string, filters?: {
  start_date?: Date;
  end_date?: Date;
}) {
  try {
    const account = await prisma.gL_Account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return { success: false, error: 'Account not found' };
    }

    const lines = await prisma.gL_JournalLine.findMany({
      where: {
        account_id: accountId,
        journal: {
          entry_date: {
            ...(filters?.start_date && { gte: filters.start_date }),
            ...(filters?.end_date && { lte: filters.end_date }),
          },
          status: 'Posted',
        },
      },
      include: {
        journal: true,
      },
      orderBy: {
        journal: {
          entry_date: 'asc',
        },
      },
    });

    let runningBalance = account.opening_balance.toNumber();
    const transactions = lines.map((line: any) => {
      const debit = line.debit_amount.toNumber();
      const credit = line.credit_amount.toNumber();

      if (account.normal_balance === 'Debit') {
        runningBalance += debit - credit;
      } else {
        runningBalance += credit - debit;
      }

      return {
        date: line.journal.entry_date,
        journal_number: line.journal.journal_number,
        description: line.description || line.journal.narration,
        debit,
        credit,
        balance: runningBalance,
      };
    });

    return {
      success: true,
      account,
      opening_balance: account.opening_balance.toNumber(),
      transactions,
      closing_balance: runningBalance,
    };
  } catch (error) {
    console.error('Error generating ledger report:', error);
    return { success: false, error: 'Failed to generate ledger report' };
  }
}

// ========================================
// Period Management
// ========================================

export async function closePeriod(periodId: number) {
  try {
    const period = await prisma.financialPeriod.update({
      where: { id: periodId },
      data: { status: 'Closed' },
    });

    revalidatePath('/finance');
    return { success: true, period };
  } catch (error) {
    console.error('Error closing period:', error);
    return { success: false, error: 'Failed to close period' };
  }
}

export async function lockPeriod(periodId: number) {
  try {
    const period = await prisma.financialPeriod.update({
      where: { id: periodId },
      data: { status: 'Locked' },
    });

    revalidatePath('/finance');
    return { success: true, period };
  } catch (error) {
    console.error('Error locking period:', error);
    return { success: false, error: 'Failed to lock period' };
  }
}

export async function postOpeningBalances(
  organizationId: string,
  periodId: number,
  balances: { account_id: string; amount: number }[]
) {
  try {
    const lines: JournalLineInput[] = balances.map((bal) => ({
      account_id: bal.account_id,
      debit_amount: bal.amount > 0 ? bal.amount : 0,
      credit_amount: bal.amount < 0 ? Math.abs(bal.amount) : 0,
      description: 'Opening balance',
    }));

    const result = await createJournalEntry({
      organizationId,
      entry_date: new Date(),
      entry_type: 'Opening',
      narration: 'Opening balances',
      lines,
      period_id: periodId,
    });

    return result;
  } catch (error) {
    console.error('Error posting opening balances:', error);
    return { success: false, error: 'Failed to post opening balances' };
  }
}

// ========================================
// Helper Functions
// ========================================

async function getAccountByCode(organizationId: string, accountCode: string) {
  return prisma.gL_Account.findFirst({
    where: {
      organizationId,
      account_code: accountCode,
      is_active: true,
    },
  });
}

// Note: mapAccountToTally is available directly from './tally-export-actions'

/**
 * Post depreciation entry to GL
 * Dr. Depreciation Expense / Cr. Accumulated Depreciation
 */
export async function postDepreciationToGL(depreciationEntryId: string) {
  try {
    const depEntry = await prisma.depreciationEntry.findUnique({
      where: { id: depreciationEntryId },
      include: {
        asset: {
          include: { category: true },
        },
      },
    });

    if (!depEntry || !depEntry.asset) {
      return { success: false, error: 'Depreciation entry not found' };
    }

    const asset = depEntry.asset;
    const category = asset.category;

    // Get GL accounts from category
    if (!category.gl_expense_account_id || !category.gl_depreciation_account_id) {
      return { success: false, error: 'GL accounts not configured for asset category' };
    }

    const depreciationAmount = parseFloat(depEntry.depreciation_amount.toString());

    // Create journal entry
    const journalData = {
      organizationId: depEntry.organizationId,
      entry_type: 'Depreciation',
      reference_type: 'DepreciationEntry',
      reference_id: depreciationEntryId,
      reference_number: `${asset.asset_code}-${depEntry.depreciation_period}`,
      narration: `Monthly depreciation for ${asset.asset_name} - ${depEntry.depreciation_period}`,
      entry_date: depEntry.period_end,
      lines: [
        {
          account_id: category.gl_expense_account_id,
          debit_amount: depreciationAmount,
          credit_amount: 0,
          description: `Depreciation expense - ${asset.asset_name}`,
        },
        {
          account_id: category.gl_depreciation_account_id,
          debit_amount: 0,
          credit_amount: depreciationAmount,
          description: `Accumulated depreciation - ${asset.asset_name}`,
        },
      ],
    };

    const result = await createJournalEntry(journalData);

    if (result.success && result.journal) {
      return { success: true, journal_id: result.journal.id };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error('Post depreciation to GL error:', error);
    return { success: false, error: error.message };
  }
}
