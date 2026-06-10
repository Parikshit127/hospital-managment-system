'use server';

import { requireTenantContext, requireRoleAndTenant } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

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
}) {
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
}

export async function updateWard(ward_id: number, data: {
    ward_name?: string;
    ward_type?: string;
    department_id?: string | null;
    floor_number?: string | null;
    cost_per_day?: number;
    nursing_charge?: number;
}) {
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
}

export async function bulkAddBeds(data: {
    ward_id: number;
    start_number: number;
    end_number: number;
    prefix: string;
    bed_category: string;
    pricing_tier: string;
    is_isolation?: boolean;
}) {
    const { db, organizationId } = await requireTenantContext();
    const { ward_id, start_number, end_number, prefix, bed_category, pricing_tier, is_isolation } = data;
    
    const count = end_number - start_number + 1;
    if (count <= 0 || count > 100) {
        throw new Error("Invalid range. Can only create up to 100 beds at a time.");
    }
    
    const bedsData = [];
    for (let i = start_number; i <= end_number; i++) {
        const bedLabel = `${prefix}${i}`;
        const uniqueId = `${organizationId}-${ward_id}-${bedLabel}`;
        
        bedsData.push({
            bed_id: uniqueId, 
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
}

export async function updateBedStatus(bed_id: string, status: string, category?: string, tier?: string, is_isolation?: boolean) {
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
}

export async function toggleWardActive(ward_id: number, is_active: boolean) {
    const { db } = await requireTenantContext();
    await db.wards.update({
        where: { ward_id },
        data: { is_active }
    });
    revalidatePath('/admin/ipd-setup');
}

// Rename a bed's display label (bed_id remains the immutable key). Admin only.
export async function renameBed(bed_id: string, bed_name: string) {
    const { db } = await requireRoleAndTenant(['admin']);
    await db.beds.update({
        where: { bed_id },
        data: { bed_name: bed_name.trim() || null },
    });
    revalidatePath('/admin/ipd-setup');
}

// Permanently delete a bed. Blocked if it has any admission history. Admin only.
export async function deleteBed(bed_id: string) {
    const { db } = await requireRoleAndTenant(['admin']);
    const admissionCount = await db.admissions.count({ where: { bed_id } });
    if (admissionCount > 0) {
        throw new Error('This bed has admission history and cannot be deleted. Set its status to "Blocked" instead.');
    }
    await db.beds.delete({ where: { bed_id } });
    revalidatePath('/admin/ipd-setup');
}

// Permanently delete a ward. Blocked if it still has beds or any admission history. Admin only.
export async function deleteWard(ward_id: number) {
    const { db } = await requireRoleAndTenant(['admin']);
    const bedCount = await db.beds.count({ where: { ward_id } });
    if (bedCount > 0) {
        throw new Error(`Cannot delete a ward that still has ${bedCount} bed(s). Delete the beds first, or deactivate the ward.`);
    }
    const admissionCount = await db.admissions.count({ where: { ward_id } });
    if (admissionCount > 0) {
        throw new Error('This ward has admission history and cannot be deleted. Deactivate it instead.');
    }
    await db.wards.delete({ where: { ward_id } });
    revalidatePath('/admin/ipd-setup');
}
