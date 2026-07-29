'use server';

import { requireTenantContext } from '@/backend/tenant';

function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

// ============================================
// LAB TEST PRICING
// ============================================

export async function getLabTestPricing() {
    try {
        const { db } = await requireTenantContext();
        const tests = await db.lab_test_inventory.findMany({
            orderBy: { test_name: 'asc' },
        });
        return { success: true, data: serialize(tests) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateLabTestPrice(id: number, data: {
    price?: number;
    hsn_sac_code?: string;
    tax_rate?: number;
}) {
    try {
        const { db } = await requireTenantContext();
        const test = await db.lab_test_inventory.update({
            where: { id },
            data: {
                ...(data.price !== undefined && { price: data.price }),
                ...(data.hsn_sac_code !== undefined && { hsn_sac_code: data.hsn_sac_code }),
                ...(data.tax_rate !== undefined && { tax_rate: data.tax_rate }),
            },
        });
        return { success: true, data: serialize(test) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ============================================
// PHARMACY PRICING
// ============================================

export async function getPharmacyPricing() {
    try {
        const { db } = await requireTenantContext();
        const medicines = await db.pharmacy_medicine_master.findMany({
            orderBy: { brand_name: 'asc' },
        });
        return { success: true, data: serialize(medicines) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateMedicinePrice(id: number, data: {
    price_per_unit?: number;
    hsn_sac_code?: string;
    tax_rate?: number;
}) {
    try {
        const { db } = await requireTenantContext();
        const medicine = await db.pharmacy_medicine_master.update({
            where: { id },
            data: {
                ...(data.price_per_unit !== undefined && { price_per_unit: data.price_per_unit }),
                ...(data.hsn_sac_code !== undefined && { hsn_sac_code: data.hsn_sac_code }),
                ...(data.tax_rate !== undefined && { tax_rate: data.tax_rate }),
            },
        });
        return { success: true, data: serialize(medicine) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ============================================
// DOCTOR CONSULTATION FEES
// ============================================

export async function getDoctorFees() {
    try {
        const { db } = await requireTenantContext();
        const doctors = await db.user.findMany({
            where: { role: 'doctor', is_active: true },
            select: {
                id: true,
                name: true,
                username: true,
                specialty: true,
                consultation_fee: true,
                follow_up_fee: true,
            },
            orderBy: { name: 'asc' },
        });
        return { success: true, data: serialize(doctors) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateDoctorFee(userId: string, data: {
    consultation_fee?: number;
    follow_up_fee?: number;
}) {
    try {
        const { db } = await requireTenantContext();
        const doctor = await db.user.update({
            where: { id: userId },
            data: {
                ...(data.consultation_fee !== undefined && { consultation_fee: data.consultation_fee }),
                ...(data.follow_up_fee !== undefined && { follow_up_fee: data.follow_up_fee }),
            },
        });
        return { success: true, data: serialize(doctor) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ============================================
// WARD & ROOM CHARGES
// ============================================

export async function getWardPricing() {
    try {
        const { db } = await requireTenantContext();
        const wards = await db.wards.findMany({
            orderBy: { ward_name: 'asc' },
        });
        return { success: true, data: serialize(wards) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateWardPricing(wardId: number, data: {
    cost_per_day?: number;
    nursing_charge?: number;
}) {
    try {
        const { db } = await requireTenantContext();
        const ward = await db.wards.update({
            where: { ward_id: wardId },
            data: {
                ...(data.cost_per_day !== undefined && { cost_per_day: data.cost_per_day }),
                ...(data.nursing_charge !== undefined && { nursing_charge: data.nursing_charge }),
            },
        });
        return { success: true, data: serialize(ward) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
