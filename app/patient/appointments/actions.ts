'use server';

import { getTenantPrisma, prisma } from '@/backend/db';
import { getPatientSession } from '../login/actions';
import { revalidatePath } from 'next/cache';

export async function getAvailableDoctors() {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, data: [] };

        const db = getTenantPrisma(session.organization_id);

        const doctors = await db.user.findMany({
            where: { role: 'doctor', is_active: true },
            select: { id: true, name: true, specialty: true },
        });

        return {
            success: true,
            data: doctors.map((d: any) => ({
                id: d.id,
                name: d.name,
                specialty: d.specialty || 'General',
            })),
        };
    } catch (error) {
        console.error('Get doctors error:', error);
        return { success: false, data: [] };
    }
}

export async function getAvailableSlots(doctorId: string, dateStr: string) {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, data: [] };

        const db = getTenantPrisma(session.organization_id);
        const date = new Date(dateStr);
        date.setHours(0, 0, 0, 0);
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);

        const slots = await db.appointmentSlot.findMany({
            where: {
                doctor_id: doctorId,
                date: { gte: date, lt: nextDay },
            },
            orderBy: { start_time: 'asc' },
        });

        // If no pre-created slots, generate default ones
        if (slots.length === 0) {
            const defaultSlots = [];
            const hours = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '14:00', '14:30', '15:00', '15:30', '16:00'];
            for (const time of hours) {
                const [h, m] = time.split(':').map(Number);
                const endM = m + 30;
                const endTime = `${String(endM >= 60 ? h + 1 : h).padStart(2, '0')}:${String(endM % 60).padStart(2, '0')}`;
                defaultSlots.push({
                    id: `default-${time}`,
                    start_time: time,
                    end_time: endTime,
                    is_available: true,
                });
            }

            // Check which default slots are already booked via appointments
            const todayStart = new Date(dateStr);
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date(dateStr);
            todayEnd.setHours(23, 59, 59, 999);

            const existingAppts = await db.appointments.count({
                where: {
                    doctor_id: doctorId,
                    appointment_date: { gte: todayStart, lte: todayEnd },
                    status: { not: 'Cancelled' },
                },
            });

            // Simple approach: mark first N slots as unavailable based on existing appointments
            for (let i = 0; i < Math.min(existingAppts, defaultSlots.length); i++) {
                defaultSlots[i].is_available = false;
            }

            return { success: true, data: defaultSlots };
        }

        return {
            success: true,
            data: slots.map((s: any) => ({
                id: s.id,
                start_time: s.start_time,
                end_time: s.end_time,
                is_available: s.is_available && !s.is_booked,
            })),
        };
    } catch (error) {
        console.error('Get slots error:', error);
        return { success: false, data: [] };
    }
}

export async function bookAppointment(slotId: string, doctorId: string, dateStr: string, reason: string) {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, error: 'Not authenticated' };

        const db = getTenantPrisma(session.organization_id);

        // Get the doctor info
        const doctor = await db.user.findUnique({ where: { id: doctorId } });
        if (!doctor) return { success: false, error: 'Doctor not found' };

        const appointmentDate = new Date(dateStr);

        // If it's a pre-created slot, mark it as booked
        if (!slotId.startsWith('default-')) {
            await db.appointmentSlot.update({
                where: { id: slotId },
                data: { is_booked: true, booked_by: session.id },
            });
        }

        // Create the appointment
        const apptId = `APT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        await db.appointments.create({
            data: {
                appointment_id: apptId,
                patient_id: session.id,
                doctor_id: doctorId,
                doctor_name: doctor.name,
                department: doctor.specialty || 'General',
                appointment_date: appointmentDate,
                status: 'Scheduled',
                reason_for_visit: reason || undefined,
            },
        });

        revalidatePath('/patient/appointments');
        revalidatePath('/patient/dashboard');

        return { success: true, data: { appointmentId: apptId } };
    } catch (error) {
        console.error('Book appointment error:', error);
        return { success: false, error: 'Booking failed' };
    }
}

export async function getMyAppointments() {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, data: [] };

        const db = getTenantPrisma(session.organization_id);

        const appointments = await db.appointments.findMany({
            where: { patient_id: session.id },
            orderBy: { appointment_date: 'desc' },
        });

        return { success: true, data: appointments };
    } catch (error) {
        console.error('Get appointments error:', error);
        return { success: false, data: [] };
    }
}
