'use server';

/**
 * GAP 4 — Coordinator Login with Doctor Approval Workflow
 * Coordinator enters EMR data on doctor's behalf.
 * Captures "typed_by" vs "signed_by" as separate fields.
 * Doctor sees pending approvals on their screen.
 */

import { requireRoleAndTenant } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

export async function createEncounterAsCoordinator(data: {
    patient_id: string;
    appointment_id?: string;
    doctor_id: string;
    subjective?: Record<string, unknown>;
    objective?: Record<string, unknown>;
    assessment?: unknown[];
    plan?: Record<string, unknown>;
}) {
    // Identity comes from the session, never the client.
    const { db, session, organizationId } = await requireRoleAndTenant(['coordinator', 'admin']);
    const coordinatorId = session.id;

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
                typed_by: coordinatorId,
                entered_by: coordinatorId,
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
    data: {
        subjective?: Record<string, unknown>;
        objective?: Record<string, unknown>;
        assessment?: unknown[];
        plan?: Record<string, unknown>;
    }
) {
    const { db, session, organizationId } = await requireRoleAndTenant(['coordinator', 'admin']);
    const coordinatorId = session.id;

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

export async function approveEncounter(encounterId: string) {
    // Only the signing clinician (doctor) or an admin may approve. The signer
    // identity is taken from the session — never supplied by the client.
    const { db, session, organizationId } = await requireRoleAndTenant(['doctor', 'admin']);

    try {
        await db.clinicalEncounter.update({
            where: { id: encounterId, organizationId },
            data: {
                approval_status: 'approved',
                approved_at: new Date(),
                signed_by: session.id,
                signed_at: new Date(),
                status: 'completed',
            },
        });

        revalidatePath('/doctor/pending-approvals');
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to approve encounter';
        return { success: false, error: msg };
    }
}

export async function rejectEncounter(encounterId: string, reason: string) {
    const { db, organizationId } = await requireRoleAndTenant(['doctor', 'admin']);

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

        revalidatePath('/doctor/pending-approvals');
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to reject encounter';
        return { success: false, error: msg };
    }
}

/**
 * Pending EMR approvals for the signed-in clinician.
 * A doctor sees only their own pending encounters; an admin sees all
 * pending encounters in the organization. The doctor id is taken from
 * the session, not the URL.
 */
export async function getPendingApprovals() {
    const { db, session, organizationId } = await requireRoleAndTenant(['doctor', 'admin']);

    const pending = await db.clinicalEncounter.findMany({
        where: {
            organizationId,
            approval_status: 'pending_approval',
            // Admins review the whole org; doctors only their own queue.
            ...(session.role === 'doctor' ? { doctor_id: session.id } : {}),
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

/**
 * Encounters typed by the signed-in coordinator, newest first.
 * Identity is taken from the session.
 */
export async function getCoordinatorEncounters() {
    const { db, session, organizationId } = await requireRoleAndTenant(['coordinator', 'admin']);

    const encounters = await db.clinicalEncounter.findMany({
        where: { typed_by: session.id, organizationId },
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
