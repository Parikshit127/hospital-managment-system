'use server';

/**
 * GAP 9 — Investigation "My List" Feature
 * Each doctor maintains a personal "My List" of frequently advised investigations.
 * Full searchable library on the right, selecting adds to My List.
 */

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

export async function getDoctorInvestigationMyList(doctorId: string) {
    const { db, organizationId } = await requireTenantContext();

    const favorites = await (db as any).doctorInvestigationFavorite.findMany({
        where: { doctor_id: doctorId, organizationId },
        orderBy: [{ display_order: 'asc' }, { investigation_name: 'asc' }],
    });

    return { success: true, data: JSON.parse(JSON.stringify(favorites)) };
}

export async function addToInvestigationMyList(
    doctorId: string,
    investigationName: string,
    category?: string
) {
    const { db, organizationId } = await requireTenantContext();

    try {
        // Get current max display_order
        const maxOrder = await (db as any).doctorInvestigationFavorite.findFirst({
            where: { doctor_id: doctorId, organizationId },
            orderBy: { display_order: 'desc' },
            select: { display_order: true },
        });

        const nextOrder = (maxOrder?.display_order ?? 0) + 1;

        const favorite = await (db as any).doctorInvestigationFavorite.upsert({
            where: {
                doctor_id_investigation_name: {
                    doctor_id: doctorId,
                    investigation_name: investigationName,
                },
            },
            create: {
                doctor_id: doctorId,
                investigation_name: investigationName,
                category: category || null,
                display_order: nextOrder,
                organizationId,
            },
            update: {
                category: category || undefined,
            },
        });

        revalidatePath('/doctor/dashboard');
        return { success: true, data: JSON.parse(JSON.stringify(favorite)) };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to add to My List';
        return { success: false, error: msg };
    }
}

export async function removeFromInvestigationMyList(doctorId: string, investigationName: string) {
    const { db, organizationId } = await requireTenantContext();

    try {
        await (db as any).doctorInvestigationFavorite.deleteMany({
            where: { doctor_id: doctorId, investigation_name: investigationName, organizationId },
        });

        revalidatePath('/doctor/dashboard');
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to remove from My List';
        return { success: false, error: msg };
    }
}

export async function reorderInvestigationMyList(
    doctorId: string,
    orderedNames: string[]
) {
    const { db, organizationId } = await requireTenantContext();

    try {
        const updates = orderedNames.map((name, index) =>
            (db as any).doctorInvestigationFavorite.updateMany({
                where: { doctor_id: doctorId, investigation_name: name, organizationId },
                data: { display_order: index + 1 },
            })
        );

        await Promise.all(updates);
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to reorder My List';
        return { success: false, error: msg };
    }
}

export async function searchInvestigationLibrary(query: string) {
    const { db, organizationId } = await requireTenantContext();

    const tests = await db.lab_test_inventory.findMany({
        where: {
            organizationId,
            is_available: true,
            OR: [
                { test_name: { contains: query, mode: 'insensitive' } },
                { category: { contains: query, mode: 'insensitive' } },
            ],
        },
        select: { id: true, test_name: true, category: true, price: true, sample_type: true },
        take: 30,
    });

    return { success: true, data: JSON.parse(JSON.stringify(tests)) };
}
