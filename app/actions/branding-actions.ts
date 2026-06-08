'use server';

import { requireTenantContext } from '@/backend/tenant';
import { getBillBranding, type BillBranding } from '@/app/lib/bill-branding';
import { getPharmacyBranding, type PharmacyBranding } from '@/app/lib/pharmacy-branding';

export async function fetchBillBranding(): Promise<{ success: boolean; data?: BillBranding; error?: string }> {
    try {
        const { organizationId } = await requireTenantContext();
        const branding = await getBillBranding(organizationId);
        return { success: true, data: branding };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function fetchPharmacyBranding(): Promise<{ success: boolean; data?: PharmacyBranding; error?: string }> {
    try {
        const { organizationId } = await requireTenantContext();
        const pharmacy = getPharmacyBranding(organizationId);
        return { success: true, data: pharmacy };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
