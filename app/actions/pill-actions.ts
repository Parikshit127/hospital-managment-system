'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sendWhatsAppMessage, formatPhoneNumber } from '@/app/lib/whatsapp';
import { pillReminderMsg } from '@/app/lib/whatsapp-templates';

const pillReminderSchema = z.object({
  patient_id: z.string().min(1, 'Patient is required'),
  medication_name: z.string().min(1, 'Medication name is required'),
  dosage: z.string().min(1, 'Dosage is required'),
  schedule_times: z.array(z.string()).min(1, 'At least one time is required'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  notes: z.string().optional(),
});

export async function schedulePillReminder(formData: any) {
  try {
    const { db, organizationId, session } = await requireTenantContext();

    const validated = pillReminderSchema.parse(formData);
    
    const reminder = await db.pillReminder.create({
      data: {
        patient_id: validated.patient_id,
        doctor_id: session.id,
        medication_name: validated.medication_name,
        dosage: validated.dosage,
        schedule_times: validated.schedule_times,
        start_date: new Date(validated.start_date),
        end_date: new Date(validated.end_date),
        notes: validated.notes,
        status: 'Active',
        organizationId,
      },
    });

    // Audit log
    await db.system_audit_logs.create({
      data: {
        action: 'SCHEDULE_PILL_REMINDER',
        module: 'doctor',
        entity_type: 'pill_reminder',
        entity_id: reminder.id,
        details: JSON.stringify({ 
          patient_id: validated.patient_id, 
          medication: validated.medication_name 
        }),
        organizationId,
      }
    });

    // WhatsApp: Pill reminder notification
    const patient = await db.oPD_REG.findUnique({
      where: { patient_id: validated.patient_id },
      select: { phone: true, full_name: true }
    });
    if (patient?.phone) {
      await sendWhatsAppMessage({
        to: formatPhoneNumber(patient.phone),
        message: pillReminderMsg({
          patientName: patient.full_name,
          medicationName: validated.medication_name,
          time: validated.schedule_times.join(", "),
          hospitalName: "Hospital"
        })
      }).catch(waErr => console.error('Pill Reminder WA failed:', waErr));
    }

    revalidatePath('/doctor/follow-ups');
    return { success: true, data: reminder };
  } catch (error) {
    console.error('Schedule Pill Reminder Error:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: 'Failed to schedule pill reminder' };
  }
}

export async function getActivePillReminders(patientId?: string) {
  try {
    const { db, organizationId } = await requireTenantContext();

    const reminders = await db.pillReminder.findMany({
      where: {
        organizationId,
        ...(patientId ? { patient_id: patientId } : {}),
        status: 'Active',
      },
      include: {
        patient: {
          select: {
            full_name: true,
            phone: true,
            email: true,
          }
        }
      },
      orderBy: { created_at: 'desc' },
    });

    return { success: true, data: reminders };
  } catch (error) {
    console.error('Fetch Pill Reminders Error:', error);
    return { success: false, data: [] };
  }
}

export async function deactivatePillReminder(id: string) {
  try {
    const { db } = await requireTenantContext();

    await db.pillReminder.update({
      where: { id },
      data: { status: 'Deactivated' },
    });

    revalidatePath('/doctor/follow-ups');
    return { success: true };
  } catch (error) {
    console.error('Deactivate Pill Reminder Error:', error);
    return { success: false, error: 'Failed to deactivate reminder' };
  }
}

export async function searchPatients(query: string) {
  try {
    const { db, organizationId } = await requireTenantContext();

    const patients = await db.oPD_REG.findMany({
      where: {
        organizationId,
        OR: [
          { full_name: { contains: query, mode: 'insensitive' } },
          { patient_id: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query } },
        ],
      },
      select: {
        patient_id: true,
        full_name: true,
        phone: true,
      },
      take: 10,
    });

    return { success: true, data: patients };
  } catch (error) {
    console.error('Search Patients Error:', error);
    return { success: false, data: [] };
  }
}
