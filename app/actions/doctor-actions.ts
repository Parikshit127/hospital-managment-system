'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { searchICD10 } from '@/app/lib/icd10';
import { sendPrescriptionEmail, sendAdmissionEmail } from '@/backend/email';


export async function getPatientQueue(options?: { doctor_id?: string; specialty?: string; view?: 'my' | 'all' }) {
    try {
        const { db } = await requireTenantContext();

        const where: any = {
            status: {
                in: ['Pending', 'Scheduled', 'Checked In', 'In Progress', 'Admitted']
            },
            appointment_date: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)),
                lt: new Date(new Date().setHours(23, 59, 59, 999))
            }
        };

        // Filter by doctor if "My Patients" view
        if (options?.view === 'my' && options?.doctor_id) {
            where.doctor_id = options.doctor_id;
        }

        // Filter by specialty/department
        if (options?.specialty) {
            where.department = options.specialty;
        }

        const appointments = await db.appointments.findMany({
            where,
            include: {
                patient: true,
            },
            orderBy: { appointment_date: 'asc' },
        });

        const queue = appointments.map((appt: any) => ({
            ...appt.patient,
            age: appt.patient.age,
            gender: appt.patient.gender,
            phone: appt.patient.phone,
            status: appt.status,
            appointment_id: appt.appointment_id,
            internal_id: appt.id,
            digital_id: appt.patient.patient_id,
            doctor_id: appt.doctor_id,
            doctor_name: appt.doctor_name,
            reason_for_visit: appt.reason_for_visit,
            appointment_date: appt.appointment_date,
        }));

        return { success: true, data: queue };
    } catch (error) {
        console.error('Queue Fetch Error:', error);
        return { success: false, data: [] };
    }
}

export async function getDoctorsList() {
    try {
        const { db } = await requireTenantContext();

        const doctors = await db.user.findMany({
            where: { role: 'doctor' },
            select: { id: true, name: true, specialty: true, username: true },
            orderBy: { name: 'asc' },
        });
        return { success: true, data: doctors };
    } catch (error) {
        console.error('Doctors List Error:', error);
        return { success: false, data: [] };
    }
}

export async function admitPatient(patientId: string, doctorName: string, diagnosis: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        // 1. Create Admission Record
        const admission = await db.admissions.create({
            data: {
                patient_id: patientId,
                doctor_name: doctorName,
                diagnosis: diagnosis,
                status: 'Admitted',
                admission_date: new Date(),
                organizationId,
            },
        });

        // 2. Update Appointment Status to 'Admitted'
        // We find the latest appointment for this patient today
        // Or just let the UI handle the status update via updateAppointmentStatus?
        // Better to do it here to ensure consistency.
        // But we don't have appointment_id passed here.
        // We will trust the UI/Logic to update appointment status separately or we can query it.
        // For now, returning success. The UI calls updateStatus separately usually or we should add it.

        const patient = await db.oPD_REG.findUnique({ where: { patient_id: patientId } });
        if (patient && patient.email) {
            await sendAdmissionEmail(patient.email, patient.full_name, 'Pending Ward Assignment', doctorName);
        }

        revalidatePath('/doctor/dashboard');
        return { success: true, admission_id: admission.admission_id };
    } catch (error) {
        console.error('Admission Error:', error);
        return { success: false, error: 'Admission failed' };
    }
}

export async function getPatientHistory(patientId: string) {
    try {
        const { db } = await requireTenantContext();

        const history = await db.clinical_EHR.findMany({
            where: { patient_id: patientId },
            orderBy: { created_at: 'desc' }
        });
        return { success: true, data: history };
    } catch (error) {
        console.error('History Fetch Error:', error);
        return { success: false, data: [] };
    }
}

export async function saveMedicalNote(data: { admission_id: string, note_type: string, details: string }) {
    try {
        const { db, organizationId } = await requireTenantContext();

        let finalAdmissionId = data.admission_id;

        // Handle Lookup if UI doesn't have admission_id
        if (data.admission_id.startsWith('LOOKUP_BY_PATIENT:')) {
            const patientId = data.admission_id.split(':')[1];
            // Find latest active admission
            const admission = await db.admissions.findFirst({
                where: {
                    patient_id: patientId,
                    status: 'Admitted'
                },
                orderBy: { admission_date: 'desc' }
            });

            if (!admission) {
                return { success: false, error: 'No active admission found for this patient' };
            }
            finalAdmissionId = admission.admission_id;
        }

        // @ts-ignore
        await db.medical_notes.create({
            data: {
                admission_id: finalAdmissionId,
                note_type: data.note_type,
                details: data.details,
                organizationId,
            }
        });
        revalidatePath('/doctor/dashboard');
        return { success: true };
    } catch (error) {
        console.error('Medical Note Save Error:', error);
        return { success: false, error: 'Failed to save medical note' };
    }
}

export async function saveClinicalNotes(data: any) {
    try {
        const { db, organizationId } = await requireTenantContext();

        // 1. Save to Local DB (Clinical_EHR)
        // Schema: appointment_id (PK), patient_id, doctor_notes, diagnosis
        // Note: Prisma create needs unique ID. appointment_id is PK.
        // We use upsert to handle re-saves for same appointment

        await db.clinical_EHR.upsert({
            where: { appointment_id: data.appointment_id },
            update: {
                doctor_notes: data.notes,
                diagnosis: data.diagnosis,
                doctor_name: data.doctor_name
            },
            create: {
                appointment_id: data.appointment_id, // PK
                patient_id: data.patient_id,
                doctor_notes: data.notes,
                diagnosis: data.diagnosis,
                doctor_name: data.doctor_name,
                organizationId,
            }
        });

        // 2. Send email prescription
        const patient = await db.oPD_REG.findUnique({ where: { patient_id: data.patient_id } });
        if (patient && patient.email) {
            const summaryHtml = `
                <h3 style="margin-top:0;">Diagnosis: ${data.diagnosis || 'Pending'}</h3>
                <div>${data.notes ? data.notes.replace(/\\n/g, '<br/>') : 'No additional notes provided.'}</div>
            `;
            await sendPrescriptionEmail(patient.email, patient.full_name, data.doctor_name, summaryHtml);
        }

        revalidatePath('/doctor/dashboard');
        return { success: true };
    } catch (error) {
        console.error('EHR Save Error:', error);
        return { success: false, error: 'Failed to save notes' };
    }
}

export async function orderLabTest(data: any) {
    console.log('--- orderLabTest Started ---');
    console.log('Data:', data);
    try {
        const { db, organizationId } = await requireTenantContext();

        // Generate barcode locally
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await db.lab_orders.count();
        const seq = String(count + 1).padStart(4, '0');
        const barcode = `LAB-${dateStr}-${seq}`;
        const technician = "Lab Tech"; // Generic assignment

        await db.lab_orders.create({
            data: {
                barcode: barcode,
                patient_id: data.patient_id,
                doctor_id: data.doctor_id,
                test_type: data.test_type,
                status: 'Pending',
                assigned_technician_id: technician,
                organizationId,
            }
        });

        revalidatePath('/lab/technician');
        revalidatePath('/doctor/dashboard');

        return { success: true, barcode, technician };

    } catch (error) {
        console.error('Lab Order Error:', error);
        return { success: false, error: 'Failed to create lab order via DB' };
    }
}

export async function getPatientLabOrders(patientId: string) {
    try {
        const { db } = await requireTenantContext();

        const orders = await db.lab_orders.findMany({
            where: { patient_id: patientId },
            orderBy: { created_at: 'desc' },
        });
        return { success: true, data: orders };
    } catch (error) {
        console.error('Get Lab Orders Error:', error);
        return { success: false, data: [] };
    }
}

export async function updateAppointmentStatus(appointmentId: string, status: string) {
    try {
        const { db } = await requireTenantContext();

        // appointmentId is string (APP-...), schema uses 'appointment_id' as unique string,
        // internal 'id' is Int.
        // So we update where appointment_id matches.

        await db.appointments.update({
            where: { appointment_id: appointmentId },
            data: { status: status }
        });
        revalidatePath('/doctor/dashboard');
        return { success: true };
    } catch (error) {
        console.error('Update Status Error:', error);
        return { success: false, error: 'Failed to update status' };
    }
}


export async function getMedicineList() {
    try {
        const { db } = await requireTenantContext();

        const medicines = await db.pharmacy_medicine_master.findMany({
            orderBy: { brand_name: 'asc' }
        });
        return { success: true, data: medicines };
    } catch (error) {
        console.error('Get Medicine List Error:', error);
        return { success: false, data: [] };
    }
}

export async function createPharmacyOrder(patientId: string, doctorId: string, items: { name: string, qty: number }[]) {
    console.log('--- createPharmacyOrder Started ---');
    console.log('Patient:', patientId, 'Doctor:', doctorId);
    console.log('Items:', items);
    try {
        const { db, organizationId } = await requireTenantContext();

        // 1. Create Local Order (Pending)
        const order = await db.pharmacy_orders.create({
            data: {
                patient_id: patientId,
                doctor_id: doctorId,
                status: 'Pending',
                total_items_requested: items.length,
                organizationId,
                items: {
                    create: items.map((i: any) => ({
                        medicine_name: i.name,
                        quantity_requested: i.qty,
                        status: 'Pending'
                    }))
                }
            },
            include: { items: true }
        });

        revalidatePath('/doctor/dashboard');
        revalidatePath('/pharmacy/billing');

        return { success: true, orderId: order.id };

    } catch (error) {
        console.error('Create Pharmacy Order Error:', error);
        return { success: false, error: 'Failed to create pharmacy order' };
    }
}

// ICD-10 code lookup for diagnosis
export async function lookupICD10(query: string) {
    try {
        const results = await searchICD10(query);
        return { success: true, data: results };
    } catch (error: any) {
        console.error('ICD-10 lookup error:', error);
        return { success: true, data: [] };
    }
}

// ========================================
// AI SOAP NOTE ASSISTANT
// ========================================

export async function generateAISOAPNote(rawText: string, patientId: string) {
    try {
        const { db } = await requireTenantContext();
        const { generateSOAPNote } = await import('@/app/lib/ai-service');

        const patient = await db.oPD_REG.findUnique({ where: { patient_id: patientId } });
        const lastVisit = await db.clinical_EHR.findFirst({
            where: { patient_id: patientId },
            orderBy: { created_at: 'desc' },
        });

        const vitals = await db.vital_signs.findFirst({
            where: { patient_id: patientId },
            orderBy: { created_at: 'desc' },
        });

        const vitalsMap: Record<string, string> = {};
        if (vitals) {
            if (vitals.blood_pressure) vitalsMap['BP'] = vitals.blood_pressure;
            if (vitals.heart_rate) vitalsMap['HR'] = `${vitals.heart_rate} bpm`;
            if (vitals.temperature) vitalsMap['Temp'] = `${vitals.temperature}°C`;
            if (vitals.oxygen_sat) vitalsMap['SpO2'] = `${vitals.oxygen_sat}%`;
            if (vitals.respiratory_rate) vitalsMap['RR'] = `${vitals.respiratory_rate}/min`;
        }

        const result = await generateSOAPNote(rawText, {
            name: patient?.full_name || 'Unknown',
            age: patient?.age ? Number(patient.age) : undefined,
            gender: patient?.gender || undefined,
            chiefComplaint: lastVisit?.diagnosis || undefined,
            vitals: Object.keys(vitalsMap).length > 0 ? vitalsMap : undefined,
            history: lastVisit?.doctor_notes?.substring(0, 500) || undefined,
        });

        return { success: true, data: result };
    } catch (error: any) {
        console.error('AI SOAP generation error:', error);
        return { success: false, error: error.message || 'AI service unavailable' };
    }
}

export async function autoSuggestICD10(diagnosisText: string) {
    try {
        const { autoCodeICD10 } = await import('@/app/lib/ai-service');
        const results = await autoCodeICD10(diagnosisText);
        return { success: true, data: results };
    } catch (error: any) {
        console.error('AI ICD-10 suggestion error:', error);
        return { success: false, data: [] };
    }
}

export async function getAIPreConsultBrief(patientId: string) {
    try {
        const { db } = await requireTenantContext();
        const { generatePreConsultBrief } = await import('@/app/lib/ai-service');

        const patient = await db.oPD_REG.findUnique({ where: { patient_id: patientId } });
        if (!patient) return { success: false, error: 'Patient not found' };

        const recentVisits = await db.clinical_EHR.findMany({
            where: { patient_id: patientId },
            orderBy: { created_at: 'desc' },
            take: 3,
        });

        const pendingLabs = await db.lab_orders.findMany({
            where: { patient_id: patientId },
            orderBy: { created_at: 'desc' },
            take: 5,
        });

        const brief = await generatePreConsultBrief({
            name: patient.full_name,
            age: patient.age ? Number(patient.age) : undefined,
            gender: patient.gender || undefined,
            recentVisits: recentVisits.map((v: any) => ({
                date: new Date(v.created_at).toLocaleDateString(),
                diagnosis: v.diagnosis || 'Unspecified',
                notes: v.doctor_notes || '',
            })),
            pendingLabs: pendingLabs.map((l: any) => ({
                testType: l.test_type,
                status: l.status,
                result: l.result_value || undefined,
            })),
            currentMeds: [],
        });

        return { success: true, data: brief };
    } catch (error: any) {
        console.error('AI Pre-consult brief error:', error);
        return { success: false, error: error.message || 'AI service unavailable' };
    }
}

export async function transcribeVoiceNote(formData: FormData) {
    try {
        const { transcribeAudio } = await import('@/app/lib/ai-service');
        const audioFile = formData.get('audio') as File;
        if (!audioFile) return { success: false, error: 'No audio file provided' };

        const buffer = Buffer.from(await audioFile.arrayBuffer());
        const text = await transcribeAudio(buffer, audioFile.name || 'recording.webm');
        return { success: true, data: text };
    } catch (error: any) {
        console.error('Voice transcription error:', error);
        return { success: false, error: error.message || 'Transcription failed' };
    }
}
