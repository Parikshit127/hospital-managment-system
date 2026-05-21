import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// ── XML helpers ───────────────────────────────────────────────────────────────

function escapeXML(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatTallyDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Wraps raw TALLYMESSAGE blocks in a single valid XML envelope.
 * Called ONCE per export — never nest this.
 */
function wrapTallyXML(content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>\n  <HEADER>\n    <TALLYREQUEST>Import Data</TALLYREQUEST>\n  </HEADER>\n  <BODY>\n    <IMPORTDATA>\n      <REQUESTDESC>\n        <REPORTNAME>All Masters</REPORTNAME>\n      </REQUESTDESC>\n      <REQUESTDATA>\n${content}\n      </REQUESTDATA>\n    </IMPORTDATA>\n  </BODY>\n</ENVELOPE>`;
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

// ── Raw content builders (return unwrapped TALLYMESSAGE blocks) ───────────────

async function buildVoucherContent(
  organizationId: string,
  start_date?: Date | null,
  end_date?: Date | null
): Promise<string> {
  const journals = await prisma.gL_JournalEntry.findMany({
    where: {
      organizationId,
      status: 'Posted',
      ...(start_date && { entry_date: { gte: start_date } }),
      ...(end_date && { entry_date: { lte: end_date } }),
    },
    include: { lines: { include: { account: true } } },
    orderBy: { entry_date: 'asc' },
  });

  return journals
    .map(
      (journal: any) => `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Journal" ACTION="Create">
        <DATE>${formatTallyDate(journal.entry_date)}</DATE>
        <VOUCHERNUMBER>${escapeXML(journal.journal_number)}</VOUCHERNUMBER>
        <NARRATION>${escapeXML(journal.narration)}</NARRATION>
        <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
        <REFERENCE>${escapeXML(journal.reference_number || '')}</REFERENCE>
${journal.lines
  .map(
    (line: any) => `        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXML(line.account.tally_ledger_name || line.account.account_name)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${line.debit_amount.toNumber() > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
          <AMOUNT>${line.debit_amount.toNumber() > 0 ? line.debit_amount.toNumber() : -line.credit_amount.toNumber()}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`
  )
  .join('\n')}
      </VOUCHER>
    </TALLYMESSAGE>`
    )
    .join('\n');
}

async function buildLedgerContent(organizationId: string): Promise<string> {
  const accounts = await prisma.gL_Account.findMany({
    where: { organizationId, is_active: true },
    orderBy: { account_code: 'asc' },
  });

  return accounts
    .map((account: any) => {
      const tallyGroup =
        account.tally_group || mapAccountTypeToTallyGroup(account.account_type);
      return `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <LEDGER NAME="${escapeXML(account.tally_ledger_name || account.account_name)}" ACTION="Create">
        <NAME>${escapeXML(account.tally_ledger_name || account.account_name)}</NAME>
        <PARENT>${escapeXML(tallyGroup)}</PARENT>
        <ISBILLWISEON>No</ISBILLWISEON>
        <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
        <OPENINGBALANCE>${account.opening_balance.toNumber()}</OPENINGBALANCE>
      </LEDGER>
    </TALLYMESSAGE>`;
    })
    .join('\n');
}

async function buildMasterContent(organizationId: string): Promise<string> {
  const vendors = await prisma.vendor.findMany({
    where: { organizationId },
    take: 100,
  });

  return vendors
    .map(
      (vendor: any) => `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
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
    </TALLYMESSAGE>`
    )
    .join('\n');
}

// ── Regenerate a complete, valid XML string from DB ───────────────────────────

async function regenerateXML(
  organizationId: string,
  exportType: string,
  startDate?: Date | null,
  endDate?: Date | null
): Promise<string> {
  switch (exportType) {
    case 'Vouchers': {
      const content = await buildVoucherContent(organizationId, startDate, endDate);
      return wrapTallyXML(content);
    }
    case 'Ledgers': {
      const content = await buildLedgerContent(organizationId);
      return wrapTallyXML(content);
    }
    case 'Masters': {
      const content = await buildMasterContent(organizationId);
      return wrapTallyXML(content);
    }
    case 'Full': {
      // Fetch all raw content in parallel, then wrap ONCE
      const [voucherContent, ledgerContent, masterContent] = await Promise.all([
        buildVoucherContent(organizationId, startDate, endDate),
        buildLedgerContent(organizationId),
        buildMasterContent(organizationId),
      ]);
      return wrapTallyXML([voucherContent, ledgerContent, masterContent].join('\n'));
    }
    default:
      throw new Error(`Unknown export type: ${exportType}`);
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return new NextResponse('Missing ID parameter', { status: 400 });
  }

  try {
    const exportRecord = await prisma.tallyExport.findUnique({
      where: { id },
    });

    if (!exportRecord) {
      return new NextResponse('Export not found', { status: 404 });
    }

    const filename = `${exportRecord.export_number}_${exportRecord.export_type.toLowerCase()}.xml`;
    const contentDisposition = `attachment; filename="${filename}"`;

    // ── Happy path: file exists on disk ──────────────────────────────────────
    if (exportRecord.file_path && existsSync(exportRecord.file_path)) {
      const fileBuffer = await readFile(exportRecord.file_path);
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': 'application/xml',
          'Content-Disposition': contentDisposition,
        },
      });
    }

    // ── Fallback: regenerate XML from DB data ─────────────────────────────────
    console.warn(
      `Tally export file missing for ${exportRecord.export_number}, regenerating from DB…`
    );

    const xmlContent = await regenerateXML(
      exportRecord.organizationId,
      exportRecord.export_type,
      exportRecord.start_date,
      exportRecord.end_date
    );

    // Persist the regenerated file so future downloads are instant
    try {
      const exportsDir = join(process.cwd(), 'exports', 'tally');
      await mkdir(exportsDir, { recursive: true });
      const filepath = join(exportsDir, filename);
      await writeFile(filepath, xmlContent, 'utf-8');
      await prisma.tallyExport.update({
        where: { id },
        data: {
          file_path: filepath,
          file_size: BigInt(Buffer.byteLength(xmlContent, 'utf-8')),
        },
      });
    } catch (persistErr) {
      // Non-fatal — still return the content even if we can't save it
      console.error('Could not persist regenerated file:', persistErr);
    }

    return new NextResponse(xmlContent, {
      headers: {
        'Content-Type': 'application/xml',
        'Content-Disposition': contentDisposition,
      },
    });
  } catch (error) {
    console.error('Error downloading Tally export:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
