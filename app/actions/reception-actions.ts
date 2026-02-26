'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import {
    sendQueueToken,
    sendQueueUpdate,
    sendYourTurnAlert,
} from '@/app/lib/whatsapp';

export async function getRegisteredPatients(options?: {
    search?: string;
    department?: string;
    page?: number;
    limit?: number;
    dateRange?: 'today' | 'week' | 'month' | 'all';
}) {
    try {
        const { db } = await requireTenantContext();

        const page = options?.page || 1;
        const limit = options?.limit || 25;
        const skip = (page - 1) * limit;

        const where: any = {};

        // Search filter
        if (options?.search) {
            const search = options.search.trim();
            where.OR = [
                { full_name: { contains: search, mode: 'insensitive' } },
                { patient_id: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
            ];
        }

        // Department filter
        if (options?.department) {
            where.department = options.department;
        }

        // Date range filter
        if (options?.dateRange && options.dateRange !== 'all') {
            const now = new Date();
            let from: Date;
            if (options.dateRange === 'today') {
                from = new Date(now.setHours(0, 0, 0, 0));
            } else if (options.dateRange === 'week') {
                from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            } else {
                from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            }
            where.created_at = { gte: from };
        }

        const [data, total] = await Promise.all([
            db.oPD_REG.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip,
                take: limit,
                include: {
                    appointments: {
                        orderBy: { appointment_date: 'desc' },
                        take: 1,
                    },
                },
            }),
            db.oPD_REG.count({ where }),
        ]);

        return {
            success: true,
            data: data.map((p: any) => ({
                ...p,
                lastAppointmentStatus: p.appointments[0]?.status || null,
                lastAppointmentDate: p.appointments[0]?.appointment_date || null,
            })),
            total,
            totalPages: Math.ceil(total / limit),
            page,
        };
    } catch (error) {
        console.error('Get Registered Patients Error:', error);
        return { success: false, data: [], total: 0, totalPages: 0, page: 1 };
    }
}

export async function getReceptionStats() {
    try {
        const { db } = await requireTenantContext();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const [todayRegistrations, todayAppointments, pendingAppointments, completedToday, totalPatients] = await Promise.all([
            db.oPD_REG.count({
                where: { created_at: { gte: todayStart, lte: todayEnd } },
            }),
            db.appointments.count({
                where: { appointment_date: { gte: todayStart, lte: todayEnd } },
            }),
            db.appointments.count({
                where: {
                    status: { in: ['Pending', 'Scheduled', 'Checked In'] },
                    appointment_date: { gte: todayStart, lte: todayEnd },
                },
            }),
            db.appointments.count({
                where: {
                    status: 'Completed',
                    appointment_date: { gte: todayStart, lte: todayEnd },
                },
            }),
            db.oPD_REG.count(),
        ]);

        return {
            success: true,
            data: { todayRegistrations, todayAppointments, pendingAppointments, completedToday, totalPatients },
        };
    } catch (error) {
        console.error('Reception Stats Error:', error);
        return { success: false, data: null };
    }
}

export async function getPatientDetail(patientId: string) {
    try {
        const { db } = await requireTenantContext();

        const patient = await db.oPD_REG.findUnique({
            where: { patient_id: patientId },
            include: {
                appointments: { orderBy: { appointment_date: 'desc' } },
            },
        });

        if (!patient) return { success: false, data: null };

        const [triageHistory, vitals] = await Promise.all([
            db.triage_results.findMany({
                where: { patient_id: patientId },
                orderBy: { created_at: 'desc' },
                take: 5,
            }),
            db.vital_signs.findMany({
                where: { patient_id: patientId },
                orderBy: { created_at: 'desc' },
                take: 5,
            }),
        ]);

        return {
            success: true,
            data: {
                patient,
                appointments: patient.appointments,
                triageHistory,
                vitals,
            },
        };
    } catch (error) {
        console.error('Patient Detail Error:', error);
        return { success: false, data: null };
    }
}

// ========================================
// OPD QUEUE & TOKEN MANAGEMENT
// ========================================

const AVG_CONSULT_MINUTES = 15;

export async function checkInPatient(appointmentId: string) {
    try {
        const { db, session } = await requireTenantContext();

        const appointment = await db.appointments.findUnique({
            where: { appointment_id: appointmentId },
            include: { patient: true },
        });

        if (!appointment) return { success: false, error: 'Appointment not found' };

        // Get next token number for today for this doctor
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const lastToken = await db.appointments.findFirst({
            where: {
                doctor_id: appointment.doctor_id,
                appointment_date: { gte: todayStart },
                queue_token: { not: null },
            },
            orderBy: { queue_token: 'desc' },
        });

        const tokenNumber = (lastToken?.queue_token || 0) + 1;

        // Count patients ahead in queue
        const aheadCount = await db.appointments.count({
            where: {
                doctor_id: appointment.doctor_id,
                appointment_date: { gte: todayStart },
                status: { in: ['Checked In', 'In Progress'] },
                queue_token: { not: null },
            },
        });

        const estimatedWait = aheadCount * AVG_CONSULT_MINUTES;

        await db.appointments.update({
            where: { appointment_id: appointmentId },
            data: {
                status: 'Checked In',
                queue_token: tokenNumber,
                checked_in_at: new Date(),
            },
        });

        // Send WhatsApp notification
        const orgName = session.organization_name || 'Hospital';
        if (appointment.patient?.phone) {
            await sendQueueToken(
                appointment.patient.phone,
                appointment.patient.full_name,
                tokenNumber,
                appointment.doctor_name || 'Doctor',
                aheadCount + 1,
                estimatedWait,
                orgName
            );
        }

        revalidatePath('/reception');
        revalidatePath('/opd');
        revalidatePath('/opd/display');

        return {
            success: true,
            data: {
                tokenNumber,
                position: aheadCount + 1,
                estimatedWait,
            },
        };
    } catch (error) {
        console.error('Check-in Error:', error);
        return { success: false, error: 'Check-in failed' };
    }
}

export async function callNextPatient(doctorId: string) {
    try {
        const { db, session } = await requireTenantContext();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // Mark current "In Progress" as completed
        const currentActive = await db.appointments.findFirst({
            where: {
                doctor_id: doctorId,
                status: 'In Progress',
                appointment_date: { gte: todayStart },
            },
        });

        if (currentActive) {
            await db.appointments.update({
                where: { appointment_id: currentActive.appointment_id },
                data: { status: 'Completed' },
            });
        }

        // Get next patient in queue
        const next = await db.appointments.findFirst({
            where: {
                doctor_id: doctorId,
                status: 'Checked In',
                appointment_date: { gte: todayStart },
                queue_token: { not: null },
            },
            orderBy: { queue_token: 'asc' },
            include: { patient: true },
        });

        if (!next) {
            revalidatePath('/opd');
            revalidatePath('/opd/display');
            return { success: true, data: null, message: 'No more patients in queue' };
        }

        await db.appointments.update({
            where: { appointment_id: next.appointment_id },
            data: { status: 'In Progress' },
        });

        // Send WhatsApp alert
        const orgName = session.organization_name || 'Hospital';
        if (next.patient?.phone) {
            await sendYourTurnAlert(
                next.patient.phone,
                next.patient.full_name,
                next.doctor_name || 'Doctor',
                '',
                orgName
            );
        }

        // Notify the patient who is 2 spots away
        const upcoming = await db.appointments.findMany({
            where: {
                doctor_id: doctorId,
                status: 'Checked In',
                appointment_date: { gte: todayStart },
                queue_token: { not: null },
            },
            orderBy: { queue_token: 'asc' },
            include: { patient: true },
            take: 3,
        });

        if (upcoming.length >= 2 && upcoming[1]?.patient?.phone) {
            const position = 2;
            await sendQueueUpdate(
                upcoming[1].patient.phone,
                upcoming[1].patient.full_name,
                position,
                position * AVG_CONSULT_MINUTES,
                orgName
            );
        }

        revalidatePath('/reception');
        revalidatePath('/opd');
        revalidatePath('/opd/display');
        revalidatePath('/doctor/dashboard');

        return {
            success: true,
            data: {
                patientName: next.patient?.full_name,
                tokenNumber: next.queue_token,
                appointmentId: next.appointment_id,
            },
        };
    } catch (error) {
        console.error('Call Next Error:', error);
        return { success: false, error: 'Failed to call next patient' };
    }
}

export async function getQueueStatus(doctorId: string) {
    try {
        const { db } = await requireTenantContext();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const queue = await db.appointments.findMany({
            where: {
                doctor_id: doctorId,
                appointment_date: { gte: todayStart },
                status: { in: ['Checked In', 'In Progress'] },
                queue_token: { not: null },
            },
            include: { patient: true },
            orderBy: { queue_token: 'asc' },
        });

        return {
            success: true,
            data: queue.map((a: any, index: number) => ({
                appointmentId: a.appointment_id,
                tokenNumber: a.queue_token,
                patientName: a.patient?.full_name || 'Unknown',
                patientId: a.patient_id,
                status: a.status,
                position: index + 1,
                estimatedWait: index * AVG_CONSULT_MINUTES,
                checkedInAt: a.checked_in_at,
            })),
        };
    } catch (error) {
        console.error('Queue Status Error:', error);
        return { success: false, data: [] };
    }
}

export async function getWaitingRoomDisplay() {
    try {
        const { db } = await requireTenantContext();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // Get all doctors who have appointments today
        const appointments = await db.appointments.findMany({
            where: {
                appointment_date: { gte: todayStart },
                status: { in: ['Checked In', 'In Progress'] },
                queue_token: { not: null },
            },
            include: { patient: true },
            orderBy: { queue_token: 'asc' },
        });

        // Group by doctor
        const doctorQueues: Record<string, {
            doctorName: string;
            doctorId: string;
            currentPatient: { name: string; token: number } | null;
            waiting: Array<{ name: string; token: number; position: number }>;
        }> = {};

        for (const appt of appointments) {
            const key = appt.doctor_id || appt.doctor_name || 'Unknown';
            if (!doctorQueues[key]) {
                doctorQueues[key] = {
                    doctorName: appt.doctor_name || 'Doctor',
                    doctorId: appt.doctor_id || '',
                    currentPatient: null,
                    waiting: [],
                };
            }

            if (appt.status === 'In Progress') {
                doctorQueues[key].currentPatient = {
                    name: appt.patient?.full_name || 'Patient',
                    token: appt.queue_token || 0,
                };
            } else {
                doctorQueues[key].waiting.push({
                    name: appt.patient?.full_name || 'Patient',
                    token: appt.queue_token || 0,
                    position: doctorQueues[key].waiting.length + 1,
                });
            }
        }

        return { success: true, data: Object.values(doctorQueues) };
    } catch (error) {
        console.error('Waiting Room Display Error:', error);
        return { success: false, data: [] };
    }
}
