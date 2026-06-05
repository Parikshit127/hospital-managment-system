/**
 * Tally HTTP client + XML builders (per-hospital, dynamic config — no env vars).
 *
 * The accounting source of truth is the GL engine (GL_Account = ledgers,
 * GL_JournalEntry/GL_JournalLine = vouchers). This module only (a) serialises a
 * single ledger / voucher to Tally import XML and (b) POSTs it to the hospital's
 * configured Tally HTTP gateway and parses the response. It does NOT compute any
 * accounting — it mirrors the existing tally-export-actions.ts XML format.
 *
 * Plain module (not 'use server') so the sync helpers can be imported by server
 * actions and reused without a network round-trip.
 */

export interface TallyConnectionConfig {
    url: string;
    company?: string | null;
    username?: string | null;
    password?: string | null;
}

export interface TallyPostResult {
    ok: boolean;
    httpStatus?: number;
    created: number;
    altered: number;
    errors: number;
    exceptions: number;
    /** parsed/derived human-readable message */
    message: string;
    /** machine code for error handling/UI */
    code:
        | 'success'
        | 'offline'
        | 'timeout'
        | 'network'
        | 'invalid_company'
        | 'duplicate'
        | 'invalid_payload'
        | 'http_error'
        | 'unknown';
    raw?: string;
}

// ── XML helpers (mirror tally-export-actions.ts) ────────────────────────────

export function escapeXML(str: string): string {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function formatTallyDate(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

export function mapAccountTypeToTallyGroup(accountType: string): string {
    const mapping: Record<string, string> = {
        Asset: 'Current Assets',
        Liability: 'Current Liabilities',
        Equity: 'Capital Account',
        Revenue: 'Sales Accounts',
        Expense: 'Indirect Expenses',
    };
    return mapping[accountType] || 'Sundry Debtors';
}

/** Wrap TALLYMESSAGE content into the standard Tally "Import Data" envelope, scoped to a company. */
export function wrapImportEnvelope(content: string, company?: string | null): string {
    const companyTag = company
        ? `\n      <REQUESTDESC>\n        <STATICVARIABLES><SVCURRENTCOMPANY>${escapeXML(company)}</SVCURRENTCOMPANY></STATICVARIABLES>\n        <REPORTNAME>All Masters</REPORTNAME>\n      </REQUESTDESC>`
        : `\n      <REQUESTDESC>\n        <REPORTNAME>All Masters</REPORTNAME>\n      </REQUESTDESC>`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>${companyTag}
      <REQUESTDATA>
${content}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

// ── Voucher-type mapping (GL entry_type -> Tally voucher type) ───────────────
// Sales / Receipt / Payment / Journal / Contra are all supported.
export function tallyVoucherType(entryType: string | null | undefined, overrideMap?: Record<string, string> | null): string {
    let t: string;
    switch (entryType) {
        case 'Invoice':
            t = 'Sales';
            break;
        case 'Payment': // patient payment received
        case 'Deposit': // advance received
            t = 'Receipt';
            break;
        case 'Refund': // money paid out
        case 'Expense':
            t = 'Payment';
            break;
        case 'Contra':
            t = 'Contra';
            break;
        default: // Adjustment | Opening | Closing | Depreciation | Manual
            t = 'Journal';
    }
    // Org override: map our default Tally voucher-type name → the company's custom name.
    return (overrideMap && overrideMap[t]) || t;
}

// ── Per-entity XML builders ─────────────────────────────────────────────────

// Receivable control ledgers use Tally bill-wise tracking.
const BILLWISE_CODES = new Set(['1130', '1140', '1150']);

/** Build a single LEDGER master from a GL_Account row. */
export function buildLedgerXml(
    account: { account_code?: string | null; account_name: string; account_type: string; tally_ledger_name?: string | null; tally_group?: string | null; opening_balance?: any },
    company?: string | null,
): string {
    const name = account.tally_ledger_name || account.account_name;
    const group = account.tally_group || mapAccountTypeToTallyGroup(account.account_type);
    const opening = Number(account.opening_balance ?? 0);
    const billWise = BILLWISE_CODES.has(String(account.account_code || '')) || group === 'Sundry Debtors';
    const content = `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <LEDGER NAME="${escapeXML(name)}" ACTION="Create">
        <NAME>${escapeXML(name)}</NAME>
        <PARENT>${escapeXML(group)}</PARENT>
        <ISBILLWISEON>${billWise ? 'Yes' : 'No'}</ISBILLWISEON>
        <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
        <OPENINGBALANCE>${opening}</OPENINGBALANCE>
      </LEDGER>
    </TALLYMESSAGE>`;
    return wrapImportEnvelope(content, company);
}

/** Build a single VOUCHER from a GL_JournalEntry (+ lines + account). */
export function buildVoucherXml(
    journal: {
        journal_number: string;
        entry_date: Date;
        entry_type?: string | null;
        narration?: string | null;
        reference_number?: string | null;
        lines: Array<{ debit_amount: any; credit_amount: any; bill_reference?: string | null; bill_alloc_type?: string | null; account: { account_name: string; tally_ledger_name?: string | null } }>;
    },
    company?: string | null,
    voucherTypeOverride?: Record<string, string> | null,
): { xml: string; voucherType: string } {
    const voucherType = tallyVoucherType(journal.entry_type, voucherTypeOverride);
    const lines = journal.lines
        .map((line) => {
            const debit = Number(line.debit_amount ?? 0);
            const credit = Number(line.credit_amount ?? 0);
            const isDebit = debit > 0;
            const amount = isDebit ? debit : credit;
            const tallyAmount = isDebit ? -amount : amount; // Tally: debit negative
            // Bill-wise allocation for receivable lines (so Tally tracks aging per invoice).
            const billAlloc = line.bill_reference
                ? `
          <BILLALLOCATIONS.LIST>
            <NAME>${escapeXML(line.bill_reference)}</NAME>
            <BILLTYPE>${escapeXML(line.bill_alloc_type || 'New Ref')}</BILLTYPE>
            <AMOUNT>${tallyAmount}</AMOUNT>
          </BILLALLOCATIONS.LIST>`
                : '';
            return `        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXML(line.account.tally_ledger_name || line.account.account_name)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
          <AMOUNT>${tallyAmount}</AMOUNT>${billAlloc}
        </ALLLEDGERENTRIES.LIST>`;
        })
        .join('\n');

    const content = `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="${escapeXML(voucherType)}" ACTION="Create">
        <DATE>${formatTallyDate(journal.entry_date)}</DATE>
        <VOUCHERNUMBER>${escapeXML(journal.journal_number)}</VOUCHERNUMBER>
        <VOUCHERTYPENAME>${escapeXML(voucherType)}</VOUCHERTYPENAME>
        <NARRATION>${escapeXML(journal.narration || '')}</NARRATION>
        <REFERENCE>${escapeXML(journal.reference_number || '')}</REFERENCE>
${lines}
      </VOUCHER>
    </TALLYMESSAGE>`;
    return { xml: wrapImportEnvelope(content, company), voucherType };
}

/** A read-only "List of VoucherTypes" export — used to validate that the required
 *  voucher types (Sales/Receipt/Payment/Journal/Contra) exist in the company. */
export function buildVoucherTypeProbeXml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>List of VoucherTypes</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

/** A read-only "List of Companies" export request — used to probe connectivity. */
export function buildConnectionProbeXml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>List of Companies</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

// ── Response parsing + error mapping ────────────────────────────────────────

function intTag(xml: string, tag: string): number {
    const m = xml.match(new RegExp(`<${tag}>\\s*(-?\\d+)\\s*</${tag}>`, 'i'));
    return m ? parseInt(m[1], 10) : 0;
}

function classifyTallyError(text: string): { code: TallyPostResult['code']; message: string } {
    const lc = text.toLowerCase();
    if (lc.includes('already exist') || lc.includes('duplicate')) {
        return { code: 'duplicate', message: 'Tally reports this ledger/voucher already exists (duplicate).' };
    }
    if (lc.includes('does not exist') || lc.includes('unknown company') || lc.includes('no company') || lc.includes('select company')) {
        return { code: 'invalid_company', message: 'Invalid or unopened Tally company. Open the configured company in Tally.' };
    }
    if (lc.includes('ledger') && (lc.includes('not') || lc.includes('does not exist'))) {
        return { code: 'invalid_payload', message: 'A referenced ledger does not exist in Tally. Sync ledgers first.' };
    }
    return { code: 'invalid_payload', message: text.slice(0, 400) || 'Tally rejected the payload.' };
}

/**
 * POST XML to the hospital's Tally gateway and parse the result.
 * Never throws — always returns a structured TallyPostResult.
 */
export async function postToTally(
    config: TallyConnectionConfig,
    xml: string,
    opts: { timeoutMs?: number } = {},
): Promise<TallyPostResult> {
    const url = (config.url || '').trim();
    if (!url) {
        return { ok: false, created: 0, altered: 0, errors: 1, exceptions: 0, code: 'invalid_payload', message: 'Tally Server URL is not configured.' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);
    const headers: Record<string, string> = { 'Content-Type': 'text/xml; charset=utf-8' };
    if (config.username) {
        const basic = Buffer.from(`${config.username}:${config.password ?? ''}`).toString('base64');
        headers['Authorization'] = `Basic ${basic}`;
    }

    try {
        const res = await fetch(url, { method: 'POST', headers, body: xml, signal: controller.signal });
        const raw = await res.text();

        if (!res.ok) {
            return { ok: false, httpStatus: res.status, created: 0, altered: 0, errors: 1, exceptions: 0, code: 'http_error', message: `Tally returned HTTP ${res.status}.`, raw };
        }

        const created = intTag(raw, 'CREATED');
        const altered = intTag(raw, 'ALTERED');
        const errors = intTag(raw, 'ERRORS');
        const exceptions = intTag(raw, 'EXCEPTIONS');
        const lineErr = raw.match(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/i)?.[1]?.trim();

        if (errors > 0 || exceptions > 0 || lineErr) {
            const { code, message } = classifyTallyError(lineErr || raw);
            return { ok: false, httpStatus: res.status, created, altered, errors: errors || 1, exceptions, code, message, raw };
        }

        // A probe (Export) response won't have CREATED/ALTERED — treat any 200 XML as reachable.
        return {
            ok: true,
            httpStatus: res.status,
            created,
            altered,
            errors,
            exceptions,
            code: 'success',
            message: created || altered ? `Tally accepted the request (created ${created}, altered ${altered}).` : 'Tally is reachable.',
            raw,
        };
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            return { ok: false, created: 0, altered: 0, errors: 1, exceptions: 0, code: 'timeout', message: `Tally did not respond within ${(opts.timeoutMs ?? 30000) / 1000}s. Is the Tally HTTP server running?` };
        }
        // fetch failures: ECONNREFUSED / DNS / network unreachable
        return {
            ok: false,
            created: 0,
            altered: 0,
            errors: 1,
            exceptions: 0,
            code: 'offline',
            message: `Could not reach Tally at ${url}. Ensure Tally is running with the HTTP/XML server enabled and the URL is correct. (${err?.message || 'connection failed'})`,
        };
    } finally {
        clearTimeout(timeout);
    }
}
