'use server';

import { requireTenantContext } from '@/backend/tenant';

export async function getOPDDashboardStats() {
    try {
        const { db } = await requireTenantContext();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const [totalToday, pending, inProgress, completed, byDepartment] = await Promise.all([
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
                    status: 'In Progress',
                    appointment_date: { gte: todayStart, lte: todayEnd },
                },
            }),
            db.appointments.count({
                where: {
                    status: 'Completed',
                    appointment_date: { gte: todayStart, lte: todayEnd },
                },
            }),
            db.appointments.groupBy({
                by: ['department'],
                where: { appointment_date: { gte: todayStart, lte: todayEnd } },
                _count: { id: true },
            }),
        ]);

        return {
            success: true,
            data: {
                totalToday,
                pending,
                inProgress,
                completed,
                byDepartment: byDepartment.map((d: any) => ({
                    department: d.department || 'General',
                    count: d._count.id,
                })),
            },
        };
    } catch (error) {
        console.error('OPD Stats Error:', error);
        return { success: false, data: null };
    }
}

export async function getTodaysAppointments(options?: { department?: string; status?: string }) {
    try {
        const { db } = await requireTenantContext();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const where: any = {
            appointment_date: { gte: todayStart, lte: todayEnd },
        };
        if (options?.department) where.department = options.department;
        if (options?.status) where.status = options.status;

        const appointments = await db.appointments.findMany({
            where,
            include: { patient: true },
            orderBy: { appointment_date: 'asc' },
        });

        return {
            success: true,
            data: appointments.map((a: any) => ({
                id: a.id,
                appointment_id: a.appointment_id,
                patient_id: a.patient_id,
                patient_name: a.patient.full_name,
                age: a.patient.age,
                gender: a.patient.gender,
                phone: a.patient.phone,
                department: a.department,
                doctor_name: a.doctor_name,
                status: a.status,
                reason_for_visit: a.reason_for_visit,
                appointment_date: a.appointment_date,
            })),
        };
    } catch (error) {
        console.error('Todays Appointments Error:', error);
        return { success: false, data: [] };
    }
}
