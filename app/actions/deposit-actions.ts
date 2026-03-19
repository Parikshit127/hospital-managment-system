'use server';

import { requireTenantContext } from '@/backend/tenant';

function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

function generateDepositNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `DEP-${dateStr}-${seq}`;
}

function generateCreditNoteNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `CN-${dateStr}-${seq}`;
}

// ============================================
// DEPOSITS / ADVANCES
// ============================================

export async function collectDeposit(data: {
    patient_id: string;
    admission_id?: string;
    amount: number;
    payment_method: string;
    payment_ref?: string;
    notes?: string;
}) {
    try {
        const { db, session, organizationId } = await requireTenantContext();
        const deposit = await db.patientDeposit.create({
            data: {
                deposit_number: generateDepositNumber(),
                patient_id: data.patient_id,
                admission_id: data.admission_id || null,
                amount: data.amount,
                payment_method: data.payment_method,
                payment_ref: data.payment_ref || null,
                collected_by: session.username,
                notes: data.notes || null,
                status: 'Active',
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'COLLECT_DEPOSIT',
                module: 'finance',
                entity_type: 'deposit',
                entity_id: deposit.deposit_number,
                details: JSON.stringify({ patient_id: data.patient_id, amount: data.amount }),
                organizationId,
            },
        });

        return { success: true, data: serialize(deposit) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getPatientDeposits(patientId?: string) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {};
        if (patientId) where.patient_id = patientId;
        const deposits = await db.patientDeposit.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: 200,
        });
        return { success: true, data: serialize(deposits) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getActiveDeposits() {
    try {
        const { db } = await requireTenantContext();
        const deposits = await db.patientDeposit.findMany({
            where: { status: 'Active' },
            orderBy: { created_at: 'desc' },
        });
        return { success: true, data: serialize(deposits) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function applyDepositToInvoice(depositId: number, invoiceId: number, amount: number) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const deposit = await db.patientDeposit.findUnique({ where: { id: depositId } });
        if (!deposit) return { success: false, error: 'Deposit not found' };

        const available = Number(deposit.amount) - Number(deposit.applied_amount) - Number(deposit.refunded_amount);
        if (amount > available) return { success: false, error: `Only ${available} available to apply` };

        // Create a payment on the invoice
        const receiptNum = `RCP-DEP-${Date.now()}`;
        await db.payments.create({
            data: {
                receipt_number: receiptNum,
                invoice_id: invoiceId,
                amount,
                payment_method: 'Deposit',
                payment_type: 'Settlement',
                status: 'Completed',
                notes: `Applied from deposit ${deposit.deposit_number}`,
            },
        });

        // Update deposit
        const newApplied = Number(deposit.applied_amount) + amount;
        const newStatus = newApplied >= Number(deposit.amount) ? 'Applied' : 'Active';
        await db.patientDeposit.update({
            where: { id: depositId },
            data: { applied_to_invoice: invoiceId, applied_amount: newApplied, status: newStatus },
        });

        // Recalculate invoice
        const allPayments = await db.payments.findMany({ where: { invoice_id: invoiceId, status: 'Completed' } });
        const totalPaid = allPayments.reduce((s: number, p: any) => s + Number(p.amount), 0);
        const invoice = await db.invoices.findUnique({ where: { id: invoiceId } });
        const netAmount = Number(invoice?.net_amount || 0);
        const balance = netAmount - totalPaid;

        await db.invoices.update({
            where: { id: invoiceId },
            data: {
                paid_amount: totalPaid,
                balance_due: balance > 0 ? balance : 0,
                status: balance <= 0 ? 'Paid' : totalPaid > 0 ? 'Partial' : invoice?.status,
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'APPLY_DEPOSIT',
                module: 'finance',
                entity_type: 'deposit',
                entity_id: deposit.deposit_number,
                details: JSON.stringify({ invoiceId, amount }),
                organizationId,
            },
        });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function refundDeposit(depositId: number, amount: number) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const deposit = await db.patientDeposit.findUnique({ where: { id: depositId } });
        if (!deposit) return { success: false, error: 'Deposit not found' };

        const available = Number(deposit.amount) - Number(deposit.applied_amount) - Number(deposit.refunded_amount);
        if (amount > available) return { success: false, error: `Only ${available} available to refund` };

        const newRefunded = Number(deposit.refunded_amount) + amount;
        const totalUsed = Number(deposit.applied_amount) + newRefunded;
        const newStatus = totalUsed >= Number(deposit.amount) ? 'Refunded' : 'Active';

        await db.patientDeposit.update({
            where: { id: depositId },
            data: { refunded_amount: newRefunded, status: newStatus },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'REFUND_DEPOSIT',
                module: 'finance',
                entity_type: 'deposit',
                entity_id: deposit.deposit_number,
                details: JSON.stringify({ amount }),
                organizationId,
            },
        });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getDepositStats() {
    try {
        const { db } = await requireTenantContext();
        const [activeDeposits, totalCollected, totalApplied, totalRefunded] = await Promise.all([
            db.patientDeposit.count({ where: { status: 'Active' } }),
            db.patientDeposit.aggregate({ _sum: { amount: true } }),
            db.patientDeposit.aggregate({ _sum: { applied_amount: true } }),
            db.patientDeposit.aggregate({ _sum: { refunded_amount: true } }),
        ]);
        return {
            success: true,
            data: {
                activeDeposits,
                totalCollected: Number(totalCollected._sum.amount || 0),
                totalApplied: Number(totalApplied._sum.applied_amount || 0),
                totalRefunded: Number(totalRefunded._sum.refunded_amount || 0),
                activeBalance: Number(totalCollected._sum.amount || 0) - Number(totalApplied._sum.applied_amount || 0) - Number(totalRefunded._sum.refunded_amount || 0),
            },
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ============================================
// CREDIT NOTES
// ============================================

export async function createCreditNote(data: {
    original_invoice_id: number;
    reason: string;
    items?: string;
    total_amount: number;
    notes?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const cn = await db.creditNote.create({
            data: {
                credit_note_number: generateCreditNoteNumber(),
                original_invoice_id: data.original_invoice_id,
                reason: data.reason,
                items: data.items || null,
                total_amount: data.total_amount,
                notes: data.notes || null,
                status: 'Draft',
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'CREATE_CREDIT_NOTE',
                module: 'finance',
                entity_type: 'credit_note',
                entity_id: cn.credit_note_number,
                details: JSON.stringify({ invoice_id: data.original_invoice_id, amount: data.total_amount }),
                organizationId,
            },
        });

        return { success: true, data: serialize(cn) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function approveCreditNote(id: number) {
    try {
        const { db, session } = await requireTenantContext();
        const cn = await db.creditNote.update({
            where: { id },
            data: { status: 'Approved', approved_by: session.username },
        });
        return { success: true, data: serialize(cn) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getCreditNotes(filters?: { status?: string }) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {};
        if (filters?.status) where.status = filters.status;
        const notes = await db.creditNote.findMany({
            where,
            include: {
                original_invoice: { select: { invoice_number: true, patient_id: true, net_amount: true } },
            },
            orderBy: { created_at: 'desc' },
            take: 100,
        });
        return { success: true, data: serialize(notes) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
