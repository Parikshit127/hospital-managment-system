'use server';

import { requireTenantContext, requireRoleAndTenant } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

// Next.js redacts any message thrown out of a Server Action in production
// builds — the client only ever sees a generic "Server Components render"
// error plus a digest, and the real message only reaches the server log. So
// every user-facing failure below is returned as data instead of thrown.
type ActionResult = { success: boolean; error?: string };

export async function getIpdInventory() {
    const { db, organizationId } = await requireTenantContext();
    
    // Fetch departments as well
    const departments = await db.department.findMany({
        where: { organizationId }
    });

    const wards = await db.wards.findMany({
        where: { organizationId },
        include: {
            beds: true,
            department: true,
        },
        orderBy: { ward_name: 'asc' }
    });
    
    return JSON.parse(JSON.stringify({ wards, departments }));
}

export async function createWard(data: {
    ward_name: string;
    ward_type: string;
    department_id?: string;
    floor_number?: string;
    cost_per_day?: number;
    nursing_charge?: number;
}): Promise<ActionResult> {
    try {
        const { db, organizationId } = await requireTenantContext();
        await db.wards.create({
            data: {
                ward_name: data.ward_name,
                ward_type: data.ward_type,
                department_id: data.department_id || null,
                floor_number: data.floor_number || null,
                cost_per_day: data.cost_per_day ?? 0,
                nursing_charge: data.nursing_charge ?? 0,
                organizationId,
                is_active: true,
            }
        });

        revalidatePath('/admin/ipd-setup');
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || 'Failed to create ward' };
    }
}

export async function updateWard(ward_id: number, data: {
    ward_name?: string;
    ward_type?: string;
    department_id?: string | null;
    floor_number?: string | null;
    cost_per_day?: number;
    nursing_charge?: number;
}): Promise<ActionResult> {
    try {
        const { db } = await requireTenantContext();
        await db.wards.update({
            where: { ward_id },
            data: {
                ...(data.ward_name !== undefined && { ward_name: data.ward_name }),
                ...(data.ward_type !== undefined && { ward_type: data.ward_type }),
                ...(data.department_id !== undefined && { department_id: data.department_id }),
                ...(data.floor_number !== undefined && { floor_number: data.floor_number }),
                ...(data.cost_per_day !== undefined && { cost_per_day: data.cost_per_day }),
                ...(data.nursing_charge !== undefined && { nursing_charge: data.nursing_charge }),
            }
        });
        revalidatePath('/admin/ipd-setup');
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || 'Failed to update ward' };
    }
}

export async function bulkAddBeds(data: {
    ward_id: number;
    start_number: number;
    end_number: number;
    prefix: string;
    bed_category: string;
    pricing_tier: string;
    is_isolation?: boolean;
}): Promise<ActionResult> {
    try {
        const { db, organizationId } = await requireTenantContext();
        const { ward_id, start_number, end_number, prefix, bed_category, pricing_tier, is_isolation } = data;

        const count = end_number - start_number + 1;
        if (count <= 0 || count > 100) {
            return { success: false, error: 'Invalid range. Can only create up to 100 beds at a time.' };
        }

        const bedsData = [];
        for (let i = start_number; i <= end_number; i++) {
            const bedLabel = `${prefix}${i}`;
            const uniqueId = `${organizationId}-${ward_id}-${bedLabel}`;

            bedsData.push({
                bed_id: uniqueId,
                bed_name: bedLabel,
                ward_id,
                status: 'Available',
                bed_category,
                pricing_tier,
                is_isolation: is_isolation ?? false,
                organizationId
            });
        }

        await db.beds.createMany({
            data: bedsData,
            skipDuplicates: true
        });

        revalidatePath('/admin/ipd-setup');
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || 'Failed to add beds' };
    }
}

export async function updateBedStatus(bed_id: string, status: string, category?: string, tier?: string, is_isolation?: boolean): Promise<ActionResult> {
    try {
        const { db } = await requireTenantContext();
        await db.beds.update({
            where: { bed_id },
            data: {
                status,
                ...(category !== undefined && { bed_category: category }),
                ...(tier !== undefined && { pricing_tier: tier }),
                ...(is_isolation !== undefined && { is_isolation }),
            }
        });
        revalidatePath('/admin/ipd-setup');
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || 'Failed to update bed' };
    }
}

export async function toggleWardActive(ward_id: number, is_active: boolean): Promise<ActionResult> {
    try {
        const { db } = await requireTenantContext();
        await db.wards.update({
            where: { ward_id },
            data: { is_active }
        });
        revalidatePath('/admin/ipd-setup');
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || 'Failed to update ward status' };
    }
}

// Rename a bed's display label (bed_id remains the immutable key). Admin only.
export async function renameBed(bed_id: string, bed_name: string): Promise<ActionResult> {
    try {
        const { db } = await requireRoleAndTenant(['admin']);
        await db.beds.update({
            where: { bed_id },
            data: { bed_name: bed_name.trim() || null },
        });
        revalidatePath('/admin/ipd-setup');
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || 'Failed to rename bed' };
    }
}

// Permanently delete a bed. Blocked if it has any admission history. Admin only.
export async function deleteBed(bed_id: string): Promise<ActionResult> {
    try {
        const { db } = await requireRoleAndTenant(['admin']);
        const admissionCount = await db.admissions.count({ where: { bed_id } });
        if (admissionCount > 0) {
            return { success: false, error: 'This bed has admission history and cannot be deleted. Set its status to "Blocked" instead.' };
        }
        await db.beds.delete({ where: { bed_id } });
        revalidatePath('/admin/ipd-setup');
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || 'Failed to delete bed' };
    }
}

// Permanently delete a ward. Blocked if it still has beds, ward-level pharmacy
// stock, or any admission history. Admin only.
export async function deleteWard(ward_id: number): Promise<ActionResult> {
    try {
        const { db } = await requireRoleAndTenant(['admin']);
        const bedCount = await db.beds.count({ where: { ward_id } });
        if (bedCount > 0) {
            return { success: false, error: `Cannot delete a ward that still has ${bedCount} bed(s). Delete the beds first, or deactivate the ward.` };
        }
        const admissionCount = await db.admissions.count({ where: { ward_id } });
        if (admissionCount > 0) {
            return { success: false, error: 'This ward has admission history and cannot be deleted. Deactivate it instead.' };
        }
        // WardStock carries a real foreign key to wards.ward_id with no cascade —
        // deleting a ward that still has pharmacy stock tracked against it throws
        // a raw, unguarded FK violation instead of the checks above.
        const stockCount = await db.wardStock.count({ where: { ward_id } });
        if (stockCount > 0) {
            return { success: false, error: `Cannot delete a ward that still has ${stockCount} pharmacy stock item(s) tracked against it. Clear ward stock first, or deactivate the ward.` };
        }
        await db.wards.delete({ where: { ward_id } });
        revalidatePath('/admin/ipd-setup');
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || 'Failed to delete ward' };
    }
}
