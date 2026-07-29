'use server';

import { requireTenantContext } from '@/backend/tenant';

// ── Types ──────────────────────────────────────────────────────────────────

export type LineItem = {
    service_id?: number;
    department: string;
    description: string;
    quantity: number;
    unit_price: number;
    discount: number;
    tax_rate: number;
};

export type BillSplit = {
    patientPayable: number;
    corporatePayable: number;
    tpaPayable: number;
    totalDiscount: number;
    totalTax: number;
    grandTotal: number;
    warnings: string[];
};

// ── calculateBillSplit ─────────────────────────────────────────────────────
// Core billing engine: given a patient and line items, compute payer split.

export async function calculateBillSplit(
    patientId: string,
    lineItems: LineItem[]
): Promise<BillSplit> {
    const { db, organizationId } = await requireTenantContext();
    const warnings: string[] = [];

    const patient = await db.oPD_REG.findFirst({
        where: { patient_id: patientId, organizationId },
        select: {
            patient_type: true,
            corporate_id: true,
            corporate: {
                select: {
                    discount_percentage: true,
                    credit_limit: true,
                    current_balance: true,
                }
            },
            insurance_policies: {
                where: { status: 'Active' },
                orderBy: { created_at: 'desc' },
                take: 1,
                include: {
                    provider: {
                        select: {
                            pre_auth_required: true,
                            default_discount_percentage: true,
                        }
                    }
                }
            }
        }
    });

    if (!patient) {
        return { patientPayable: 0, corporatePayable: 0, tpaPayable: 0, totalDiscount: 0, totalTax: 0, grandTotal: 0, warnings: ['Patient not found'] };
    }

    // Compute gross totals
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    for (const item of lineItems) {
        const base = item.unit_price * item.quantity;
        const afterDiscount = base - item.discount;
        const tax = afterDiscount * (item.tax_rate / 100);
        subtotal += base;
        totalDiscount += item.discount;
        totalTax += tax;
    }
    const grandTotal = subtotal - totalDiscount + totalTax;

    // Cash patient — full patient payable
    if (patient.patient_type === 'cash' || !patient.patient_type) {
        return { patientPayable: grandTotal, corporatePayable: 0, tpaPayable: 0, totalDiscount, totalTax, grandTotal, warnings };
    }

    // Corporate patient
    if (patient.patient_type === 'corporate' && patient.corporate) {
        const discountPct = Number(patient.corporate.discount_percentage) / 100;
        const corporateDiscount = grandTotal * discountPct;
        const corporatePayable = grandTotal - corporateDiscount;
        totalDiscount += corporateDiscount;

        // Credit limit check
        const used = Number(patient.corporate.current_balance);
        const limit = Number(patient.corporate.credit_limit);
        if (corporatePayable > limit - used) {
            warnings.push(`Credit limit warning: ₹${(limit - used).toFixed(2)} remaining. This invoice (₹${corporatePayable.toFixed(2)}) may exceed limit.`);
        }

        return {
            patientPayable: 0,
            corporatePayable,
            tpaPayable: 0,
            totalDiscount,
            totalTax,
            grandTotal: grandTotal - corporateDiscount,
            warnings,
        };
    }

    // TPA patient
    if (patient.patient_type === 'tpa_insurance') {
        const policy = patient.insurance_policies[0];
        if (!policy) {
            warnings.push('No active insurance policy found. Patient will be billed as Cash.');
            return { patientPayable: grandTotal, corporatePayable: 0, tpaPayable: 0, totalDiscount, totalTax, grandTotal, warnings };
        }

        if (policy.provider?.pre_auth_required) {
            // Check if pre-auth exists and approved
            const preAuth = await db.preAuthorization.findFirst({
                where: {
                    patient_id: patientId,
                    organizationId,
                    status: 'approved',
                    valid_until: { gte: new Date() },
                }
            });
            if (!preAuth) {
                warnings.push('PRE_AUTH_REQUIRED: Pre-authorization required but not approved. Cannot proceed without TPA approval.');
            }
        }

        const discountPct = Number(policy.provider?.default_discount_percentage || 0) / 100;
        const tpaDiscount = grandTotal * discountPct;
        const tpaPayable = grandTotal - tpaDiscount;
        totalDiscount += tpaDiscount;

        return {
            patientPayable: 0,
            corporatePayable: 0,
            tpaPayable,
            totalDiscount,
            totalTax,
            grandTotal: grandTotal - tpaDiscount,
            warnings,
        };
    }

    return { patientPayable: grandTotal, corporatePayable: 0, tpaPayable: 0, totalDiscount, totalTax, grandTotal, warnings };
}

// ── createPaymentSplits ────────────────────────────────────────────────────

export async function createPaymentSplits(
    invoiceId: number,
    splits: Array<{
        payer_type: 'patient' | 'corporate' | 'tpa_insurance';
        payer_id?: string;
        amount: number;
        payment_method?: string;
        payment_reference?: string;
        received_by?: string;
    }>
) {
    const { db, organizationId } = await requireTenantContext();
    for (const split of splits) {
        if (split.amount <= 0) continue;
        await db.paymentSplit.create({
            data: {
                organizationId,
                invoice_id: invoiceId,
                payer_type: split.payer_type,
                payer_id: split.payer_id || null,
                amount: split.amount,
                payment_method: split.payment_method || null,
                payment_reference: split.payment_reference || null,
                received_by: split.received_by || null,
                status: split.payer_type === 'patient' ? 'received' : 'pending',
            }
        });
    }
    return { success: true };
}

// ── submitTpaClaim ────────────────────────────────────────────────────────

export async function submitTpaClaim(invoiceId: number) {
    const { db, organizationId } = await requireTenantContext();
    try {
        const claimNumber = `CLM-${Date.now()}`;
        await db.invoices.update({
            where: { id: invoiceId, organizationId },
            data: {
                tpa_claim_status: 'submitted',
                tpa_claim_number: claimNumber,
            }
        });
        return { success: true, claimNumber };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to submit claim';
        return { success: false, error: msg };
    }
}

export async function updateTpaClaimStatus(invoiceId: number, status: string, settledAmount?: number) {
    const { db, organizationId } = await requireTenantContext();
    try {
        await db.invoices.update({
            where: { id: invoiceId, organizationId },
            data: {
                tpa_claim_status: status,
                tpa_settled_amount: settledAmount ?? undefined,
            }
        });
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to update claim status';
        return { success: false, error: msg };
    }
}

// ── getInvoicePaymentSplits ───────────────────────────────────────────────

export async function getInvoicePaymentSplits(invoiceId: number) {
    const { db, organizationId } = await requireTenantContext();
    const splits = await db.paymentSplit.findMany({
        where: { invoice_id: invoiceId, organizationId },
        orderBy: { created_at: 'asc' },
    });
    return { success: true, data: splits };
}

// ── Corporate outstanding ─────────────────────────────────────────────────

export async function getCorporateOutstanding() {
    const { db, organizationId } = await requireTenantContext();
    const corporates = await db.corporateMaster.findMany({
        where: { organizationId, is_active: true },
        select: {
            id: true,
            company_name: true,
            company_code: true,
            credit_limit: true,
            current_balance: true,
        }
    });
    // Get pending payment splits per corporate
    const result = await Promise.all(
        corporates.map(async (corporate: typeof corporates[number]) => {
            const splits = await db.paymentSplit.findMany({
                where: {
                    organizationId,
                    payer_type: 'corporate',
                    payer_id: corporate.id,
                },
                select: { amount: true, status: true }
            });
            const totalBilled = splits.reduce((sum: number, row: { amount: unknown; status: string }) => sum + Number(row.amount), 0);
            const totalReceived = splits
                .filter((row: { amount: unknown; status: string }) => row.status === 'received')
                .reduce((sum: number, row: { amount: unknown; status: string }) => sum + Number(row.amount), 0);
            return {
                ...corporate,
                totalBilled,
                totalReceived,
                outstanding: totalBilled - totalReceived,
            };
        })
    );
    return { success: true, data: result };
}

// ── TPA Claims tracker ────────────────────────────────────────────────────

export async function getTpaClaimsTracker() {
    const { db, organizationId } = await requireTenantContext();
    const invoices = await db.invoices.findMany({
        where: {
            organizationId,
            billing_patient_type: 'tpa_insurance',
            tpa_claim_status: { not: 'not_submitted' },
        },
        select: {
            id: true,
            invoice_number: true,
            tpa_claim_status: true,
            tpa_claim_number: true,
            tpa_payable: true,
            tpa_settled_amount: true,
            created_at: true,
            patient: { select: { full_name: true, patient_id: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 100,
    });
    return { success: true, data: invoices };
}
