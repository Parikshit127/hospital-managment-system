'use server';

import { requireTenantContext } from '@/backend/tenant';

// Convert Prisma Decimal/Date objects to plain JS for client serialization
function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

function generateClaimNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `CLM-${dateStr}-${seq}`;
}

// ============================================
// INSURANCE PROVIDERS
// ============================================

export async function getInsuranceProviders() {
    try {
        const { db } = await requireTenantContext();
        const providers = await db.insurance_providers.findMany({
            where: { is_active: true },
            orderBy: { provider_name: 'asc' },
        });

        return { success: true, data: serialize(providers) };
    } catch (error: any) {
        console.error('getInsuranceProviders error:', error);
        return { success: false, error: error.message };
    }
}

export async function addInsuranceProvider(data: {
    provider_name: string;
    provider_code: string;
    contact_email?: string;
    contact_phone?: string;
    address?: string;
}) {
    try {
        const { db } = await requireTenantContext();
        const provider = await db.insurance_providers.create({
            data: {
                provider_name: data.provider_name,
                provider_code: data.provider_code,
                contact_email: data.contact_email || null,
                contact_phone: data.contact_phone || null,
                address: data.address || null,
            },
        });

        return { success: true, data: serialize(provider) };
    } catch (error: any) {
        console.error('addInsuranceProvider error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// INSURANCE POLICIES
// ============================================

export async function getPatientPolicies(patientId: string) {
    try {
        const { db } = await requireTenantContext();
        const policies = await db.insurance_policies.findMany({
            where: { patient_id: patientId },
            include: {
                provider: { select: { provider_name: true, provider_code: true } },
                claims: { orderBy: { submitted_at: 'desc' }, take: 5 },
            },
            orderBy: { created_at: 'desc' },
        });

        return { success: true, data: serialize(policies) };
    } catch (error: any) {
        console.error('getPatientPolicies error:', error);
        return { success: false, error: error.message };
    }
}

export async function addPatientPolicy(data: {
    patient_id: string;
    provider_id: number;
    policy_number: string;
    policy_holder?: string;
    plan_name?: string;
    coverage_limit: number;
    valid_from: string;
    valid_until: string;
}) {
    try {
        const { db } = await requireTenantContext();
        const policy = await db.insurance_policies.create({
            data: {
                patient_id: data.patient_id,
                provider_id: data.provider_id,
                policy_number: data.policy_number,
                policy_holder: data.policy_holder || null,
                plan_name: data.plan_name || null,
                coverage_limit: data.coverage_limit,
                remaining_limit: data.coverage_limit,
                valid_from: new Date(data.valid_from),
                valid_until: new Date(data.valid_until),
                status: 'Active',
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'ADD_INSURANCE_POLICY',
                module: 'insurance',
                entity_type: 'policy',
                entity_id: data.policy_number,
                details: JSON.stringify({ patient_id: data.patient_id, provider_id: data.provider_id }),
            },
        });

        return { success: true, data: serialize(policy) };
    } catch (error: any) {
        console.error('addPatientPolicy error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// INSURANCE CLAIMS
// ============================================

export async function submitInsuranceClaim(data: {
    policy_id: number;
    invoice_id: number;
    admission_id?: string;
    claimed_amount: number;
}) {
    try {
        const { db } = await requireTenantContext();
        // Validate policy
        const policy = await db.insurance_policies.findUnique({
            where: { id: data.policy_id },
        });

        if (!policy || policy.status !== 'Active') {
            return { success: false, error: 'Policy is not active' };
        }

        if (policy.valid_until && new Date(policy.valid_until) < new Date()) {
            return { success: false, error: 'Policy has expired' };
        }

        const remainingLimit = Number(policy.remaining_limit || 0);
        if (data.claimed_amount > remainingLimit) {
            return { success: false, error: `Claimed amount exceeds remaining coverage limit of ${remainingLimit}` };
        }

        const claim = await db.insurance_claims.create({
            data: {
                claim_number: generateClaimNumber(),
                policy_id: data.policy_id,
                invoice_id: data.invoice_id,
                admission_id: data.admission_id || null,
                claimed_amount: data.claimed_amount,
                status: 'Submitted',
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'SUBMIT_INSURANCE_CLAIM',
                module: 'insurance',
                entity_type: 'claim',
                entity_id: claim.claim_number,
                details: JSON.stringify({
                    policy_id: data.policy_id,
                    invoice_id: data.invoice_id,
                    claimed_amount: data.claimed_amount,
                }),
            },
        });

        return { success: true, data: serialize(claim) };
    } catch (error: any) {
        console.error('submitInsuranceClaim error:', error);
        return { success: false, error: error.message };
    }
}

export async function updateClaimStatus(claimId: number, data: {
    status: string;
    approved_amount?: number;
    rejected_amount?: number;
    rejection_reason?: string;
}) {
    try {
        const { db } = await requireTenantContext();
        const validStatuses = ['Submitted', 'UnderReview', 'Approved', 'Rejected', 'PartiallyApproved', 'Settled'];
        if (!validStatuses.includes(data.status)) {
            return { success: false, error: 'Invalid claim status' };
        }

        const updateData: any = {
            status: data.status,
            reviewed_at: ['Approved', 'Rejected', 'PartiallyApproved'].includes(data.status) ? new Date() : undefined,
            settled_at: data.status === 'Settled' ? new Date() : undefined,
        };

        if (data.approved_amount !== undefined) updateData.approved_amount = data.approved_amount;
        if (data.rejected_amount !== undefined) updateData.rejected_amount = data.rejected_amount;
        if (data.rejection_reason) updateData.rejection_reason = data.rejection_reason;

        const claim = await db.insurance_claims.update({
            where: { id: claimId },
            data: updateData,
        });

        // If approved/settled, reduce remaining coverage limit
        if (['Approved', 'PartiallyApproved', 'Settled'].includes(data.status) && data.approved_amount) {
            const policy = await db.insurance_policies.findUnique({
                where: { id: claim.policy_id },
            });

            if (policy) {
                const newRemaining = Number(policy.remaining_limit || 0) - data.approved_amount;
                await db.insurance_policies.update({
                    where: { id: policy.id },
                    data: { remaining_limit: newRemaining > 0 ? newRemaining : 0 },
                });
            }

            // Auto-record payment on the invoice for the approved amount
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');

            await db.payments.create({
                data: {
                    receipt_number: `RCP-${dateStr}-${seq}`,
                    invoice_id: claim.invoice_id,
                    amount: data.approved_amount,
                    payment_method: 'Insurance',
                    payment_type: 'Settlement',
                    status: 'Completed',
                    notes: `Insurance claim ${claim.claim_number} settled`,
                },
            });

            // Update invoice paid amount
            const allPayments = await db.payments.findMany({
                where: { invoice_id: claim.invoice_id, status: 'Completed' },
            });
            const totalPaid = allPayments.reduce((sum: any, p: any) => sum + Number(p.amount), 0);
            const invoice = await db.invoices.findUnique({ where: { id: claim.invoice_id } });
            const netAmount = Number(invoice?.net_amount || 0);
            const balance = netAmount - totalPaid;

            await db.invoices.update({
                where: { id: claim.invoice_id },
                data: {
                    paid_amount: totalPaid,
                    balance_due: balance > 0 ? balance : 0,
                    status: balance <= 0 ? 'Paid' : 'Partial',
                },
            });
        }

        await db.system_audit_logs.create({
            data: {
                action: 'UPDATE_CLAIM_STATUS',
                module: 'insurance',
                entity_type: 'claim',
                entity_id: claim.claim_number,
                details: JSON.stringify(data),
            },
        });

        return { success: true, data: serialize(claim) };
    } catch (error: any) {
        console.error('updateClaimStatus error:', error);
        return { success: false, error: error.message };
    }
}

// Get all claims with filters
export async function getInsuranceClaims(filters?: {
    status?: string;
    policy_id?: number;
    limit?: number;
}) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {};
        if (filters?.status) where.status = filters.status;
        if (filters?.policy_id) where.policy_id = filters.policy_id;

        const claims = await db.insurance_claims.findMany({
            where,
            include: {
                policy: {
                    include: {
                        patient: { select: { full_name: true, patient_id: true } },
                        provider: { select: { provider_name: true } },
                    },
                },
                invoice: { select: { invoice_number: true, net_amount: true, status: true } },
            },
            orderBy: { submitted_at: 'desc' },
            take: filters?.limit || 100,
        });

        return { success: true, data: serialize(claims) };
    } catch (error: any) {
        console.error('getInsuranceClaims error:', error);
        return { success: false, error: error.message };
    }
}

// Get insurance dashboard stats
export async function getInsuranceStats() {
    try {
        const { db } = await requireTenantContext();
        const [
            totalProviders,
            activePolicies,
            totalClaims,
            pendingClaims,
            approvedTotal,
            claimedTotal,
        ] = await Promise.all([
            db.insurance_providers.count({ where: { is_active: true } }),
            db.insurance_policies.count({ where: { status: 'Active' } }),
            db.insurance_claims.count(),
            db.insurance_claims.count({ where: { status: { in: ['Submitted', 'UnderReview'] } } }),
            db.insurance_claims.aggregate({
                _sum: { approved_amount: true },
                where: { status: { in: ['Approved', 'PartiallyApproved', 'Settled'] } },
            }),
            db.insurance_claims.aggregate({
                _sum: { claimed_amount: true },
            }),
        ]);

        return {
            success: true,
            data: {
                totalProviders,
                activePolicies,
                totalClaims,
                pendingClaims,
                approvedTotal: Number(approvedTotal._sum.approved_amount || 0),
                claimedTotal: Number(claimedTotal._sum.claimed_amount || 0),
            },
        };
    } catch (error: any) {
        console.error('getInsuranceStats error:', error);
        return { success: false, error: error.message };
    }
}

// Revenue Leakage: invoices where patient has insurance but no claim was filed
export async function getRevenueLeakage() {
    try {
        const { db } = await requireTenantContext();
        const insuredPatientIds = (await db.insurance_policies.findMany({
            where: { status: 'Active' },
            select: { patient_id: true },
        })).map((p: any) => p.patient_id);

        if (insuredPatientIds.length === 0) {
            return { success: true, data: [] };
        }

        // Find finalized invoices for insured patients that have no insurance claim
        const claimedInvoiceIds = (await db.insurance_claims.findMany({
            select: { invoice_id: true },
        })).map((c: any) => c.invoice_id);

        const leakedInvoices = await db.invoices.findMany({
            where: {
                patient_id: { in: insuredPatientIds },
                status: { in: ['Final', 'Paid', 'Partial'] },
                id: claimedInvoiceIds.length > 0 ? { notIn: claimedInvoiceIds } : undefined,
            },
            include: {
                patient: { select: { full_name: true, patient_id: true } },
            },
            orderBy: { created_at: 'desc' },
            take: 50,
        });

        return { success: true, data: serialize(leakedInvoices) };
    } catch (error: any) {
        console.error('getRevenueLeakage error:', error);
        return { success: false, error: error.message };
    }
}

// Get invoices available for claim submission (finalized invoices for a given patient)
export async function getClaimableInvoices(patientId: string) {
    try {
        const { db } = await requireTenantContext();
        const claimedInvoiceIds = (await db.insurance_claims.findMany({
            where: { policy: { patient_id: patientId } },
            select: { invoice_id: true },
        })).map((c: any) => c.invoice_id);

        const invoices = await db.invoices.findMany({
            where: {
                patient_id: patientId,
                status: { in: ['Final', 'Paid', 'Partial'] },
                id: claimedInvoiceIds.length > 0 ? { notIn: claimedInvoiceIds } : undefined,
            },
            orderBy: { created_at: 'desc' },
        });

        return { success: true, data: serialize(invoices) };
    } catch (error: any) {
        console.error('getClaimableInvoices error:', error);
        return { success: false, error: error.message };
    }
}

// Get all policies for the insurance management page
export async function getAllPolicies(filters?: { status?: string; limit?: number }) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {};
        if (filters?.status) where.status = filters.status;

        const policies = await db.insurance_policies.findMany({
            where,
            include: {
                patient: { select: { full_name: true, patient_id: true, phone: true } },
                provider: { select: { provider_name: true, provider_code: true } },
                claims: { orderBy: { submitted_at: 'desc' }, take: 3 },
            },
            orderBy: { created_at: 'desc' },
            take: filters?.limit || 100,
        });

        return { success: true, data: serialize(policies) };
    } catch (error: any) {
        console.error('getAllPolicies error:', error);
        return { success: false, error: error.message };
    }
}

// Provider performance: approval rate, avg settlement time, total settled
export async function getProviderPerformance() {
    try {
        const { db } = await requireTenantContext();
        const providers = await db.insurance_providers.findMany({
            where: { is_active: true },
            select: { id: true, provider_name: true, provider_code: true },
        });

        const results = await Promise.all(providers.map(async (prov: any) => {
            const claims = await db.insurance_claims.findMany({
                where: { policy: { provider_id: prov.id } },
            });
            const total = claims.length;
            const approved = claims.filter((c: any) => ['Approved', 'PartiallyApproved', 'Settled'].includes(c.status)).length;
            const rejected = claims.filter((c: any) => c.status === 'Rejected').length;
            const settled = claims.filter((c: any) => c.status === 'Settled');

            const totalSettled = settled.reduce((s: number, c: any) => s + Number(c.approved_amount || 0), 0);

            // Average days to settle
            let avgSettlementDays = 0;
            if (settled.length > 0) {
                const totalDays = settled.reduce((s: number, c: any) => {
                    const submitted = new Date(c.submitted_at || c.created_at);
                    const settledAt = new Date(c.settled_at || c.reviewed_at || new Date());
                    return s + Math.floor((settledAt.getTime() - submitted.getTime()) / 86400000);
                }, 0);
                avgSettlementDays = Math.round(totalDays / settled.length);
            }

            return {
                provider_name: prov.provider_name,
                provider_code: prov.provider_code,
                totalClaims: total,
                approvedCount: approved,
                rejectedCount: rejected,
                approvalRate: total > 0 ? ((approved / total) * 100).toFixed(1) : '0',
                totalSettled,
                avgSettlementDays,
            };
        }));

        return { success: true, data: serialize(results) };
    } catch (error: any) {
        console.error('getProviderPerformance error:', error);
        return { success: false, error: error.message };
    }
}

// Auto-submit claim for a specific invoice (finds patient's active policy and submits)
export async function autoSubmitClaim(invoiceId: number) {
    try {
        const { db } = await requireTenantContext();
        const invoice = await db.invoices.findUnique({ where: { id: invoiceId } });
        if (!invoice) return { success: false, error: 'Invoice not found' };

        // Find active policy for this patient
        const policy = await db.insurance_policies.findFirst({
            where: { patient_id: invoice.patient_id, status: 'Active' },
            orderBy: { remaining_limit: 'desc' },
        });
        if (!policy) return { success: false, error: 'No active insurance policy found for this patient' };

        const claimAmount = Math.min(Number(invoice.net_amount), Number(policy.remaining_limit || 0));
        if (claimAmount <= 0) return { success: false, error: 'No remaining coverage available' };

        const claim = await db.insurance_claims.create({
            data: {
                claim_number: generateClaimNumber(),
                policy_id: policy.id,
                invoice_id: invoiceId,
                claimed_amount: claimAmount,
                status: 'Submitted',
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'AUTO_SUBMIT_CLAIM',
                module: 'insurance',
                entity_type: 'claim',
                entity_id: claim.claim_number,
                details: JSON.stringify({ invoice_id: invoiceId, policy_id: policy.id, amount: claimAmount }),
            },
        });

        return { success: true, data: serialize(claim) };
    } catch (error: any) {
        console.error('autoSubmitClaim error:', error);
        return { success: false, error: error.message };
    }
}
