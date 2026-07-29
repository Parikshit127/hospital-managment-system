'use server';

import { requireTenantContext, requireRoleAndTenant } from '@/backend/tenant';
import OpenAI from 'openai';
import {
    DischargeSummaryData,
    emptyDischargeData,
    normalizeDischargeData,
    buildDischargeHeader,
    renderDischargeSummaryText,
    DEFAULT_DISCHARGE_CONDITION,
    DEFAULT_DISCHARGE_INSTRUCTIONS,
} from '@/app/lib/discharge-summary';
import { ADMISSION_STATUS } from '@/app/lib/admission-status';

const AUTHORS = ['doctor', 'admin', 'ipd_manager', 'superadmin', 'receptionist', 'reception'];

// A `datetime-local` input yields "YYYY-MM-DDTHH:mm" with no timezone — the
// hospital works in IST, so pin the offset rather than trusting server locale.
function parseIstDateTime(value: string): Date | null {
    const raw = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+05:30` : value;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
}

// Format the stored medication_reconciliation JSON (if any) into one med per line.
function medsFromReconciliation(raw: any): string {
    if (!raw) return '';
    let arr: any[] = [];
    if (Array.isArray(raw)) arr = raw;
    else if (typeof raw === 'object' && Array.isArray(raw.medications)) arr = raw.medications;
    if (arr.length === 0) return '';
    return arr
        .map((m: any) => {
            if (typeof m === 'string') return m;
            const parts = [m.name || m.drug || m.medicine, m.dose || m.dosage, m.frequency || m.freq, m.duration]
                .filter(Boolean)
                .join(' – ');
            return parts;
        })
        .filter(Boolean)
        .join('\n');
}

// Pre-fill the structured fields from the admission record when nothing has been saved yet.
function defaultsFromAdmission(admission: any): DischargeSummaryData {
    const d = emptyDischargeData();
    d.final_diagnosis_primary = admission?.diagnosis || '';
    d.icd_code = admission?.primary_diagnosis_icd || '';
    d.medical_history = [admission?.past_ailments, admission?.other_ailments].filter(Boolean).join('; ') || '';
    d.procedure_name = admission?.surgery_requested || '';
    d.discharge_medications = medsFromReconciliation(admission?.medication_reconciliation);
    d.discharge_instructions = admission?.discharge_instructions || DEFAULT_DISCHARGE_INSTRUCTIONS;
    d.discharge_condition = DEFAULT_DISCHARGE_CONDITION;
    d.prepared_by = admission?.doctor_name || '';
    return d;
}

async function loadAdmission(db: any, admissionId: string) {
    return db.admissions.findUnique({
        where: { admission_id: admissionId },
        include: {
            patient: { select: { full_name: true, patient_id: true, age: true, gender: true } },
            ward: true,
            bed: { include: { wards: true } },
        },
    });
}

// Read the discharge summary for an admission. Returns the saved structured data (or
// admission-derived defaults), plus the live demographic/stay header for the form + preview.
export async function getDischargeSummary(admissionId: string) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const admission = await loadAdmission(db, admissionId);
        if (!admission || admission.organizationId !== organizationId) {
            return { success: false, error: 'Admission not found' };
        }

        const row = await db.discharge_summaries.findFirst({
            where: { admission_id: admissionId, organizationId },
            orderBy: { created_at: 'desc' },
        });

        const saved = !!row?.data;
        const data = saved ? normalizeDischargeData(row!.data) : defaultsFromAdmission(admission);
        const header = buildDischargeHeader(admission, data);

        return {
            success: true,
            saved,
            data,
            header,
            lastUpdated: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
        };
    } catch (error: any) {
        console.error('getDischargeSummary error:', error);
        return { success: false, error: error.message };
    }
}

// Create/replace the discharge summary for an admission. Doctor/admin/IPD-manager/reception only.
export async function saveDischargeSummary(
    admissionId: string,
    input: Partial<DischargeSummaryData>,
    dischargeDateTime?: string,
) {
    try {
        const { db, organizationId, session } = await requireRoleAndTenant(AUTHORS);
        const admission = await loadAdmission(db, admissionId);
        if (!admission || admission.organizationId !== organizationId) {
            return { success: false, error: 'Admission not found' };
        }

        // Authoring the summary records the discharge date/time but leaves the
        // patient Admitted — that combination IS "semi discharged": the bed stays
        // occupied and the bill stays Draft until the full discharge (TPA
        // approval / settlement). See app/lib/admission-status.ts.
        if (dischargeDateTime && admission.status === ADMISSION_STATUS.CANCELLED) {
            return { success: false, error: 'Cannot set a discharge date on a cancelled admission.' };
        }
        if (dischargeDateTime) {
            const parsed = parseIstDateTime(dischargeDateTime);
            if (!parsed) {
                return { success: false, error: 'Invalid discharge date/time.' };
            }
            if (parsed.getTime() > Date.now()) {
                return { success: false, error: 'Discharge date/time cannot be in the future.' };
            }
            if (admission.admission_date && parsed < new Date(admission.admission_date)) {
                return { success: false, error: 'Discharge date/time cannot be before the admission date.' };
            }

            // Status is deliberately untouched: still 'Admitted' (semi discharged),
            // or already 'Discharged' when correcting the time after the fact.
            // Semi-discharge does NOT freeze the bill — it stays Draft and fully
            // editable (packages/charges can still be posted) until the patient
            // is actually discharged/settled or an admin explicitly locks it.
            await db.admissions.update({
                where: { admission_id: admissionId },
                data: { discharge_date: parsed },
            });

            // Keep the in-memory record in sync so the rendered summary/header
            // below shows the discharge date/time we just stored.
            admission.discharge_date = parsed;
        }

        const data = normalizeDischargeData(input);
        const header = buildDischargeHeader(admission, data);
        const text = renderDischargeSummaryText(header, data);
        const preparedBy = data.prepared_by || admission.doctor_name || session.username || null;

        // One row per admission — update the latest if it exists, else create.
        const existing = await db.discharge_summaries.findFirst({
            where: { admission_id: admissionId, organizationId },
            orderBy: { created_at: 'desc' },
        });

        if (existing) {
            await db.discharge_summaries.update({
                where: { id: existing.id },
                data: {
                    patient_name: header.patient_name,
                    generated_summary: text,
                    data: data as any,
                    prepared_by: preparedBy,
                },
            });
        } else {
            await db.discharge_summaries.create({
                data: {
                    admission_id: admissionId,
                    patient_name: header.patient_name,
                    generated_summary: text,
                    data: data as any,
                    prepared_by: preparedBy,
                    organizationId,
                },
            });
        }

        await db.system_audit_logs.create({
            data: {
                action: 'SAVE_DISCHARGE_SUMMARY',
                module: 'discharge',
                entity_type: 'admission',
                entity_id: admissionId,
                details: JSON.stringify({
                    by: session.username,
                    patient_id: admission.patient_id,
                    discharge_date: admission.discharge_date ?? null,
                    status: admission.status,
                }),
                organizationId,
            },
        });

        return { success: true };
    } catch (error: any) {
        if (error?.name === 'ForbiddenError' || /FORBIDDEN/.test(error?.message || '')) {
            return { success: false, error: 'Only a doctor, admin, IPD manager, or reception can author the discharge summary.' };
        }
        console.error('saveDischargeSummary error:', error);
        return { success: false, error: error.message };
    }
}

// Optional AI assist — drafts the narrative sections from the patient's clinical data.
// Returns a partial DischargeSummaryData the doctor reviews/edits before saving.
export async function generateDischargeSummaryDraft(admissionId: string) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(AUTHORS);
        if (!process.env.OPENAI_API_KEY) {
            return { success: false, error: 'AI drafting is not configured (missing API key).' };
        }
        const admission = await loadAdmission(db, admissionId);
        if (!admission || admission.organizationId !== organizationId) {
            return { success: false, error: 'Admission not found' };
        }

        const [vitals, ehrNotes, labOrders] = await Promise.all([
            db.vital_signs.findMany({ where: { patient_id: admission.patient_id }, orderBy: { created_at: 'desc' }, take: 10 }),
            db.clinical_EHR.findMany({ where: { patient_id: admission.patient_id }, orderBy: { created_at: 'desc' } }),
            db.lab_orders.findMany({ where: { patient_id: admission.patient_id }, orderBy: { created_at: 'desc' } }),
        ]);

        const doctorNotes = ehrNotes.filter((n: any) => n.doctor_notes).map((n: any) => n.doctor_notes).join('. ') || 'No clinical notes';
        const diagnosisList = ehrNotes.filter((n: any) => n.diagnosis).map((n: any) => n.diagnosis).join(', ') || admission.diagnosis || 'Not recorded';
        const labResults = labOrders.map((l: any) => `${l.test_type}: ${l.result_value ?? 'Pending'}`).join(', ') || 'No lab orders';
        const vitalsSummary = vitals.length > 0
            ? `BP: ${vitals[0].blood_pressure || '-'}, HR: ${vitals[0].heart_rate || '-'}, Temp: ${vitals[0].temperature || '-'}, SpO2: ${vitals[0].oxygen_sat || '-'}%`
            : 'No vitals recorded';

        const prompt = `You are a senior physician drafting an Indian hospital (NABH) discharge summary.
Using the clinical data below, return ONLY a JSON object (no markdown, no commentary) with these string keys:
- final_diagnosis_primary, final_diagnosis_secondary, icd_code
- complaints (one complaint per line)
- medical_history
- investigations (one per line)
- operative_notes
- course (a detailed paragraph: admission condition, assessment, procedure, post-op recovery, monitoring, condition at discharge, follow-up)
- discharge_medications (one per line as "Name – Dose – Frequency – Duration")
- follow_up
- discharge_condition
Leave a key as an empty string if unknown. Do not invent procedures that aren't supported by the notes.

Patient: ${admission.patient?.full_name || 'Unknown'}, Age: ${admission.patient?.age ?? 'Unknown'}
Admission Date: ${admission.admission_date ? new Date(admission.admission_date).toISOString().split('T')[0] : '-'}
Attending Doctor: ${admission.doctor_name || 'Not assigned'}
Diagnosis: ${diagnosisList}
Doctor Notes: ${doctorNotes}
Vitals: ${vitalsSummary}
Lab Results: ${labResults}`;

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1200,
            response_format: { type: 'json_object' },
        });

        let parsed: any = {};
        try {
            parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
        } catch {
            return { success: false, error: 'AI returned an unreadable draft. Please try again.' };
        }

        await db.system_audit_logs.create({
            data: {
                action: 'AI_DISCHARGE_SUMMARY_DRAFT',
                module: 'discharge',
                entity_type: 'admission',
                entity_id: admissionId,
                details: JSON.stringify({ patient_id: admission.patient_id, model: 'gpt-4o' }),
                organizationId,
            },
        });

        // Only return the known narrative keys (ignore anything extra the model emits).
        const allowed = normalizeDischargeData(parsed);
        return { success: true, data: allowed };
    } catch (error: any) {
        if (error?.name === 'ForbiddenError' || /FORBIDDEN/.test(error?.message || '')) {
            return { success: false, error: 'Only a doctor or admin can draft the discharge summary.' };
        }
        console.error('generateDischargeSummaryDraft error:', error);
        return { success: false, error: error.message || 'Failed to generate AI draft' };
    }
}
