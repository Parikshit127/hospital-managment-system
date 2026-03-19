'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { sendAppointmentReminder } from '@/app/lib/whatsapp';
import { sendWelcomeEmail } from '@/backend/email';
import { createPatientPasswordSetupToken } from '@/app/lib/password-setup';
import { patientRegistrationSchema } from '@/app/lib/validations/patient';
import { generateUHID, generateAppointmentId } from '@/app/lib/uhid';

/**
 * Check for duplicate patients by phone number.
 * Returns matching patients so reception can decide to reuse or register new.
 */
export async function checkDuplicatePatient(phone: string) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const cleaned = phone.replace(/[\s\-+91]/g, '').slice(-10);

        if (cleaned.length < 10) {
            return { success: true, data: [] };
        }

        const matches = await db.oPD_REG.findMany({
            where: {
                organizationId,
                phone: { contains: cleaned },
            },
            select: {
                patient_id: true,
                full_name: true,
                phone: true,
                age: true,
                gender: true,
                department: true,
                date_of_birth: true,
                created_at: true,
            },
            take: 5,
        });

        return { success: true, data: matches };
    } catch (error) {
        console.error('Duplicate check error:', error);
        return { success: true, data: [] };
    }
}

export async function registerPatient(formData: FormData) {
    const rawInput = {
        full_name: formData.get('full_name') as string,
        phone: formData.get('phone') as string,
        age: formData.get('age') as string,
        gender: formData.get('gender') as string,
        department: formData.get('department') as string,
        email: (formData.get('email') as string) || '',
        address: (formData.get('address') as string) || '',
        aadhar: (formData.get('aadhar') as string) || '',
        date_of_birth: (formData.get('date_of_birth') as string) || '',
        blood_group: (formData.get('blood_group') as string) || '',
        emergency_contact_name: (formData.get('emergency_contact_name') as string) || '',
        emergency_contact_phone: (formData.get('emergency_contact_phone') as string) || '',
        emergency_contact_relation: (formData.get('emergency_contact_relation') as string) || '',
        registration_consent: formData.get('registration_consent') === 'on' || formData.get('registration_consent') === 'true',
    };

    // Server-side Zod validation
    const parsed = patientRegistrationSchema.safeParse(rawInput);
    if (!parsed.success) {
        const firstError = parsed.error.issues[0]?.message || 'Validation failed';
        return { success: false, error: firstError };
    }

    const rawData = {
        ...parsed.data,
        email: parsed.data.email || 'not given',
        address: parsed.data.address || 'not given',
        aadhar: parsed.data.aadhar || '',
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

        let setupLink: string | null = null;

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
                    date_of_birth: rawData.date_of_birth || null,
                    blood_group: rawData.blood_group || null,
                    emergency_contact_name: rawData.emergency_contact_name || null,
                    emergency_contact_phone: rawData.emergency_contact_phone || null,
                    emergency_contact_relation: rawData.emergency_contact_relation || null,
                    registration_consent: rawData.registration_consent,
                    password: null,
                    organizationId,
                },
            });

            const tokenResult = await createPatientPasswordSetupToken({
                patientId: agentPatientId,
                organizationId,
            });
            setupLink = tokenResult.setupLink;

            // 3b. Send email with credentials
            if (rawData.email && rawData.email !== "not given") {
                await sendWelcomeEmail(rawData.email, rawData.full_name, agentPatientId, setupLink);
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
            password_setup_required: !!setupLink,
            manual_password_setup_link: rawData.email === 'not given' ? setupLink : null,
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
