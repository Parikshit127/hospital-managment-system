'use server';

import { prisma } from '@/app/lib/db';
import { sendDischargeSummary } from '@/app/lib/whatsapp';
import OpenAI from 'openai';

const WEBHOOK_DISCHARGE = 'https://n8n.srv1336142.hstgr.cloud/webhook/discharge-patient';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function dischargePatient(patientId: string) {
    try {
        console.log(`Initiating Discharge for Patient: ${patientId}`);

        const activeAdmission = await prisma.admissions.findFirst({
            where: {
                patient_id: patientId,
                status: 'Admitted'
            }
        });

        if (activeAdmission) {
            await prisma.admissions.update({
                where: { admission_id: activeAdmission.admission_id },
                data: {
                    status: 'Discharged',
                    discharge_date: new Date()
                }
            });
        }

        // Log audit event
        await prisma.system_audit_logs.create({
            data: {
                action: 'DISCHARGE_PATIENT',
                module: 'discharge',
                entity_type: 'patient',
                entity_id: patientId,
                details: JSON.stringify({ admission_id: activeAdmission?.admission_id }),
            }
        });

        // Call n8n Webhook
        const response = await fetch(WEBHOOK_DISCHARGE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patient_id: patientId }),
        });

        if (!response.ok) {
            throw new Error(`Webhook failed with status: ${response.status}`);
        }

        const pdfArrayBuffer = await response.arrayBuffer();
        const base64Pdf = Buffer.from(pdfArrayBuffer).toString('base64');

        return {
            success: true,
            pdfBase64: base64Pdf
        };

    } catch (error: any) {
        console.error('Discharge Error:', error);
        return { success: false, error: error.message || 'Failed to generate discharge summary' };
    }
}

// Get all admitted patients for discharge management
export async function getAdmittedPatients() {
    try {
        const admissions = await prisma.admissions.findMany({
            where: { status: 'Admitted' },
            include: {
                patient: true,
            },
            orderBy: { admission_date: 'desc' }
        });

        const data = admissions.map(a => {
            const daysDiff = Math.ceil((new Date().getTime() - a.admission_date.getTime()) / (1000 * 60 * 60 * 24));
            return {
                id: a.patient_id,
                admission_id: a.admission_id,
                patient_name: a.patient?.full_name || 'Unknown',
                doctor: a.doctor_name || 'Unassigned',
                diagnosis: a.diagnosis || 'Pending',
                days: daysDiff,
                status: a.status,
                admission_date: a.admission_date,
            };
        });

        return { success: true, data };
    } catch (error: any) {
        console.error('getAdmittedPatients error:', error);
        return { success: false, data: [], error: error.message };
    }
}

// Process discharge with summary generation
export async function processDischarge(patientId: string, patientName: string, notes: string) {
    try {
        // Update admission status
        const activeAdmission = await prisma.admissions.findFirst({
            where: { patient_id: patientId, status: 'Admitted' }
        });

        if (activeAdmission) {
            await prisma.admissions.update({
                where: { admission_id: activeAdmission.admission_id },
                data: {
                    status: 'Discharged',
                    discharge_date: new Date()
                }
            });

            // Create discharge summary record
            await prisma.discharge_summaries.create({
                data: {
                    admission_id: activeAdmission.admission_id,
                    patient_name: patientName,
                    generated_summary: `<h2>Discharge Summary</h2><p>Patient: ${patientName}</p><p>Notes: ${notes}</p><p>Date: ${new Date().toLocaleString()}</p>`,
                }
            });
        }

        // Log audit event
        await prisma.system_audit_logs.create({
            data: {
                action: 'PROCESS_DISCHARGE',
                module: 'discharge',
                entity_type: 'patient',
                entity_id: patientId,
                details: JSON.stringify({ patientName, notes }),
            }
        });

        // Try webhook, but don't fail if webhook is down
        try {
            await fetch(WEBHOOK_DISCHARGE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patient_id: patientId, patient_name: patientName, notes }),
            });
        } catch (webhookErr) {
            console.warn('Discharge webhook failed:', webhookErr);
        }

        // Send WhatsApp discharge notification (non-blocking)
        const patient = await prisma.oPD_REG.findFirst({ where: { patient_id: patientId }, select: { phone: true } });
        if (patient?.phone) {
            sendDischargeSummary(patient.phone, patientName).catch(err =>
                console.warn('[WhatsApp] Failed to send discharge summary:', err)
            );
        }

        return { success: true };
    } catch (error: any) {
        console.error('processDischarge error:', error);
        return { success: false, error: error.message };
    }
}

// Generate AI-powered discharge summary for doctor review
export async function generateAISummary(admissionId: string) {
    try {
        const admission = await prisma.admissions.findUnique({
            where: { admission_id: admissionId },
            include: { patient: true },
        });

        if (!admission) {
            return { success: false, error: 'Admission not found' };
        }

        const [vitals, ehrNotes, labOrders] = await Promise.all([
            prisma.vital_signs.findMany({
                where: { patient_id: admission.patient_id },
                orderBy: { created_at: 'desc' },
                take: 10,
            }),
            prisma.clinical_EHR.findMany({
                where: { patient_id: admission.patient_id },
                orderBy: { created_at: 'desc' },
            }),
            prisma.lab_orders.findMany({
                where: { patient_id: admission.patient_id },
                orderBy: { created_at: 'desc' },
            }),
        ]);

        const patientName = admission.patient?.full_name || 'Unknown';
        const patientAge = admission.patient?.age || 'Unknown';
        const diagnosisList = ehrNotes.filter(n => n.diagnosis).map(n => n.diagnosis).join(', ') || admission.diagnosis || 'Not recorded';
        const doctorNotes = ehrNotes.filter(n => n.doctor_notes).map(n => n.doctor_notes).join('. ') || 'No clinical notes';
        const labResults = labOrders.map(l => `${l.test_type}: ${l.result_value ?? 'Pending'}`).join(', ') || 'No lab orders';
        const vitalsSummary = vitals.length > 0
            ? `BP: ${vitals[0].blood_pressure || '-'}, HR: ${vitals[0].heart_rate || '-'}, Temp: ${vitals[0].temperature || '-'}, SpO2: ${vitals[0].oxygen_sat || '-'}%`
            : 'No vitals recorded';

        const prompt = `You are a senior physician writing a hospital discharge summary.
Based on the following clinical data, write a concise, professional discharge summary.

Patient: ${patientName}, Age: ${patientAge}
Admission Date: ${admission.admission_date.toISOString().split('T')[0]}
Attending Doctor: ${admission.doctor_name || 'Not assigned'}
Diagnosis: ${diagnosisList}
Doctor Notes: ${doctorNotes}
Vitals on Admission: ${vitalsSummary}
Lab Results: ${labResults}

Write the discharge summary with these sections:
1. Chief Complaint
2. Hospital Course
3. Significant Findings
4. Discharge Diagnosis
5. Medications on Discharge
6. Follow-up Instructions

Keep it clinical, concise, and professional. Use HTML formatting with <h3> tags for section headings and <p> tags for content.`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1000,
        });

        const summary = completion.choices[0]?.message?.content || 'AI summary generation failed.';

        // Log audit event
        await prisma.system_audit_logs.create({
            data: {
                action: 'AI_DISCHARGE_SUMMARY',
                module: 'discharge',
                entity_type: 'admission',
                entity_id: admissionId,
                details: JSON.stringify({ patient_id: admission.patient_id, model: 'gpt-4o' }),
            },
        });

        return { success: true, summary };
    } catch (error: any) {
        console.error('generateAISummary error:', error);
        return { success: false, error: error.message || 'Failed to generate AI summary' };
    }
}

