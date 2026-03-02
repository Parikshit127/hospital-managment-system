'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

// ========================================
// OPD MANAGER DASHBOARD
// ========================================

export async function getOPDManagerDashboard() {
    try {
        const { db } = await requireTenantContext();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const [
            totalAppointments, pendingCount, inProgressCount, completedCount,
            checkedInCount, noShowCount, activeDoctors
        ] = await Promise.all([
            db.appointments.count({ where: { appointment_date: { gte: todayStart, lte: todayEnd } } }),
            db.appointments.count({ where: { appointment_date: { gte: todayStart, lte: todayEnd }, status: 'Pending' } }),
            db.appointments.count({ where: { appointment_date: { gte: todayStart, lte: todayEnd }, status: 'In Progress' } }),
            db.appointments.count({ where: { appointment_date: { gte: todayStart, lte: todayEnd }, status: 'Completed' } }),
            db.appointments.count({ where: { appointment_date: { gte: todayStart, lte: todayEnd }, status: 'Checked In' } }),
            db.appointments.count({ where: { appointment_date: { gte: todayStart, lte: todayEnd }, status: 'Cancelled' } }),
            db.user.count({ where: { role: 'doctor', is_active: true } }),
        ]);

        // Calculate avg wait time estimate
        const avgWait = checkedInCount > 0 ? Math.round((checkedInCount / Math.max(activeDoctors, 1)) * 15) : 0;

        return {
            success: true,
            data: {
                totalAppointments, pendingCount, inProgressCount, completedCount,
                checkedInCount, noShowCount, activeDoctors, avgWait,
            },
        };
    } catch (error) {
        console.error('OPD Dashboard Error:', error);
        return { success: false, data: null };
    }
}

// ========================================
// ALL DOCTOR QUEUES
// ========================================

export async function getAllDoctorQueues() {
    try {
        const { db } = await requireTenantContext();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const appointments = await db.appointments.findMany({
            where: {
                appointment_date: { gte: todayStart },
                status: { in: ['Checked In', 'In Progress', 'Scheduled', 'Pending'] },
            },
            include: { patient: true },
            orderBy: { queue_token: 'asc' },
        });

        const queues: Record<string, {
            doctorId: string;
            doctorName: string;
            department: string;
            current: any | null;
            waiting: any[];
            scheduled: any[];
            completed: number;
        }> = {};

        for (const appt of appointments) {
            const key = appt.doctor_id || 'unknown';
            if (!queues[key]) {
                queues[key] = {
                    doctorId: key,
                    doctorName: appt.doctor_name || 'Doctor',
                    department: appt.department || '',
                    current: null,
                    waiting: [],
                    scheduled: [],
                    completed: 0,
                };
            }

            const item = {
                appointmentId: appt.appointment_id,
                patientName: appt.patient?.full_name || 'Unknown',
                patientId: appt.patient_id,
                token: appt.queue_token,
                status: appt.status,
                checkedInAt: appt.checked_in_at,
                reason: appt.reason_for_visit,
            };

            if (appt.status === 'In Progress') {
                queues[key].current = item;
            } else if (appt.status === 'Checked In') {
                queues[key].waiting.push(item);
            } else {
                queues[key].scheduled.push(item);
            }
        }

        // Count completed for each doctor
        const completedCounts = await db.appointments.groupBy({
            by: ['doctor_id'],
            where: { appointment_date: { gte: todayStart }, status: 'Completed' },
            _count: true,
        });

        for (const cc of completedCounts) {
            if (cc.doctor_id && queues[cc.doctor_id]) {
                queues[cc.doctor_id].completed = cc._count;
            }
        }

        return { success: true, data: Object.values(queues) };
    } catch (error) {
        console.error('All Doctor Queues Error:', error);
        return { success: false, data: [] };
    }
}

// ========================================
// REASSIGN PATIENT
// ========================================

export async function reassignPatient(appointmentId: string, newDoctorId: string, newDoctorName: string) {
    try {
        const { db } = await requireTenantContext();

        await db.appointments.update({
            where: { appointment_id: appointmentId },
            data: { doctor_id: newDoctorId, doctor_name: newDoctorName },
        });

        revalidatePath('/opd-manager/queues');
        return { success: true };
    } catch (error) {
        console.error('Reassign Patient Error:', error);
        return { success: false, error: 'Failed to reassign' };
    }
}

// ========================================
// DOCTOR UTILIZATION
// ========================================

export async function getDoctorUtilization() {
    try {
        const { db } = await requireTenantContext();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const doctors = await db.user.findMany({
            where: { role: 'doctor', is_active: true },
            select: { id: true, name: true, specialty: true },
        });

        const utilization = await Promise.all(
            doctors.map(async (doc: any) => {
                const [total, completed, slots] = await Promise.all([
                    db.appointments.count({
                        where: { doctor_id: doc.id, appointment_date: { gte: todayStart, lte: todayEnd } },
                    }),
                    db.appointments.count({
                        where: { doctor_id: doc.id, appointment_date: { gte: todayStart, lte: todayEnd }, status: 'Completed' },
                    }),
                    db.appointmentSlot.count({
                        where: { doctor_id: doc.id, date: { gte: todayStart, lte: todayEnd } },
                    }),
                ]);

                return {
                    doctorId: doc.id,
                    doctorName: doc.name || 'Unknown',
                    specialty: doc.specialty || 'General',
                    totalAppointments: total,
                    completedAppointments: completed,
                    totalSlots: slots,
                    utilizationPct: slots > 0 ? Math.round((total / slots) * 100) : 0,
                };
            })
        );

        return { success: true, data: utilization };
    } catch (error) {
        console.error('Doctor Utilization Error:', error);
        return { success: false, data: [] };
    }
}

// ========================================
// WAIT TIME & NO-SHOW ANALYTICS
// ========================================

export async function getWaitTimeAnalytics() {
    try {
        const { db } = await requireTenantContext();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const checkedIn = await db.appointments.findMany({
            where: {
                appointment_date: { gte: todayStart },
                checked_in_at: { not: null },
            },
            select: { checked_in_at: true, status: true, doctor_name: true, department: true },
        });

        // Simple wait time estimation
        const byDepartment: Record<string, { count: number; totalWait: number }> = {};
        for (const appt of checkedIn) {
            const dept = appt.department || 'General';
            if (!byDepartment[dept]) byDepartment[dept] = { count: 0, totalWait: 0 };
            byDepartment[dept].count++;
            // Estimate wait in minutes from check-in to now (or completion)
            const waitMin = Math.round((Date.now() - new Date(appt.checked_in_at).getTime()) / (1000 * 60));
            byDepartment[dept].totalWait += waitMin;
        }

        const departmentWaits = Object.entries(byDepartment).map(([dept, data]) => ({
            department: dept,
            avgWait: Math.round(data.totalWait / data.count),
            patientCount: data.count,
        }));

        return { success: true, data: departmentWaits };
    } catch (error) {
        console.error('Wait Time Analytics Error:', error);
        return { success: false, data: [] };
    }
}

export async function getNoShowReport(days: number = 7) {
    try {
        const { db } = await requireTenantContext();

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        const cancelled = await db.appointments.findMany({
            where: {
                appointment_date: { gte: startDate },
                status: 'Cancelled',
            },
            include: { patient: true },
            orderBy: { appointment_date: 'desc' },
        });

        return {
            success: true,
            data: cancelled.map((a: any) => ({
                appointmentId: a.appointment_id,
                patientName: a.patient?.full_name || 'Unknown',
                patientId: a.patient_id,
                doctorName: a.doctor_name,
                department: a.department,
                date: a.appointment_date,
                reason: a.cancellation_reason || 'No reason provided',
            })),
        };
    } catch (error) {
        console.error('No Show Report Error:', error);
        return { success: false, data: [] };
    }
}
