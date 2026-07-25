/**
 * One implementation of "record a set of observations".
 *
 * Vitals had two unrelated paths. /nurse/vitals wrote vital_signs — patient-scoped,
 * no admission link, no NEWS, no escalation. /ipd/vitals/[id] wrote IPDVitals with
 * a NEWS score. Which one a nurse used decided whether a deteriorating patient was
 * scored at all, and the two histories never met.
 *
 * Both entrances now call recordObservation(). The screens stay where the ward
 * expects them; there is a single behaviour behind them.
 *
 * Not a 'use server' module — server actions own the session and tenant client
 * and pass them in.
 */
import { calcNEWS2, type NEWS2Input } from '@/app/lib/news2';

export type ObservationInput = NEWS2Input & {
    patient_id: string;
    /** Present when the patient is an inpatient. Absent for an OPD observation. */
    admission_id?: string | null;
    bp_diastolic?: number | null;
    pain_score?: number | null;
    blood_sugar?: number | null;
    urine_output_ml?: number | null;
    weight?: number | null;
    height?: number | null;
};

export type EscalationResult = {
    raised: boolean;
    band: 'routine' | 'urgent' | 'emergency';
    notified: number;
    taskId?: number;
};

export type ObservationResult = {
    news: { score: number; level: string; maxSingleParam: number } | null;
    escalation: EscalationResult;
    ipdVitalsId?: number;
};

/** Parse "120/80" into its two components; tolerant of spacing and junk. */
export function parseBloodPressure(bp?: string | null): { systolic?: number; diastolic?: number } {
    if (!bp) return {};
    const m = String(bp).match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
    if (!m) return {};
    return { systolic: Number(m[1]), diastolic: Number(m[2]) };
}

export async function recordObservation(
    db: any,
    organizationId: string,
    userId: string,
    input: ObservationInput,
): Promise<ObservationResult> {
    const isInpatient = !!input.admission_id;

    // Score only when there is enough to score. A single stray reading charted on
    // an OPD walk-in should not manufacture an "escalation".
    const news = isInpatient ? calcNEWS2(input) : null;

    let ipdVitalsId: number | undefined;

    if (isInpatient) {
        const row = await db.iPDVitals.create({
            data: {
                admission_id: input.admission_id,
                patient_id: input.patient_id,
                organizationId,
                bp_systolic: input.bp_systolic ?? null,
                bp_diastolic: input.bp_diastolic ?? null,
                heart_rate: input.heart_rate ?? null,
                temperature: input.temperature ?? null,
                respiratory_rate: input.respiratory_rate ?? null,
                spo2: input.spo2 ?? null,
                pain_score: input.pain_score ?? null,
                consciousness: input.consciousness ?? null,
                blood_sugar: input.blood_sugar ?? null,
                urine_output_ml: input.urine_output_ml ?? null,
                news_score: news!.score,
                news_level: news!.level,
                news_max_single_param: news!.maxSingleParam,
                on_supplemental_oxygen: input.on_supplemental_oxygen ?? false,
                recorded_by: userId,
            },
        });
        ipdVitalsId = row.id;

        await db.admissions.update({
            where: { admission_id: input.admission_id },
            data: { news_score_latest: news!.score },
        });
    }

    // The shared patient-level history. The nurse portal, the doctor's patient
    // view, the discharge summary and the discharge PDF all read this table, so
    // every observation lands here regardless of which screen recorded it.
    try {
        await db.vital_signs.create({
            data: {
                patient_id: input.patient_id,
                blood_pressure: (input.bp_systolic != null && input.bp_diastolic != null)
                    ? `${input.bp_systolic}/${input.bp_diastolic}`
                    : null,
                heart_rate: input.heart_rate ?? null,
                temperature: input.temperature ?? null,
                oxygen_sat: input.spo2 ?? null,
                respiratory_rate: input.respiratory_rate ?? null,
                blood_sugar: input.blood_sugar ?? null,
                pain_scale: input.pain_score ?? null,
                weight: input.weight ?? null,
                height: input.height ?? null,
                recorded_by: userId,
            },
        });
    } catch (e) {
        // Losing the mirror must not lose the primary observation.
        console.error('recordObservation: vital_signs mirror failed:', e);
    }

    const escalation = news && input.admission_id
        ? await escalateOnNEWS(db, organizationId, {
            admissionId: input.admission_id,
            patientId: input.patient_id,
            score: news.score,
            maxSingleParam: news.maxSingleParam,
            recordedBy: userId,
        })
        : { raised: false, band: 'routine' as const, notified: 0 };

    return { news, escalation, ipdVitalsId };
}

/**
 * Get a deteriorating patient in front of somebody who can act.
 *
 * The score used to be calculated, stored, and left there: the only output was a
 * banner on the page of whoever happened to be charting. A NEWS of 11 produced
 * zero notifications, zero tasks and zero alerts.
 *
 * RCP response bands:
 *   >= 7            emergency — ward nursing staff AND the treating doctor
 *   5-6, or any
 *   single param 3  urgent    — ward nursing staff
 *   0-4             routine   — nothing
 */
export async function escalateOnNEWS(
    db: any,
    organizationId: string,
    args: {
        admissionId: string;
        patientId: string;
        score: number;
        maxSingleParam: number;
        recordedBy: string;
    },
): Promise<EscalationResult> {
    const { admissionId, patientId, score, maxSingleParam } = args;

    const emergency = score >= 7;
    const urgent = score >= 5 || maxSingleParam >= 3;
    if (!emergency && !urgent) return { raised: false, band: 'routine', notified: 0 };

    const band: EscalationResult['band'] = emergency ? 'emergency' : 'urgent';

    try {
        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            include: { patient: { select: { full_name: true } }, ward: true },
        });
        const who = admission?.patient?.full_name ?? patientId;
        const where = [admission?.ward?.ward_name, admission?.bed_id].filter(Boolean).join(' · ');

        const title = emergency ? `NEWS ${score} — emergency response` : `NEWS ${score} — urgent review`;
        const body = emergency
            ? `${who} (${where}) scored NEWS ${score}. Emergency response required — call the treating doctor now.`
            : `${who} (${where}) scored NEWS ${score}${maxSingleParam >= 3 && score < 5 ? ' (single parameter at 3)' : ''}. Urgent review required; increase monitoring frequency.`;

        const recipients = await db.user.findMany({
            where: {
                organizationId,
                is_active: true,
                role: { in: emergency ? ['nurse', 'ipd_manager', 'doctor'] : ['nurse', 'ipd_manager'] },
            },
            select: { id: true },
        });

        const ids = new Set<string>(recipients.map((r: { id: string }) => r.id));
        if (admission?.attending_doctor_id) ids.add(admission.attending_doctor_id);

        if (ids.size > 0) {
            await db.notification.createMany({
                data: [...ids].map((uid) => ({
                    organizationId,
                    user_id: uid,
                    title,
                    body,
                    type: emergency ? 'error' : 'warning',
                })),
            });
        }

        // A notification can be dismissed; a task has to be closed. One open
        // escalation per admission, so repeat observations don't spam the ward.
        const existing = await db.nursingTask.findFirst({
            where: {
                admission_id: admissionId,
                task_type: 'NEWS Escalation',
                status: { in: ['Pending', 'In Progress'] },
            },
        });

        let taskId: number | undefined;
        if (existing) {
            await db.nursingTask.update({
                where: { id: existing.id },
                data: { description: body, priority: emergency ? 'stat' : 'urgent' },
            });
            taskId = existing.id;
        } else {
            const task = await db.nursingTask.create({
                data: {
                    admission_id: admissionId,
                    task_type: 'NEWS Escalation',
                    description: body,
                    scheduled_at: new Date(),
                    status: 'Pending',
                    priority: emergency ? 'stat' : 'urgent',
                    source_type: 'news_escalation',
                    organizationId,
                },
            });
            taskId = task.id;
        }

        await db.system_audit_logs.create({
            data: {
                action: 'NEWS_ESCALATION_RAISED',
                module: 'ipd',
                entity_type: 'admission',
                entity_id: admissionId,
                user_id: args.recordedBy,
                details: JSON.stringify({ score, band, maxSingleParam, notified: ids.size }),
                organizationId,
            },
        });

        return { raised: true, band, notified: ids.size, taskId };
    } catch (error) {
        // Charting must never fail because the alert fan-out did.
        console.error('escalateOnNEWS error:', error);
        return { raised: false, band, notified: 0 };
    }
}
