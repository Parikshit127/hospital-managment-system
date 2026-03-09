'use server';

import { getTenantPrisma } from '@/backend/db';
import { getPatientSession } from '@/app/patient/login/actions';
import { revalidatePath } from 'next/cache';

export async function getPatientDashboardData() {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, error: 'Not authenticated' };

        const db = getTenantPrisma(session.organization_id);
        const pid = session.id;

        const patient = await db.oPD_REG.findUnique({
            where: { patient_id: pid }
        });

        if (!patient) return { success: false, error: 'Patient not found' };

        const upcomingAppointments = await db.appointments.findMany({
            where: { patient_id: pid, appointment_date: { gte: new Date() }, status: { in: ['Scheduled', 'Checked In', 'Pending'] } },
            orderBy: { appointment_date: 'asc' },
            take: 5
        });
        const activePrescriptions = await db.pharmacy_orders.findMany({
            where: { patient_id: pid },
            orderBy: { created_at: 'desc' },
            include: { items: true },
            take: 3
        });
        const latestVitalsArr = await db.vital_signs.findMany({
            where: { patient_id: pid },
            orderBy: { created_at: 'desc' },
            take: 1
        });
        const pendingLabCount = await db.lab_orders.count({
            where: { patient_id: pid, status: { not: 'Completed' } }
        });
        const unpaidInvoiceCount = await db.invoices.count({
            where: { patient_id: pid, status: { not: 'Paid' } }
        });
        const latestVitals = latestVitalsArr;

        return {
            success: true,
            data: {
                patient,
                upcomingAppointments,
                activePrescriptions,
                latestVitals: latestVitals?.[0] || null,
                pendingLabCount,
                unpaidInvoiceCount,
            }
        };
    } catch (error: any) {
        console.error('Patient dashboard error:', error);
        return { success: false, error: error.message };
    }
}

export async function getPatientRecords() {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, error: 'Not authenticated' };

        const db = getTenantPrisma(session.organization_id);
        const pid = session.id;

        const labs = await db.lab_orders.findMany({
            where: { patient_id: pid },
            orderBy: { created_at: 'desc' }
        });
        const diagnoses = await db.clinical_EHR.findMany({
            where: { patient_id: pid },
            orderBy: { created_at: 'desc' }
        });
        const vitals = await db.vital_signs.findMany({
            where: { patient_id: pid },
            orderBy: { created_at: 'desc' }
        });

        return { success: true, data: { labs, diagnoses, vitals } };
    } catch (error: any) {
        console.error('Patient records error:', error);
        return { success: false, error: error.message };
    }
}

export async function submitPatientFeedback(rating: number, comments: string) {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, error: 'Not authenticated' };

        const db = getTenantPrisma(session.organization_id);

        await db.patientFeedback.create({
            data: {
                patient_id: session.id,
                rating,
                comments,
                organizationId: session.organization_id
            }
        });

        revalidatePath('/patient/feedback');
        return { success: true };
    } catch (error: any) {
        console.error('Feedback error:', error);
        return { success: false, error: error.message };
    }
}
