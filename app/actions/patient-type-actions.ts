'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

// ── Corporate Masters ──────────────────────────────────────────────────────

export async function getCorporateMasters() {
    const { db, organizationId } = await requireTenantContext();
    const corporates = await db.corporateMaster.findMany({
        where: { organizationId, is_active: true },
        orderBy: { company_name: 'asc' },
    });
    return { success: true, data: corporates };
}

export async function getAllCorporateMasters() {
    const { db, organizationId } = await requireTenantContext();
    const corporates = await db.corporateMaster.findMany({
        where: { organizationId },
        orderBy: { company_name: 'asc' },
    });
    return { success: true, data: corporates };
}

export async function createCorporateMaster(data: {
    company_name: string;
    company_code: string;
    contact_person?: string;
    contact_phone?: string;
    contact_email?: string;
    credit_limit?: number;
    discount_percentage?: number;
    payment_terms_days?: number;
    contract_start?: string;
    contract_end?: string;
    covered_services?: string[];
}) {
    const { db, organizationId } = await requireTenantContext();
    try {
        const corporate = await db.corporateMaster.create({
            data: {
                organizationId,
                company_name: data.company_name,
                company_code: data.company_code.toUpperCase(),
                contact_person: data.contact_person || null,
                contact_phone: data.contact_phone || null,
                contact_email: data.contact_email || null,
                credit_limit: data.credit_limit ?? 0,
                discount_percentage: data.discount_percentage ?? 0,
                payment_terms_days: data.payment_terms_days ?? 30,
                contract_start: data.contract_start ? new Date(data.contract_start) : null,
                contract_end: data.contract_end ? new Date(data.contract_end) : null,
                covered_services: data.covered_services ?? [],
            },
        });
        revalidatePath('/reception/finance/corporates');
        return { success: true, data: corporate };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to create corporate';
        return { success: false, error: msg };
    }
}

export async function updateCorporateMaster(id: string, data: {
    company_name?: string;
    contact_person?: string;
    contact_phone?: string;
    contact_email?: string;
    credit_limit?: number;
    discount_percentage?: number;
    payment_terms_days?: number;
    contract_start?: string;
    contract_end?: string;
    is_active?: boolean;
    covered_services?: string[];
}) {
    const { db, organizationId } = await requireTenantContext();
    try {
        const corporate = await db.corporateMaster.update({
            where: { id, organizationId },
            data: {
                ...data,
                contract_start: data.contract_start ? new Date(data.contract_start) : undefined,
                contract_end: data.contract_end ? new Date(data.contract_end) : undefined,
            },
        });
        revalidatePath('/reception/finance/corporates');
        return { success: true, data: corporate };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to update corporate';
        return { success: false, error: msg };
    }
}

// ── TPA / Insurance Providers ──────────────────────────────────────────────

export async function getTpaProviders() {
    const { db, organizationId } = await requireTenantContext();
    const providers = await db.insurance_providers.findMany({
        where: { organizationId, is_active: true },
        orderBy: { provider_name: 'asc' },
    });
    return { success: true, data: providers };
}

export async function getAllTpaProviders() {
    const { db, organizationId } = await requireTenantContext();
    const providers = await db.insurance_providers.findMany({
        where: { organizationId },
        orderBy: { provider_name: 'asc' },
    });
    return { success: true, data: providers };
}

export async function createTpaProvider(data: {
    provider_name: string;
    provider_code: string;
    tpa_type?: string;
    contact_person?: string;
    contact_phone?: string;
    contact_email?: string;
    pre_auth_required?: boolean;
    claim_submission_mode?: string;
    default_discount_percentage?: number;
    payment_terms_days?: number;
    covered_services?: string[];
    excluded_services?: string[];
}) {
    const { db, organizationId } = await requireTenantContext();
    try {
        const provider = await db.insurance_providers.create({
            data: {
                organizationId,
                provider_name: data.provider_name,
                provider_code: data.provider_code.toUpperCase(),
                tpa_type: data.tpa_type || null,
                contact_person: data.contact_person || null,
                contact_phone: data.contact_phone || null,
                contact_email: data.contact_email || null,
                pre_auth_required: data.pre_auth_required ?? true,
                claim_submission_mode: data.claim_submission_mode || 'online',
                default_discount_percentage: data.default_discount_percentage ?? 0,
                payment_terms_days: data.payment_terms_days ?? 45,
                covered_services: data.covered_services ?? [],
                excluded_services: data.excluded_services ?? [],
            },
        });
        revalidatePath('/reception/finance/tpa-insurance');
        return { success: true, data: provider };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to create TPA provider';
        return { success: false, error: msg };
    }
}

export async function updateTpaProvider(id: number, data: {
    provider_name?: string;
    tpa_type?: string;
    contact_person?: string;
    contact_phone?: string;
    contact_email?: string;
    pre_auth_required?: boolean;
    claim_submission_mode?: string;
    default_discount_percentage?: number;
    payment_terms_days?: number;
    is_active?: boolean;
    covered_services?: string[];
    excluded_services?: string[];
}) {
    const { db, organizationId } = await requireTenantContext();
    try {
        const provider = await db.insurance_providers.update({
            where: { id, organizationId },
            data,
        });
        revalidatePath('/reception/finance/tpa-insurance');
        return { success: true, data: provider };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to update TPA provider';
        return { success: false, error: msg };
    }
}

// ── Patient Coverage ───────────────────────────────────────────────────────

export async function getPatientCoverage(patientId: string) {
    const { db, organizationId } = await requireTenantContext();

    const patient = await db.oPD_REG.findFirst({
        where: { patient_id: patientId, organizationId },
        select: {
            patient_type: true,
            corporate_id: true,
            corporate_card_number: true,
            employee_id: true,
            corporate: {
                select: {
                    id: true,
                    company_name: true,
                    company_code: true,
                    discount_percentage: true,
                    credit_limit: true,
                    current_balance: true,
                    contract_start: true,
                    contract_end: true,
                    covered_services: true,
                },
            },
            insurance_policies: {
                orderBy: { created_at: 'desc' },
                take: 1,
                include: {
                    provider: {
                        select: {
                            id: true,
                            provider_name: true,
                            provider_code: true,
                            pre_auth_required: true,
                            default_discount_percentage: true,
                            covered_services: true,
                            excluded_services: true,
                        },
                    },
                },
            },
        },
    });

    if (!patient) return { success: false, error: 'Patient not found' };
    return { success: true, data: patient };
}

// ── Pre-Authorization ──────────────────────────────────────────────────────

export async function createPreAuthorization(data: {
    patient_id: string;
    provider_id?: number;
    corporate_id?: string;
    appointment_id?: string;
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
                appointment_id: data.appointment_id || null,
                pre_auth_number: data.pre_auth_number || null,
                requested_amount: data.requested_amount ?? null,
                valid_until: data.valid_until ? new Date(data.valid_until) : null,
                remarks: data.remarks || null,
                status: 'pending',
            },
        });
        return { success: true, data: preAuth };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to create pre-authorization';
        return { success: false, error: msg };
    }
}

export async function updatePreAuthStatus(id: string, status: string, approvedAmount?: number) {
    const { db, organizationId } = await requireTenantContext();
    try {
        const preAuth = await db.preAuthorization.update({
            where: { id, organizationId },
            data: {
                status,
                approved_amount: approvedAmount ?? undefined,
                responded_at: new Date(),
            },
        });
        return { success: true, data: preAuth };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to update pre-authorization';
        return { success: false, error: msg };
    }
}

export async function getPatientPreAuthorizations(patientId: string) {
    const { db, organizationId } = await requireTenantContext();
    const preAuths = await db.preAuthorization.findMany({
        where: { patient_id: patientId, organizationId },
        include: {
            provider: { select: { provider_name: true } },
            corporate: { select: { company_name: true } },
        },
        orderBy: { created_at: 'desc' },
    });
    return { success: true, data: preAuths };
}

// ── Corporate Balance ──────────────────────────────────────────────────────

export async function getCorporateBalance(corporateId: string) {
    const { db, organizationId } = await requireTenantContext();
    const corporate = await db.corporateMaster.findFirst({
        where: { id: corporateId, organizationId },
        select: { credit_limit: true, current_balance: true },
    });
    if (!corporate) return { success: false, error: 'Corporate not found' };
    const used = Number(corporate.current_balance);
    const limit = Number(corporate.credit_limit);
    return {
        success: true,
        data: { creditLimit: limit, used, remaining: limit - used },
    };
}
