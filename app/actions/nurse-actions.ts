'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

// ========================================
// NURSE DASHBOARD
// ========================================

export async function getNurseDashboard(nurseId: string) {
    try {
        const { db } = await requireTenantContext();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const [pendingTasks, completedTasks, totalAdmitted, pendingMeds] = await Promise.all([
            db.nursingTask.count({
                where: { assigned_to: nurseId, status: 'Pending', scheduled_at: { gte: todayStart, lte: todayEnd } },
            }),
            db.nursingTask.count({
                where: { assigned_to: nurseId, status: 'Completed', scheduled_at: { gte: todayStart, lte: todayEnd } },
            }),
            db.admissions.count({ where: { status: 'Admitted' } }),
            db.medicationAdministration.count({
                where: { status: 'Scheduled', scheduled_time: { gte: todayStart, lte: todayEnd } },
            }),
        ]);

        return {
            success: true,
            data: { pendingTasks, completedTasks, totalAdmitted, pendingMeds },
        };
    } catch (error) {
        console.error('Nurse Dashboard Error:', error);
        return { success: false, data: null };
    }
}

// ========================================
// WARD PATIENTS
// ========================================

export async function getWardPatients(wardId?: number) {
    try {
        const { db } = await requireTenantContext();

        const where: any = { status: 'Admitted' };
        if (wardId) where.ward_id = wardId;

        const admissions = await db.admissions.findMany({
            where,
            include: {
                patient: true,
                bed: true,
                ward: true,
            },
            orderBy: { admission_date: 'desc' },
        });

        return {
            success: true,
            data: admissions.map((a: any) => ({
                admissionId: a.admission_id,
                patientId: a.patient_id,
                patientName: a.patient?.full_name || 'Unknown',
                age: a.patient?.age,
                gender: a.patient?.gender,
                bedId: a.bed_id,
                bedStatus: a.bed?.status,
                wardName: a.ward?.ward_name || 'Unassigned',
                wardType: a.ward?.ward_type,
                diagnosis: a.diagnosis,
                doctorName: a.doctor_name,
                admissionDate: a.admission_date,
            })),
        };
    } catch (error) {
        console.error('Ward Patients Error:', error);
        return { success: false, data: [] };
    }
}

// ========================================
// VITALS RECORDING
// ========================================

export async function recordVitals(data: {
    patientId: string;
    appointmentId?: string;
    bloodPressure?: string;
    heartRate?: number;
    temperature?: number;
    oxygenSat?: number;
    respiratoryRate?: number;
    weight?: number;
    height?: number;
    recordedBy: string;
}) {
    try {
        const { db } = await requireTenantContext();

        await db.vital_signs.create({
            data: {
                patient_id: data.patientId,
                appointment_id: data.appointmentId,
                blood_pressure: data.bloodPressure,
                heart_rate: data.heartRate,
                temperature: data.temperature,
                oxygen_sat: data.oxygenSat,
                respiratory_rate: data.respiratoryRate,
                weight: data.weight,
                height: data.height,
                recorded_by: data.recordedBy,
            },
        });

        revalidatePath('/nurse/vitals');
        revalidatePath('/nurse/patients');
        return { success: true };
    } catch (error) {
        console.error('Record Vitals Error:', error);
        return { success: false, error: 'Failed to record vitals' };
    }
}

export async function getPatientVitals(patientId: string) {
    try {
        const { db } = await requireTenantContext();

        const vitals = await db.vital_signs.findMany({
            where: { patient_id: patientId },
            orderBy: { created_at: 'desc' },
            take: 20,
        });

        return { success: true, data: vitals };
    } catch (error) {
        console.error('Get Vitals Error:', error);
        return { success: false, data: [] };
    }
}

// ========================================
// MEDICATION ADMINISTRATION
// ========================================

export async function getMedicationSchedule(admissionId?: string, filter?: 'due' | 'all') {
    try {
        const { db } = await requireTenantContext();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const where: any = {};
        if (admissionId) where.admission_id = admissionId;

        if (filter === 'due') {
            where.status = 'Scheduled';
            where.scheduled_time = { gte: todayStart, lte: todayEnd };
        }

        const medications = await db.medicationAdministration.findMany({
            where,
            orderBy: { scheduled_time: 'asc' },
        });

        // Enrich with patient names via admissions
        const admissionIds = [...new Set(medications.map((m: any) => m.admission_id))];
        const admissions = await db.admissions.findMany({
            where: { admission_id: { in: admissionIds } },
            include: { patient: { select: { full_name: true, patient_id: true } } },
        });
        const admissionMap = Object.fromEntries(
            admissions.map((a: any) => [a.admission_id, { patientName: a.patient?.full_name, patientId: a.patient?.patient_id }])
        );

        return {
            success: true,
            data: medications.map((m: any) => ({
                ...m,
                patientName: admissionMap[m.admission_id]?.patientName || 'Unknown',
                patientId: admissionMap[m.admission_id]?.patientId || '',
            })),
        };
    } catch (error) {
        console.error('Medication Schedule Error:', error);
        return { success: false, data: [] };
    }
}

export async function administerMedication(id: number, nurseId: string, notes?: string) {
    try {
        const { db } = await requireTenantContext();

        await db.medicationAdministration.update({
            where: { id },
            data: {
                status: 'Administered',
                administered_at: new Date(),
                administered_by: nurseId,
                notes,
            },
        });

        revalidatePath('/nurse/medications');
        return { success: true };
    } catch (error) {
        console.error('Administer Medication Error:', error);
        return { success: false, error: 'Failed to administer' };
    }
}

export async function updateMedicationStatus(id: number, status: string, notes?: string) {
    try {
        const { db } = await requireTenantContext();

        await db.medicationAdministration.update({
            where: { id },
            data: { status, notes },
        });

        revalidatePath('/nurse/medications');
        return { success: true };
    } catch (error) {
        console.error('Update Medication Status Error:', error);
        return { success: false, error: 'Failed to update' };
    }
}

// ========================================
// NURSING NOTES
// ========================================

export async function addNursingNote(data: {
    admissionId: string;
    nurseId: string;
    noteType: string;
    details: string;
}) {
    try {
        const { db } = await requireTenantContext();

        await db.nursingNote.create({
            data: {
                admission_id: data.admissionId,
                nurse_id: data.nurseId,
                note_type: data.noteType,
                details: data.details,
            },
        });

        revalidatePath('/nurse/patients');
        return { success: true };
    } catch (error) {
        console.error('Add Nursing Note Error:', error);
        return { success: false, error: 'Failed to add note' };
    }
}

export async function getNursingNotes(admissionId: string) {
    try {
        const { db } = await requireTenantContext();

        const notes = await db.nursingNote.findMany({
            where: { admission_id: admissionId },
            orderBy: { created_at: 'desc' },
        });

        return { success: true, data: notes };
    } catch (error) {
        console.error('Get Nursing Notes Error:', error);
        return { success: false, data: [] };
    }
}

// ========================================
// NURSING TASKS
// ========================================

export async function getNursingTasks(options?: {
    nurseId?: string;
    status?: string;
    dateFilter?: 'today' | 'all';
}) {
    try {
        const { db } = await requireTenantContext();

        const where: any = {};
        if (options?.nurseId) where.assigned_to = options.nurseId;
        if (options?.status) where.status = options.status;

        if (options?.dateFilter === 'today') {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            where.scheduled_at = { gte: todayStart, lte: todayEnd };
        }

        const tasks = await db.nursingTask.findMany({
            where,
            orderBy: { scheduled_at: 'asc' },
        });

        // Enrich with patient names
        const admissionIds = [...new Set(tasks.map((t: any) => t.admission_id))];
        const admissions = await db.admissions.findMany({
            where: { admission_id: { in: admissionIds } },
            include: { patient: { select: { full_name: true, patient_id: true } } },
        });
        const admissionMap = Object.fromEntries(
            admissions.map((a: any) => [a.admission_id, { patientName: a.patient?.full_name, patientId: a.patient?.patient_id, bedId: a.bed_id }])
        );

        return {
            success: true,
            data: tasks.map((t: any) => ({
                ...t,
                patientName: admissionMap[t.admission_id]?.patientName || 'Unknown',
                patientId: admissionMap[t.admission_id]?.patientId || '',
                bedId: admissionMap[t.admission_id]?.bedId || '',
            })),
        };
    } catch (error) {
        console.error('Get Nursing Tasks Error:', error);
        return { success: false, data: [] };
    }
}

export async function completeNursingTask(taskId: number) {
    try {
        const { db } = await requireTenantContext();

        await db.nursingTask.update({
            where: { id: taskId },
            data: { status: 'Completed', completed_at: new Date() },
        });

        revalidatePath('/nurse/tasks');
        return { success: true };
    } catch (error) {
        console.error('Complete Task Error:', error);
        return { success: false, error: 'Failed to complete task' };
    }
}

// ========================================
// SHIFT HANDOVER
// ========================================

export async function generateHandoverReport(data: {
    wardId?: number;
    fromNurseId: string;
    toNurseId?: string;
    summary: string;
}) {
    try {
        const { db } = await requireTenantContext();

        await db.shiftHandover.create({
            data: {
                ward_id: data.wardId || 0,
                from_nurse_id: data.fromNurseId,
                to_nurse_id: data.toNurseId || '',
                shift_date: new Date(),
                summary: data.summary,
            },
        });

        revalidatePath('/nurse/handover');
        return { success: true };
    } catch (error) {
        console.error('Handover Error:', error);
        return { success: false, error: 'Failed to create handover' };
    }
}

export async function getHandoverHistory(wardId?: number) {
    try {
        const { db } = await requireTenantContext();

        const where: any = {};
        if (wardId) where.ward_id = wardId;

        const handovers = await db.shiftHandover.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: 20,
        });

        return { success: true, data: handovers };
    } catch (error) {
        console.error('Handover History Error:', error);
        return { success: false, data: [] };
    }
}

export async function getWardsList() {
    try {
        const { db } = await requireTenantContext();
        const wards = await db.wards.findMany({ orderBy: { ward_name: 'asc' } });
        return { success: true, data: wards };
    } catch (error) {
        console.error('Get Wards Error:', error);
        return { success: false, data: [] };
    }
}
