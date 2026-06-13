'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { sendWhatsAppTemplate, sendWhatsAppMessage, formatPhoneNumber } from '@/app/lib/whatsapp';
import { appointmentConfirmationMsg, newPatientCardMsg } from '@/app/lib/whatsapp-templates';
import { notifyPatient } from '@/app/lib/notify-patient';
import { sendWelcomeEmail } from '@/backend/email';
import { createPatientPasswordSetupToken } from '@/app/lib/password-setup';
import { patientRegistrationSchema } from '@/app/lib/validations/patient';
import { generateUHID, generateAppointmentId } from '@/app/lib/uhid';
import { logger, maskEmail } from '@/app/lib/logger';

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

        const matches = await (db.oPD_REG.findMany as any)({
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
                patient_type: true,
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
        nationality: (formData.get('nationality') as string) || '',
        govt_id_type: (formData.get('govt_id_type') as string) || '',
        govt_id_number: (formData.get('govt_id_number') as string) || '',
        date_of_birth: (formData.get('date_of_birth') as string) || '',
        blood_group: (formData.get('blood_group') as string) || '',
        emergency_contact_name: (formData.get('emergency_contact_name') as string) || '',
        emergency_contact_phone: (formData.get('emergency_contact_phone') as string) || '',
        emergency_contact_relation: (formData.get('emergency_contact_relation') as string) || '',
        registration_consent: formData.get('registration_consent') === 'on' || formData.get('registration_consent') === 'true',
        // Phase 1 — Patient Type
        patient_type: (formData.get('patient_type') as string) || 'cash',
        corporate_id: (formData.get('corporate_id') as string) || '',
        corporate_card_number: (formData.get('corporate_card_number') as string) || '',
        employee_id: (formData.get('employee_id') as string) || '',
        tpa_provider_id: (formData.get('tpa_provider_id') as string) || '',
        insurance_policy_number: (formData.get('insurance_policy_number') as string) || '',
        insurance_validity_start: (formData.get('insurance_validity_start') as string) || '',
        insurance_validity_end: (formData.get('insurance_validity_end') as string) || '',
        // GAP 13 — Extended Registration Fields
        title: (formData.get('title') as string) || '',
        is_vip: formData.get('is_vip') === 'true',
        marital_status: (formData.get('marital_status') as string) || '',
        preferred_language: (formData.get('preferred_language') as string) || 'en',
        lead_source: (formData.get('lead_source') as string) || '',
        race: (formData.get('race') as string) || '',
        patient_category: (formData.get('patient_category') as string) || '',
        frro_number: (formData.get('frro_number') as string) || '',
        age_in_days: (formData.get('age_in_days') as string) || '',
        registration_remarks: (formData.get('registration_remarks') as string) || '',
        distance_from_hospital_km: (formData.get('distance_from_hospital_km') as string) || '',
        registration_form_url: (formData.get('registration_form_url') as string) || '',
    };

    // Server-side Zod validation
    const parsed = patientRegistrationSchema.safeParse(rawInput);
    if (!parsed.success) {
        const firstError = parsed.error.issues[0]?.message || 'Validation failed';
        return { success: false, error: firstError };
    }

    const skipAppointment = formData.get('bookAppointment') !== 'true'; // opt-in: only create if checked

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

        // Block duplicate registration unless explicitly allowed
        const allowDuplicate = formData.get('allowDuplicate') === 'true';
        if (!allowDuplicate) {
            const cleaned = rawData.phone.replace(/[\s\-+91]/g, '').slice(-10);
            if (cleaned.length >= 10) {
                const existingByPhone = await (db.oPD_REG.findFirst as any)({
                    where: {
                        organizationId,
                        phone: { contains: cleaned },
                    },
                    select: { patient_id: true, full_name: true },
                });
                if (existingByPhone) {
                    return {
                        success: false,
                        error: `Patient already registered with this phone number (${existingByPhone.full_name} — ${existingByPhone.patient_id}). Use existing record or confirm duplicate registration.`,
                        duplicate: true,
                        existing_patient_id: existingByPhone.patient_id,
                    };
                }
            }
        }

        // Use org-configured UHID prefix if available
        const orgConfig = await db.organizationConfig.findUnique({
            where: { organizationId },
            select: { uhid_prefix: true },
        }).catch(() => null);
        const uhidPrefix = orgConfig?.uhid_prefix || 'AVN';

        agentPatientId = await generateUHID(db, uhidPrefix);
        appointmentId = generateAppointmentId();

        // 2. Create/Update Patient in DB
        const existingPatient = await db.oPD_REG.findUnique({
            where: { patient_id: agentPatientId }
        });

        let setupLink: string | null = null;

        if (!existingPatient) {
            await (db.oPD_REG.create as any)({
                data: {
                    patient_id: agentPatientId,
                    full_name: rawData.full_name,
                    phone: rawData.phone,
                    age: rawData.age,
                    gender: rawData.gender,
                    department: rawData.department,
                    email: rawData.email,
                    address: rawData.address,
                    aadhar_card: rawData.aadhar,
                    nationality: rawData.nationality || 'Indian',
                    govt_id_type: rawData.govt_id_type || null,
                    govt_id_number: rawData.govt_id_number || null,
                    date_of_birth: rawData.date_of_birth || null,
                    blood_group: rawData.blood_group || null,
                    emergency_contact_name: rawData.emergency_contact_name || null,
                    emergency_contact_phone: rawData.emergency_contact_phone || null,
                    emergency_contact_relation: rawData.emergency_contact_relation || null,
                    registration_consent: rawData.registration_consent,
                    password: null,
                    organizationId,
                    patient_type: rawData.patient_type || 'cash',
                    corporate_id: rawData.corporate_id || null,
                    corporate_card_number: rawData.corporate_card_number || null,
                    employee_id: rawData.employee_id || null,
                    // GAP 13 — Extended Registration Fields
                    title: rawData.title || null,
                    is_vip: rawData.is_vip || false,
                    marital_status: rawData.marital_status || null,
                    preferred_language: rawData.preferred_language || 'en',
                    lead_source: rawData.lead_source || null,
                    race: rawData.race || null,
                    patient_category: rawData.patient_category || null,
                    frro_number: rawData.frro_number || null,
                    age_in_days: rawData.age_in_days ? parseInt(rawData.age_in_days, 10) : null,
                    registration_remarks: rawData.registration_remarks || null,
                    distance_from_hospital_km: rawData.distance_from_hospital_km ? parseFloat(rawData.distance_from_hospital_km) : null,
                    registration_form_url: rawData.registration_form_url || null,
                    // Auto-flag senior citizen
                    is_senior_citizen: rawData.age ? parseInt(rawData.age, 10) > 60 : false,
                },
            });

            // Phase 1 — Create insurance_policy record for TPA patients
            if (rawData.patient_type === 'tpa_insurance' && rawData.tpa_provider_id && rawData.insurance_policy_number) {
                const providerId = parseInt(rawData.tpa_provider_id, 10);
                if (!isNaN(providerId)) {
                    await db.insurance_policies.create({
                        data: {
                            patient_id: agentPatientId,
                            provider_id: providerId,
                            policy_number: rawData.insurance_policy_number,
                            valid_from: rawData.insurance_validity_start ? new Date(rawData.insurance_validity_start) : null,
                            valid_until: rawData.insurance_validity_end ? new Date(rawData.insurance_validity_end) : null,
                            status: 'Active',
                            organizationId,
                        },
                    }).catch((err: unknown) => console.error('Insurance policy create error:', err));
                }
            }

            const tokenResult = await createPatientPasswordSetupToken({
                patientId: agentPatientId,
                organizationId,
            });
            setupLink = tokenResult.setupLink;

            // 3b. Send email with credentials
            if (rawData.email && rawData.email !== "not given") {
                sendWelcomeEmail(rawData.email, rawData.full_name, agentPatientId, setupLink)
                    .then(res => {
                        if (!res.success) logger.warn('[Email] Welcome email failed:', res.error);
                        else logger.info('[Email] Welcome email sent to', maskEmail(rawData.email));
                    })
                    .catch(err => console.error('[Email] Welcome email error:', err));
            }

            // 3c. Send WhatsApp welcome via template
            if (rawData.phone) {
                const hospitalName = process.env.HOSPITAL_NAME || "Hospital";
                await sendWhatsAppTemplate({
                    to: formatPhoneNumber(rawData.phone),
                    templateName: 'welcome_msg',
                    userName: rawData.full_name,
                    params: [
                        hospitalName,
                        rawData.full_name,
                        agentPatientId,
                        setupLink,
                        hospitalName
                    ]
                }).catch((err: unknown) => console.error("WA Welcome Template Error:", err));
            }
        }

        // 3. Create Appointment (If not exists and not skipped)
        if (!skipAppointment) {
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
        } else {
            appointmentId = null;
        }

        revalidatePath('/doctor/dashboard');
        revalidatePath('/reception');
        revalidatePath('/reception/patient');
        revalidatePath('/reception/dashboard');
        revalidatePath('/reception/appointments');
        revalidatePath('/admin/patients');
        revalidatePath('/opd-manager/dashboard');

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
        // Send appointment notification (email + WhatsApp, non-blocking)
        if (!skipAppointment) {
            notifyPatient(
                { email: rawData.email !== 'not given' ? rawData.email : undefined, phone: rawData.phone },
                { type: 'appointment', patientName: rawData.full_name, doctorName: rawData.department, department: rawData.department, date: 'Today', time: 'as scheduled', hospitalName: 'Hospital' },
            ).catch(err => console.warn('[Notify] Registration appointment notification failed:', err));
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
