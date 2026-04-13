// @ts-nocheck
'use server';

import { prisma } from '@/backend/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { revalidatePath } from 'next/cache';

// ========================================
// Types & Interfaces
// ========================================

interface TallyExportOptions {
  organizationId: string;
  export_type: 'Vouchers' | 'Ledgers' | 'Masters' | 'Full';
  start_date?: Date;
  end_date?: Date;
  include_invoices?: boolean;
  include_payments?: boolean;
  include_expenses?: boolean;
  created_by?: string;
}

interface TallyVoucher {
  voucher_type: string;
  date: Date;
  voucher_number: string;
  narration: string;
  entries: {
    ledger_name: string;
    amount: number;
    is_debit: boolean;
  }[];
}

// ========================================
// Main Export Functions
// ========================================

export async function generateTallyXML(options: TallyExportOptions) {
  try {
    // Create export record
    const year = new Date().getFullYear();
    const lastExport = await prisma.tallyExport.findFirst({
      where: {
        organizationId: options.organizationId,
        export_number: { startsWith: `TALLY-${year}-` },
      },
      orderBy: { export_number: 'desc' },
    });

    let nextNumber = 1;
    if (lastExport) {
      const match = lastExport.export_number.match(/TALLY-\d{4}-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }
    const export_number = `TALLY-${year}-${nextNumber.toString().padStart(4, '0')}`;

    const exportRecord = await prisma.tallyExport.create({
      data: {
        organizationId: options.organizationId,
        export_number,
        export_type: options.export_type,
        export_format: 'XML',
        start_date: options.start_date,
        end_date: options.end_date,
        status: 'Processing',
        created_by: options.created_by,
      },
    });

    try {
      let xmlContent = '';
      let recordCount = 0;

      switch (options.export_type) {
        case 'Vouchers':
          const vouchersResult = await buildVoucherXML(options);
          xmlContent = vouchersResult.xml;
          recordCount = vouchersResult.count;
          break;

        case 'Ledgers':
          const ledgersResult = await buildLedgerXML(options.organizationId);
          xmlContent = ledgersResult.xml;
          recordCount = ledgersResult.count;
          break;

        case 'Masters':
          const mastersResult = await buildMasterXML(options.organizationId);
          xmlContent = mastersResult.xml;
          recordCount = mastersResult.count;
          break;

        case 'Full':
          const [vouchers, ledgers, masters] = await Promise.all([
            buildVoucherXML(options),
            buildLedgerXML(options.organizationId),
            buildMasterXML(options.organizationId),
          ]);
          xmlContent = wrapTallyXML(
            vouchers.xml + ledgers.xml + masters.xml
          );
          recordCount = vouchers.count + ledgers.count + masters.count;
          break;
      }

      // Save XML file
      const exportsDir = join(process.cwd(), 'exports', 'tally');
      await mkdir(exportsDir, { recursive: true });

      const filename = `${export_number}_${options.export_type.toLowerCase()}.xml`;
      const filepath = join(exportsDir, filename);

      await writeFile(filepath, xmlContent, 'utf-8');

      const fileSize = Buffer.byteLength(xmlContent, 'utf-8');

      // Update export record
      await prisma.tallyExport.update({
        where: { id: exportRecord.id },
        data: {
          file_path: filepath,
          file_size: BigInt(fileSize),
          record_count: recordCount,
          status: 'Completed',
          completed_at: new Date(),
        },
      });

      revalidatePath('/finance/tally-export');
      return {
        success: true,
        export_number,
        file_path: filepath,
        record_count: recordCount,
        exportId: exportRecord.id,
      };
    } catch (error) {
      // Update export record with error
      await prisma.tallyExport.update({
        where: { id: exportRecord.id },
        data: {
          status: 'Failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  } catch (error) {
    console.error('Error generating Tally XML:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate export',
    };
  }
}

// ========================================
// XML Building Functions
// ========================================

async function buildVoucherXML(options: TallyExportOptions): Promise<{ xml: string; count: number }> {
  const vouchers: string[] = [];

  // Fetch journal entries
  const journals = await prisma.gL_JournalEntry.findMany({
    where: {
      organizationId: options.organizationId,
      status: 'Posted',
      ...(options.start_date && { entry_date: { gte: options.start_date } }),
      ...(options.end_date && { entry_date: { lte: options.end_date } }),
    },
    include: {
      lines: {
        include: {
          account: true,
        },
      },
    },
    orderBy: { entry_date: 'asc' },
  });

  for (const journal of journals) {
    const voucherXML = `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Journal" ACTION="Create">
        <DATE>${formatTallyDate(journal.entry_date)}</DATE>
        <VOUCHERNUMBER>${escapeXML(journal.journal_number)}</VOUCHERNUMBER>
        <NARRATION>${escapeXML(journal.narration)}</NARRATION>
        <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
        <REFERENCE>${escapeXML(journal.reference_number || '')}</REFERENCE>
${journal.lines
  .map(
    (line) => `        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXML(line.account.tally_ledger_name || line.account.account_name)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${line.debit_amount.toNumber() > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
          <AMOUNT>${line.debit_amount.toNumber() > 0 ? line.debit_amount.toNumber() : -line.credit_amount.toNumber()}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`
  )
  .join('\n')}
      </VOUCHER>
    </TALLYMESSAGE>`;

    vouchers.push(voucherXML);
  }

  // Optionally include invoice vouchers
  if (options.include_invoices) {
    const invoiceVouchers = await buildInvoiceVoucherXML(options);
    vouchers.push(...invoiceVouchers);
  }

  // Optionally include payment vouchers
  if (options.include_payments) {
    const paymentVouchers = await buildPaymentVoucherXML(options);
    vouchers.push(...paymentVouchers);
  }

  // Optionally include expense vouchers
  if (options.include_expenses) {
    const expenseVouchers = await buildExpenseVoucherXML(options);
    vouchers.push(...expenseVouchers);
  }

  const xml = wrapTallyXML(vouchers.join('\n'));
  return { xml, count: vouchers.length };
}

async function buildInvoiceVoucherXML(options: TallyExportOptions): Promise<string[]> {
  const invoices = await prisma.invoices.findMany({
    where: {
      organizationId: options.organizationId,
      ...(options.start_date && { invoice_date: { gte: options.start_date } }),
      ...(options.end_date && { invoice_date: { lte: options.end_date } }),
    },
    include: {
      patient: true,
    },
  });

  return invoices.map((invoice: any) => {
    const taxableAmount =
      invoice.total_amount.toNumber() -
      (invoice.cgst_amount?.toNumber() || 0) -
      (invoice.sgst_amount?.toNumber() || 0) -
      (invoice.igst_amount?.toNumber() || 0);

    return `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Sales" ACTION="Create">
        <DATE>${formatTallyDate(invoice.invoice_date)}</DATE>
        <VOUCHERNUMBER>${escapeXML(invoice.invoice_number)}</VOUCHERNUMBER>
        <NARRATION>Sales Invoice - ${escapeXML(invoice.patient?.name || 'Patient')}</NARRATION>
        <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
        <PARTYLEDGERNAME>Sundry Debtors - Patients</PARTYLEDGERNAME>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Sundry Debtors - Patients</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>${invoice.total_amount.toNumber()}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Sales Account</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${-taxableAmount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
${
  invoice.cgst_amount && invoice.cgst_amount.toNumber() > 0
    ? `        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>CGST Payable</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${-invoice.cgst_amount.toNumber()}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`
    : ''
}
${
  invoice.sgst_amount && invoice.sgst_amount.toNumber() > 0
    ? `        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>SGST Payable</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${-invoice.sgst_amount.toNumber()}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`
    : ''
}
${
  invoice.igst_amount && invoice.igst_amount.toNumber() > 0
    ? `        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>IGST Payable</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${-invoice.igst_amount.toNumber()}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`
    : ''
}
      </VOUCHER>
    </TALLYMESSAGE>`;
  });
}

async function buildPaymentVoucherXML(options: TallyExportOptions): Promise<string[]> {
  const payments = await prisma.payments.findMany({
    where: {
      organizationId: options.organizationId,
      ...(options.start_date && { payment_date: { gte: options.start_date } }),
      ...(options.end_date && { payment_date: { lte: options.end_date } }),
    },
  });

  return payments.map((payment: any) => {
    const cashOrBank = payment.payment_method === 'Cash' ? 'Cash' : 'Bank Accounts';

    return `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Receipt" ACTION="Create">
        <DATE>${formatTallyDate(payment.payment_date)}</DATE>
        <VOUCHERNUMBER>${escapeXML(payment.payment_reference || payment.id)}</VOUCHERNUMBER>
        <NARRATION>Payment received - ${escapeXML(payment.payment_method)}</NARRATION>
        <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${cashOrBank}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>${payment.amount_paid.toNumber()}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Sundry Debtors - Patients</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${-payment.amount_paid.toNumber()}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE>`;
  });
}

async function buildExpenseVoucherXML(options: TallyExportOptions): Promise<string[]> {
  const expenses = await prisma.expense.findMany({
    where: {
      organizationId: options.organizationId,
      ...(options.start_date && { expense_date: { gte: options.start_date } }),
      ...(options.end_date && { expense_date: { lte: options.end_date } }),
    },
  });

  return expenses.map((expense: any) => {
    const paymentLedger =
      expense.payment_status === 'Paid' ? 'Cash' : 'Sundry Creditors';

    return `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Payment" ACTION="Create">
        <DATE>${formatTallyDate(expense.expense_date)}</DATE>
        <VOUCHERNUMBER>${escapeXML(expense.id)}</VOUCHERNUMBER>
        <NARRATION>${escapeXML(expense.description || 'Expense')}</NARRATION>
        <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Operating Expenses</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>${expense.amount.toNumber()}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${paymentLedger}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${-expense.amount.toNumber()}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE>`;
  });
}

async function buildLedgerXML(organizationId: string): Promise<{ xml: string; count: number }> {
  const accounts = await prisma.gL_Account.findMany({
    where: {
      organizationId,
      is_active: true,
    },
    orderBy: { account_code: 'asc' },
  });

  const ledgers = accounts.map((account: any) => {
    // Map account type to Tally group
    const tallyGroup = account.tally_group || mapAccountTypeToTallyGroup(account.account_type);

    return `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <LEDGER NAME="${escapeXML(account.tally_ledger_name || account.account_name)}" ACTION="Create">
        <NAME>${escapeXML(account.tally_ledger_name || account.account_name)}</NAME>
        <PARENT>${escapeXML(tallyGroup)}</PARENT>
        <ISBILLWISEON>No</ISBILLWISEON>
        <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
        <OPENINGBALANCE>${account.opening_balance.toNumber()}</OPENINGBALANCE>
      </LEDGER>
    </TALLYMESSAGE>`;
  });

  const xml = wrapTallyXML(ledgers.join('\n'));
  return { xml, count: ledgers.length };
}


async function buildMasterXML(organizationId: string): Promise<{ xml: string; count: number }> {
  // Export vendors as party ledgers (patients table doesn't exist in schema)
  const vendors = await prisma.vendor.findMany({
    where: { organizationId },
    take: 100,
  });

  const masters: string[] = [];

  // Vendors
  for (const vendor of vendors) {
    masters.push(`
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <LEDGER NAME="${escapeXML(vendor.vendor_name)}" ACTION="Create">
        <NAME>${escapeXML(vendor.vendor_name)}</NAME>
        <PARENT>Sundry Creditors</PARENT>
        <ISBILLWISEON>Yes</ISBILLWISEON>
        <ADDRESS.LIST>
          <ADDRESS>${escapeXML(vendor.address || '')}</ADDRESS>
        </ADDRESS.LIST>
        ${vendor.gst_number ? `<GSTIN>${escapeXML(vendor.gst_number)}</GSTIN>` : ''}
        ${vendor.pan_number ? `<INCOMETAXNUMBER>${escapeXML(vendor.pan_number)}</INCOMETAXNUMBER>` : ''}
      </LEDGER>
    </TALLYMESSAGE>`);
  }

  const xml = wrapTallyXML(masters.join('\n'));
  return { xml, count: masters.length };
}
// ========================================
// Export Management Functions
// ========================================

export async function getTallyExports(organizationId: string, filters?: {
  status?: string;
  export_type?: string;
  limit?: number;
}) {
  try {
    const exports = await prisma.tallyExport.findMany({
      where: {
        organizationId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.export_type && { export_type: filters.export_type }),
      },
      orderBy: { created_at: 'desc' },
      take: filters?.limit || 50,
    });

    return { success: true, exports };
  } catch (error) {
    console.error('Error fetching exports:', error);
    return { success: false, error: 'Failed to fetch exports', exports: [] };
  }
}

export async function downloadTallyExport(exportId: string) {
  try {
    const exportRecord = await prisma.tallyExport.findUnique({
      where: { id: exportId },
    });

    if (!exportRecord || !exportRecord.file_path) {
      return { success: false, error: 'Export not found or file missing' };
    }

    return {
      success: true,
      file_path: exportRecord.file_path,
      export_number: exportRecord.export_number,
    };
  } catch (error) {
    console.error('Error downloading export:', error);
    return { success: false, error: 'Failed to download export' };
  }
}

export async function deleteTallyExport(exportId: string) {
  try {
    await prisma.tallyExport.delete({
      where: { id: exportId },
    });

    revalidatePath('/finance/tally-export');
    return { success: true };
  } catch (error) {
    console.error('Error deleting export:', error);
    return { success: false, error: 'Failed to delete export' };
  }
}

export async function mapAccountToTally(
  accountId: string,
  tally_ledger_name: string,
  tally_group: string
) {
  try {
    const account = await prisma.gL_Account.update({
      where: { id: accountId },
      data: {
        tally_ledger_name,
        tally_group,
      },
    });

    revalidatePath('/finance/chart-of-accounts');
    revalidatePath('/finance/tally-export');
    return { success: true, account };
  } catch (error) {
    console.error('Error mapping account to Tally:', error);
    return { success: false, error: 'Failed to map account' };
  }
}

// ========================================
// Utility Functions
// ========================================

function wrapTallyXML(content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
${content}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

function formatTallyDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function mapAccountTypeToTallyGroup(accountType: string): string {
  const mapping: Record<string, string> = {
    Asset: 'Current Assets',
    Liability: 'Current Liabilities',
    Equity: 'Capital Account',
    Revenue: 'Sales Accounts',
    Expense: 'Indirect Expenses',
  };

  return mapping[accountType] || 'Sundry Debtors';
}
