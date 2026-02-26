'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { sendAppointmentReminder } from '@/app/lib/whatsapp';
import * as bcrypt from 'bcryptjs';
import { sendWelcomeEmail } from '@/backend/email';

// Generate standardized UHID: AVN-YYYY-XXXXX
async function generateUHID(db: any): Promise<string> {
    const year = new Date().getFullYear();
    const count = await db.oPD_REG.count();
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
        const { db, organizationId } = await requireTenantContext();

        let agentPatientId = null;
        let appointmentId = null;

        agentPatientId = await generateUHID(db);
        appointmentId = generateAppointmentId();

        // 2. Create/Update Patient in DB
        const existingPatient = await db.oPD_REG.findUnique({
            where: { patient_id: agentPatientId }
        });

        // 3a. Generate Password
        const tempPassword = Math.random().toString(36).slice(-8); // Generate 8 char password
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        if (!existingPatient) {
            await db.oPD_REG.create({
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
                    password: hashedPassword,
                    organizationId,
                },
            });

            // 3b. Send email with credentials
            if (rawData.email && rawData.email !== "not given") {
                await sendWelcomeEmail(rawData.email, rawData.full_name, agentPatientId, tempPassword);
            }
        }

        // 3. Create Appointment (If not exists)
        const existingAppt = await db.appointments.findUnique({
            where: { appointment_id: appointmentId }
        });

        if (!existingAppt) {
            // Find a doctor in that department
            const matchingDoctor = await db.user.findFirst({
                where: {
                    role: 'doctor',
                    specialty: rawData.department,
                    is_active: true
                }
            });

            await db.appointments.create({
                data: {
                    appointment_id: appointmentId,
                    patient_id: agentPatientId, // FK to OPD_REG
                    status: 'Pending',
                    department: rawData.department,
                    doctor_id: matchingDoctor ? matchingDoctor.id : null,
                    doctor_name: matchingDoctor ? matchingDoctor.name || matchingDoctor.username : null,
                    reason_for_visit: 'Initial Consultation',
                    organizationId,
                }
            });
        }

        revalidatePath('/doctor/dashboard');

        // Audit log
        await db.system_audit_logs.create({
            data: {
                action: 'CREATE_PATIENT',
                module: 'reception',
                entity_type: 'patient',
                entity_id: agentPatientId,
                details: JSON.stringify({ full_name: rawData.full_name, department: rawData.department, appointment_id: appointmentId }),
                organizationId,
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
            user_type: 'OPD',
            generatedPassword: tempPassword
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
