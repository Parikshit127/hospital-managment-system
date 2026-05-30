'use server';

import { requireTenantContext } from '@/backend/tenant';
import { getBillBranding, type BillBranding } from '@/app/lib/bill-branding';

export async function fetchBillBranding(): Promise<{ success: boolean; data?: BillBranding; error?: string }> {
    try {
        const { organizationId } = await requireTenantContext();
        const branding = await getBillBranding(organizationId);
        return { success: true, data: branding };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
