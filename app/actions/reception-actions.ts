'use server';

import { prisma } from '@/app/lib/db';

export async function getRegisteredPatients(options?: {
    search?: string;
    department?: string;
    page?: number;
    limit?: number;
    dateRange?: 'today' | 'week' | 'month' | 'all';
}) {
    try {
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
            prisma.oPD_REG.findMany({
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
            prisma.oPD_REG.count({ where }),
        ]);

        return {
            success: true,
            data: data.map(p => ({
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
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const [todayRegistrations, todayAppointments, pendingAppointments, completedToday, totalPatients] = await Promise.all([
            prisma.oPD_REG.count({
                where: { created_at: { gte: todayStart, lte: todayEnd } },
            }),
            prisma.appointments.count({
                where: { appointment_date: { gte: todayStart, lte: todayEnd } },
            }),
            prisma.appointments.count({
                where: {
                    status: { in: ['Pending', 'Scheduled', 'Checked In'] },
                    appointment_date: { gte: todayStart, lte: todayEnd },
                },
            }),
            prisma.appointments.count({
                where: {
                    status: 'Completed',
                    appointment_date: { gte: todayStart, lte: todayEnd },
                },
            }),
            prisma.oPD_REG.count(),
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
        const patient = await prisma.oPD_REG.findUnique({
            where: { patient_id: patientId },
            include: {
                appointments: { orderBy: { appointment_date: 'desc' } },
            },
        });

        if (!patient) return { success: false, data: null };

        const [triageHistory, vitals] = await Promise.all([
            prisma.triage_results.findMany({
                where: { patient_id: patientId },
                orderBy: { created_at: 'desc' },
                take: 5,
            }),
            prisma.vital_signs.findMany({
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
