'use server';

/**
 * GAP 3 — Doctor Group Hierarchy — Senior/Junior Access
 * Implements group of doctors (senior + juniors) with shared patient access.
 * Every entry shows against the individual who made it.
 */

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

export async function createDoctorGroup(groupId: string, leadDoctorId: string, memberIds: string[]) {
    const { db, organizationId } = await requireTenantContext();

    try {
        // Set group lead
        await (db.user.update as any)({
            where: { id: leadDoctorId, organizationId },
            data: { doctor_group_id: groupId, is_group_lead: true },
        });

        // Set group members with supervisor
        if (memberIds.length > 0) {
            await (db.user.updateMany as any)({
                where: { id: { in: memberIds }, organizationId },
                data: { doctor_group_id: groupId, supervisor_id: leadDoctorId, is_group_lead: false },
            });
        }

        revalidatePath('/admin/doctors');
        return { success: true, message: `Doctor group ${groupId} created with ${memberIds.length + 1} members` };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to create doctor group';
        return { success: false, error: msg };
    }
}

export async function getDoctorGroup(groupId: string) {
    const { db, organizationId } = await requireTenantContext();

    const members = await (db.user.findMany as any)({
        where: { doctor_group_id: groupId, organizationId },
        select: {
            id: true,
            name: true,
            username: true,
            specialty: true,
            is_group_lead: true,
            supervisor_id: true,
        },
    });

    return { success: true, data: JSON.parse(JSON.stringify(members)) };
}

export async function getGroupAccessiblePatients(doctorId: string) {
    const { db, organizationId } = await requireTenantContext();

    try {
        const doctor = await (db.user.findFirst as any)({
            where: { id: doctorId, organizationId },
            select: { doctor_group_id: true, is_group_lead: true },
        });

        if (!doctor?.doctor_group_id) {
            // No group — return only own patients
            const admissions = await db.admissions.findMany({
                where: { organizationId, admitting_doctor_id: doctorId, discharge_date: null },
                include: { patient: { select: { patient_id: true, full_name: true, age: true, gender: true } } },
            });
            return { success: true, data: JSON.parse(JSON.stringify(admissions)), is_group: false };
        }

        // Get all doctors in the group
        const groupMembers = await (db.user.findMany as any)({
            where: { doctor_group_id: doctor.doctor_group_id, organizationId },
            select: { id: true },
        });

        const groupDoctorIds = groupMembers.map((m: { id: string }) => m.id);

        // Get all active admissions for any doctor in the group
        const admissions = await db.admissions.findMany({
            where: {
                organizationId,
                admitting_doctor_id: { in: groupDoctorIds },
                discharge_date: null,
            },
            include: {
                patient: { select: { patient_id: true, full_name: true, age: true, gender: true } },
            },
        });

        return { success: true, data: JSON.parse(JSON.stringify(admissions)), is_group: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to fetch group patients';
        return { success: false, error: msg };
    }
}

export async function assignDoctorToGroup(doctorId: string, groupId: string, supervisorId?: string) {
    const { db, organizationId } = await requireTenantContext();

    try {
        await (db.user.update as any)({
            where: { id: doctorId, organizationId },
            data: {
                doctor_group_id: groupId,
                supervisor_id: supervisorId || null,
                is_group_lead: false,
            },
        });

        revalidatePath('/admin/doctors');
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to assign doctor to group';
        return { success: false, error: msg };
    }
}

export async function removeDoctorFromGroup(doctorId: string) {
    const { db, organizationId } = await requireTenantContext();

    try {
        await (db.user.update as any)({
            where: { id: doctorId, organizationId },
            data: { doctor_group_id: null, supervisor_id: null, is_group_lead: false },
        });

        revalidatePath('/admin/doctors');
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to remove doctor from group';
        return { success: false, error: msg };
    }
}

export async function getAllDoctorGroups() {
    const { db, organizationId } = await requireTenantContext();

    const doctors = await (db.user.findMany as any)({
        where: { organizationId, role: 'doctor', doctor_group_id: { not: null } },
        select: {
            id: true,
            name: true,
            specialty: true,
            doctor_group_id: true,
            is_group_lead: true,
            supervisor_id: true,
        },
    });

    // Group by doctor_group_id
    const groups: Record<string, { lead: unknown; members: unknown[] }> = {};
    for (const doc of doctors) {
        const gid = doc.doctor_group_id as string;
        if (!groups[gid]) groups[gid] = { lead: null, members: [] };
        if (doc.is_group_lead) groups[gid].lead = doc;
        else groups[gid].members.push(doc);
    }

    return { success: true, data: groups };
}
