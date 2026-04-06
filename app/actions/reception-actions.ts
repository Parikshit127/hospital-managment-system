'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { getTodayRange, getOrgTimezone } from '@/app/lib/timezone';
import {
    sendQueueToken,
    sendQueueUpdate,
    sendYourTurnAlert,
    sendAppointmentReminder,
} from '@/app/lib/whatsapp';
import { sendAppointmentConfirmationEmail } from '@/backend/email';
import { notifyPatient } from '@/app/lib/notify-patient';
import type {
    ActionResponse,
    PaginatedResponse,
    PatientListItem,
    ReceptionStats,
    PatientDetail,
    CheckInResult,
    QueueItem,
    WaitingRoomDoctor,
    DoctorQueue,
    Department,
    DoctorListItem,
    Appointment,
    AppointmentSlot,
    BookAppointmentInput,
} from '@/app/types/reception';
import { getPatientBalances } from '@/app/actions/balance-actions';

// ========================================
// LAZY EXPIRATION: STALE APPOINTMENTS
// ========================================

/**
 * Expire stale "Scheduled" appointments whose date has fully passed
 * (before the start of today) by marking them as "No Show".
 *
 * Uses a lazy-expiration pattern: called at the top of dashboard /
 * calendar fetches so the cost is amortised and no cron job is needed.
 */
async function expireStaleAppointments(): Promise<void> {
    try {
        const { db } = await requireTenantContext();
        const tz = await getOrgTimezone();
        const { start: todayStart } = getTodayRange(tz);

        await db.appointments.updateMany({
            where: {
                status: 'Scheduled',
                appointment_date: { lt: todayStart },
            },
            data: {
                status: 'No Show',
            },
        });
    } catch (error) {
        // Silently log – never let expiration break the caller
        console.error('expireStaleAppointments Error:', error);
    }
}

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

        const where: Record<string, unknown> = {};

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

        const patientIds = data.map((p: any) => p.patient_id);
        const balances = await getPatientBalances(patientIds);

        return {
            success: true,
            data: data.map((p: any) => ({
                ...p,
                lastAppointmentStatus: p.appointments[0]?.status || null,
                lastAppointmentDate: p.appointments[0]?.appointment_date || null,
                totalBalance: balances[p.patient_id]?.totalBalance || 0,
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
        // Lazy-expire stale appointments before computing stats
        await expireStaleAppointments();

        const { db } = await requireTenantContext();

        const tz = await getOrgTimezone();
        const { start: todayStart, end: todayEnd } = getTodayRange(tz);

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

        const balances = await getPatientBalances([patientId]);
        const patientWithBalance = {
            ...patient,
            totalBalance: balances[patientId]?.totalBalance || 0
        };

        return {
            success: true,
            data: {
                patient: patientWithBalance,
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

/**
 * Inline update a single patient field.
 */
export async function updatePatientField(patientId: string, field: string, value: string) {
    try {
        const { db } = await requireTenantContext();

        const allowedFields = [
            'full_name', 'phone', 'email', 'address', 'age', 'gender',
            'department', 'blood_group', 'date_of_birth',
            'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
        ];

        if (!allowedFields.includes(field)) {
            return { success: false, error: 'Field not editable' };
        }

        await db.oPD_REG.update({
            where: { patient_id: patientId },
            data: { [field]: value || null },
        });

        revalidatePath(`/reception/patient/${patientId}`);
        return { success: true };
    } catch (error) {
        console.error('Update Patient Field Error:', error);
        return { success: false, error: 'Failed to update' };
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
            data: queue.map((a: { appointment_id: string; queue_token: number | null; patient?: { full_name: string } | null; patient_id: string; status: string; checked_in_at: Date | null }, index: number) => ({
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

// ========================================
// APPOINTMENT CALENDAR & SCHEDULING
// ========================================

export async function getDepartmentList() {
    try {
        const { db } = await requireTenantContext();
        const departments = await db.department.findMany({
            where: { is_active: true },
            orderBy: { name: 'asc' },
        });
        return { success: true, data: departments };
    } catch (error) {
        console.error('Get Departments Error:', error);
        return { success: false, data: [] };
    }
}

export async function getDoctorList(department?: string) {
    try {
        const { db } = await requireTenantContext();
        const where: Record<string, unknown> = { role: 'doctor', is_active: true };
        if (department) where.specialty = department;
        const doctors = await db.user.findMany({
            where,
            select: { id: true, name: true, specialty: true },
            orderBy: { name: 'asc' },
        });
        return { success: true, data: doctors };
    } catch (error) {
        console.error('Get Doctors Error:', error);
        return { success: false, data: [] };
    }
}

export async function getAppointmentCalendar(date: string, doctorId?: string) {
    try {
        // Lazy-expire stale appointments before loading calendar
        await expireStaleAppointments();

        const { db } = await requireTenantContext();

        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        const where: Record<string, unknown> = {
            appointment_date: { gte: dayStart, lte: dayEnd },
        };
        if (doctorId) where.doctor_id = doctorId;

        const [appointments, slots] = await Promise.all([
            db.appointments.findMany({
                where,
                include: { patient: true },
                orderBy: { appointment_date: 'asc' },
            }),
            db.appointmentSlot.findMany({
                where: {
                    date: { gte: dayStart, lte: dayEnd },
                    ...(doctorId ? { doctor_id: doctorId } : {}),
                },
                orderBy: { start_time: 'asc' },
            }),
        ]);

        return { success: true, data: { appointments, slots } };
    } catch (error) {
        console.error('Appointment Calendar Error:', error);
        return { success: false, data: { appointments: [], slots: [] } };
    }
}

export async function bookAppointment(data: {
    patientId: string;
    doctorId: string;
    doctorName: string;
    department: string;
    date: string;
    slotId?: string;
    reasonForVisit?: string;
}) {
    try {
        const { db, session } = await requireTenantContext();

        // Generate appointment ID
        const count = await db.appointments.count();
        const appointmentId = `APT-${String(count + 1).padStart(6, '0')}`;

        let appointmentDate = new Date(data.date);

        if (data.slotId) {
            const slot = await db.appointmentSlot.findUnique({
                where: { id: data.slotId }
            });
            if (slot) {
                // Parse slot start time assuming format HH:MM
                const [hours, minutes] = slot.start_time.split(':').map(Number);
                appointmentDate = new Date(data.date);
                appointmentDate.setHours(hours, minutes, 0, 0);
            }
        }

        const appointment = await db.appointments.create({
            data: {
                appointment_id: appointmentId,
                patient_id: data.patientId,
                doctor_id: data.doctorId,
                doctor_name: data.doctorName,
                department: data.department,
                reason_for_visit: data.reasonForVisit,
                status: 'Scheduled',
                appointment_date: appointmentDate,
            },
        });

        // Mark slot as booked if slotId provided
        if (data.slotId) {
            await db.appointmentSlot.update({
                where: { id: data.slotId },
                data: { is_booked: true, is_available: false, booked_by: data.patientId },
            });
        }

        revalidatePath('/reception/appointments');
        revalidatePath('/reception');

        // Send appointment notification (email + WhatsApp, non-blocking)
        try {
            const patient = await db.oPD_REG.findUnique({
                where: { patient_id: data.patientId },
                select: { email: true, phone: true, full_name: true },
            });
            if (patient?.email) {
                const formattedDate = appointmentDate.toLocaleDateString('en-IN', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                });
                const formattedTime = appointmentDate.toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit', hour12: true,
                });
                await sendAppointmentConfirmationEmail({
                    to: patient.email,
                    patientName: patient.full_name || 'Patient',
                    doctorName: data.doctorName,
                    department: data.department,
                    date: formattedDate,
                    time: formattedTime,
                    hospitalName: session.organization_name || 'Hospital',
                });
            }
        } catch (emailError) {
            console.error('Appointment confirmation email failed:', emailError);
        }

        return { success: true, data: appointment };
    } catch (error) {
        console.error('Book Appointment Error:', error);
        return { success: false, error: 'Failed to book appointment' };
    }
}

export async function rescheduleAppointment(appointmentId: string, newDate: string, newSlotId?: string) {
    try {
        const { db } = await requireTenantContext();

        await db.appointments.update({
            where: { appointment_id: appointmentId },
            data: {
                appointment_date: new Date(newDate),
                status: 'Scheduled',
            },
        });

        if (newSlotId) {
            await db.appointmentSlot.update({
                where: { id: newSlotId },
                data: { is_booked: true, is_available: false },
            });
        }

        revalidatePath('/reception/appointments');
        return { success: true };
    } catch (error) {
        console.error('Reschedule Error:', error);
        return { success: false, error: 'Failed to reschedule' };
    }
}

export async function cancelAppointment(appointmentId: string, reason: string) {
    try {
        const { db } = await requireTenantContext();

        await db.appointments.update({
            where: { appointment_id: appointmentId },
            data: {
                status: 'Cancelled',
                cancellation_reason: reason,
            },
        });

        revalidatePath('/reception/appointments');
        revalidatePath('/reception');
        return { success: true };
    } catch (error) {
        console.error('Cancel Appointment Error:', error);
        return { success: false, error: 'Failed to cancel appointment' };
    }
}

export async function createBulkSlots(data: {
    doctorId: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    slotDuration: number;
    slotType?: string;
}) {
    try {
        const { db } = await requireTenantContext();

        const slots: Array<Record<string, unknown>> = [];
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            // Skip weekends
            if (d.getDay() === 0) continue;

            const [startH, startM] = data.startTime.split(':').map(Number);
            const [endH, endM] = data.endTime.split(':').map(Number);
            const dayStartMin = startH * 60 + startM;
            const dayEndMin = endH * 60 + endM;

            for (let min = dayStartMin; min + data.slotDuration <= dayEndMin; min += data.slotDuration) {
                const slotStart = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
                const slotEndMin = min + data.slotDuration;
                const slotEnd = `${String(Math.floor(slotEndMin / 60)).padStart(2, '0')}:${String(slotEndMin % 60).padStart(2, '0')}`;

                slots.push({
                    doctor_id: data.doctorId,
                    date: new Date(d),
                    start_time: slotStart,
                    end_time: slotEnd,
                    slot_type: data.slotType || 'scheduled',
                    is_available: true,
                    is_booked: false,
                });
            }
        }

        if (slots.length > 0) {
            await db.appointmentSlot.createMany({ data: slots });
        }

        revalidatePath('/reception/appointments');
        return { success: true, count: slots.length };
    } catch (error) {
        console.error('Bulk Slots Error:', error);
        return { success: false, error: 'Failed to create slots' };
    }
}

/**
 * Walk-in appointment: auto-assigns next available slot or creates overflow.
 */
export async function walkInAppointment(data: {
    patientId: string;
    doctorId: string;
    doctorName: string;
    department: string;
    reasonForVisit?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Find next available slot for this doctor today
        const nextSlot = await db.appointmentSlot.findFirst({
            where: {
                doctor_id: data.doctorId,
                date: { gte: today, lt: new Date(today.getTime() + 86400000) },
                is_available: true,
                is_booked: false,
            },
            orderBy: { start_time: 'asc' },
        });

        const count = await db.appointments.count();
        const appointmentId = `WLK-${String(count + 1).padStart(6, '0')}`;

        const appointmentDate = nextSlot
            ? (() => {
                const [hours, minutes] = nextSlot.start_time.split(':').map(Number);
                const d = new Date();
                d.setHours(hours, minutes, 0, 0);
                return d;
            })()
            : new Date();

        const appointment = await db.appointments.create({
            data: {
                appointment_id: appointmentId,
                patient_id: data.patientId,
                doctor_id: data.doctorId,
                doctor_name: data.doctorName,
                department: data.department,
                reason_for_visit: data.reasonForVisit || 'Walk-in',
                status: 'Checked In',
                appointment_date: appointmentDate,
                checked_in_at: new Date(),
                organizationId,
            },
        });

        // Mark slot as booked if one was found
        if (nextSlot) {
            await db.appointmentSlot.update({
                where: { id: nextSlot.id },
                data: { is_booked: true, is_available: false, booked_by: data.patientId },
            });
        }

        // Assign next queue token
        const lastToken = await db.appointments.findFirst({
            where: {
                doctor_id: data.doctorId,
                appointment_date: { gte: today },
                queue_token: { not: null },
            },
            orderBy: { queue_token: 'desc' },
        });

        const newToken = (lastToken?.queue_token || 0) + 1;
        await db.appointments.update({
            where: { appointment_id: appointmentId },
            data: { queue_token: newToken },
        });

        revalidatePath('/reception/appointments');
        revalidatePath('/reception/queue');
        return { success: true, data: { ...appointment, queue_token: newToken } };
    } catch (error) {
        console.error('Walk-in Appointment Error:', error);
        return { success: false, error: 'Failed to create walk-in appointment' };
    }
}

/**
 * Preview how many slots will be created before actually creating them.
 */
export async function previewBulkSlots(data: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    slotDuration: number;
    bufferMinutes?: number;
}): Promise<{ count: number; days: number }> {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const buffer = data.bufferMinutes || 0;
    const effectiveDuration = data.slotDuration + buffer;
    let count = 0;
    let days = 0;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === 0) continue; // Skip Sundays
        days++;
        const [startH, startM] = data.startTime.split(':').map(Number);
        const [endH, endM] = data.endTime.split(':').map(Number);
        const dayStartMin = startH * 60 + startM;
        const dayEndMin = endH * 60 + endM;

        for (let min = dayStartMin; min + data.slotDuration <= dayEndMin; min += effectiveDuration) {
            count++;
        }
    }

    return { count, days };
}

// ========================================
// QUEUE MANAGEMENT (ENHANCED)
// ========================================

export async function getAllDoctorQueues() {
    try {
        const { db } = await requireTenantContext();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const appointments = await db.appointments.findMany({
            where: {
                appointment_date: { gte: todayStart },
                status: { in: ['Checked In', 'In Progress', 'Scheduled'] },
            },
            include: { patient: true },
            orderBy: { queue_token: 'asc' },
        });

        // Group by doctor
        type DoctorQueueItem = {
            appointmentId: string;
            patientName: string;
            patientId: string;
            token: number | null;
            status: string;
            checkedInAt: Date | null;
            reason: string | null;
        };

        const queues: Record<string, {
            doctorId: string;
            doctorName: string;
            department: string;
            current: DoctorQueueItem | null;
            waiting: DoctorQueueItem[];
            scheduled: DoctorQueueItem[];
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
                };
            }

            const item: DoctorQueueItem = {
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

        return { success: true, data: Object.values(queues) };
    } catch (error) {
        console.error('All Doctor Queues Error:', error);
        return { success: false, data: [] };
    }
}

export async function reorderQueue(appointmentId: string, newToken: number) {
    try {
        const { db } = await requireTenantContext();

        await db.appointments.update({
            where: { appointment_id: appointmentId },
            data: { queue_token: newToken },
        });

        revalidatePath('/reception/queue');
        revalidatePath('/opd/display');
        return { success: true };
    } catch (error) {
        console.error('Reorder Queue Error:', error);
        return { success: false, error: 'Failed to reorder' };
    }
}

export async function skipPatient(appointmentId: string) {
    try {
        const { db } = await requireTenantContext();

        const appointment = await db.appointments.findUnique({
            where: { appointment_id: appointmentId },
        });

        if (!appointment) return { success: false, error: 'Not found' };

        // Get the highest token for this doctor today
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

        const newToken = (lastToken?.queue_token || 0) + 1;

        await db.appointments.update({
            where: { appointment_id: appointmentId },
            data: { queue_token: newToken, status: 'Checked In' },
        });

        revalidatePath('/reception/queue');
        revalidatePath('/opd/display');
        return { success: true };
    } catch (error) {
        console.error('Skip Patient Error:', error);
        return { success: false, error: 'Failed to skip' };
    }
}
