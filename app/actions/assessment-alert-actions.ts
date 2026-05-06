'use server';

/**
 * GAP 5 — 2-Hour Initial Assessment Alert with Group Notification
 * Tracks arrival in unit, creates 2-hour countdown, alerts doctor group.
 */

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

export async function recordPatientArrivalInUnit(
    admissionId: string,
    patientId: string,
    doctorGroupId?: string
) {
    const { db, organizationId } = await requireTenantContext();

    try {
        const arrivalTime = new Date();
        const dueTime = new Date(arrivalTime.getTime() + 2 * 60 * 60 * 1000); // +2 hours

        const alert = await (db as any).nursingAssessmentAlert.create({
            data: {
                admission_id: admissionId,
                patient_id: patientId,
                arrival_in_unit_at: arrivalTime,
                assessment_due_at: dueTime,
                doctor_group_id: doctorGroupId || null,
                organizationId,
            },
        });

        // Notify doctor group immediately
        if (doctorGroupId) {
            const groupMembers = await (db.user.findMany as any)({
                where: { doctor_group_id: doctorGroupId, organizationId },
                select: { id: true },
            });

            const notifications = groupMembers.map((m: { id: string }) => ({
                organizationId,
                user_id: m.id,
                title: '⏱ Initial Assessment Required',
                body: `Patient ${patientId} has arrived in the ward. Initial assessment must be completed within 2 hours (by ${dueTime.toLocaleTimeString()}).`,
                type: 'warning',
            }));

            if (notifications.length > 0) {
                await db.notification.createMany({ data: notifications });
            }
        }

        revalidatePath('/ipd/nursing-assessment');
        return { success: true, data: JSON.parse(JSON.stringify(alert)) };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to record arrival';
        return { success: false, error: msg };
    }
}

export async function markAssessmentCompleted(admissionId: string, completedBy: string) {
    const { db, organizationId } = await requireTenantContext();

    try {
        const alert = await (db as any).nursingAssessmentAlert.findFirst({
            where: { admission_id: admissionId, organizationId, assessment_completed: false },
        });

        if (!alert) return { success: false, error: 'No pending assessment alert found' };

        const completedAt = new Date();
        const arrivalTime = new Date(alert.arrival_in_unit_at);
        const minutesTaken = Math.round((completedAt.getTime() - arrivalTime.getTime()) / 60000);
        const wasOnTime = completedAt <= new Date(alert.assessment_due_at);

        await (db as any).nursingAssessmentAlert.update({
            where: { id: alert.id },
            data: {
                assessment_completed: true,
                completed_at: completedAt,
            },
        });

        // Notify group on completion
        if (alert.doctor_group_id) {
            const groupMembers = await (db.user.findMany as any)({
                where: { doctor_group_id: alert.doctor_group_id, organizationId },
                select: { id: true },
            });

            const statusEmoji = wasOnTime ? '✅' : '⚠️';
            const notifications = groupMembers.map((m: { id: string }) => ({
                organizationId,
                user_id: m.id,
                title: `${statusEmoji} Initial Assessment Completed`,
                body: `Assessment for patient ${alert.patient_id} completed in ${minutesTaken} minutes by ${completedBy}. ${wasOnTime ? 'On time.' : 'OVERDUE.'}`,
                type: wasOnTime ? 'success' : 'warning',
            }));

            if (notifications.length > 0) {
                await db.notification.createMany({ data: notifications });
            }
        }

        revalidatePath('/ipd/nursing-assessment');
        return { success: true, was_on_time: wasOnTime, minutes_taken: minutesTaken };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to mark assessment completed';
        return { success: false, error: msg };
    }
}

export async function getOverdueAssessments() {
    const { db, organizationId } = await requireTenantContext();

    const now = new Date();
    const overdue = await (db as any).nursingAssessmentAlert.findMany({
        where: {
            organizationId,
            assessment_completed: false,
            assessment_due_at: { lt: now },
        },
        orderBy: { assessment_due_at: 'asc' },
    });

    return { success: true, data: JSON.parse(JSON.stringify(overdue)) };
}

export async function getPendingAssessments() {
    const { db, organizationId } = await requireTenantContext();

    const now = new Date();
    const pending = await (db as any).nursingAssessmentAlert.findMany({
        where: {
            organizationId,
            assessment_completed: false,
            assessment_due_at: { gte: now },
        },
        orderBy: { assessment_due_at: 'asc' },
    });

    return { success: true, data: JSON.parse(JSON.stringify(pending)) };
}
