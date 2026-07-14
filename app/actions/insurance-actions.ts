'use server';

import { requireTenantContext } from '@/backend/tenant';
import { isSemiDischarged } from '@/app/lib/admission-status';

// Convert Prisma Decimal/Date objects to plain JS for client serialization
function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

// Check if a given date falls into a locked financial period
async function checkPeriodLock(db: any, date: Date = new Date()) {
    const period = await db.financialPeriod.findFirst({
        where: {
            start_date: { lte: date },
            end_date: { gte: date }
        }
    });
    if (period && period.status === 'Locked') {
        throw new Error(`Financial period '${period.period_name}' is locked. Cannot process transaction.`);
    }
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

// Patients covered by (i.e. holding a policy with) a specific TPA / insurance provider.
// Used by the Providers drill-down on the Insurance dashboard. Deduped to one row per
// patient, with a flag indicating whether they are currently admitted (IPD).
export async function getPatientsByProvider(providerId: number) {
    try {
        const { db } = await requireTenantContext();
        const patientSelect = {
            patient_id: true,
            full_name: true,
            phone: true,
            admissions: {
                where: { status: 'Admitted', is_archived: false },
                select: { admission_id: true, admission_date: true },
                orderBy: { admission_date: 'desc' },
                take: 1,
            },
        };

        const [policies, billedInvoices] = await Promise.all([
            db.insurance_policies.findMany({
                where: { provider_id: providerId },
                include: { patient: { select: patientSelect } },
                orderBy: { created_at: 'desc' },
            }),
            // Patients billed directly to this TPA (invoices.tpa_provider_id) may not have
            // a formal insurance_policies row — e.g. TPA selected at admission/billing time
            // without a policy being recorded. Without this, they never show up here even
            // though their bills are tied to this provider.
            db.invoices.findMany({
                where: { tpa_provider_id: providerId, is_archived: false },
                select: { patient: { select: patientSelect } },
                orderBy: { created_at: 'desc' },
            }),
        ]);

        // One entry per patient — a patient may hold multiple policies / invoices with the same TPA.
        const byPatient = new Map<string, any>();
        for (const pol of policies) {
            if (!pol.patient) continue;
            const pid = pol.patient.patient_id;
            if (byPatient.has(pid)) continue;
            const admission = pol.patient.admissions?.[0] || null;
            byPatient.set(pid, {
                patient_id: pid,
                full_name: pol.patient.full_name,
                phone: pol.patient.phone,
                policy_number: pol.policy_number,
                policy_status: pol.status,
                coverage_limit: pol.coverage_limit,
                remaining_limit: pol.remaining_limit,
                is_admitted: !!admission,
            });
        }
        for (const inv of billedInvoices) {
            if (!inv.patient) continue;
            const pid = inv.patient.patient_id;
            if (byPatient.has(pid)) continue;
            const admission = inv.patient.admissions?.[0] || null;
            byPatient.set(pid, {
                patient_id: pid,
                full_name: inv.patient.full_name,
                phone: inv.patient.phone,
                policy_number: null,
                policy_status: null,
                coverage_limit: null,
                remaining_limit: null,
                is_admitted: !!admission,
            });
        }

        return { success: true, data: serialize(Array.from(byPatient.values())) };
    } catch (error: any) {
        console.error('getPatientsByProvider error:', error);
        return { success: false, error: error.message };
    }
}

export async function addInsuranceProvider(data: {
    provider_name: string;
    provider_code?: string;
    contact_email?: string;
    contact_phone?: string;
    address?: string;
}) {
    try {
        const { db } = await requireTenantContext();
        const provider = await db.insurance_providers.create({
            data: {
                provider_name: data.provider_name,
                provider_code: (data.provider_code?.trim()
                    ? data.provider_code.trim().toUpperCase()
                    : data.provider_name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) + Date.now().toString().slice(-4)),
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

export async function updateInsuranceProvider(id: number, data: {
    provider_name?: string;
    contact_email?: string;
    contact_phone?: string;
    address?: string;
    pre_auth_required?: boolean;
    default_discount_percentage?: number;
    is_active?: boolean;
}) {
    try {
        const { db, session } = await requireTenantContext();
        if (session.role !== 'admin') return { success: false, error: 'Admin only' };
        const provider = await db.insurance_providers.update({
            where: { id },
            data: {
                ...(data.provider_name && { provider_name: data.provider_name }),
                ...(data.contact_email !== undefined && { contact_email: data.contact_email }),
                ...(data.contact_phone !== undefined && { contact_phone: data.contact_phone }),
                ...(data.address !== undefined && { address: data.address }),
                ...(data.pre_auth_required !== undefined && { pre_auth_required: data.pre_auth_required }),
                ...(data.default_discount_percentage !== undefined && { default_discount_percentage: data.default_discount_percentage }),
                ...(data.is_active !== undefined && { is_active: data.is_active }),
            },
        });
        return { success: true, data: serialize(provider) };
    } catch (error: any) {
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

        // Derive the patient's current admission state once (all these policies
        // belong to the same patient). "Semi discharged" == still Admitted but a
        // discharge_date is recorded — the patient holds a bed awaiting TPA approval.
        const latestAdmission = await db.admissions.findFirst({
            where: { patient_id: patientId, status: 'Admitted', is_archived: false },
            select: { status: true, discharge_date: true },
            orderBy: { admission_date: 'desc' },
        });
        const admissionStatus = latestAdmission?.status ?? null;
        const isSemi = isSemiDischarged(latestAdmission);

        const data = policies.map((pol: any) => ({
            ...pol,
            admission_status: admissionStatus,
            is_semi_discharged: isSemi,
        }));

        return { success: true, data: serialize(data) };
    } catch (error: any) {
        console.error('getPatientPolicies error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Fetch a patient's TPA / insurance invoices (the "claims on bills").
 *
 * The TPA lifecycle in this system is tracked entirely on the invoice
 * (invoices.tpa_claim_status), not on insurance_claims rows — so this powers
 * the same actionable view the Master Billing module exposes, including the
 * [Mark TPA Received] action for approved / partially-settled bills.
 */
export async function getPatientTpaInvoices(patientId: string) {
    try {
        const { db } = await requireTenantContext();
        const invoices = await db.invoices.findMany({
            where: {
                patient_id: patientId,
                // Any bill that has entered the TPA workflow (covers tpa_insurance
                // bills as well as any invoice with a TPA claim status set).
                OR: [
                    { billing_patient_type: 'tpa_insurance' },
                    { tpa_claim_status: { not: 'not_submitted' } },
                ],
                is_archived: false,
            },
            select: {
                id: true,
                version: true,
                invoice_number: true,
                billing_patient_type: true,
                tpa_provider_id: true,
                tpa_claim_status: true,
                tpa_claim_number: true,
                tpa_approved_amount: true,
                tpa_settled_amount: true,
                net_amount: true,
                created_at: true,
                admission_id: true,
                // Admission status drives the derived "Semi Discharged" badge:
                // status still 'Admitted' but a discharge_date is recorded.
                admission: { select: { status: true, discharge_date: true } },
            },
            orderBy: { created_at: 'desc' },
        });

        // invoices has no tpa_provider relation — resolve provider names in one pass.
        const providerIds = [...new Set(
            invoices.map((i: { tpa_provider_id: number | null }) => i.tpa_provider_id)
                .filter((v: number | null): v is number => v != null)
        )];
        const providers = providerIds.length
            ? await db.insurance_providers.findMany({
                where: { id: { in: providerIds } },
                select: { id: true, provider_name: true },
            })
            : [];
        const providerName = new Map<number, string>(
            providers.map((p: { id: number; provider_name: string }) => [p.id, p.provider_name])
        );

        const data = invoices.map((inv: {
            tpa_provider_id: number | null;
            admission?: { status: string | null; discharge_date: Date | null } | null;
        }) => ({
            ...inv,
            tpa_provider_name: inv.tpa_provider_id != null ? (providerName.get(inv.tpa_provider_id) ?? null) : null,
            is_semi_discharged: isSemiDischarged(inv.admission),
        }));

        return { success: true, data: serialize(data) };
    } catch (error: any) {
        console.error('getPatientTpaInvoices error:', error);
        return { success: false, error: error.message };
    }
}

export async function addPatientPolicy(data: {
    patient_id: string;
    provider_id: number;
    // Policy number, coverage limit + validity are optional at the patient level —
    // they become mandatory only when billing a TPA/insurance patient.
    policy_number?: string;
    policy_holder?: string;
    plan_name?: string;
    member_id?: string;
    policy_type?: string;
    coverage_limit?: number | null;
    copay_percent?: number | null;
    copay_fixed?: number | null;
    valid_from?: string;
    valid_until?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const coverage = data.coverage_limit != null && data.coverage_limit !== ('' as any)
            ? Number(data.coverage_limit)
            : null;
        const copayPct = data.copay_percent != null && data.copay_percent !== ('' as any)
            ? Number(data.copay_percent)
            : null;
        const copayFixed = data.copay_fixed != null && data.copay_fixed !== ('' as any)
            ? Number(data.copay_fixed)
            : null;
        const policyNumber = data.policy_number?.trim() || null;
        const policyData = {
            patient_id: data.patient_id,
            provider_id: data.provider_id,
            policy_number: policyNumber,
            policy_holder: data.policy_holder || null,
            plan_name: data.plan_name || null,
            member_id: data.member_id?.trim() || null,
            policy_type: data.policy_type || null,
            coverage_limit: coverage,
            remaining_limit: coverage,
            copay_percent: copayPct,
            copay_fixed: copayFixed,
            valid_from: data.valid_from ? new Date(data.valid_from) : null,
            valid_until: data.valid_until ? new Date(data.valid_until) : null,
            status: 'Active' as const,
            organizationId,
        };
        const policy = policyNumber
            ? await db.insurance_policies.upsert({
                where: { policy_number: policyNumber },
                create: policyData,
                update: {
                    provider_id: data.provider_id,
                    policy_holder: data.policy_holder || null,
                    plan_name: data.plan_name || null,
                    member_id: data.member_id?.trim() || null,
                    policy_type: data.policy_type || null,
                    coverage_limit: coverage,
                    remaining_limit: coverage,
                    copay_percent: copayPct,
                    copay_fixed: copayFixed,
                    valid_from: data.valid_from ? new Date(data.valid_from) : null,
                    valid_until: data.valid_until ? new Date(data.valid_until) : null,
                    status: 'Active',
                },
            })
            : await db.insurance_policies.create({ data: policyData });

        await db.system_audit_logs.create({
            data: {
                action: 'ADD_INSURANCE_POLICY',
                module: 'insurance',
                entity_type: 'policy',
                entity_id: policyNumber || String(policy.id),
                details: JSON.stringify({ patient_id: data.patient_id, provider_id: data.provider_id }),
                organizationId,
            },
        });

        return { success: true, data: serialize(policy) };
    } catch (error: any) {
        console.error('addPatientPolicy error:', error);
        return { success: false, error: error.message };
    }
}

export async function updatePatientPolicy(id: number, data: {
    provider_id?: number;
    policy_number?: string;
    policy_holder?: string | null;
    plan_name?: string | null;
    member_id?: string | null;
    policy_type?: string | null;
    coverage_limit?: number | null;
    copay_percent?: number | null;
    copay_fixed?: number | null;
    valid_from?: string;
    valid_until?: string;
    status?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        // Verify policy belongs to this tenant
        const existing = await db.insurance_policies.findFirst({ where: { id, organizationId } });
        if (!existing) return { success: false, error: 'Policy not found' };

        const updateData: any = {};
        if (data.provider_id !== undefined) updateData.provider_id = data.provider_id;
        if (data.policy_number !== undefined) updateData.policy_number = data.policy_number?.trim() || null;
        if (data.policy_holder !== undefined) updateData.policy_holder = data.policy_holder || null;
        if (data.plan_name !== undefined) updateData.plan_name = data.plan_name || null;
        if (data.member_id !== undefined) updateData.member_id = data.member_id?.trim() || null;
        if (data.policy_type !== undefined) updateData.policy_type = data.policy_type || null;
        if (data.coverage_limit !== undefined) {
            updateData.coverage_limit = data.coverage_limit;
            // Keep remaining_limit in sync when coverage changes. Derive the amount
            // already consumed from ACTUAL approved/settled claims (not the stored
            // remaining_limit, which may have drifted), so remaining = coverage - consumed.
            const newCoverage = Number(data.coverage_limit || 0);
            const consumedAgg = await db.insurance_claims.aggregate({
                where: { policy_id: id, status: { in: ['Approved', 'PartiallyApproved', 'Settled'] } },
                _sum: { approved_amount: true },
            });
            const consumed = Number(consumedAgg._sum.approved_amount || 0);
            updateData.remaining_limit = Math.max(0, newCoverage - consumed);
        }
        if (data.copay_percent !== undefined) updateData.copay_percent = data.copay_percent;
        if (data.copay_fixed !== undefined) updateData.copay_fixed = data.copay_fixed;
        if (data.valid_from !== undefined) updateData.valid_from = new Date(data.valid_from);
        if (data.valid_until !== undefined) updateData.valid_until = new Date(data.valid_until);
        if (data.status !== undefined) updateData.status = data.status;

        const policy = await db.insurance_policies.update({ where: { id }, data: updateData });

        await db.system_audit_logs.create({
            data: {
                action: 'UPDATE_INSURANCE_POLICY',
                module: 'insurance',
                entity_type: 'policy',
                entity_id: String(id),
                details: JSON.stringify({ fields: Object.keys(updateData) }),
                organizationId,
            },
        });

        return { success: true, data: serialize(policy) };
    } catch (error: any) {
        console.error('updatePatientPolicy error:', error);
        return { success: false, error: error.message };
    }
}

export async function deletePatientPolicy(id: number) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const existing = await db.insurance_policies.findFirst({
            where: { id, organizationId },
            include: { claims: { take: 1 } },
        });
        if (!existing) return { success: false, error: 'Policy not found' };

        // Refuse if claims exist — soft-deactivate instead so claim history survives
        if (existing.claims.length > 0) {
            await db.insurance_policies.update({ where: { id }, data: { status: 'Inactive' } });
            await db.system_audit_logs.create({
                data: {
                    action: 'DEACTIVATE_INSURANCE_POLICY',
                    module: 'insurance',
                    entity_type: 'policy',
                    entity_id: String(id),
                    details: 'Soft-deactivated (claims exist)',
                    organizationId,
                },
            });
            return { success: true, deactivated: true };
        }

        await db.insurance_policies.delete({ where: { id } });
        await db.system_audit_logs.create({
            data: {
                action: 'DELETE_INSURANCE_POLICY',
                module: 'insurance',
                entity_type: 'policy',
                entity_id: String(id),
                details: JSON.stringify({ policy_number: existing.policy_number }),
                organizationId,
            },
        });
        return { success: true, deactivated: false };
    } catch (error: any) {
        console.error('deletePatientPolicy error:', error);
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
        
        // Phase 4: Period Locking
        await checkPeriodLock(db);
        
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

        // Defense in depth: a claim may never exceed the invoice net. For package
        // admissions the invoice nets to package + billable extras (two-ledger
        // package billing), so this also prevents hand-keying an inflated
        // package claim that includes absorbed services.
        const claimInvoice = await db.invoices.findUnique({ where: { id: data.invoice_id } });
        if (!claimInvoice) {
            return { success: false, error: 'Invoice not found' };
        }
        const invoiceNet = Number(claimInvoice.net_amount || 0);
        if (data.claimed_amount > invoiceNet) {
            return {
                success: false,
                error: `Claimed amount (${data.claimed_amount}) exceeds the invoice net amount (${invoiceNet}). Package bills are claimed at the package amount.`,
            };
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

        // Reflect the filed claim on the invoice so the bill/status stay in step —
        // but never downgrade a bill that is already approved/settled.
        if (!['approved', 'partially_settled', 'settled'].includes(String(claimInvoice.tpa_claim_status ?? ''))) {
            await db.invoices.update({
                where: { id: data.invoice_id },
                data: { tpa_claim_status: 'submitted' },
            });
        }

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
        
        // Phase 4: Period Locking
        await checkPeriodLock(db);

        const validStatuses = ['Submitted', 'UnderReview', 'Approved', 'Rejected', 'PartiallyApproved', 'Settled', 'Disputed'];
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
    provider_id?: number;
    limit?: number;
}) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {};
        if (filters?.status) where.status = filters.status;
        if (filters?.policy_id) where.policy_id = filters.policy_id;
        if (filters?.provider_id) where.policy = { provider_id: filters.provider_id };

        const claims = await db.insurance_claims.findMany({
            where,
            include: {
                policy: {
                    include: {
                        patient: { select: { full_name: true, patient_id: true } },
                        provider: { select: { provider_name: true } },
                    },
                },
                invoice: {
                    select: {
                        invoice_number: true, net_amount: true, status: true,
                        // Surfaces the derived "Semi Discharged" badge on the claims list.
                        admission: { select: { status: true, discharge_date: true } },
                    },
                },
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
                status: 'Final',
                // Only IPD (hospitalization) bills go through TPA/insurance claims here —
                // OPD visits are self-pay/corporate and were leaking into this list because
                // this query only checked "patient holds an active policy", not whether the
                // bill itself was ever meant to be claimed.
                invoice_type: 'IPD',
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
                // A claim can be filed against a finalized bill, OR against a
                // semi-discharged patient's frozen Draft bill (discharge summary
                // authored + discharge date recorded, still in a bed awaiting TPA).
                OR: [
                    { status: 'Final' },
                    { status: 'Draft', admission: { status: 'Admitted', discharge_date: { not: null } } },
                ],
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

// Get all pre-authorizations for the dashboard
export async function getAllPreAuths(filters?: { status?: string; limit?: number }) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {};
        if (filters?.status) where.status = filters.status;

        const preauths = await db.insurancePreAuth.findMany({
            where,
            include: {
                admission: {
                    select: {
                        patient: { select: { full_name: true, patient_id: true } }
                    }
                }
            },
            orderBy: { submitted_at: 'desc' },
            take: filters?.limit || 100,
        });

        return { success: true, data: serialize(preauths) };
    } catch (error: any) {
        console.error('getAllPreAuths error:', error);
        return { success: false, error: error.message };
    }
}

// Dispute a rejected claim
export async function disputeClaim(claimId: number, reason: string) {
    try {
        const { db } = await requireTenantContext();
        
        const claim = await db.insurance_claims.update({
            where: { id: claimId },
            data: {
                status: 'Disputed',
                rejection_reason: reason, // Save the dispute reason or update remarks
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'DISPUTE_CLAIM',
                module: 'insurance',
                entity_type: 'claim',
                entity_id: claim.claim_number,
                details: JSON.stringify({ reason }),
            },
        });

        return { success: true, data: serialize(claim) };
    } catch (error: any) {
        console.error('disputeClaim error:', error);
        return { success: false, error: error.message };
    }
}
