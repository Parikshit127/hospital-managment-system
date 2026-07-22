/**
 * Centralized sequential number generator for invoices, receipts, deposits, etc.
 *
 * Format: {ORG_CODE}/{TYPE}/{FY}/{ sequential number }
 * Examples:
 *   AXT/OPD/26-27/001   — Axten OPD invoice
 *   AXT/IPD/26-27/002   — Axten IPD invoice
 *   AXT/RCP/26-27/001   — Axten receipt
 *   AXT/DEP/26-27/001   — Axten deposit
 *   AXT/PHM/26-27/001   — Axten pharmacy invoice
 *   AVS/OPD/26-27/001   — Avise OPD invoice
 */

import { prisma } from '@/backend/db';

// Get financial year string (e.g., "26-27" for April 2026 - March 2027)
function getFinancialYear(date: Date = new Date()): string {
    const month = date.getMonth(); // 0-indexed (0=Jan, 3=Apr)
    const year = date.getFullYear();
    // FY starts in April
    const fyStart = month >= 3 ? year : year - 1;
    const fyEnd = fyStart + 1;
    return `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;
}

// Get FY start date for querying
function getFYStartDate(date: Date = new Date()): Date {
    const month = date.getMonth();
    const year = date.getFullYear();
    const fyStartYear = month >= 3 ? year : year - 1;
    return new Date(fyStartYear, 3, 1); // April 1st
}

export type NumberType = 'OPD' | 'IPD' | 'RCP' | 'DEP' | 'PHM' | 'CN' | 'EXP' | 'CLM' | 'WO' | 'REF' | 'IRC' | 'BILL' | 'IND' | 'DRI' | 'CNI';

/**
 * Generate a sequential number for the given org and type.
 * Thread-safe via DB count-based approach.
 *
 * @param organizationId - The org UUID
 * @param type - OPD, IPD, RCP, DEP, PHM, CN, EXP, CLM, WO, REF
 * @param invoiceType - Optional: used to determine OPD vs IPD from invoice_type field
 * @returns e.g. "AXT/OPD/26-27/001"
 */
export async function generateSequentialNumber(
    organizationId: string,
    type: NumberType,
    db?: any
): Promise<string> {
    const database = db || prisma;

    // Get org code
    const org = await database.organization.findUnique({
        where: { id: organizationId },
        select: { code: true },
    });
    const orgCode = org?.code || 'HOS';

    const fy = getFinancialYear();
    const fyStart = getFYStartDate();
    const prefix = `${orgCode}-${type}-${fy}-`;

    // Count existing records with this prefix pattern
    let lastSeq = 0;

    if (type === 'OPD' || type === 'IPD') {
        // Count all invoices with this prefix — count is atomic unlike findFirst+increment
        const count = await database.invoices.count({
            where: {
                organizationId,
                invoice_number: { startsWith: prefix },
            },
        });
        lastSeq = count;
    } else if (type === 'RCP') {
        const count = await database.payments.count({
            where: {
                organizationId,
                receipt_number: { startsWith: prefix },
            },
        });
        lastSeq = count;
    } else if (type === 'DEP') {
        const count = await database.patientDeposit.count({
            where: {
                organizationId,
                deposit_number: { startsWith: prefix },
            },
        });
        lastSeq = count;
    } else if (type === 'PHM') {
        const count = await database.invoices.count({
            where: {
                organizationId,
                invoice_number: { startsWith: prefix },
            },
        });
        lastSeq = count;
    } else if (type === 'CN') {
        const count = await database.creditNote.count({
            where: {
                organizationId,
                credit_note_number: { startsWith: prefix },
            },
        });
        lastSeq = count;
    } else if (type === 'IRC') {
        const count = await database.insuranceReceipt.count({
            where: {
                organizationId,
                receipt_number: { startsWith: prefix },
            },
        });
        lastSeq = count;
    } else if (type === 'BILL') {
        // Final Bill Number — assigned only when a bill is finalized.
        const count = await database.invoices.count({
            where: {
                organizationId,
                final_bill_number: { startsWith: prefix },
            },
        });
        lastSeq = count;
    } else if (type === 'IND') {
        // Pharmacy / nursing indent requisition number.
        const count = await database.pharmacy_orders.count({
            where: {
                organizationId,
                indent_number: { startsWith: prefix },
            },
        });
        lastSeq = count;
    } else if (type === 'CNI') {
        // Consultant / referrer payout invoice number.
        const count = await database.referralPayoutStatement.count({
            where: {
                organizationId,
                statement_number: { startsWith: prefix },
            },
        });
        lastSeq = count;
    } else if (type === 'DRI') {
        // Doctor payout invoice / statement number.
        const count = await database.doctorPayoutStatement.count({
            where: {
                organizationId,
                statement_number: { startsWith: prefix },
            },
        });
        lastSeq = count;
    } else {
        const count = await database.invoices.count({
            where: {
                organizationId,
                invoice_number: { startsWith: prefix },
            },
        });
        lastSeq = count;
    }

    const nextSeq = String(lastSeq + 1).padStart(3, '0');
    const candidate = `${prefix}${nextSeq}`;

    // Verify uniqueness — if collision, keep incrementing
    let finalNumber = candidate;
    let attempt = lastSeq + 1;
    while (true) {
        const field = type === 'RCP' ? 'receipt_number' : type === 'DEP' ? 'deposit_number' : type === 'CN' ? 'credit_note_number' : type === 'IRC' ? 'receipt_number' : type === 'BILL' ? 'final_bill_number' : type === 'IND' ? 'indent_number' : type === 'DRI' || type === 'CNI' ? 'statement_number' : 'invoice_number';
        const table = type === 'RCP' ? database.payments : type === 'DEP' ? database.patientDeposit : type === 'CN' ? database.creditNote : type === 'IRC' ? database.insuranceReceipt : type === 'IND' ? database.pharmacy_orders : type === 'DRI' ? database.doctorPayoutStatement : type === 'CNI' ? database.referralPayoutStatement : database.invoices;
        const existing = await table.findFirst({
            where: { [field]: finalNumber },
            select: { id: true },
        });
        if (!existing) break;
        attempt++;
        finalNumber = `${prefix}${String(attempt).padStart(3, '0')}`;
    }
    return finalNumber;
}

/**
 * Determine invoice type code from invoice_type field
 */
export function getInvoiceTypeCode(invoiceType: string, hasAdmission: boolean = false): NumberType {
    const t = (invoiceType || '').toLowerCase();
    if (t.includes('ipd') || t.includes('discharge') || hasAdmission) return 'IPD';
    if (t.includes('pharm')) return 'PHM';
    return 'OPD';
}

/**
 * Generate invoice number with auto-detection of OPD/IPD
 */
export async function generateInvoiceNumber(
    organizationId: string,
    invoiceType: string,
    hasAdmission: boolean = false,
    db?: any
): Promise<string> {
    const typeCode = getInvoiceTypeCode(invoiceType, hasAdmission);
    return generateSequentialNumber(organizationId, typeCode, db);
}

/**
 * Generate the official Final Bill Number, with SEPARATE series for IPD and OPD.
 *   IPD -> {ORG}-BILL-IPD-{FY}-001
 *   OPD -> {ORG}-BILL-OPD-{FY}-001
 * Assigned only at finalization; counts existing final_bill_numbers for that series.
 */
export async function generateFinalBillNumber(
    organizationId: string,
    isIpd: boolean,
    db?: any
): Promise<string> {
    const database = db || prisma;
    const org = await database.organization.findUnique({
        where: { id: organizationId },
        select: { code: true },
    });
    const orgCode = org?.code || 'HOS';
    const fy = getFinancialYear();
    const prefix = `${orgCode}-BILL-${isIpd ? 'IPD' : 'OPD'}-${fy}-`;

    const count = await database.invoices.count({
        where: { organizationId, final_bill_number: { startsWith: prefix } },
    });

    let attempt = count + 1;
    let finalNumber = `${prefix}${String(attempt).padStart(3, '0')}`;
    while (true) {
        const existing = await database.invoices.findFirst({
            where: { final_bill_number: finalNumber },
            select: { id: true },
        });
        if (!existing) break;
        attempt++;
        finalNumber = `${prefix}${String(attempt).padStart(3, '0')}`;
    }
    return finalNumber;
}

/**
 * Generate receipt number
 */
export async function generateReceiptNumber(organizationId: string, db?: any): Promise<string> {
    return generateSequentialNumber(organizationId, 'RCP', db);
}

/**
 * generateSequentialNumber() picks the next number via count+existence-check,
 * not a DB-level atomic increment. Two concurrent callers (e.g. two cashiers
 * recording payments, or a double-submitted click) can both pass the
 * existence check for the same candidate before either has committed, then
 * race to insert — the loser hits a Prisma P2002 unique constraint error.
 * Wrap the generate+create in this retry so the loser just regenerates a
 * fresh number and tries again instead of surfacing the race to the user.
 */
export async function createWithUniqueRetry<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            if (err?.code === 'P2002' && attempt < maxAttempts) continue;
            throw err;
        }
    }
    // Unreachable: loop either returns or throws on its final attempt.
    throw new Error('createWithUniqueRetry: exhausted attempts');
}

/**
 * Generate deposit receipt number
 */
export async function generateDepositNumber(organizationId: string, db?: any): Promise<string> {
    return generateSequentialNumber(organizationId, 'DEP', db);
}

/** Doctor payout invoice number, e.g. AVS-DRI-26-27-001. */
export async function generateDoctorInvoiceNumber(organizationId: string, db?: any): Promise<string> {
    return generateSequentialNumber(organizationId, 'DRI', db);
}

/** Consultant / referrer payout invoice number, e.g. AVS-CNI-26-27-001. */
export async function generateConsultantInvoiceNumber(organizationId: string, db?: any): Promise<string> {
    return generateSequentialNumber(organizationId, 'CNI', db);
}

export async function generateIndentNumber(organizationId: string, db?: any): Promise<string> {
    return generateSequentialNumber(organizationId, 'IND', db);
}
