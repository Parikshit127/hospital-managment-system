'use server';

/**
 * GAP 12 — Nurse-to-Doctor Vitals Real-Time Sync per Appointment
 * Vitals entered by nurse reflect on doctor's prescription page for that appointment.
 * Uses Supabase Realtime (via existing realtime.ts) with polling fallback.
 */

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

export async function recordNurseVitalsForAppointment(data: {
    patient_id: string;
    appointment_id: string;
    blood_pressure?: string;
    heart_rate?: number;
    temperature?: number;
    oxygen_sat?: number;
    respiratory_rate?: number;
    weight?: number;
    height?: number;
    blood_sugar?: number;
    pain_scale?: number;
    recorded_by: string;
}) {
    const { db, organizationId } = await requireTenantContext();

    try {
        // Upsert vitals for this appointment (one record per appointment visit)
        const existing = await db.vital_signs.findFirst({
            where: { appointment_id: data.appointment_id, organizationId },
        });

        let vitals;
        if (existing) {
            vitals = await db.vital_signs.update({
                where: { id: existing.id },
                data: {
                    blood_pressure: data.blood_pressure ?? existing.blood_pressure,
                    heart_rate: data.heart_rate ?? existing.heart_rate,
                    temperature: data.temperature ?? existing.temperature,
                    oxygen_sat: data.oxygen_sat ?? existing.oxygen_sat,
                    respiratory_rate: data.respiratory_rate ?? existing.respiratory_rate,
                    weight: data.weight ?? existing.weight,
                    height: data.height ?? existing.height,
                    blood_sugar: data.blood_sugar ?? existing.blood_sugar,
                    pain_scale: data.pain_scale ?? existing.pain_scale,
                    recorded_by: data.recorded_by,
                },
            });
        } else {
            vitals = await db.vital_signs.create({
                data: {
                    patient_id: data.patient_id,
                    appointment_id: data.appointment_id,
                    blood_pressure: data.blood_pressure || null,
                    heart_rate: data.heart_rate || null,
                    temperature: data.temperature || null,
                    oxygen_sat: data.oxygen_sat || null,
                    respiratory_rate: data.respiratory_rate || null,
                    weight: data.weight || null,
                    height: data.height || null,
                    blood_sugar: data.blood_sugar || null,
                    pain_scale: data.pain_scale ?? null,
                    recorded_by: data.recorded_by,
                    organizationId,
                },
            });
        }

        // Notify doctor that vitals are ready (find doctor for this appointment)
        const appointment = await db.appointments.findUnique({
            where: { appointment_id: data.appointment_id },
            select: { doctor_id: true },
        });

        if (appointment?.doctor_id) {
            await db.notification.create({
                data: {
                    organizationId,
                    user_id: appointment.doctor_id,
                    title: '📊 Vitals Updated',
                    body: `Nurse has recorded vitals for patient ${data.patient_id}. Ready for consultation.`,
                    type: 'info',
                },
            });
        }

        // Revalidate doctor's prescription page
        revalidatePath('/doctor/patient');
        revalidatePath('/doctor/dashboard');

        return { success: true, data: JSON.parse(JSON.stringify(vitals)) };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to record vitals';
        return { success: false, error: msg };
    }
}

export async function getVitalsForAppointment(appointmentId: string) {
    const { db, organizationId } = await requireTenantContext();

    const vitals = await db.vital_signs.findFirst({
        where: { appointment_id: appointmentId, organizationId },
        orderBy: { created_at: 'desc' },
    });

    return { success: true, data: vitals ? JSON.parse(JSON.stringify(vitals)) : null };
}

export async function getLatestVitalsForPatient(patientId: string) {
    const { db, organizationId } = await requireTenantContext();

    const vitals = await db.vital_signs.findFirst({
        where: { patient_id: patientId, organizationId },
        orderBy: { created_at: 'desc' },
    });

    return { success: true, data: vitals ? JSON.parse(JSON.stringify(vitals)) : null };
}

export async function getVitalsHistoryForPatient(patientId: string, limit = 10) {
    const { db, organizationId } = await requireTenantContext();

    const vitals = await db.vital_signs.findMany({
        where: { patient_id: patientId, organizationId },
        orderBy: { created_at: 'desc' },
        take: limit,
    });

    return { success: true, data: JSON.parse(JSON.stringify(vitals)) };
}
