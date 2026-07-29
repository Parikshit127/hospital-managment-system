'use server';

/**
 * GAP 2 — Prescription-Mandatory Test Upload Validation
 * Checks if a patient has uploaded a prescription before billing
 * for tests that require one. Blocks billing with a popup if missing.
 */

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

export async function checkPrescriptionGate(patientId: string, testNames: string[]) {
    const { db, organizationId } = await requireTenantContext();

    try {
        // Find which of the requested tests require a prescription
        const prescriptionTests = await db.lab_test_inventory.findMany({
            where: {
                organizationId,
                test_name: { in: testNames },
                requires_prescription: true,
            },
            select: { test_name: true },
        });

        if (prescriptionTests.length === 0) {
            return { success: true, blocked: false, missing_tests: [] };
        }

        // Check if patient has any uploaded prescription documents
        const prescriptionDocs = await db.system_audit_logs.findFirst({
            where: {
                organizationId,
                entity_id: patientId,
                action: 'UPLOAD_PRESCRIPTION',
            },
            orderBy: { created_at: 'desc' },
        });

        const hasPrescription = !!prescriptionDocs;
        const missingTests = prescriptionTests.map((t: { test_name: string }) => t.test_name);

        return {
            success: true,
            blocked: !hasPrescription,
            missing_tests: hasPrescription ? [] : missingTests,
            message: hasPrescription
                ? null
                : `Prescription required for: ${missingTests.join(', ')}. Please upload a valid prescription before proceeding.`,
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to check prescription gate';
        return { success: false, error: msg };
    }
}

export async function uploadPrescriptionForPatient(patientId: string, prescriptionUrl: string, uploadedBy: string) {
    const { db, organizationId } = await requireTenantContext();

    try {
        await db.system_audit_logs.create({
            data: {
                action: 'UPLOAD_PRESCRIPTION',
                module: 'lab',
                entity_type: 'patient',
                entity_id: patientId,
                details: JSON.stringify({ prescription_url: prescriptionUrl, uploaded_by: uploadedBy }),
                organizationId,
            },
        });

        revalidatePath('/reception/billing');
        revalidatePath('/lab/worklist');

        return { success: true, message: 'Prescription uploaded successfully' };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to upload prescription';
        return { success: false, error: msg };
    }
}

export async function toggleTestPrescriptionRequirement(testId: number, requires: boolean) {
    const { db, organizationId } = await requireTenantContext();

    try {
        await db.lab_test_inventory.update({
            where: { id: testId, organizationId },
            data: { requires_prescription: requires },
        });

        revalidatePath('/admin/lab-settings');
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to update test';
        return { success: false, error: msg };
    }
}

export async function getPrescriptionRequiredTests() {
    const { db, organizationId } = await requireTenantContext();

    const tests = await db.lab_test_inventory.findMany({
        where: { organizationId, requires_prescription: true },
        select: { id: true, test_name: true, category: true },
    });

    return { success: true, data: JSON.parse(JSON.stringify(tests)) };
}
