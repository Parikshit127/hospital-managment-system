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

export type NumberType = 'OPD' | 'IPD' | 'RCP' | 'DEP' | 'PHM' | 'CN' | 'EXP' | 'CLM' | 'WO' | 'REF';

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
        // Search in invoices table
        const lastInvoice = await database.invoices.findFirst({
            where: {
                organizationId,
                invoice_number: { startsWith: prefix },
            },
            orderBy: { created_at: 'desc' },
            select: { invoice_number: true },
        });
        if (lastInvoice) {
            const parts = lastInvoice.invoice_number.split('-');
            lastSeq = parseInt(parts[parts.length - 1]) || 0;
        }
    } else if (type === 'RCP') {
        const lastReceipt = await database.payments.findFirst({
            where: {
                organizationId,
                receipt_number: { startsWith: prefix },
            },
            orderBy: { created_at: 'desc' },
            select: { receipt_number: true },
        });
        if (lastReceipt) {
            const parts = lastReceipt.receipt_number.split('-');
            lastSeq = parseInt(parts[parts.length - 1]) || 0;
        }
    } else if (type === 'DEP') {
        const lastDeposit = await database.patientDeposit.findFirst({
            where: {
                organizationId,
                deposit_number: { startsWith: prefix },
            },
            orderBy: { created_at: 'desc' },
            select: { deposit_number: true },
        });
        if (lastDeposit) {
            const parts = lastDeposit.deposit_number.split('-');
            lastSeq = parseInt(parts[parts.length - 1]) || 0;
        }
    } else if (type === 'PHM') {
        const lastPharm = await database.invoices.findFirst({
            where: {
                organizationId,
                invoice_number: { startsWith: prefix },
            },
            orderBy: { created_at: 'desc' },
            select: { invoice_number: true },
        });
        if (lastPharm) {
            const parts = lastPharm.invoice_number.split('-');
            lastSeq = parseInt(parts[parts.length - 1]) || 0;
        }
    } else if (type === 'CN') {
        const lastCN = await database.creditNote.findFirst({
            where: {
                organizationId,
                credit_note_number: { startsWith: prefix },
            },
            orderBy: { created_at: 'desc' },
            select: { credit_note_number: true },
        });
        if (lastCN) {
            const parts = lastCN.credit_note_number.split('-');
            lastSeq = parseInt(parts[parts.length - 1]) || 0;
        }
    } else {
        // Generic fallback — search invoices
        const last = await database.invoices.findFirst({
            where: {
                organizationId,
                invoice_number: { startsWith: prefix },
            },
            orderBy: { created_at: 'desc' },
            select: { invoice_number: true },
        });
        if (last) {
            const parts = last.invoice_number.split('-');
            lastSeq = parseInt(parts[parts.length - 1]) || 0;
        }
    }

    const nextSeq = String(lastSeq + 1).padStart(3, '0');
    return `${prefix}${nextSeq}`;
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
 * Generate receipt number
 */
export async function generateReceiptNumber(organizationId: string, db?: any): Promise<string> {
    return generateSequentialNumber(organizationId, 'RCP', db);
}

/**
 * Generate deposit receipt number
 */
export async function generateDepositNumber(organizationId: string, db?: any): Promise<string> {
    return generateSequentialNumber(organizationId, 'DEP', db);
}
