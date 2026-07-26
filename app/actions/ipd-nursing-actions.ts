'use server';

import { guardAction } from '@/app/lib/action-guard';

import { requireTenantContext, denyUnlessRole, CLINICAL_ROLES } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
// NEWS2 lives in a plain module: a 'use server' file may only export async
// actions, and keeping the scoring pure makes it unit-testable.
import { recordObservation } from '@/app/lib/vitals-recording';
import { applyAdministration } from '@/app/lib/medication-safety';


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
    /** @deprecated Ignored. The recorder is taken from the signed-in session. */
    recorded_by?: string;
    /** True when the patient is receiving supplemental oxygen (NEWS2 scores +2). */
    on_supplemental_oxygen?: boolean;
}) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'record vitals');
    if (denied) return denied;
    try {
        const { db, organizationId, session } = await requireTenantContext();

        // Both vitals entrances (/ipd/vitals and /nurse/vitals) run through
        // recordObservation, so scoring, mirroring and escalation behave the same
        // whichever screen the nurse happened to open.
        const result = await recordObservation(db, organizationId, session.id, {
            patient_id: data.patient_id,
            admission_id: data.admission_id,
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
            on_supplemental_oxygen: data.on_supplemental_oxygen,
        });

        revalidatePath(`/ipd/vitals/${data.admission_id}`);
        revalidatePath('/nurse/vitals');
        revalidatePath('/nurse/dashboard');
        return {
            success: true,
            data: {
                id: result.ipdVitalsId,
                news_score: result.news?.score,
                news_level: result.news?.level,
                news_max_single_param: result.news?.maxSingleParam,
            },
            escalation: result.escalation,
        };
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
    // Adding a dose to the MAR is originating an order, not executing one.
    const denied = await denyUnlessRole(CLINICAL_ROLES.PRESCRIBE, 'schedule a medication');
    if (denied) return denied;
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
    /** @deprecated Ignored. The administering user is taken from the session. */
    administered_by?: string;
    notes?: string;
    pain_score_before?: number;
    pain_score_after?: number;
    prn_reason?: string;
    /** Required when the dose was not given. */
    not_given_reason?: string;
    /** Second-nurse check for high-alert / controlled drugs. */
    witness_id?: string;
    /** Justification when giving despite a recorded allergy match. */
    allergy_override_reason?: string;
}) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.ADMINISTER, 'administer medication');
    if (denied) return denied;

    try {
        const { db, session, organizationId } = await requireTenantContext();
        const outcome = await applyAdministration(db, session.id, data, {
            organizationId, actorName: session.name,
        });
        if (!outcome.ok) {
            return { success: false, error: outcome.error, allergyConflict: outcome.allergyConflict };
        }
        revalidatePath('/ipd/medication-admin');
        revalidatePath('/nurse/medications');
        return { success: true, data: JSON.parse(JSON.stringify(outcome.data)) };
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
    /** @deprecated Ignored. The outgoing nurse is taken from the session. */
    from_nurse_id?: string;
    to_nurse_id: string;
    shift_type: string;
    patients: any[];
    critical_alerts?: any[];
}) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'record a shift handover');
    if (denied) return denied;
    try {
        const { db, organizationId, session } = await requireTenantContext();

        // Backward-compat: legacy summary field as JSON string
        const summary = JSON.stringify({ patients: data.patients, critical_alerts: data.critical_alerts ?? [] });

        const handover = await db.shiftHandover.create({
            data: {
                ward_id: data.ward_id,
                from_nurse_id: session.id,
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

export async function acknowledgeHandover(handoverId: number, _nurseId?: string) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'acknowledge a handover');
    if (denied) return denied;
    try {
        const { db, session } = await requireTenantContext();
        await db.shiftHandover.update({
            where: { id: handoverId },
            // The incoming nurse accepting the shift is whoever is signed in.
            data: { acknowledged_by: session.id, acknowledged_at: new Date() },
        });
        revalidatePath('/ipd/handover');
        revalidatePath('/nurse/handover');
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

        // Resolve the stored user ids to names. The screen rendered raw UUIDs,
        // which tells a nurse nothing about who handed over to whom.
        const ids = [...new Set(handovers.flatMap((h: any) =>
            [h.from_nurse_id, h.to_nurse_id, h.acknowledged_by].filter(Boolean)))] as string[];
        const users = ids.length
            ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, username: true } })
            : [];
        const nameOf = Object.fromEntries(users.map((u: any) => [u.id, u.name || u.username]));

        return {
            success: true,
            data: JSON.parse(JSON.stringify(handovers.map((h: any) => ({
                ...h,
                from_nurse_name: nameOf[h.from_nurse_id] ?? null,
                to_nurse_name: nameOf[h.to_nurse_id] ?? null,
                acknowledged_by_name: nameOf[h.acknowledged_by] ?? null,
            })))),
        };
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
    /** @deprecated Ignored. The assessor is taken from the session. */
    assessed_by?: string;
}) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'record a nursing assessment');
    if (denied) return denied;
    try {
        const { db, organizationId, session } = await requireTenantContext();

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
                assessed_by: session.id,
            },
        });

        // Close the 2-hour initial-assessment loop: the alert and the ward task
        // that were raised at admission are only meaningful if doing the work
        // clears them. Best-effort — never fail the assessment over bookkeeping.
        if ((data.assessment_type ?? 'initial') === 'initial') {
            try {
                const alert = await (db as any).nursingAssessmentAlert.findFirst({
                    where: { admission_id: data.admission_id, assessment_completed: false },
                });
                if (alert) {
                    const completedAt = new Date();
                    const onTime = completedAt <= new Date(alert.assessment_due_at);
                    await (db as any).nursingAssessmentAlert.update({
                        where: { id: alert.id },
                        data: { assessment_completed: true, completed_at: completedAt },
                    });
                    await db.system_audit_logs.create({
                        data: {
                            action: onTime ? 'INITIAL_ASSESSMENT_ON_TIME' : 'INITIAL_ASSESSMENT_OVERDUE',
                            module: 'ipd',
                            entity_type: 'admission',
                            entity_id: data.admission_id,
                            user_id: session.id,
                            username: session.username,
                            details: JSON.stringify({
                                minutes_taken: Math.round((completedAt.getTime() - new Date(alert.arrival_in_unit_at).getTime()) / 60000),
                                due_at: alert.assessment_due_at,
                            }),
                            organizationId,
                        },
                    });
                }
                await db.nursingTask.updateMany({
                    where: { admission_id: data.admission_id, task_type: 'Initial Assessment', status: 'Pending' },
                    data: { status: 'Completed', completed_at: new Date(), completed_by: session.id },
                });
            } catch (e) {
                console.error('initial assessment loop close failed:', e);
            }
        }

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
    const __denied = await guardAction('ipd-nursing-actions', 'setExpectedDischargeDate');
    if (__denied) return __denied;
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
    const __denied = await guardAction('ipd-nursing-actions', 'markFitForDischarge');
    if (__denied) return __denied;
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
    const __denied = await guardAction('ipd-nursing-actions', 'updateDischargeChecklistItem');
    if (__denied) return __denied;
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
    const __denied = await guardAction('ipd-nursing-actions', 'submitTPAClaim');
    if (__denied) return __denied;
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
    const __denied = await guardAction('ipd-nursing-actions', 'recordTPAQuery');
    if (__denied) return __denied;
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
    const __denied = await guardAction('ipd-nursing-actions', 'recordTPASettlement');
    if (__denied) return __denied;
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
    const __denied = await guardAction('ipd-nursing-actions', 'createInsurancePreAuth');
    if (__denied) return __denied;
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
    const __denied = await guardAction('ipd-nursing-actions', 'updatePreAuthStatus');
    if (__denied) return __denied;
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
