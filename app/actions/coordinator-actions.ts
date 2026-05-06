'use server';

/**
 * GAP 4 — Coordinator Login with Doctor Approval Workflow
 * Coordinator enters EMR data on doctor's behalf.
 * Captures "typed_by" vs "signed_by" as separate fields.
 * Doctor sees pending approvals on their screen.
 */

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

export async function createEncounterAsCoordinator(data: {
    patient_id: string;
    appointment_id?: string;
    doctor_id: string;
    coordinator_id: string;
    subjective?: Record<string, unknown>;
    objective?: Record<string, unknown>;
    assessment?: unknown[];
    plan?: Record<string, unknown>;
}) {
    const { db, organizationId } = await requireTenantContext();

    try {
        const encounter = await db.clinicalEncounter.create({
            data: {
                organizationId,
                patient_id: data.patient_id,
                appointment_id: data.appointment_id || null,
                doctor_id: data.doctor_id,
                subjective: (data.subjective as object) ?? {},
                objective: (data.objective as object) ?? {},
                assessment: (data.assessment as object[]) ?? [],
                plan: (data.plan as object) ?? {},
                status: 'in_progress',
                typed_by: data.coordinator_id,
                entered_by: data.coordinator_id,
                approval_status: 'pending_approval',
            },
        });

        // Create notification for the doctor
        await db.notification.create({
            data: {
                organizationId,
                user_id: data.doctor_id,
                title: 'EMR Entry Pending Approval',
                body: `A coordinator has entered EMR data for patient ${data.patient_id}. Please review and approve.`,
                type: 'warning',
            },
        });

        revalidatePath('/doctor/dashboard');
        return { success: true, data: JSON.parse(JSON.stringify(encounter)) };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to create coordinator encounter';
        return { success: false, error: msg };
    }
}

export async function updateEncounterAsCoordinator(
    encounterId: string,
    coordinatorId: string,
    data: {
        subjective?: Record<string, unknown>;
        objective?: Record<string, unknown>;
        assessment?: unknown[];
        plan?: Record<string, unknown>;
    }
) {
    const { db, organizationId } = await requireTenantContext();

    try {
        // Verify coordinator is allowed to edit (encounter must be in draft/pending)
        const existing = await db.clinicalEncounter.findFirst({
            where: { id: encounterId, organizationId, typed_by: coordinatorId },
        });

        if (!existing) return { success: false, error: 'Encounter not found or not editable by this coordinator' };
        if (existing.approval_status === 'approved') {
            return { success: false, error: 'Cannot edit an approved encounter' };
        }

        const updateData: Record<string, unknown> = {
            typed_by: coordinatorId,
            approval_status: 'pending_approval',
        };
        if (data.subjective !== undefined) updateData.subjective = data.subjective;
        if (data.objective !== undefined) updateData.objective = data.objective;
        if (data.assessment !== undefined) updateData.assessment = data.assessment;
        if (data.plan !== undefined) updateData.plan = data.plan;

        await db.clinicalEncounter.update({
            where: { id: encounterId, organizationId },
            data: updateData,
        });

        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to update encounter';
        return { success: false, error: msg };
    }
}

export async function approveEncounter(encounterId: string, doctorId: string) {
    const { db, organizationId } = await requireTenantContext();

    try {
        await db.clinicalEncounter.update({
            where: { id: encounterId, organizationId },
            data: {
                approval_status: 'approved',
                approved_at: new Date(),
                signed_by: doctorId,
                signed_at: new Date(),
                status: 'completed',
            },
        });

        revalidatePath('/doctor/dashboard');
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to approve encounter';
        return { success: false, error: msg };
    }
}

export async function rejectEncounter(encounterId: string, doctorId: string, reason: string) {
    const { db, organizationId } = await requireTenantContext();

    try {
        const encounter = await db.clinicalEncounter.findFirst({
            where: { id: encounterId, organizationId },
            select: { typed_by: true },
        });

        await db.clinicalEncounter.update({
            where: { id: encounterId, organizationId },
            data: {
                approval_status: 'rejected',
                rejected_at: new Date(),
                rejection_reason: reason,
            },
        });

        // Notify coordinator
        if (encounter?.typed_by) {
            await db.notification.create({
                data: {
                    organizationId,
                    user_id: encounter.typed_by,
                    title: 'EMR Entry Rejected',
                    body: `Dr. rejected your EMR entry. Reason: ${reason}`,
                    type: 'critical',
                },
            });
        }

        revalidatePath('/doctor/dashboard');
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to reject encounter';
        return { success: false, error: msg };
    }
}

export async function getPendingApprovals(doctorId: string) {
    const { db, organizationId } = await requireTenantContext();

    const pending = await db.clinicalEncounter.findMany({
        where: {
            doctor_id: doctorId,
            organizationId,
            approval_status: 'pending_approval',
        },
        orderBy: { created_at: 'desc' },
        include: {
            patient: {
                select: { patient_id: true, full_name: true, age: true, gender: true },
            },
        },
    });

    return { success: true, data: JSON.parse(JSON.stringify(pending)) };
}

export async function getCoordinatorEncounters(coordinatorId: string) {
    const { db, organizationId } = await requireTenantContext();

    const encounters = await db.clinicalEncounter.findMany({
        where: { typed_by: coordinatorId, organizationId },
        orderBy: { created_at: 'desc' },
        take: 50,
        include: {
            patient: {
                select: { patient_id: true, full_name: true },
            },
        },
    });

    return { success: true, data: JSON.parse(JSON.stringify(encounters)) };
}
