'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { getTodayRange, getOrgTimezone } from '@/app/lib/timezone';
import { notifyPatient } from '@/app/lib/notify-patient';
import { sendWhatsAppMessage, sendWhatsAppTemplate, formatPhoneNumber } from '@/app/lib/whatsapp';
import { appointmentConfirmationMsg, appointmentCancellationMsg } from '@/app/lib/whatsapp-templates';
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
import { createInvoice, addInvoiceItem, recordPayment } from '@/app/actions/finance-actions';

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

        const [triageHistory, vitals, invoices] = await Promise.all([
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
            db.invoices.findMany({
                where: { patient_id: patientId },
                orderBy: { created_at: 'desc' },
            }),
        ]);

        const balances = await getPatientBalances([patientId]);
        const patientWithBalance = {
            ...patient,
            totalBalance: balances[patientId]?.totalBalance || 0
        };

        return {
            success: true,
            data: JSON.parse(JSON.stringify({
                patient: patientWithBalance,
                appointments: patient.appointments,
                triageHistory,
                vitals,
                invoices,
            })),
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
            await sendWhatsAppMessage({
                to: formatPhoneNumber(appointment.patient.phone),
                message: `*${orgName} — Queue Token*\n\nDear ${appointment.patient.full_name},\n\nYour token number is *#${tokenNumber}*.\nDoctor: *Dr. ${appointment.doctor_name || 'Doctor'}*\nQueue position: *${aheadCount + 1}*\nEstimated wait: *~${estimatedWait} min*\n\nYou will be notified when it's your turn.`
            }).catch(err => console.warn('[WhatsApp] Queue token failed:', err));
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
            await sendWhatsAppMessage({
                to: formatPhoneNumber(next.patient.phone),
                message: `*${orgName} — Your Turn!*\n\nDear ${next.patient.full_name},\n\nPlease proceed to *Dr. ${next.doctor_name || 'Doctor'}*'s consultation room.\n\nThank you for your patience.`
            }).catch(err => console.warn('[WhatsApp] Your turn alert failed:', err));
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
            await sendWhatsAppMessage({
                to: formatPhoneNumber(upcoming[1].patient.phone),
                message: `*${orgName} — Queue Update*\n\nDear ${upcoming[1].patient.full_name},\n\nYour queue position: *${position}*\nEstimated wait: *~${position * AVG_CONSULT_MINUTES} min*`
            }).catch(err => console.warn('[WhatsApp] Queue update failed:', err));
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
            if (patient) {
                const formattedDate = appointmentDate.toLocaleDateString('en-IN', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                });
                const formattedTime = appointmentDate.toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit', hour12: true,
                });
                const hospitalName = session.organization_name || 'Hospital';

                if (patient.phone) {
                    await sendWhatsAppTemplate({
                        to: formatPhoneNumber(patient.phone),
                        templateName: 'appointment_confirmed',
                        userName: patient.full_name || 'Patient',
                        params: [
                            hospitalName,
                            patient.full_name || 'Patient',
                            data.doctorName,
                            data.department,
                            formattedDate,
                            formattedTime,
                        ]
                    }).catch(waErr => console.error('Appointment WA Template failed:', waErr));
                }

                notifyPatient(
                    { email: patient.email, phone: patient.phone },
                    { type: 'appointment', patientName: patient.full_name || 'Patient', doctorName: data.doctorName, department: data.department, date: formattedDate, time: formattedTime, hospitalName }
                ).catch(err => console.error('[Notify] Book Appointment notification failed:', err));
            }
        } catch (error) {
            console.error('Appointment notifications failed:', error);
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

/**
 * Creates an invoice and adds a line item for miscellaneous dues from Reception
 */
export async function addPatientDues(data: {
    patient_id: string;
    department: string;
    description: string;
    amount: number;
}) {
    try {
        const invRes = await createInvoice({
            patient_id: data.patient_id,
            invoice_type: 'OPD',
            notes: 'Generated from Reception Billing',
        });

        if (!invRes.success || !invRes.data) throw new Error(invRes.error || 'Failed to create invoice');

        const newItem = await addInvoiceItem({
            invoice_id: invRes.data.id,
            department: data.department,
            description: data.description,
            quantity: 1,
            unit_price: data.amount,
        });

        if (!newItem.success) throw new Error(newItem.error);

        revalidatePath(`/reception/patient/${data.patient_id}`);
        return { success: true };
    } catch (error: any) {
        console.error('addPatientDues Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Wrapper for processing a payment from the Reception portal
 */
export async function processPatientPayment(data: {
    patient_id: string;
    invoice_id: number;
    amount: number;
    payment_method: string;
}) {
    try {
        const res = await recordPayment({
            invoice_id: data.invoice_id,
            amount: data.amount,
            payment_method: data.payment_method,
            payment_type: 'Settlement',
            notes: 'Collected at Reception',
        });

        if (!res.success) throw new Error(res.error);

        revalidatePath(`/reception/patient/${data.patient_id}`);
        return { success: true };
    } catch (error: any) {
        console.error('processPatientPayment Error:', error);
        return { success: false, error: error.message };
    }
}

export async function getPatientExternalRecords(patientId: string) {
    try {
        const { db } = await requireTenantContext();
        const records = await db.$queryRaw`
            SELECT * FROM patient_external_records
            WHERE patient_id = ${patientId}
            ORDER BY created_at DESC
        ` as any[];
        return { success: true, data: records };
    } catch (error) {
        console.error('External records error:', error);
        return { success: false, data: [] };
    }
}

export async function savePatientExternalRecord(patientId: string, data: {
    title: string;
    description?: string;
    hospital_name?: string;
    record_date?: string;
    file_url?: string;
    file_name?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        await db.$executeRaw`
            INSERT INTO patient_external_records
            (patient_id, "organizationId", title, description, hospital_name, record_date, file_url, file_name)
            VALUES (
                ${patientId},
                ${organizationId},
                ${data.title},
                ${data.description || null},
                ${data.hospital_name || null},
                ${data.record_date ? new Date(data.record_date) : null},
                ${data.file_url || null},
                ${data.file_name || null}
            )
        `;
        return { success: true };
    } catch (error) {
        console.error('Save external record error:', error);
        return { success: false, error: 'Failed to save record' };
    }
}

export async function deletePatientExternalRecord(id: number) {
    try {
        const { db } = await requireTenantContext();
        await db.$executeRaw`DELETE FROM patient_external_records WHERE id = ${id}`;
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to delete' };
    }
}

// ── Phase 4: Queue & Check-in ──────────────────────────────────────────────

export async function getTodayCheckInList() {
    const { db, organizationId } = await requireTenantContext();
    const { start, end } = getTodayRange();
    const appointments = await db.appointments.findMany({
        where: { organizationId, appointment_date: { gte: start, lte: end } },
        include: { patient: { select: { full_name: true, phone: true, age: true, gender: true } } },
        orderBy: [{ checked_in_at: 'asc' }, { appointment_date: 'asc' }],
    });
    return { success: true, data: JSON.parse(JSON.stringify(appointments)) };
}

export async function selfCheckInByPhone(phone: string) {
    const { db, organizationId } = await requireTenantContext();
    const { start, end } = getTodayRange();

    const patient = await db.oPD_REG.findFirst({
        where: { organizationId, phone },
    });
    if (!patient) return { success: false, error: 'No patient found with this phone number' };

    const appointment = await db.appointments.findFirst({
        where: {
            organizationId,
            patient_id: patient.patient_id,
            appointment_date: { gte: start, lte: end },
            status: { in: ['Pending', 'Confirmed'] },
        },
        orderBy: { appointment_date: 'asc' },
    });
    if (!appointment) return { success: false, error: 'No appointment found for today' };

    return checkInPatient(appointment.appointment_id);
}

export async function getQueueWithSLA() {
    const { db, organizationId } = await requireTenantContext();
    const { start, end } = getTodayRange();

    const [appointments, config] = await Promise.all([
        db.appointments.findMany({
            where: {
                organizationId,
                appointment_date: { gte: start, lte: end },
                status: { in: ['Checked In', 'In Progress'] },
                queue_token: { not: null },
            },
            include: { patient: { select: { full_name: true, patient_id: true } } },
            orderBy: [{ doctor_id: 'asc' }, { queue_token: 'asc' }],
        }),
        db.oPDConfig.findFirst({ where: { organizationId } }),
    ]);

    const maxWait = config?.max_wait_minutes ?? 30;
    const now = new Date();

    const data = appointments.map((a: {
        appointment_id: string;
        queue_token: number | null;
        status: string;
        doctor_id: string | null;
        doctor_name: string | null;
        checked_in_at: Date | null;
        called_at: Date | null;
        patient: { full_name: string; patient_id: string } | null;
    }) => {
        const waitMinutes = a.checked_in_at
            ? Math.floor((now.getTime() - new Date(a.checked_in_at).getTime()) / 60000)
            : null;
        return {
            appointment_id: a.appointment_id,
            queue_token: a.queue_token,
            status: a.status,
            doctor_id: a.doctor_id,
            doctor_name: a.doctor_name,
            patient_name: a.patient?.full_name ?? '',
            patient_id: a.patient?.patient_id ?? '',
            checked_in_at: a.checked_in_at,
            called_at: a.called_at,
            wait_minutes: waitMinutes,
            sla_breached: waitMinutes !== null && waitMinutes > maxWait,
            max_wait_minutes: maxWait,
        };
    });

    return { success: true, data: JSON.parse(JSON.stringify(data)), maxWait };
}
