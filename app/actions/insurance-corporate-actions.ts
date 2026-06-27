'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { generateReceiptNumber as genRcpNum } from '@/app/lib/sequence-generator';

function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, v) =>
        v !== null && typeof v === 'object' && v.constructor?.name === 'Decimal' ? Number(v) : v
    ));
}

// ─────────────────────────────────────────────────────────────────────────────
// CORPORATE OUTSTANDING
// ─────────────────────────────────────────────────────────────────────────────

export async function getCorporateOutstandingFull() {
    const { db, organizationId } = await requireTenantContext();

    const corporates = await db.corporateMaster.findMany({
        where: { organizationId },
        orderBy: { company_name: 'asc' },
    });

    const result = await Promise.all(corporates.map(async (corp: any) => {
        // All payment splits for this corporate
        const splits = await db.paymentSplit.findMany({
            where: { organizationId, payer_type: 'corporate', payer_id: corp.id },
            include: {
                invoice: {
                    select: {
                        invoice_number: true,
                        created_at: true,
                        patient: { select: { full_name: true, patient_id: true } },
                    }
                }
            },
            orderBy: { created_at: 'desc' },
        });

        const totalBilled = splits.reduce((s: number, r: any) => s + Number(r.amount), 0);
        const totalReceived = splits
            .filter((r: any) => r.status === 'received')
            .reduce((s: number, r: any) => s + Number(r.amount), 0);
        const outstanding = totalBilled - totalReceived;

        return {
            id: corp.id,
            company_name: corp.company_name,
            company_code: corp.company_code,
            credit_limit: Number(corp.credit_limit),
            current_balance: Number(corp.current_balance),
            discount_percentage: Number(corp.discount_percentage),
            payment_terms_days: corp.payment_terms_days,
            is_active: corp.is_active,
            totalBilled,
            totalReceived,
            outstanding,
            splits: splits.map((s: any) => ({
                id: s.id,
                amount: Number(s.amount),
                status: s.status,
                payment_method: s.payment_method,
                payment_reference: s.payment_reference,
                created_at: s.created_at,
                invoice_number: s.invoice?.invoice_number,
                patient_name: s.invoice?.patient?.full_name,
                patient_id: s.invoice?.patient?.patient_id,
            })),
        };
    }));

    return { success: true, data: serialize(result) };
}

// Mark a corporate payment split as received
export async function receiveCorporatePayment(data: {
    split_id: number;
    payment_method: string;
    payment_reference?: string;
}) {
    const { db, organizationId } = await requireTenantContext();
    try {
        await db.paymentSplit.update({
            where: { id: data.split_id },
            data: {
                status: 'received',
                payment_method: data.payment_method,
                payment_reference: data.payment_reference || null,
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'CORPORATE_PAYMENT_RECEIVED',
                module: 'finance',
                entity_type: 'payment_split',
                entity_id: String(data.split_id),
                details: JSON.stringify(data),
                organizationId,
            },
        });

        revalidatePath('/reception/insurance');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TPA CLAIMS TRACKER
// ─────────────────────────────────────────────────────────────────────────────

export async function getTpaClaimsFullTracker() {
    const { db, organizationId } = await requireTenantContext();

    const invoices = await db.invoices.findMany({
        where: {
            organizationId,
            billing_patient_type: 'tpa_insurance',
        },
        include: {
            patient: { select: { full_name: true, patient_id: true, phone: true } },
            payment_splits: {
                where: { payer_type: 'tpa_insurance' },
            },
        },
        orderBy: { created_at: 'desc' },
        take: 200,
    });

    const data = invoices.map((inv: any) => {
        const tpaSplit = inv.payment_splits?.[0];
        return {
            id: inv.id,
            invoice_number: inv.invoice_number,
            invoice_type: inv.invoice_type,
            created_at: inv.created_at,
            net_amount: Number(inv.net_amount || inv.total_amount || 0),
            tpa_payable: Number(inv.tpa_payable || tpaSplit?.amount || 0),
            tpa_claim_status: inv.tpa_claim_status || 'not_submitted',
            tpa_claim_number: inv.tpa_claim_number || null,
            tpa_settled_amount: Number(inv.tpa_settled_amount || 0),
            split_id: tpaSplit?.id || null,
            split_status: tpaSplit?.status || 'pending',
            patient_name: inv.patient?.full_name || 'Unknown',
            patient_id: inv.patient?.patient_id || '',
            patient_phone: inv.patient?.phone || '',
        };
    });

    return { success: true, data: serialize(data) };
}

// Submit a TPA claim
export async function submitTpaClaimAction(invoiceId: number) {
    const { db, organizationId } = await requireTenantContext();
    try {
        const claimNumber = `CLM-${Date.now()}`;
        await db.invoices.update({
            where: { id: invoiceId, organizationId },
            data: {
                tpa_claim_status: 'submitted',
                tpa_claim_number: claimNumber,
            },
        });
        revalidatePath('/reception/insurance');
        return { success: true, claimNumber };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Update TPA claim status (approved / rejected / settled)
export async function updateTpaClaimAction(data: {
    invoice_id: number;
    status: string;
    settled_amount?: number;
    split_id?: number;
}) {
    // Block silent settlement overwrites — settlements must go through
    // recordTpaPaymentReceived which accumulates correctly and creates a
    // payments row + audit trail.
    if (data.status === 'settled' && data.settled_amount !== undefined) {
        return { success: false, error: 'Use recordTpaPaymentReceived for settlement' };
    }
    const { db, organizationId } = await requireTenantContext();
    try {
        await db.invoices.update({
            where: { id: data.invoice_id, organizationId },
            data: {
                tpa_claim_status: data.status,
                tpa_settled_amount: data.settled_amount ?? undefined,
            },
        });

        // If settled, mark the payment split as received
        if (data.status === 'settled' && data.split_id) {
            await db.paymentSplit.update({
                where: { id: data.split_id },
                data: { status: 'received' },
            });
        }

        revalidatePath('/reception/insurance');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Record actual TPA payment received against an invoice. Accumulates into
// tpa_settled_amount (does NOT overwrite), creates a payments row, recomputes
// invoice paid_amount/balance_due/status, and flips tpa_claim_status to
// 'settled' or 'partially_settled'. Optimistic-locked via invoices.version.
export async function recordTpaPaymentReceived(input: {
    invoice_id: number;
    expected_version: number;
    amount_received: number;
    received_date: string;
    payment_method: 'NEFT' | 'RTGS' | 'Cheque' | 'UPI' | 'Other';
    reference_number: string;
    remarks?: string;
    is_partial?: boolean;
}): Promise<{ success: boolean; payment_id?: number; error?: string }> {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        const amount = Number(input.amount_received);
        if (!Number.isFinite(amount) || amount <= 0) {
            return { success: false, error: 'amount_received must be greater than 0' };
        }
        if (!input.reference_number || !input.reference_number.trim()) {
            return { success: false, error: 'reference_number is required' };
        }
        const reference = input.reference_number.trim();
        const receivedDate = new Date(input.received_date);
        if (isNaN(receivedDate.getTime())) {
            return { success: false, error: 'Invalid received_date' };
        }

        const result = await db.$transaction(async (tx: any) => {
            // 1. Load invoice (tenant-scoped).
            const invoice = await tx.invoices.findFirst({
                where: { id: input.invoice_id, organizationId },
            });
            if (!invoice) throw new Error('Invoice not found');

            // 2. Optimistic lock.
            if (invoice.version !== input.expected_version) {
                throw new Error('Invoice was modified by another user. Please refresh and retry.');
            }

            // 3. Status must be approved or partially_settled.
            const currentStatus = invoice.tpa_claim_status;
            if (currentStatus !== 'approved' && currentStatus !== 'partially_settled') {
                throw new Error(`Cannot record TPA payment when claim status is '${currentStatus}'`);
            }

            const approved = Number(invoice.tpa_approved_amount || 0);
            const priorSettled = Number(invoice.tpa_settled_amount || 0);
            const newSettled = priorSettled + amount;

            // 6. Cannot exceed approved (with 0.01 tolerance).
            if (newSettled > approved + 0.01) {
                throw new Error(
                    `Amount exceeds approved balance. Approved: ${approved}, Already settled: ${priorSettled}, Remaining: ${(approved - priorSettled).toFixed(2)}`
                );
            }

            // 7. If less than approved, partial flag must be set.
            if (newSettled < approved - 0.01 && input.is_partial !== true) {
                throw new Error('Use partial flag for amount less than approved');
            }

            // 8. Reference uniqueness scoped to this invoice.
            const refExists = await tx.payments.findFirst({
                where: { invoice_id: invoice.id, reference },
                select: { id: true },
            });
            if (refExists) {
                throw new Error(`Reference number '${reference}' already recorded against this invoice`);
            }

            // 9. Create payments row (mirror recordPayment shape).
            const notes = input.remarks && input.remarks.trim()
                ? `TPA settlement — ${input.remarks.trim()}`
                : 'TPA settlement';
            const receiptNumber = await genRcpNum(organizationId, tx);
            const payment = await tx.payments.create({
                data: {
                    receipt_number: receiptNumber,
                    invoice_id: invoice.id,
                    amount,
                    payment_method: input.payment_method,
                    payment_type: 'TPA Settlement',
                    reference,
                    status: 'Completed',
                    notes,
                    organizationId,
                    created_at: receivedDate,
                },
            });

            // 10. Recompute invoice totals + status.
            const newPaidAmount = Number(invoice.paid_amount || 0) + amount;
            const netAmount = Number(invoice.net_amount || 0);
            const newBalanceDue = Math.max(0, netAmount - newPaidAmount);
            const newTpaPayable = Math.max(0, approved - newSettled);
            const fullySettled = newSettled >= approved - 0.01;
            const newClaimStatus = fullySettled ? 'settled' : 'partially_settled';

            const updateData: any = {
                tpa_settled_amount: newSettled,
                tpa_payable: newTpaPayable,
                tpa_claim_status: newClaimStatus,
                paid_amount: newPaidAmount,
                balance_due: newBalanceDue,
                version: { increment: 1 },
            };
            if (fullySettled && !invoice.tpa_settled_at) {
                updateData.tpa_settled_at = new Date();
            }

            await tx.invoices.update({
                where: { id: invoice.id },
                data: updateData,
            });

            // 11. Audit log with before/after snapshots.
            await tx.system_audit_logs.create({
                data: {
                    user_id: session?.id,
                    username: session?.username || session?.name,
                    role: session?.role,
                    action: 'tpa_payment_received',
                    module: 'finance',
                    entity_type: 'invoice',
                    entity_id: String(invoice.id),
                    details: JSON.stringify({
                        invoice_id: invoice.id,
                        invoice_number: invoice.invoice_number,
                        payment_id: payment.id,
                        receipt_number: receiptNumber,
                        reference_number: reference,
                        amount_received: amount,
                        payment_method: input.payment_method,
                        received_date: receivedDate.toISOString(),
                        is_partial: input.is_partial === true,
                        remarks: input.remarks || null,
                        before: {
                            tpa_claim_status: currentStatus,
                            tpa_settled_amount: priorSettled,
                            tpa_payable: Number(invoice.tpa_payable || 0),
                            paid_amount: Number(invoice.paid_amount || 0),
                            balance_due: Number(invoice.balance_due || 0),
                            status: invoice.status,
                            version: invoice.version,
                        },
                        after: {
                            tpa_claim_status: newClaimStatus,
                            tpa_settled_amount: newSettled,
                            tpa_payable: newTpaPayable,
                            paid_amount: newPaidAmount,
                            balance_due: newBalanceDue,
                            status: invoice.status,
                            version: invoice.version + 1,
                        },
                    }),
                    organizationId,
                },
            });

            return { payment_id: payment.id };
        });

        revalidatePath('/reception/insurance');
        revalidatePath('/billing');
        return { success: true, payment_id: result.payment_id };
    } catch (error: any) {
        console.error('recordTpaPaymentReceived error:', error);
        return { success: false, error: error.message };
    }
}

// Reject a TPA claim. Clears approved/payable and flips claim status. Patient
// becomes liable for the full remaining balance. Optimistic-locked.
export async function rejectTpaClaim(input: {
    invoice_id: number;
    expected_version: number;
    reason: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        const reason = (input.reason || '').trim();
        if (!reason) return { success: false, error: 'reason is required' };

        await db.$transaction(async (tx: any) => {
            const invoice = await tx.invoices.findFirst({
                where: { id: input.invoice_id, organizationId },
            });
            if (!invoice) throw new Error('Invoice not found');

            if (invoice.version !== input.expected_version) {
                throw new Error('Invoice was modified by another user. Please refresh and retry.');
            }

            const allowed = ['submitted', 'under_review', 'approved'];
            if (!allowed.includes(invoice.tpa_claim_status)) {
                throw new Error(`Cannot reject TPA claim from status '${invoice.tpa_claim_status}'`);
            }

            const before = {
                tpa_claim_status: invoice.tpa_claim_status,
                tpa_approved_amount: Number(invoice.tpa_approved_amount || 0),
                tpa_approved_at: invoice.tpa_approved_at,
                tpa_payable: Number(invoice.tpa_payable || 0),
                version: invoice.version,
            };

            await tx.invoices.update({
                where: { id: invoice.id },
                data: {
                    tpa_claim_status: 'rejected',
                    tpa_approved_amount: 0,
                    tpa_approved_at: null,
                    tpa_payable: 0,
                    version: { increment: 1 },
                },
            });

            await tx.system_audit_logs.create({
                data: {
                    user_id: session?.id,
                    username: session?.username || session?.name,
                    role: session?.role,
                    action: 'tpa_claim_rejected',
                    module: 'finance',
                    entity_type: 'invoice',
                    entity_id: String(invoice.id),
                    details: JSON.stringify({
                        invoice_id: invoice.id,
                        invoice_number: invoice.invoice_number,
                        reason,
                        before,
                        after: {
                            tpa_claim_status: 'rejected',
                            tpa_approved_amount: 0,
                            tpa_approved_at: null,
                            tpa_payable: 0,
                            version: invoice.version + 1,
                        },
                    }),
                    organizationId,
                },
            });
        });

        revalidatePath('/reception/insurance');
        revalidatePath('/billing');
        return { success: true };
    } catch (error: any) {
        console.error('rejectTpaClaim error:', error);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRE-AUTHORIZATIONS
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: these now target the real `InsurancePreAuth` model (Prisma client:
// db.insurancePreAuth). The previous `db.preAuthorization` reference pointed at a
// model that does not exist in the schema — a latent broken path now fixed.
export async function getAllPreAuthorizations(statusFilter?: string) {
    const { db, organizationId } = await requireTenantContext();

    const where: any = { organizationId };
    if (statusFilter && statusFilter !== 'all') where.status = statusFilter;

    const preAuths = await db.insurancePreAuth.findMany({
        where,
        include: {
            provider: { select: { provider_name: true, provider_code: true } },
            corporate: { select: { company_name: true, company_code: true } },
        },
        orderBy: { submitted_at: 'desc' },
        take: 200,
    });

    // Hydrate patient summary (no direct relation on InsurancePreAuth -> OPD_REG).
    const patientIds = Array.from(new Set(preAuths.map((p: any) => p.patient_id).filter(Boolean)));
    const patients = patientIds.length
        ? await db.oPD_REG.findMany({
            where: { organizationId, patient_id: { in: patientIds } },
            select: { patient_id: true, full_name: true, phone: true },
        })
        : [];
    const pmap = new Map(patients.map((p: any) => [p.patient_id, p]));

    const data = preAuths.map((p: any) => ({
        ...p,
        patient: pmap.get(p.patient_id) || null,
    }));

    return { success: true, data: serialize(data) };
}

export async function createPreAuthAction(data: {
    patient_id: string;
    admission_id?: string;
    policy_id?: string;
    provider_id?: number;
    corporate_id?: string;
    tpa_name?: string;
    pre_auth_number?: string;
    requested_amount?: number;
    submission_type?: 'Planned' | 'Emergency';
    diagnosis_icd?: string;
    valid_until?: string;
    remarks?: string;
}) {
    const { db, organizationId } = await requireTenantContext();
    try {
        const preAuth = await db.insurancePreAuth.create({
            data: {
                organizationId,
                patient_id: data.patient_id,
                admission_id: data.admission_id || null,
                policy_id: data.policy_id || null,
                provider_id: data.provider_id ?? null,
                corporate_id: data.corporate_id || null,
                tpa_name: data.tpa_name || null,
                pre_auth_number: data.pre_auth_number || null,
                requested_amount: data.requested_amount ?? 0,
                submission_type: data.submission_type || 'Planned',
                diagnosis_icd: data.diagnosis_icd || null,
                valid_until: data.valid_until ? new Date(data.valid_until) : null,
                remarks: data.remarks || null,
                status: 'Submitted',
            },
        });
        revalidatePath('/reception/insurance');
        revalidatePath('/admin/finance/tpa-insurance');
        return { success: true, data: serialize(preAuth) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updatePreAuthAction(data: {
    id: string;
    status: string; // Submitted | Approved | PartiallyApproved | Denied | QueryRaised | Enhanced
    approved_amount?: number;
    tpa_remarks?: string;
    query_due_at?: string;
}) {
    const { db, organizationId } = await requireTenantContext();
    try {
        await db.insurancePreAuth.update({
            where: { id: data.id, organizationId },
            data: {
                status: data.status,
                approved_amount: data.approved_amount ?? undefined,
                tpa_remarks: data.tpa_remarks ?? undefined,
                query_due_at: data.query_due_at ? new Date(data.query_due_at) : undefined,
                responded_at: new Date(),
            },
        });
        revalidatePath('/reception/insurance');
        revalidatePath('/admin/finance/tpa-insurance');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Search patients for pre-auth creation
export async function searchPatientsForInsurance(query: string) {
    const { db, organizationId } = await requireTenantContext();
    const patients = await db.oPD_REG.findMany({
        where: {
            organizationId,
            patient_type: { in: ['corporate', 'tpa_insurance'] },
            OR: [
                { full_name: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query, mode: 'insensitive' } },
                { patient_id: { contains: query, mode: 'insensitive' } },
            ],
        },
        select: {
            patient_id: true,
            full_name: true,
            phone: true,
            patient_type: true,
            corporate_id: true,
            corporate: { select: { id: true, company_name: true } },
            insurance_policies: {
                where: { status: 'Active' },
                take: 1,
                include: { provider: { select: { id: true, provider_name: true } } },
            },
        },
        take: 10,
    });
    return { success: true, data: serialize(patients) };
}
