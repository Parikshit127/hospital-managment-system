'use server';

import { prisma } from '@/app/lib/db';
import { revalidatePath } from 'next/cache';
import { sendAppointmentReminder } from '@/app/lib/whatsapp';
const WEBHOOK_OPD_REG = 'https://n8n.srv1336142.hstgr.cloud/webhook/hospital-reg';

// Generate standardized UHID: AVN-YYYY-XXXXX
async function generateUHID(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await prisma.oPD_REG.count();
    const seq = String(count + 1).padStart(5, '0');
    return `AVN-${year}-${seq}`;
}

// Generate appointment ID: APT-YYYYMMDD-XXXX
function generateAppointmentId(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `APT-${dateStr}-${seq}`;
}

export async function registerPatient(formData: FormData) {
    const rawData = {
        full_name: formData.get('full_name') as string,
        phone: formData.get('phone') as string,
        age: formData.get('age') as string,
        gender: formData.get('gender') as string,
        department: formData.get('department') as string,
        email: (formData.get('email') as string) || "not given",
        address: (formData.get('address') as string) || "not given",
        aadhar: formData.get('aadhar') as string,
    };

    try {
        let agentPatientId = null;
        let appointmentId = null;

        // 1. Send to Webhook to get the official ID (falls back to local UHID if webhook fails)
        try {
            const webhookRes = await fetch(WEBHOOK_OPD_REG, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...rawData }),
            });

            if (webhookRes.ok) {
                const result = await webhookRes.json();
                if (result.patient_id || result.id || result.digital_id) {
                    agentPatientId = result.patient_id || result.id || result.digital_id;
                    appointmentId = result.appointment_id;
                }
            }
        } catch (webhookErr) {
            console.warn('Webhook unavailable, using local UHID:', webhookErr);
        }

        // Fallback: generate UHID locally if webhook didn't provide IDs
        if (!agentPatientId) {
            agentPatientId = await generateUHID();
        }
        if (!appointmentId) {
            appointmentId = generateAppointmentId();
        }

        // 2. Create/Update Patient in DB
        const existingPatient = await prisma.oPD_REG.findUnique({
            where: { patient_id: agentPatientId }
        });

        if (!existingPatient) {
            await prisma.oPD_REG.create({
                data: {
                    patient_id: agentPatientId,
                    full_name: rawData.full_name,
                    phone: rawData.phone,
                    age: rawData.age,
                    department: rawData.department,
                    email: rawData.email,
                    // @ts-ignore
                    address: rawData.address,
                    aadhar_card: rawData.aadhar,
                },
            });
        }

        // 3. Create Appointment (If not exists)
        const existingAppt = await prisma.appointments.findUnique({
            where: { appointment_id: appointmentId }
        });

        if (!existingAppt) {
            await prisma.appointments.create({
                data: {
                    appointment_id: appointmentId,
                    patient_id: agentPatientId, // FK to OPD_REG
                    status: 'Pending',
                    department: rawData.department,
                    reason_for_visit: 'Initial Consultation'
                }
            });
        }

        revalidatePath('/doctor/dashboard');

        // Audit log
        await prisma.system_audit_logs.create({
            data: {
                action: 'CREATE_PATIENT',
                module: 'reception',
                entity_type: 'patient',
                entity_id: agentPatientId,
                details: JSON.stringify({ full_name: rawData.full_name, department: rawData.department, appointment_id: appointmentId }),
            }
        });
        // Send WhatsApp appointment reminder (non-blocking)
        if (rawData.phone) {
            sendAppointmentReminder(rawData.phone, rawData.full_name, rawData.department, 'as scheduled').catch(err =>
                console.warn('[WhatsApp] Failed to send reminder:', err)
            );
        }

        return {
            success: true,
            patient_id: agentPatientId,
            appointment_id: appointmentId,
            user_type: 'OPD'
        };

    } catch (error) {
        console.error('Registration Error:', error);
        let errorMessage = 'Failed to register patient';
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        return { success: false, error: errorMessage };
    }
}

