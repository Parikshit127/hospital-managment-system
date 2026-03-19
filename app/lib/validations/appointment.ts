import { z } from 'zod';

export const bookAppointmentSchema = z.object({
    patientId: z.string().min(1, 'Patient ID is required'),
    doctorId: z.string().min(1, 'Doctor is required'),
    doctorName: z.string().min(1, 'Doctor name is required'),
    department: z.string().min(1, 'Department is required'),
    date: z.string().min(1, 'Appointment date is required'),
    slotId: z.string().optional(),
    reasonForVisit: z.string().max(500).optional(),
});

export type BookAppointmentInput = z.infer<typeof bookAppointmentSchema>;

export const rescheduleAppointmentSchema = z.object({
    appointmentId: z.string().min(1, 'Appointment ID is required'),
    newDate: z.string().min(1, 'New date is required'),
    newSlotId: z.string().optional(),
});

export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;

export const cancelAppointmentSchema = z.object({
    appointmentId: z.string().min(1, 'Appointment ID is required'),
    reason: z.string().min(1, 'Cancellation reason is required').max(500),
});

export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;

export const createBulkSlotsSchema = z.object({
    doctorId: z.string().min(1, 'Doctor is required'),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be HH:MM format'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'End time must be HH:MM format'),
    slotDuration: z
        .number()
        .int()
        .min(5, 'Slot must be at least 5 minutes')
        .max(120, 'Slot cannot exceed 120 minutes'),
    slotType: z.string().optional(),
});

export type CreateBulkSlotsInput = z.infer<typeof createBulkSlotsSchema>;
