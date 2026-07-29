'use server';

/**
 * GAP 1 — UHID Merging / Unmerging
 * Implements primary/secondary UHID relationship where two patient records
 * can be merged. Secondary UHID becomes a child of Primary, documents remain
 * searchable under both, and the system fetches child documents when querying parent.
 */

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

export async function mergePatients(primaryPatientId: string, secondaryPatientId: string, mergedBy: string) {
    const { db, organizationId } = await requireTenantContext();

    if (primaryPatientId === secondaryPatientId) {
        return { success: false, error: 'Cannot merge a patient with themselves' };
    }

    try {
        // Verify both patients exist in this org
        const [primary, secondary] = await Promise.all([
            (db.oPD_REG.findFirst as any)({ where: { patient_id: primaryPatientId, organizationId } }),
            (db.oPD_REG.findFirst as any)({ where: { patient_id: secondaryPatientId, organizationId } }),
        ]);

        if (!primary) return { success: false, error: 'Primary patient not found' };
        if (!secondary) return { success: false, error: 'Secondary patient not found' };
        if (secondary.is_secondary) return { success: false, error: 'Secondary patient is already merged into another record' };

        // Mark secondary as merged into primary
        await (db.oPD_REG.update as any)({
            where: { patient_id: secondaryPatientId },
            data: {
                parent_patient_id: primaryPatientId,
                is_secondary: true,
                merged_into: primaryPatientId,
                merged_at: new Date(),
                merged_by: mergedBy,
            },
        });

        // Audit log
        await db.system_audit_logs.create({
            data: {
                action: 'MERGE_PATIENT',
                module: 'reception',
                entity_type: 'patient',
                entity_id: primaryPatientId,
                details: JSON.stringify({ primary: primaryPatientId, secondary: secondaryPatientId, merged_by: mergedBy }),
                organizationId,
            },
        });

        revalidatePath('/reception/patient');
        revalidatePath('/admin/patients');

        return { success: true, message: `Patient ${secondaryPatientId} merged into ${primaryPatientId}` };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to merge patients';
        return { success: false, error: msg };
    }
}

export async function unmergePatient(secondaryPatientId: string, unmergedBy: string) {
    const { db, organizationId } = await requireTenantContext();

    try {
        const secondary = await (db.oPD_REG.findFirst as any)({
            where: { patient_id: secondaryPatientId, organizationId, is_secondary: true },
        });

        if (!secondary) return { success: false, error: 'Patient is not a secondary/merged record' };

        await (db.oPD_REG.update as any)({
            where: { patient_id: secondaryPatientId },
            data: {
                parent_patient_id: null,
                is_secondary: false,
                merged_into: null,
                merged_at: null,
                merged_by: null,
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'UNMERGE_PATIENT',
                module: 'reception',
                entity_type: 'patient',
                entity_id: secondaryPatientId,
                details: JSON.stringify({ secondary: secondaryPatientId, unmerged_by: unmergedBy }),
                organizationId,
            },
        });

        revalidatePath('/reception/patient');
        return { success: true, message: `Patient ${secondaryPatientId} unmerged successfully` };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to unmerge patient';
        return { success: false, error: msg };
    }
}

/**
 * Fetch patient with all merged secondary records and their documents.
 * When querying primary, also returns documents from all secondary UHIDs.
 */
export async function getPatientWithMergedRecords(patientId: string) {
    const { db, organizationId } = await requireTenantContext();

    try {
        const patient = await (db.oPD_REG.findFirst as any)({
            where: { patient_id: patientId, organizationId },
        });

        if (!patient) return { success: false, error: 'Patient not found' };

        // Collect all IDs to search (primary + all secondaries)
        const secondaryRecords = await (db.oPD_REG.findMany as any)({
            where: { parent_patient_id: patientId, organizationId },
            select: { patient_id: true, full_name: true, merged_at: true },
        });

        const allPatientIds = [patientId, ...secondaryRecords.map((r: { patient_id: string }) => r.patient_id)];

        // Fetch documents across all IDs
        const [appointments, labOrders, admissions, encounters] = await Promise.all([
            db.appointments.findMany({
                where: { patient_id: { in: allPatientIds }, organizationId },
                orderBy: { appointment_date: 'desc' },
                take: 50,
            }),
            db.lab_orders.findMany({
                where: { patient_id: { in: allPatientIds }, organizationId },
                orderBy: { created_at: 'desc' },
                take: 50,
            }),
            db.admissions.findMany({
                where: { patient_id: { in: allPatientIds }, organizationId },
                orderBy: { admission_date: 'desc' },
                take: 20,
            }),
            db.clinicalEncounter.findMany({
                where: { patient_id: { in: allPatientIds }, organizationId },
                orderBy: { encounter_date: 'desc' },
                take: 20,
            }),
        ]);

        return {
            success: true,
            data: {
                patient: JSON.parse(JSON.stringify(patient)),
                secondary_records: JSON.parse(JSON.stringify(secondaryRecords)),
                all_patient_ids: allPatientIds,
                documents: {
                    appointments: JSON.parse(JSON.stringify(appointments)),
                    lab_orders: JSON.parse(JSON.stringify(labOrders)),
                    admissions: JSON.parse(JSON.stringify(admissions)),
                    encounters: JSON.parse(JSON.stringify(encounters)),
                },
            },
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to fetch merged records';
        return { success: false, error: msg };
    }
}

export async function searchMergeablePatients(query: string) {
    const { db, organizationId } = await requireTenantContext();

    const patients = await (db.oPD_REG.findMany as any)({
        where: {
            organizationId,
            is_secondary: false,
            OR: [
                { full_name: { contains: query, mode: 'insensitive' } },
                { patient_id: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query, mode: 'insensitive' } },
            ],
        },
        select: {
            patient_id: true,
            full_name: true,
            phone: true,
            age: true,
            gender: true,
            date_of_birth: true,
        },
        take: 10,
    });

    return { success: true, data: JSON.parse(JSON.stringify(patients)) };
}
