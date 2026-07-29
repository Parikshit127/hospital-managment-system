'use server';

/**
 * GAP 8 — Order Set / Saved Prescription Templates
 * Multi-domain combination: Chief Complaints, Gross Examination, Diagnosis,
 * Advice Investigations, Advice Medications, OP Procedure.
 * Selecting an order set auto-fills all fields and they remain editable.
 */

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

export async function createOrderSet(data: {
    doctor_id: string;
    name: string;
    description?: string;
    chief_complaints?: string[];
    gross_examination?: string[];
    diagnosis?: Array<{ text: string; icd10_code?: string }>;
    advice_investigations?: string[];
    advice_medications?: Array<{ name: string; dosage?: string; frequency?: string }>;
    op_procedures?: string[];
}) {
    const { db, organizationId } = await requireTenantContext();

    try {
        const orderSet = await (db as any).orderSet.create({
            data: {
                doctor_id: data.doctor_id,
                name: data.name,
                description: data.description || null,
                chief_complaints: data.chief_complaints || [],
                gross_examination: data.gross_examination || [],
                diagnosis: data.diagnosis || [],
                advice_investigations: data.advice_investigations || [],
                advice_medications: data.advice_medications || [],
                op_procedures: data.op_procedures || [],
                organizationId,
            },
        });

        revalidatePath('/doctor/templates');
        return { success: true, data: JSON.parse(JSON.stringify(orderSet)) };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to create order set';
        return { success: false, error: msg };
    }
}

export async function getOrderSets(doctorId: string) {
    const { db, organizationId } = await requireTenantContext();

    const orderSets = await (db as any).orderSet.findMany({
        where: { doctor_id: doctorId, organizationId },
        orderBy: [{ is_favorite: 'desc' }, { usage_count: 'desc' }, { name: 'asc' }],
    });

    return { success: true, data: JSON.parse(JSON.stringify(orderSets)) };
}

export async function getOrderSetById(orderSetId: string) {
    const { db, organizationId } = await requireTenantContext();

    const orderSet = await (db as any).orderSet.findFirst({
        where: { id: orderSetId, organizationId },
    });

    if (!orderSet) return { success: false, error: 'Order set not found' };

    // Increment usage count
    await (db as any).orderSet.update({
        where: { id: orderSetId },
        data: { usage_count: { increment: 1 } },
    });

    return { success: true, data: JSON.parse(JSON.stringify(orderSet)) };
}

export async function updateOrderSet(
    orderSetId: string,
    data: {
        name?: string;
        description?: string;
        chief_complaints?: string[];
        gross_examination?: string[];
        diagnosis?: Array<{ text: string; icd10_code?: string }>;
        advice_investigations?: string[];
        advice_medications?: Array<{ name: string; dosage?: string; frequency?: string }>;
        op_procedures?: string[];
    }
) {
    const { db, organizationId } = await requireTenantContext();

    try {
        const updateData: Record<string, unknown> = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.chief_complaints !== undefined) updateData.chief_complaints = data.chief_complaints;
        if (data.gross_examination !== undefined) updateData.gross_examination = data.gross_examination;
        if (data.diagnosis !== undefined) updateData.diagnosis = data.diagnosis;
        if (data.advice_investigations !== undefined) updateData.advice_investigations = data.advice_investigations;
        if (data.advice_medications !== undefined) updateData.advice_medications = data.advice_medications;
        if (data.op_procedures !== undefined) updateData.op_procedures = data.op_procedures;

        await (db as any).orderSet.update({
            where: { id: orderSetId, organizationId },
            data: updateData,
        });

        revalidatePath('/doctor/templates');
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to update order set';
        return { success: false, error: msg };
    }
}

export async function deleteOrderSet(orderSetId: string) {
    const { db, organizationId } = await requireTenantContext();

    try {
        await (db as any).orderSet.delete({
            where: { id: orderSetId, organizationId },
        });

        revalidatePath('/doctor/templates');
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to delete order set';
        return { success: false, error: msg };
    }
}

export async function toggleOrderSetFavorite(orderSetId: string, isFavorite: boolean) {
    const { db, organizationId } = await requireTenantContext();

    try {
        await (db as any).orderSet.update({
            where: { id: orderSetId, organizationId },
            data: { is_favorite: isFavorite },
        });

        revalidatePath('/doctor/templates');
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to toggle favorite';
        return { success: false, error: msg };
    }
}
