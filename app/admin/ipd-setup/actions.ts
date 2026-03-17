'use server';

import { requireTenantContext } from '@/backend/tenant';
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
}) {
    const { db, organizationId } = await requireTenantContext();
    await db.wards.create({
        data: {
            ward_name: data.ward_name,
            ward_type: data.ward_type,
            department_id: data.department_id,
            floor_number: data.floor_number,
            organizationId,
            is_active: true,
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
}) {
    const { db, organizationId } = await requireTenantContext();
    const { ward_id, start_number, end_number, prefix, bed_category, pricing_tier } = data;
    
    const count = end_number - start_number + 1;
    if (count <= 0 || count > 100) {
        throw new Error("Invalid range. Can only create up to 100 beds at a time.");
    }
    
    const bedsData = [];
    for (let i = start_number; i <= end_number; i++) {
        // e.g. "org_id-ICU-101"
        const bedLabel = `${prefix}${i}`;
        const uniqueId = `${organizationId}-${ward_id}-${bedLabel}`;
        
        bedsData.push({
            bed_id: uniqueId, 
            ward_id,
            status: 'Available',
            bed_category,
            pricing_tier,
            organizationId
        });
    }

    // Since Prisma createMany doesn't skip duplicates well in older APIs we might want skipDuplicates: true
    await db.beds.createMany({
        data: bedsData,
        skipDuplicates: true
    });

    revalidatePath('/admin/ipd-setup');
}

export async function updateBedStatus(bed_id: string, status: string, category?: string, tier?: string) {
    const { db } = await requireTenantContext();
    await db.beds.update({
        where: { bed_id },
        data: {
            status,
            ...(category && { bed_category: category }),
            ...(tier && { pricing_tier: tier }),
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
