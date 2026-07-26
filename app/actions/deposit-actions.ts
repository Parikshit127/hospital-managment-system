'use server';

import { guardAction } from '@/app/lib/action-guard';

import { requireTenantContext, requireRoleAndTenant } from '@/backend/tenant';
import { generateDepositNumber as genDepNum } from '@/app/lib/sequence-generator';
import { postDepositToGL } from './gl-actions';
import {
    getCashThresholds,
    validateCashCompliance,
    resolveRegisteredPan,
    normalizePan,
    CASH_METHOD,
} from '@/app/lib/cash-compliance';

function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

function round2(n: number): number {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
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
    payer_pan_number?: string;
    payer_pan_name?: string;
    notes?: string;
}) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        // The deposit form takes a free-typed UHID, so normalize and validate it before
        // saving. Trim stray whitespace (a trailing tab once broke the receipt's name
        // lookup) and reject anything that isn't a real patient — invoice/deposit numbers
        // were being saved into patient_id, leaving receipts with an ID but no name.
        const patientId = (data.patient_id || '').trim();
        const admissionId = (data.admission_id || '').trim() || null;
        if (!patientId) return { success: false, error: 'Patient UHID is required' };
        const patient = await db.OPD_REG.findFirst({
            where: { patient_id: patientId, organizationId },
            select: { patient_id: true, full_name: true, pan_number: true, govt_id_type: true, govt_id_number: true },
        });
        if (!patient) {
            return { success: false, error: `No patient found with UHID "${patientId}". Enter a valid patient UHID (e.g. AVS-2026-00001).` };
        }

        // Cash compliance (Rule 1 PAN / Rule 2 limit) — a deposit is a single cash
        // receipt, so the same rules as a bill payment apply. PAN already on file from
        // registration is used automatically (no re-capture).
        const isCash = data.payment_method === CASH_METHOD;
        let effectivePan: string | null = normalizePan(data.payer_pan_number) || null;
        let effectivePanName: string | null = (data.payer_pan_name || '').trim() || null;
        if (isCash) {
            const thresholds = await getCashThresholds(db);
            const registeredPan = resolveRegisteredPan(patient);
            const compliance = validateCashCompliance({
                thresholds,
                cashTotal: Number(data.amount) || 0,
                panNumber: data.payer_pan_number,
                panName: data.payer_pan_name,
                registeredPan,
                registeredPanName: registeredPan ? patient.full_name : null,
            });
            if (!compliance.ok) {
                await db.system_audit_logs.create({
                    data: {
                        action: 'CASH_COMPLIANCE_BLOCK',
                        module: 'finance',
                        entity_type: 'deposit',
                        entity_id: patientId,
                        details: JSON.stringify({ rule: compliance.rule, cash_amount: Number(data.amount) || 0, ...thresholds }),
                        organizationId,
                    },
                }).catch(() => {});
                return { success: false, error: compliance.error };
            }
            if (compliance.effectivePan) {
                effectivePan = compliance.effectivePan;
                effectivePanName = compliance.effectivePanName || null;
            }
        }

        const deposit = await db.patientDeposit.create({
            data: {
                deposit_number: await genDepNum(organizationId, db),
                patient_id: patientId,
                admission_id: admissionId,
                amount: data.amount,
                payment_method: data.payment_method,
                payment_ref: data.payment_ref || null,
                payer_pan_number: isCash ? effectivePan : null,
                payer_pan_name: isCash ? effectivePanName : null,
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
                details: JSON.stringify({ patient_id: patientId, amount: data.amount }),
                user_id: session?.id,
                organizationId,
            },
        });

        postDepositToGL(deposit.id).catch(err =>
            console.error('Failed to post deposit to GL:', err)
        );

        return { success: true, data: serialize(deposit) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Resolve the PAN already on file for a patient (by UHID) so the deposit screen
// can skip PAN re-capture when one was provided at registration. Returns
// { found, pan } — pan is null when none is on file.
export async function getRegisteredPanForPatient(patientId: string) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const id = (patientId || '').trim();
        if (!id) return { success: true, data: { found: false, pan: null } };
        const patient = await db.OPD_REG.findFirst({
            where: { patient_id: id, organizationId },
            select: { pan_number: true, govt_id_type: true, govt_id_number: true },
        });
        if (!patient) return { success: true, data: { found: false, pan: null } };
        return { success: true, data: { found: true, pan: resolveRegisteredPan(patient) } };
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

        // Attach patient name (PatientDeposit has no relation, so resolve by patient_id)
        const patientIds = [...new Set(deposits.map((d: any) => d.patient_id))];
        const patients = patientIds.length
            ? await db.oPD_REG.findMany({
                where: { patient_id: { in: patientIds } },
                select: { patient_id: true, full_name: true },
            })
            : [];
        const nameById = new Map(patients.map((p: any) => [p.patient_id, p.full_name]));
        const enriched = deposits.map((d: any) => ({
            ...d,
            patient_name: nameById.get(d.patient_id) || null,
        }));

        return { success: true, data: serialize(enriched) };
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

// Patient's currently available (unapplied) deposit balance, oldest deposit
// first — used by the insurance-receipt screen to show what's held and, if
// the biller chooses to use it, to consume it FIFO via
// applyAvailableDepositToInvoice below. A deposit stays 'Active' until fully
// consumed (see applyDepositToInvoice), so partially-used deposits are
// already correctly included here.
export async function getPatientDepositBalance(patientId: string) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const id = (patientId || '').trim();
        if (!id) return { success: true, data: { available: 0, deposits: [] } };
        const deposits = await db.patientDeposit.findMany({
            where: { organizationId, patient_id: id, status: 'Active' },
            orderBy: { created_at: 'asc' },
            select: { id: true, deposit_number: true, amount: true, applied_amount: true, refunded_amount: true },
        });
        const rows = deposits
            .map((d: any) => ({
                id: d.id,
                deposit_number: d.deposit_number,
                available: round2(Number(d.amount) - Number(d.applied_amount) - Number(d.refunded_amount)),
            }))
            .filter((d: any) => d.available > 0.01);
        const available = round2(rows.reduce((s: number, d: any) => s + d.available, 0));
        return { success: true, data: { available, deposits: rows } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Consume up to `amount` from a patient's available deposits, oldest first,
// applying each to the invoice via applyDepositToInvoice until the amount is
// covered or the patient's deposits run out. Used at insurance-receipt time
// to actually settle the portion of a bill's disallowed gap the biller chose
// to cover from a held deposit, so the invoice's real balance drops
// immediately instead of leaving the deposit sitting unused.
export async function applyAvailableDepositToInvoice(patientId: string, invoiceId: number, amount: number) {
    try {
        const requested = round2(Number(amount) || 0);
        if (requested <= 0) return { success: true, applied: 0 };
        const balance: any = await getPatientDepositBalance(patientId);
        if (!balance?.success) return { success: false, error: balance?.error || 'Failed to load deposit balance', applied: 0 };
        let remaining = requested;
        let applied = 0;
        for (const d of balance.data.deposits) {
            if (remaining <= 0.01) break;
            const r: any = await applyDepositToInvoice(d.id, invoiceId, remaining);
            if (!r?.success) return { success: false, error: r?.error || 'Failed to apply deposit', applied };
            applied = round2(applied + Number(r.applied || 0));
            remaining = round2(remaining - Number(r.applied || 0));
        }
        return { success: true, applied };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function applyDepositToInvoice(depositId: number, invoiceId: number, amount: number) {
    const __denied = await guardAction('deposit-actions', 'applyDepositToInvoice');
    if (__denied) return __denied;
    try {
        const { db, organizationId } = await requireTenantContext();

        const deposit = await db.patientDeposit.findFirst({ where: { id: depositId } });
        if (!deposit) return { success: false, error: 'Deposit not found' };

        const available = Number(deposit.amount) - Number(deposit.applied_amount) - Number(deposit.refunded_amount);
        if (available <= 0) return { success: false, error: 'No balance available in this deposit' };

        // Apply only what's available — don't exceed deposit balance
        const applyAmount = Math.min(available, amount);

        // Create a payment on the invoice
        const receiptNum = `RCP-DEP-${Date.now()}`;
        await db.payments.create({
            data: {
                receipt_number: receiptNum,
                invoice_id: invoiceId,
                amount: applyAmount,
                payment_method: 'Deposit',
                payment_type: 'Settlement',
                status: 'Completed',
                notes: `Applied from deposit ${deposit.deposit_number}`,
                // Money was received when the deposit was collected — keep that date
                // on the receipt, not the (later) date it was applied to the bill.
                created_at: deposit.created_at,
            },
        });

        // Update deposit
        const newApplied = Number(deposit.applied_amount) + applyAmount;
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
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'APPLY_DEPOSIT',
                module: 'finance',
                entity_type: 'deposit',
                entity_id: deposit.deposit_number,
                details: JSON.stringify({ invoiceId, amount: applyAmount }),
                organizationId,
            },
        });

        return { success: true, applied: applyAmount };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function refundDeposit(depositId: number, amount: number) {
    const __denied = await guardAction('deposit-actions', 'refundDeposit');
    if (__denied) return __denied;
    try {
        const { db, organizationId } = await requireTenantContext();

        const deposit = await db.patientDeposit.findFirst({ where: { id: depositId } });
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

export async function cancelDeposit(depositId: number, reason?: string) {
    const __denied = await guardAction('deposit-actions', 'cancelDeposit');
    if (__denied) return __denied;
    try {
        const { db, organizationId, session } = await requireTenantContext();

        // Scope by org — without it one tenant could cancel another's deposit by id.
        const deposit = await db.patientDeposit.findFirst({ where: { id: depositId, organizationId } });
        if (!deposit) return { success: false, error: 'Deposit not found' };
        if (deposit.status !== 'Active') return { success: false, error: 'Only Active deposits can be cancelled' };
        if (Number(deposit.applied_amount) > 0) return { success: false, error: 'Cannot cancel — deposit has already been applied to an invoice' };
        if (!reason?.trim()) return { success: false, error: 'A cancellation reason is required.' };

        await db.patientDeposit.update({
            where: { id: depositId },
            data: {
                status: 'Cancelled',
                cancelled_reason: reason.trim(),
                cancelled_by: session?.username ?? null,
                cancelled_at: new Date(),
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'CANCEL_DEPOSIT',
                module: 'finance',
                entity_type: 'deposit',
                entity_id: deposit.deposit_number,
                details: JSON.stringify({
                    reason: reason.trim(),
                    amount: Number(deposit.amount),
                    payment_method: deposit.payment_method,
                    patient_id: deposit.patient_id,
                }),
                user_id: session?.id,
                username: session?.username,
                organizationId,
            },
        });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Correct a deposit that was entered wrongly (wrong amount, mode, reference,
 * note, or date). Active deposits can always be edited. A deposit that's
 * already fully Applied to one invoice can also be edited (Admin/Finance
 * only) — in that case an amount or date change is cascaded to the linked
 * "Applied from deposit" payment row(s) (and the invoice's paid_amount/
 * balance_due recalculated for amount changes), so the bill and the deposit
 * receipt never go out of sync. Partially-applied or partly-refunded
 * deposits are not supported here — those must be reversed through
 * Apply/Refund first, since the split across ledgers is ambiguous.
 */
export async function updateDeposit(
    depositId: number,
    updates: { amount?: number; payment_method?: string; payment_ref?: string | null; notes?: string | null; created_at?: string },
    reason: string,
) {
    const __denied = await guardAction('deposit-actions', 'updateDeposit');
    if (__denied) return __denied;
    try {
        // Correcting a deposit after the fact is an Admin/Finance action — the
        // front desk collects deposits but shouldn't be able to alter them post-hoc.
        const { db, organizationId, session } = await requireRoleAndTenant(['admin', 'finance', 'superadmin']);

        if (!reason?.trim()) return { success: false, error: 'A reason for the correction is required.' };

        const deposit = await db.patientDeposit.findFirst({ where: { id: depositId, organizationId } });
        if (!deposit) return { success: false, error: 'Deposit not found' };
        if (!['Active', 'Applied'].includes(deposit.status)) {
            return { success: false, error: `Only Active or Applied deposits can be edited — this one is ${deposit.status}.` };
        }
        if (Number(deposit.refunded_amount) > 0) {
            return { success: false, error: 'Cannot edit — deposit has already been partly refunded.' };
        }
        const isFullyApplied = deposit.status === 'Applied';
        if (isFullyApplied && Number(deposit.applied_amount) !== Number(deposit.amount)) {
            return { success: false, error: 'Cannot edit — this deposit is only partially applied. Reverse the application first.' };
        }

        const data: any = {};
        let newAmount: number | undefined;
        if (typeof updates.amount !== 'undefined') {
            const amt = Number(updates.amount);
            if (!Number.isFinite(amt) || amt <= 0) return { success: false, error: 'Amount must be greater than zero.' };
            newAmount = amt;
            data.amount = amt;
        }
        if (typeof updates.payment_method !== 'undefined' && updates.payment_method) {
            data.payment_method = updates.payment_method;
        }
        if (typeof updates.payment_ref !== 'undefined') data.payment_ref = updates.payment_ref || null;
        if (typeof updates.notes !== 'undefined') data.notes = updates.notes || null;

        let newDate: Date | undefined;
        if (typeof updates.created_at !== 'undefined' && updates.created_at) {
            const d = new Date(updates.created_at);
            if (Number.isNaN(d.getTime())) return { success: false, error: 'Invalid deposit date.' };
            if (d.getTime() > Date.now()) return { success: false, error: 'Deposit date cannot be in the future.' };
            newDate = d;
            data.created_at = d;
        }

        if (Object.keys(data).length === 0) return { success: false, error: 'Nothing to update.' };

        const amountChanged = typeof newAmount !== 'undefined' && newAmount !== Number(deposit.amount);
        const dateChanged = typeof newDate !== 'undefined' && newDate.getTime() !== new Date(deposit.created_at).getTime();
        const invoiceId = deposit.applied_to_invoice;

        // Cascade the amount/date change onto the payment row(s) this application
        // created, and re-derive the invoice's paid/balance — otherwise the bill
        // and the "applied deposit" receipt would silently disagree. (The payment's
        // created_at is deliberately kept in step with the deposit's — see the
        // comment in applyDepositToInvoice: money was received on the deposit date,
        // not the later date it was applied to the bill.)
        if (isFullyApplied && (amountChanged || dateChanged) && invoiceId) {
            if (amountChanged) data.applied_amount = newAmount;

            const linkedPayments = await db.payments.findMany({
                where: {
                    invoice_id: invoiceId,
                    payment_method: 'Deposit',
                    notes: { contains: `Applied from deposit ${deposit.deposit_number}` },
                },
            });

            if (linkedPayments.length > 0) {
                const oldSum = linkedPayments.reduce((s: number, p: any) => s + Number(p.amount), 0);
                let allocated = 0;
                for (let i = 0; i < linkedPayments.length; i++) {
                    const p = linkedPayments[i];
                    const isLast = i === linkedPayments.length - 1;
                    const share = amountChanged
                        ? (isLast
                            ? Math.round((newAmount! - allocated) * 100) / 100
                            : Math.round((newAmount! * (Number(p.amount) / oldSum)) * 100) / 100)
                        : Number(p.amount);
                    if (amountChanged) allocated += share;
                    await db.payments.update({
                        where: { id: p.id },
                        data: {
                            ...(amountChanged ? { amount: share } : {}),
                            ...(dateChanged ? { created_at: newDate } : {}),
                        },
                    });
                }
            }

            const allPayments = await db.payments.findMany({ where: { invoice_id: invoiceId, status: 'Completed' } });
            const totalPaid = allPayments.reduce((s: number, p: any) => s + Number(p.amount), 0);
            const invoice = await db.invoices.findUnique({ where: { id: invoiceId } });
            const netAmount = Number(invoice?.net_amount || 0);
            const balance = netAmount - totalPaid;
            await db.invoices.update({
                where: { id: invoiceId },
                data: { paid_amount: totalPaid, balance_due: balance > 0 ? balance : 0 },
            });
        }

        const updated = await db.patientDeposit.update({ where: { id: depositId }, data });

        // Record the before/after so the Edit/Cancel audit report can show what
        // actually changed, not just that something did.
        await db.system_audit_logs.create({
            data: {
                action: 'UPDATE_DEPOSIT',
                module: 'finance',
                entity_type: 'deposit',
                entity_id: deposit.deposit_number,
                details: JSON.stringify({
                    reason: reason.trim(),
                    before: {
                        amount: Number(deposit.amount),
                        payment_method: deposit.payment_method,
                        payment_ref: deposit.payment_ref,
                        created_at: deposit.created_at,
                    },
                    after: {
                        amount: Number(updated.amount),
                        payment_method: updated.payment_method,
                        payment_ref: updated.payment_ref,
                        created_at: updated.created_at,
                    },
                    cascaded_to_invoice: isFullyApplied && (amountChanged || dateChanged) ? invoiceId : undefined,
                }),
                user_id: session?.id,
                username: session?.username,
                organizationId,
            },
        });

        return { success: true, data: serialize(updated) };
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
    const __denied = await guardAction('deposit-actions', 'createCreditNote');
    if (__denied) return __denied;
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

function decToNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof (value as any)?.toNumber === 'function') {
    return Number((value as any).toNumber());
  }
  return Number(value) || 0;
}

export async function approveCreditNote(id: number) {
    const __denied = await guardAction('deposit-actions', 'approveCreditNote');
    if (__denied) return __denied;
    try {
        const { db, session, organizationId } = await requireTenantContext();
        
        const result = await db.$transaction(async (tx: any) => {
            const cn = await tx.creditNote.findUnique({
                where: { id },
            });
            if (!cn) throw new Error('Credit note not found');
            if (cn.status !== 'Draft') throw new Error(`Cannot approve credit note in status ${cn.status}`);

            const amount = decToNum(cn.total_amount);

            // Fetch original invoice
            const invoice = await tx.invoices.findUnique({
                where: { id: cn.original_invoice_id },
            });
            if (!invoice) throw new Error('Original invoice not found');

            // Calculate GST proportionally
            const invoiceTotal = decToNum(invoice.total_amount);
            const invoiceCgst = decToNum(invoice.cgst_amount);
            const invoiceSgst = decToNum(invoice.sgst_amount);
            const invoiceIgst = decToNum(invoice.igst_amount);
            const invoiceGst = invoiceCgst + invoiceSgst + invoiceIgst;
            const invoiceTaxable = invoiceTotal - invoiceGst;

            let cnTaxable = amount;
            let cnCgst = 0;
            let cnSgst = 0;
            let cnIgst = 0;

            if (invoiceTotal > 0) {
                const ratio = amount / invoiceTotal;
                cnTaxable = ratio * invoiceTaxable;
                cnCgst = ratio * invoiceCgst;
                cnSgst = ratio * invoiceSgst;
                cnIgst = ratio * invoiceIgst;
            }

            // Find GL accounts
            const [receivableAccount, revenueAccount, cgstAccount, sgstAccount, igstAccount] = await Promise.all([
                tx.gL_Account.findFirst({ where: { organizationId, account_code: '1130', is_active: true } }),
                tx.gL_Account.findFirst({ where: { organizationId, account_code: '6000', is_active: true } }),
                tx.gL_Account.findFirst({ where: { organizationId, account_code: '3120', is_active: true } }),
                tx.gL_Account.findFirst({ where: { organizationId, account_code: '3121', is_active: true } }),
                tx.gL_Account.findFirst({ where: { organizationId, account_code: '3122', is_active: true } }),
            ]);

            if (!receivableAccount || !revenueAccount) {
                throw new Error('Required receivable (1130) or revenue (6000) GL accounts not found. Ensure Chart of Accounts is seeded.');
            }

            // Update credit note status to Applied (approve + apply in one step)
            const updatedCn = await tx.creditNote.update({
                where: { id },
                data: { status: 'Applied', approved_by: session.username },
            });

            // Update original invoice balance
            const newBalance = Math.max(0, decToNum(invoice.balance_due) - amount);
            const isFullyPaid = newBalance <= 0.01;
            await tx.invoices.update({
                where: { id: cn.original_invoice_id },
                data: {
                    balance_due: newBalance,
                },
            });

            // Generate unique journal number
            const year = new Date().getFullYear();
            const prefix = `JV-CN-${year}-`;
            const count = await tx.gL_JournalEntry.count({
                where: { organizationId, journal_number: { startsWith: prefix } },
            });
            const journalNumber = `${prefix}${String(count + 1).padStart(4, "0")}`;

            // Create Journal Lines list
            const journalLines = [];
            let lineNum = 1;

            // 1. DR: Revenue Account (Taxable component)
            if (cnTaxable > 0) {
                journalLines.push({
                    organizationId,
                    line_number: lineNum++,
                    account_id: revenueAccount.id,
                    debit_amount: cnTaxable,
                    credit_amount: 0,
                    description: `Credit Note - Revenue Reversal`,
                });
            }

            // 2. DR: CGST Account
            if (cnCgst > 0 && cgstAccount) {
                journalLines.push({
                    organizationId,
                    line_number: lineNum++,
                    account_id: cgstAccount.id,
                    debit_amount: cnCgst,
                    credit_amount: 0,
                    description: `Credit Note - CGST Reversal`,
                });
            }

            // 3. DR: SGST Account
            if (cnSgst > 0 && sgstAccount) {
                journalLines.push({
                    organizationId,
                    line_number: lineNum++,
                    account_id: sgstAccount.id,
                    debit_amount: cnSgst,
                    credit_amount: 0,
                    description: `Credit Note - SGST Reversal`,
                });
            }

            // 4. DR: IGST Account
            if (cnIgst > 0 && igstAccount) {
                journalLines.push({
                    organizationId,
                    line_number: lineNum++,
                    account_id: igstAccount.id,
                    debit_amount: cnIgst,
                    credit_amount: 0,
                    description: `Credit Note - IGST Reversal`,
                });
            }

            // 5. CR: Receivable Account (Total credit note amount)
            journalLines.push({
                organizationId,
                line_number: lineNum++,
                account_id: receivableAccount.id,
                debit_amount: 0,
                credit_amount: amount,
                description: `Receivable adjustment via credit note`,
            });

            // Create GL Journal Entry
            await tx.gL_JournalEntry.create({
                data: {
                    organizationId,
                    journal_number: journalNumber,
                    entry_date: new Date(),
                    entry_type: 'Adjustment',
                    reference_type: 'CreditNote',
                    reference_id: String(cn.id),
                    reference_number: cn.credit_note_number,
                    narration: `Credit Note ${cn.credit_note_number} approved — ${cn.reason}`,
                    total_debit: amount,
                    total_credit: amount,
                    status: 'Posted',
                    created_by: session.username ?? null,
                    lines: {
                        create: journalLines,
                    },
                },
            });

            // Update GL Account balances
            for (const line of journalLines) {
                const isDebitLine = line.debit_amount > 0;
                const lineAmount = isDebitLine ? line.debit_amount : line.credit_amount;
                const glAcc = await tx.gL_Account.findUnique({ where: { id: line.account_id } });
                if (glAcc) {
                    const balanceChange = glAcc.normal_balance === 'Debit'
                        ? (isDebitLine ? lineAmount : -lineAmount)
                        : (isDebitLine ? -lineAmount : lineAmount);
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

            return updatedCn;
        });

        return { success: true, data: serialize(result) };
    } catch (error: any) {
        console.error('approveCreditNote error:', error);
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
