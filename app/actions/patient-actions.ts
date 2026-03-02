'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

// Mock Patient Auth Wrapper:
// Since there isn't a dedicated Patient Login screen yet in this deployment,
// we'll attempt to use the session.username as the patient ID, OR
// fall back to the first available patient in the database to allow demonstration.
async function getDemoPatientId(db: any) {
    const defaultPatient = await db.oPD_REG.findFirst({
        orderBy: { registration_date: 'desc' },
        select: { patient_id: true }
    });
    return defaultPatient?.patient_id || 'PAT-DEMO';
}

export async function getPatientDashboardData(patientId?: string) {
    try {
        const { db, session } = await requireTenantContext();

        const pid = patientId || session.username || await getDemoPatientId(db);

        const patient = await db.oPD_REG.findUnique({
            where: { patient_id: pid }
        });

        if (!patient) return { success: false, error: 'Patient not found' };

        const upcomingAppointments = await db.appointments.findMany({
            where: { patient_id: pid, appointment_date: { gte: new Date() }, status: 'Scheduled' },
            orderBy: { appointment_date: 'asc' },
            take: 3
        });

        const activePrescriptions = await db.prescriptions.findMany({
            where: { patient_id: pid },
            orderBy: { prescription_date: 'desc' },
            take: 3
        });

        return {
            success: true,
            data: {
                patient,
                upcomingAppointments,
                activePrescriptions
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getPatientRecords(patientId?: string) {
    try {
        const { db, session } = await requireTenantContext();
        const pid = patientId || session.username || await getDemoPatientId(db);

        const labs = await db.labSampleTracking.findMany({
            where: {
                order: { patient_id: pid },
                status: 'Verified'
            },
            include: {
                order: { select: { doctor_id: true, order_date: true } },
                test: { select: { test_name: true, normal_range: true, methodology: true } }
            },
            orderBy: { collected_at: 'desc' }
        });

        const diagnoses = await db.aI_ClinicalSummaries.findMany({
            where: { appointment: { patient_id: pid } },
            orderBy: { generated_at: 'desc' }
        });

        const vitals = await db.vitals.findMany({
            where: { appointment: { patient_id: pid } },
            orderBy: { recorded_at: 'desc' }
        });

        return { success: true, data: { labs, diagnoses, vitals } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function submitPatientFeedback(rating: number, comments: string, patientId?: string) {
    try {
        const { db, session, organizationId } = await requireTenantContext();
        const pid = patientId || session.username || await getDemoPatientId(db);

        await db.patientFeedback.create({
            data: {
                patient_id: pid,
                rating,
                comments,
                organizationId
            }
        });

        revalidatePath('/patient/feedback');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function bookPatientAppointment(data: {
    doctor_id: string,
    department: string,
    appointment_date: string,
    notes: string,
    patient_id?: string
}) {
    try {
        const { db, session, organizationId } = await requireTenantContext();
        const pid = data.patient_id || session.username || await getDemoPatientId(db);

        await db.appointments.create({
            data: {
                patient_id: pid,
                doctor_id: data.doctor_id,
                department: data.department,
                appointment_date: new Date(data.appointment_date),
                status: 'Scheduled',
                notes: data.notes,
                queue_number: Math.floor(Math.random() * 50) + 1,
                organizationId,
                visit_type: 'Follow-up'
            }
        });

        revalidatePath('/patient/appointments/book');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getBookableDoctors() {
    try {
        const { db } = await requireTenantContext();
        // Return unique doctor IDs from schedules
        const doctors = await db.doctorSchedule.findMany({
            select: { doctor_id: true },
            distinct: ['doctor_id']
        });
        return { success: true, data: doctors.map((d: any) => d.doctor_id) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
