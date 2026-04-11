'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

// ─────────────────────────────────────────────────────────────────────────────
// NEWS SCORE CALCULATOR
// National Early Warning Score — auto-calculated from vitals
// ─────────────────────────────────────────────────────────────────────────────

function calcNEWS({
    respiratory_rate, spo2, temperature, bp_systolic, heart_rate, consciousness
}: {
    respiratory_rate?: number | null;
    spo2?: number | null;
    temperature?: number | null;
    bp_systolic?: number | null;
    heart_rate?: number | null;
    consciousness?: string | null;
}): { score: number; level: string } {
    let score = 0;

    // Respiratory rate
    if (respiratory_rate != null) {
        if (respiratory_rate <= 8) score += 3;
        else if (respiratory_rate <= 11) score += 1;
        else if (respiratory_rate <= 20) score += 0;
        else if (respiratory_rate <= 24) score += 2;
        else score += 3;
    }

    // SpO2
    if (spo2 != null) {
        if (spo2 <= 91) score += 3;
        else if (spo2 <= 93) score += 2;
        else if (spo2 <= 95) score += 1;
    }

    // Temperature °C
    if (temperature != null) {
        if (temperature <= 35.0) score += 3;
        else if (temperature <= 36.0) score += 1;
        else if (temperature <= 38.0) score += 0;
        else if (temperature <= 39.0) score += 1;
        else score += 2;
    }

    // Systolic BP
    if (bp_systolic != null) {
        if (bp_systolic <= 90) score += 3;
        else if (bp_systolic <= 100) score += 2;
        else if (bp_systolic <= 110) score += 1;
        else if (bp_systolic <= 219) score += 0;
        else score += 3;
    }

    // Heart rate
    if (heart_rate != null) {
        if (heart_rate <= 40) score += 3;
        else if (heart_rate <= 50) score += 1;
        else if (heart_rate <= 90) score += 0;
        else if (heart_rate <= 110) score += 1;
        else if (heart_rate <= 130) score += 2;
        else score += 3;
    }

    // Consciousness (AVPU)
    if (consciousness && consciousness !== 'Alert') score += 3;

    const level =
        score === 0 ? 'Low' :
        score <= 4 ? 'Low' :
        score <= 6 ? 'Medium' :
        score <= 8 ? 'High' : 'Critical';

    return { score, level };
}

// ─────────────────────────────────────────────────────────────────────────────
// RECORD IPD VITALS
// ─────────────────────────────────────────────────────────────────────────────

export async function recordIPDVitals(data: {
    admission_id: string;
    patient_id: string;
    bp_systolic?: number;
    bp_diastolic?: number;
    heart_rate?: number;
    temperature?: number;
    respiratory_rate?: number;
    spo2?: number;
    pain_score?: number;
    consciousness?: string;
    blood_sugar?: number;
    urine_output_ml?: number;
    recorded_by?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const { score, level } = calcNEWS({
            respiratory_rate: data.respiratory_rate,
            spo2: data.spo2,
            temperature: data.temperature,
            bp_systolic: data.bp_systolic,
            heart_rate: data.heart_rate,
            consciousness: data.consciousness,
        });

        const vitals = await db.iPDVitals.create({
            data: {
                admission_id: data.admission_id,
                patient_id: data.patient_id,
                organizationId,
                bp_systolic: data.bp_systolic,
                bp_diastolic: data.bp_diastolic,
                heart_rate: data.heart_rate,
                temperature: data.temperature,
                respiratory_rate: data.respiratory_rate,
                spo2: data.spo2,
                pain_score: data.pain_score,
                consciousness: data.consciousness,
                blood_sugar: data.blood_sugar,
                urine_output_ml: data.urine_output_ml,
                news_score: score,
                news_level: level,
                recorded_by: data.recorded_by,
            },
        });

        // Update latest NEWS score on admission record
        await db.admissions.update({
            where: { admission_id: data.admission_id },
            data: { news_score_latest: score },
        });

        revalidatePath(`/ipd/vitals/${data.admission_id}`);
        return { success: true, data: { ...vitals, news_score: score, news_level: level } };
    } catch (error: any) {
        console.error('recordIPDVitals error:', error);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET IPD VITALS HISTORY
// ─────────────────────────────────────────────────────────────────────────────

export async function getIPDVitalsHistory(admissionId: string) {
    try {
        const { db } = await requireTenantContext();
        const vitals = await db.iPDVitals.findMany({
            where: { admission_id: admissionId },
            orderBy: { created_at: 'asc' },
        });
        return { success: true, data: JSON.parse(JSON.stringify(vitals)) };
    } catch (error: any) {
        console.error('getIPDVitalsHistory error:', error);
        return { success: false, data: [] };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDICATION ADMINISTRATION (eMAR)
// ─────────────────────────────────────────────────────────────────────────────

export async function getMedicationSchedule(admissionId: string) {
    try {
        const { db } = await requireTenantContext();
        const meds = await db.medicationAdministration.findMany({
            where: { admission_id: admissionId },
            orderBy: { scheduled_time: 'asc' },
        });
        return { success: true, data: JSON.parse(JSON.stringify(meds)) };
    } catch (error: any) {
        console.error('getMedicationSchedule error:', error);
        return { success: false, data: [] };
    }
}

export async function scheduleMedication(data: {
    admission_id: string;
    medication_name: string;
    dose: string;
    route: string;
    frequency: string;
    scheduled_time: string;
    is_prn?: boolean;
    notes?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const med = await db.medicationAdministration.create({
            data: {
                admission_id: data.admission_id,
                medication_name: data.medication_name,
                dose: data.dose,
                route: data.route,
                frequency: data.frequency,
                scheduled_time: new Date(data.scheduled_time),
                is_prn: data.is_prn ?? false,
                notes: data.notes,
                status: 'Scheduled',
                organizationId,
            },
        });
        revalidatePath(`/ipd/medication-admin`);
        return { success: true, data: JSON.parse(JSON.stringify(med)) };
    } catch (error: any) {
        console.error('scheduleMedication error:', error);
        return { success: false, error: error.message };
    }
}

export async function administerMedication(data: {
    med_id: number;
    status: 'Administered' | 'Missed' | 'Held' | 'Refused';
    administered_by: string;
    notes?: string;
    pain_score_before?: number;
    pain_score_after?: number;
    prn_reason?: string;
}) {
    try {
        const { db } = await requireTenantContext();
        const updated = await db.medicationAdministration.update({
            where: { id: data.med_id },
            data: {
                status: data.status,
                administered_at: data.status === 'Administered' ? new Date() : null,
                administered_by: data.administered_by,
                notes: data.notes,
                pain_score_before: data.pain_score_before,
                pain_score_after: data.pain_score_after,
                prn_reason: data.prn_reason,
            },
        });
        revalidatePath('/ipd/medication-admin');
        return { success: true, data: JSON.parse(JSON.stringify(updated)) };
    } catch (error: any) {
        console.error('administerMedication error:', error);
        return { success: false, error: error.message };
    }
}

// Get all today's medication schedule across all active admissions (for ward nurse view)
export async function getTodayMedicationSchedule(wardId?: number) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        // Get active admissions
        const admissions = await db.admissions.findMany({
            where: {
                organizationId,
                status: 'Admitted',
                ...(wardId ? { ward_id: wardId } : {}),
            },
            include: { patient: { select: { full_name: true } }, bed: true, ward: true },
        });

        const admissionIds = admissions.map((a: any) => a.admission_id);

        const meds = await db.medicationAdministration.findMany({
            where: {
                admission_id: { in: admissionIds },
                scheduled_time: { gte: todayStart, lte: todayEnd },
            },
            orderBy: { scheduled_time: 'asc' },
        });

        // Attach patient info
        const admissionMap = Object.fromEntries(admissions.map((a: any) => [a.admission_id, a]));
        const result = meds.map((m: any) => ({
            ...m,
            patient_name: admissionMap[m.admission_id]?.patient?.full_name ?? 'Unknown',
            bed_id: admissionMap[m.admission_id]?.bed_id,
            ward_name: admissionMap[m.admission_id]?.ward?.ward_name,
        }));

        return { success: true, data: JSON.parse(JSON.stringify(result)) };
    } catch (error: any) {
        console.error('getTodayMedicationSchedule error:', error);
        return { success: false, data: [] };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHIFT HANDOVER
// ─────────────────────────────────────────────────────────────────────────────

export async function getShiftHandoverData(wardId: number) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const admissions = await db.admissions.findMany({
            where: { organizationId, status: 'Admitted', ward_id: wardId },
            include: {
                patient: { select: { full_name: true, age: true } },
                bed: true,
                ipd_vitals: { orderBy: { created_at: 'desc' }, take: 1 },
                nursing_tasks: {
                    where: { status: { in: ['Pending', 'In Progress'] } },
                    orderBy: { scheduled_at: 'asc' },
                },
                medication_administrations: {
                    where: {
                        status: 'Scheduled',
                        scheduled_time: { gte: new Date() },
                    },
                    orderBy: { scheduled_time: 'asc' },
                    take: 3,
                },
            },
        });

        const patients = admissions.map((a: any) => ({
            admission_id: a.admission_id,
            bed_id: a.bed_id,
            patient_name: a.patient?.full_name ?? 'Unknown',
            age: a.patient?.age,
            diagnosis: a.diagnosis,
            news_score: a.news_score_latest ?? (a.ipd_vitals[0]?.news_score ?? null),
            news_level: a.ipd_vitals[0]?.news_level ?? 'Low',
            fall_risk: a.fall_risk_score,
            code_status: a.code_status ?? 'Full',
            pending_tasks: a.nursing_tasks.length,
            medications_due: a.medication_administrations.map((m: any) => ({
                name: m.medication_name,
                dose: m.dose,
                route: m.route,
                time: m.scheduled_time,
            })),
            key_concerns: '',
            plan_for_shift: '',
        }));

        return { success: true, data: patients };
    } catch (error: any) {
        console.error('getShiftHandoverData error:', error);
        return { success: false, data: [] };
    }
}

export async function saveShiftHandover(data: {
    ward_id: number;
    from_nurse_id: string;
    to_nurse_id: string;
    shift_type: string;
    patients: any[];
    critical_alerts?: any[];
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        // Backward-compat: legacy summary field as JSON string
        const summary = JSON.stringify({ patients: data.patients, critical_alerts: data.critical_alerts ?? [] });

        const handover = await db.shiftHandover.create({
            data: {
                ward_id: data.ward_id,
                from_nurse_id: data.from_nurse_id,
                to_nurse_id: data.to_nurse_id,
                shift_date: new Date(),
                shift_type: data.shift_type,
                patients: data.patients,
                critical_alerts: data.critical_alerts ?? [],
                summary,
                organizationId,
            },
        });

        revalidatePath('/ipd/handover');
        return { success: true, data: JSON.parse(JSON.stringify(handover)) };
    } catch (error: any) {
        console.error('saveShiftHandover error:', error);
        return { success: false, error: error.message };
    }
}

export async function acknowledgeHandover(handoverId: number, nurseId: string) {
    try {
        const { db } = await requireTenantContext();
        await db.shiftHandover.update({
            where: { id: handoverId },
            data: { acknowledged_by: nurseId, acknowledged_at: new Date() },
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getRecentHandovers(wardId: number) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const handovers = await db.shiftHandover.findMany({
            where: { organizationId, ward_id: wardId },
            orderBy: { created_at: 'desc' },
            take: 10,
        });
        return { success: true, data: JSON.parse(JSON.stringify(handovers)) };
    } catch (error: any) {
        return { success: false, data: [] };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// NURSING ASSESSMENT
// ─────────────────────────────────────────────────────────────────────────────

export async function saveNursingAssessment(data: {
    admission_id: string;
    assessment_type?: string;
    consciousness?: string;
    pain_score?: number;
    fall_risk_score?: number;
    braden_score?: number;
    nutrition_screen?: string;
    mobility?: string;
    continence?: string;
    skin_assessment?: any;
    safety_measures?: any;
    care_plan?: any;
    assessed_by?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const assessment = await db.nursingAssessment.create({
            data: {
                admission_id: data.admission_id,
                organizationId,
                assessment_type: data.assessment_type ?? 'initial',
                consciousness: data.consciousness,
                pain_score: data.pain_score,
                fall_risk_score: data.fall_risk_score,
                braden_score: data.braden_score,
                nutrition_screen: data.nutrition_screen,
                mobility: data.mobility,
                continence: data.continence,
                skin_assessment: data.skin_assessment,
                safety_measures: data.safety_measures,
                care_plan: data.care_plan,
                assessed_by: data.assessed_by,
            },
        });

        // Sync fall risk score to admission
        if (data.fall_risk_score != null) {
            await db.admissions.update({
                where: { admission_id: data.admission_id },
                data: { fall_risk_score: data.fall_risk_score },
            });
        }
        if (data.braden_score != null) {
            await db.admissions.update({
                where: { admission_id: data.admission_id },
                data: { pressure_ulcer_risk: data.braden_score },
            });
        }

        revalidatePath(`/ipd/admission/${data.admission_id}`);
        return { success: true, data: JSON.parse(JSON.stringify(assessment)) };
    } catch (error: any) {
        console.error('saveNursingAssessment error:', error);
        return { success: false, error: error.message };
    }
}

export async function getNursingAssessments(admissionId: string) {
    try {
        const { db } = await requireTenantContext();
        const assessments = await db.nursingAssessment.findMany({
            where: { admission_id: admissionId },
            orderBy: { created_at: 'desc' },
        });
        return { success: true, data: JSON.parse(JSON.stringify(assessments)) };
    } catch (error: any) {
        return { success: false, data: [] };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPECTED DISCHARGE DATE
// ─────────────────────────────────────────────────────────────────────────────

export async function setExpectedDischargeDate(admissionId: string, edd: string) {
    try {
        const { db } = await requireTenantContext();
        await db.admissions.update({
            where: { admission_id: admissionId },
            data: { expected_discharge_date: new Date(edd) },
        });
        revalidatePath(`/ipd/admission/${admissionId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

const DEFAULT_DISCHARGE_CHECKLIST = [
    { id: 'lab_results', label: 'All pending lab results received', done: false },
    { id: 'meds_reconciled', label: 'Medications reconciled (discharge vs inpatient)', done: false },
    { id: 'charges_posted', label: 'All pending charges posted', done: false },
    { id: 'tpa_submitted', label: 'TPA final bill submitted (if applicable)', done: false },
    { id: 'followup_booked', label: 'Follow-up appointment booked', done: false },
    { id: 'patient_education', label: 'Patient education completed', done: false },
    { id: 'transport_arranged', label: 'Transport arranged (if needed)', done: false },
    { id: 'discharge_summary', label: 'AI discharge summary drafted and reviewed', done: false },
    { id: 'bill_settled', label: 'Final bill settled or payment plan agreed', done: false },
];

export async function markFitForDischarge(admissionId: string, doctorId: string) {
    try {
        const { db } = await requireTenantContext();
        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            select: { discharge_checklist: true },
        });
        const existing = admission?.discharge_checklist as any[];
        const checklist = (existing && existing.length > 0) ? existing : DEFAULT_DISCHARGE_CHECKLIST;
        await db.admissions.update({
            where: { admission_id: admissionId },
            data: {
                fit_for_discharge_at: new Date(),
                fit_for_discharge_by: doctorId,
                discharge_checklist: checklist,
            },
        });
        revalidatePath(`/ipd/admission/${admissionId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getPreDischargeChecklist(admissionId: string) {
    try {
        const { db } = await requireTenantContext();
        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            select: { discharge_checklist: true, fit_for_discharge_at: true, fit_for_discharge_by: true },
        });
        return {
            success: true,
            data: {
                checklist: (admission?.discharge_checklist as any[]) ?? [],
                fit_for_discharge_at: admission?.fit_for_discharge_at ?? null,
                fit_for_discharge_by: admission?.fit_for_discharge_by ?? null,
            },
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateDischargeChecklistItem(admissionId: string, itemId: string, done: boolean) {
    try {
        const { db } = await requireTenantContext();
        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            select: { discharge_checklist: true },
        });
        const checklist = ((admission?.discharge_checklist as any[]) ?? []).map((item: any) =>
            item.id === itemId ? { ...item, done } : item
        );
        await db.admissions.update({
            where: { admission_id: admissionId },
            data: { discharge_checklist: checklist },
        });
        revalidatePath(`/ipd/admission/${admissionId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function submitTPAClaim(preAuthId: string, data: {
    final_claimed_amount: number;
    remarks?: string;
}) {
    try {
        const { db } = await requireTenantContext();
        await db.insurancePreAuth.update({
            where: { id: preAuthId },
            data: {
                status: 'Claimed',
                requested_amount: data.final_claimed_amount,
                notes: data.remarks,
            },
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function recordTPAQuery(preAuthId: string, data: {
    query_text: string;
    response_text?: string;
}) {
    try {
        const { db } = await requireTenantContext();
        const existing = await db.insurancePreAuth.findUnique({
            where: { id: preAuthId },
            select: { notes: true },
        });
        const history = existing?.notes ? existing.notes + '\n\n' : '';
        const entry = `[${new Date().toISOString()}]\nQ: ${data.query_text}${data.response_text ? '\nA: ' + data.response_text : ''}`;
        await db.insurancePreAuth.update({
            where: { id: preAuthId },
            data: {
                status: data.response_text ? 'QueryResponded' : 'Query',
                notes: history + entry,
            },
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function recordTPASettlement(preAuthId: string, data: {
    settled_amount: number;
    settlement_date: string;
    remarks?: string;
}) {
    try {
        const { db } = await requireTenantContext();
        await db.insurancePreAuth.update({
            where: { id: preAuthId },
            data: {
                status: 'Settled',
                approved_amount: data.settled_amount,
                notes: data.remarks,
            },
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// INSURANCE PRE-AUTH
// ─────────────────────────────────────────────────────────────────────────────

export async function createInsurancePreAuth(data: {
    admission_id: string;
    patient_id: string;
    tpa_name: string;
    requested_amount: number;
    submission_type: string;
    diagnosis_icd?: string;
    procedure_codes?: any[];
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const preauth = await db.insurancePreAuth.create({
            data: {
                admission_id: data.admission_id,
                patient_id: data.patient_id,
                organizationId,
                tpa_name: data.tpa_name,
                requested_amount: data.requested_amount,
                submission_type: data.submission_type,
                diagnosis_icd: data.diagnosis_icd,
                procedure_codes: data.procedure_codes,
                status: 'Submitted',
            },
        });
        revalidatePath(`/ipd/admission/${data.admission_id}`);
        return { success: true, data: JSON.parse(JSON.stringify(preauth)) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updatePreAuthStatus(preAuthId: string, status: string, approvedAmount?: number, remarks?: string) {
    try {
        const { db } = await requireTenantContext();
        await db.insurancePreAuth.update({
            where: { id: preAuthId },
            data: {
                status,
                approved_amount: approvedAmount,
                tpa_remarks: remarks,
                responded_at: new Date(),
            },
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getAdmissionPreAuths(admissionId: string) {
    try {
        const { db } = await requireTenantContext();
        const preauths = await db.insurancePreAuth.findMany({
            where: { admission_id: admissionId },
            orderBy: { submitted_at: 'desc' },
        });
        return { success: true, data: JSON.parse(JSON.stringify(preauths)) };
    } catch (error: any) {
        return { success: false, data: [] };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTING DOCTORS
// ─────────────────────────────────────────────────────────────────────────────

export async function requestConsultation(data: {
    admission_id: string;
    doctor_name: string;
    doctor_id?: string;
    specialty?: string;
    notes?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const consult = await db.admissionConsultant.create({
            data: {
                admission_id: data.admission_id,
                organizationId,
                doctor_name: data.doctor_name,
                doctor_id: data.doctor_id,
                specialty: data.specialty,
                notes: data.notes,
                status: 'Active',
            },
        });
        revalidatePath(`/ipd/admission/${data.admission_id}`);
        return { success: true, data: JSON.parse(JSON.stringify(consult)) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getAdmissionConsultants(admissionId: string) {
    try {
        const { db } = await requireTenantContext();
        const consultants = await db.admissionConsultant.findMany({
            where: { admission_id: admissionId },
            orderBy: { consulted_at: 'desc' },
        });
        return { success: true, data: JSON.parse(JSON.stringify(consultants)) };
    } catch (error: any) {
        return { success: false, data: [] };
    }
}
