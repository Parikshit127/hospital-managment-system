'use server';

import { requireTenantContext } from '@/backend/tenant';
import { dischargePatientIPD } from '@/app/actions/ipd-actions';
import { notifyPatient } from '@/app/lib/notify-patient';
import OpenAI from 'openai';
import { generateInvoiceNumber as genInvNum } from '@/app/lib/sequence-generator';

// Rounds to 2 decimals (paise) so balance_due/net_amount never persist with
// float residue (e.g. 9e-13) from summing invoice_items / subtracting
// paid_amount — that residue makes a fully-paid bill look "> 0" outstanding
// in reports like A/R Aging.
function round2(n: number): number {
    const r = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    return Object.is(r, -0) ? 0 : r;
}

/**
 * Discharge by patient id, from the doctor's dashboard.
 *
 * This used to be its own implementation and did far less than the others: it
 * flipped the admission status and nothing else. The bed was never freed (so it
 * stayed Occupied forever), the invoice was never finalised, no discharge
 * summary was written and no clinical checks ran. Which of the four discharge
 * functions the UI happened to call decided what actually happened to the
 * patient's record.
 *
 * It now resolves the admission and delegates to dischargePatientIPD, which is
 * the complete path — readiness gate, medication chart closed, bed released with
 * its cleaning timestamp, invoice finalised, discharge summary written, audit
 * entry with the acting user.
 */
export async function dischargePatient(patientId: string, overrideReason?: string) {
    try {
        const { db } = await requireTenantContext();

        const activeAdmission = await db.admissions.findFirst({
            where: { patient_id: patientId, status: 'Admitted' },
            select: { admission_id: true },
        });

        if (!activeAdmission) {
            return { success: false, error: 'This patient has no active admission to discharge.' };
        }

        const res = await dischargePatientIPD(
            activeAdmission.admission_id,
            undefined,
            undefined,
            overrideReason,
        );
        return { ...res, pdfBase64: null };
    } catch (error: any) {
        console.error('Discharge Error:', error);
        return { success: false, error: error.message || 'Failed to discharge patient' };
    }
}

export async function getAdmittedPatients() {
    try {
        const { db } = await requireTenantContext();

        const admissions = await db.admissions.findMany({
            where: { status: 'Admitted' },
            include: {
                patient: true,
            },
            orderBy: { admission_date: 'desc' }
        });

        const data = admissions.map((a: any) => {
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


/**
 * Discharge from the /discharge/admin screen.
 *
 * Was a third, separate implementation with its own bed handling, its own
 * invoice creation and its own notion of what discharge means. Now resolves the
 * admission and delegates to dischargePatientIPD so every entrance produces the
 * same record: readiness gate, medication chart closed, bed released with its
 * cleaning timestamp, invoice finalised, discharge summary written.
 */
export async function processDischarge(
    patientId: string,
    _patientName: string,
    notes: string,
    overrideReason?: string,
) {
    try {
        const { db } = await requireTenantContext();

        const activeAdmission = await db.admissions.findFirst({
            where: { patient_id: patientId, status: 'Admitted' },
            select: { admission_id: true },
        });

        if (!activeAdmission) {
            return { success: false, error: 'This patient has no active admission to discharge.' };
        }

        const res = await dischargePatientIPD(
            activeAdmission.admission_id,
            notes,
            undefined,
            overrideReason,
        );
        if (!res.success) return res;

        // Close out any appointment still parked in the Admitted state.
        await db.appointments.updateMany({
            where: { patient_id: patientId, status: 'Admitted' },
            data: { status: 'Completed' },
        });

        return res;
    } catch (error: any) {
        console.error('processDischarge error:', error);
        return { success: false, error: error.message };
    }
}


export async function generateAISummary(admissionId: string) {
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const { db, organizationId } = await requireTenantContext();

        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            include: { patient: true },
        });

        if (!admission) {
            return { success: false, error: 'Admission not found' };
        }

        const [vitals, ehrNotes, labOrders] = await Promise.all([
            db.vital_signs.findMany({
                where: { patient_id: admission.patient_id },
                orderBy: { created_at: 'desc' },
                take: 10,
            }),
            db.clinical_EHR.findMany({
                where: { patient_id: admission.patient_id },
                orderBy: { created_at: 'desc' },
            }),
            db.lab_orders.findMany({
                where: { patient_id: admission.patient_id },
                orderBy: { created_at: 'desc' },
            }),
        ]);

        const patientName = admission.patient?.full_name || 'Unknown';
        const patientAge = admission.patient?.age || 'Unknown';
        const diagnosisList = ehrNotes.filter((n: any) => n.diagnosis).map((n: any) => n.diagnosis).join(', ') || admission.diagnosis || 'Not recorded';
        const doctorNotes = ehrNotes.filter((n: any) => n.doctor_notes).map((n: any) => n.doctor_notes).join('. ') || 'No clinical notes';
        const labResults = labOrders.map((l: any) => `${l.test_type}: ${l.result_value ?? 'Pending'}`).join(', ') || 'No lab orders';
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
        await db.system_audit_logs.create({
            data: {
                action: 'AI_DISCHARGE_SUMMARY',
                module: 'discharge',
                entity_type: 'admission',
                entity_id: admissionId,
                details: JSON.stringify({ patient_id: admission.patient_id, model: 'gpt-4o' }),
                organizationId,
            },
        });

        return { success: true, summary };
    } catch (error: any) {
        console.error('generateAISummary error:', error);
        return { success: false, error: error.message || 'Failed to generate AI summary' };
    }
}
