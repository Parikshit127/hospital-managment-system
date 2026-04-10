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

export async function getOPDConfig() {
    try {
        const { db, organizationId } = await requireTenantContext();
        const config = await db.oPDConfig.findFirst({ where: { organizationId } });
        return {
            success: true,
            data: {
                max_wait_minutes: config?.max_wait_minutes ?? 30,
                escalation_threshold: config?.escalation_threshold ?? 45,
                max_patients_per_doctor: config?.max_patients_per_doctor ?? 30,
            },
        };
    } catch {
        return { success: true, data: { max_wait_minutes: 30, escalation_threshold: 45, max_patients_per_doctor: 30 } };
    }
}

// ── Phase 5 additions ──────────────────────────────────────────────────────

export async function getSLABreachAlerts() {
    try {
        const { db, organizationId } = await requireTenantContext();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [checkedIn, config] = await Promise.all([
            db.appointments.findMany({
                where: {
                    organizationId,
                    appointment_date: { gte: todayStart },
                    status: { in: ['Checked In'] },
                    checked_in_at: { not: null },
                },
                include: { patient: { select: { full_name: true } } },
                orderBy: { checked_in_at: 'asc' },
            }),
            db.oPDConfig.findFirst({ where: { organizationId } }),
        ]);

        const maxWait = config?.max_wait_minutes ?? 30;
        const now = Date.now();

        const breaches = checkedIn
            .map((a: { appointment_id: string; doctor_name: string | null; department: string | null; checked_in_at: Date | null; queue_token: number | null; patient: { full_name: string } | null }) => {
                const waitMin = Math.floor((now - new Date(a.checked_in_at!).getTime()) / 60000);
                return {
                    appointment_id: a.appointment_id,
                    patient_name: a.patient?.full_name ?? 'Unknown',
                    doctor_name: a.doctor_name,
                    department: a.department,
                    queue_token: a.queue_token,
                    wait_minutes: waitMin,
                    sla_minutes: maxWait,
                };
            })
            .filter((a: { wait_minutes: number; sla_minutes: number }) => a.wait_minutes > a.sla_minutes);

        return { success: true, data: JSON.parse(JSON.stringify(breaches)), maxWait };
    } catch (error) {
        console.error('SLA Breach Error:', error);
        return { success: false, data: [], maxWait: 30 };
    }
}

export async function getPeakHoursAnalytics(days = 7) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const start = new Date();
        start.setDate(start.getDate() - days);
        start.setHours(0, 0, 0, 0);

        const appointments = await db.appointments.findMany({
            where: { organizationId, appointment_date: { gte: start } },
            select: { appointment_date: true, status: true },
        });

        const hourCounts: number[] = Array(24).fill(0);
        for (const a of appointments) {
            const h = new Date(a.appointment_date).getHours();
            hourCounts[h]++;
        }

        const data = hourCounts.map((count, hour) => ({
            hour,
            label: `${hour.toString().padStart(2, '0')}:00`,
            count,
        })).filter(h => h.count > 0 || (h.hour >= 8 && h.hour <= 20));

        return { success: true, data };
    } catch (error) {
        console.error('Peak Hours Error:', error);
        return { success: false, data: [] };
    }
}

export async function markNoShow(appointmentId: string) {
    try {
        const { db, organizationId } = await requireTenantContext();
        await db.appointments.update({
            where: { appointment_id: appointmentId, organizationId },
            data: { status: 'Cancelled', cancellation_reason: 'No Show' },
        });
        revalidatePath('/opd-manager');
        return { success: true };
    } catch (error) {
        console.error('Mark No Show Error:', error);
        return { success: false, error: 'Failed to mark no-show' };
    }
}

export async function getTodayPendingNoShows() {
    try {
        const { db, organizationId } = await requireTenantContext();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const now = new Date();

        // Appointments that were scheduled in the past today and never checked in
        const pending = await db.appointments.findMany({
            where: {
                organizationId,
                appointment_date: { gte: todayStart, lte: now },
                status: { in: ['Pending', 'Confirmed'] },
                checked_in_at: null,
            },
            include: { patient: { select: { full_name: true, phone: true } } },
            orderBy: { appointment_date: 'asc' },
        });

        return { success: true, data: JSON.parse(JSON.stringify(pending)) };
    } catch (error) {
        console.error('Pending No Shows Error:', error);
        return { success: false, data: [] };
    }
}
