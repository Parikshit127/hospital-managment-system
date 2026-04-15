'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

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

// ─────────────────────────────────────────────────────────────────────────────
// PRE-AUTHORIZATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function getAllPreAuthorizations(statusFilter?: string) {
    const { db, organizationId } = await requireTenantContext();

    const where: any = { organizationId };
    if (statusFilter && statusFilter !== 'all') where.status = statusFilter;

    const preAuths = await db.preAuthorization.findMany({
        where,
        include: {
            provider: { select: { provider_name: true, provider_code: true } },
            corporate: { select: { company_name: true, company_code: true } },
            patient: { select: { full_name: true, patient_id: true, phone: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 200,
    });

    return { success: true, data: serialize(preAuths) };
}

export async function createPreAuthAction(data: {
    patient_id: string;
    provider_id?: number;
    corporate_id?: string;
    pre_auth_number?: string;
    requested_amount?: number;
    valid_until?: string;
    remarks?: string;
}) {
    const { db, organizationId } = await requireTenantContext();
    try {
        const preAuth = await db.preAuthorization.create({
            data: {
                organizationId,
                patient_id: data.patient_id,
                provider_id: data.provider_id || null,
                corporate_id: data.corporate_id || null,
                pre_auth_number: data.pre_auth_number || null,
                requested_amount: data.requested_amount ?? null,
                valid_until: data.valid_until ? new Date(data.valid_until) : null,
                remarks: data.remarks || null,
                status: 'pending',
            },
        });
        revalidatePath('/reception/insurance');
        return { success: true, data: serialize(preAuth) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updatePreAuthAction(data: {
    id: string;
    status: string;
    approved_amount?: number;
    remarks?: string;
}) {
    const { db, organizationId } = await requireTenantContext();
    try {
        await db.preAuthorization.update({
            where: { id: data.id, organizationId },
            data: {
                status: data.status,
                approved_amount: data.approved_amount ?? undefined,
                remarks: data.remarks ?? undefined,
                responded_at: new Date(),
            },
        });
        revalidatePath('/reception/insurance');
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
                { phone: { contains: query } },
                { patient_id: { contains: query } },
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
