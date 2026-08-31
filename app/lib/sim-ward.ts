/**
 * Inpatient ward activity for the background engine: nursing notes, observations and
 * the medication administration record.
 *
 * NOTE ON VITALS — read before changing anything here.
 *
 * `CLAUDE.local.md` and `LLM_INDEX.md` both instruct that vitals must be written through
 * `app/lib/vitals-recording.ts`, which dual-writes IPDVitals and vital_signs, and that
 * NEWS2 must come from `app/lib/news2.ts`. **Neither file exists on main.** They live on
 * the unmerged `fix/nursing-module-hardening` branch. On main the scoring and the write
 * are inline in `app/actions/ipd-nursing-actions.ts`.
 *
 * So `calcNews()` below deliberately mirrors main's `calcNEWS()` — including the fact
 * that it does NOT apply the +2 supplemental-oxygen modifier that the real RCP score
 * requires. Matching the app matters more than matching the standard here: if the engine
 * scored differently from the software, a ward screen would show a NEWS value the system
 * itself would never produce, and that inconsistency is exactly what a close-up catches.
 * When the nursing branch merges, delete this and call the shared lib.
 *
 * Plain library. Never add 'use server'.
 */
import { logSimAudit, actorFor, type StaffMember } from '@/app/lib/sim-staff';

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const rint = (min: number, max: number) => Math.floor(rand(min, max + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/**
 * Observation and note cadence.
 *
 * These are tied to the COMPRESSED inpatient stay in sim-tick.ts (~90 minutes), not to
 * real-world nursing intervals. Set to realistic values (4-hourly obs, shift-wise notes)
 * they fire less than once per admission, and patients discharge with an empty chart —
 * which is worse on camera than no IPD data at all. If the stay length changes, these
 * must change with it.
 */
const VITALS_INTERVAL_MINUTES = 16;
const NURSING_NOTE_INTERVAL_MINUTES = 24;

/**
 * A tick can span more time than one interval (an irregular scheduler, or a long gap).
 * Backfill the rounds that period would really contain rather than recording a single
 * row, so a chart's density matches the elapsed stay instead of the tick cadence.
 */
const MAX_BACKFILL_VITALS = 4;
const MAX_BACKFILL_NOTES = 2;
/** How long after a scheduled dose the nurse records it as given. */
const MAR_ADMINISTER_WINDOW_MINUTES = 18;

const MAX_PER_STATUS = 40;

const NOTE_TYPES = ['General', 'Observation', 'Care Plan', 'Handover', 'Family Communication'] as const;

const NURSING_NOTES: Record<string, readonly string[]> = {
    General: [
        'Patient comfortable, no fresh complaints. Intake and output charted.',
        'Ambulating with assistance. Tolerating soft diet well.',
        'Rested overnight. No acute events during the shift.',
    ],
    Observation: [
        'Vitals within acceptable range. Continues on maintenance IV fluids.',
        'Mild pyrexia noted, tepid sponging done, temperature settling.',
        'SpO2 maintained on room air. Chest clear on auscultation.',
    ],
    'Care Plan': [
        'Two-hourly position change continued. Pressure areas intact.',
        'Encouraged incentive spirometry six-hourly. Compliant.',
        'Fall-risk precautions in place, bed rails up, call bell within reach.',
    ],
    Handover: [
        'Handed over to incoming shift. Pending: morning bloods, physiotherapy review.',
        'Shift handover completed. Awaiting consultant round and discharge decision.',
    ],
    'Family Communication': [
        'Attendant updated on plan of care. Queries addressed.',
        'Relatives informed of investigation results by treating team.',
    ],
};

const ROUTES = ['IV', 'Oral', 'IM', 'SC'] as const;
const FREQUENCIES = ['BD', 'TDS', 'OD', 'QID', 'STAT'] as const;

/**
 * NEWS score, mirroring calcNEWS() in app/actions/ipd-nursing-actions.ts on main.
 * See the file header for why this is a deliberate copy rather than a shared import.
 */
export function calcNews(v: {
    respiratory_rate?: number; spo2?: number; temperature?: number;
    bp_systolic?: number; heart_rate?: number; consciousness?: string;
}): { score: number; level: string } {
    let score = 0;

    if (v.respiratory_rate != null) {
        if (v.respiratory_rate <= 8) score += 3;
        else if (v.respiratory_rate <= 11) score += 1;
        else if (v.respiratory_rate <= 20) score += 0;
        else if (v.respiratory_rate <= 24) score += 2;
        else score += 3;
    }
    if (v.spo2 != null) {
        if (v.spo2 <= 91) score += 3;
        else if (v.spo2 <= 93) score += 2;
        else if (v.spo2 <= 95) score += 1;
    }
    if (v.temperature != null) {
        if (v.temperature <= 35) score += 3;
        else if (v.temperature <= 36) score += 1;
        else if (v.temperature <= 38) score += 0;
        else if (v.temperature <= 39) score += 1;
        else score += 2;
    }
    if (v.bp_systolic != null) {
        if (v.bp_systolic <= 90) score += 3;
        else if (v.bp_systolic <= 100) score += 2;
        else if (v.bp_systolic <= 110) score += 1;
        else if (v.bp_systolic <= 219) score += 0;
        else score += 3;
    }
    if (v.heart_rate != null) {
        if (v.heart_rate <= 40) score += 3;
        else if (v.heart_rate <= 50) score += 1;
        else if (v.heart_rate <= 90) score += 0;
        else if (v.heart_rate <= 110) score += 1;
        else if (v.heart_rate <= 130) score += 2;
        else score += 3;
    }
    if (v.consciousness && v.consciousness !== 'Alert') score += 3;

    const level = score <= 4 ? 'Low' : score <= 6 ? 'Medium' : score <= 8 ? 'High' : 'Critical';
    return { score, level };
}

/**
 * Generate one plausible observation set. Mostly-normal with an occasional deranged
 * value, so NEWS scores are usually low and sometimes genuinely escalate — a ward where
 * every patient scores zero looks as wrong as one where everybody is crashing.
 */
function observationSet() {
    const unwell = Math.random() < 0.18;
    return {
        bp_systolic: unwell ? rint(84, 104) : rint(106, 138),
        bp_diastolic: rint(62, 88),
        heart_rate: unwell ? rint(104, 128) : rint(62, 94),
        temperature: Number((unwell ? rand(37.9, 39.2) : rand(36.2, 37.4)).toFixed(1)),
        respiratory_rate: unwell ? rint(21, 26) : rint(13, 19),
        spo2: unwell ? rint(90, 94) : rint(95, 100),
        pain_score: rint(0, unwell ? 7 : 4),
        consciousness: unwell && Math.random() < 0.25 ? 'Voice' : 'Alert',
        blood_sugar: rint(82, 186),
        urine_output_ml: rint(150, 700),
    };
}

export interface WardResult {
    vitalsRecorded: number;
    nursingNotes: number;
    medsPrescribed: number;
    medsAdministered: number;
}

/**
 * One tick of ward activity across every currently admitted patient.
 *
 * Cadence is derived from the newest existing row per admission — the same
 * "read the domain, no run-state table" approach the rest of the engine uses.
 */
export async function runWardCare(
    db: any,
    orgId: string,
    staff: StaffMember[],
    doctors: StaffMember[],
    now: Date,
    tz: string,
): Promise<WardResult> {
    const out: WardResult = { vitalsRecorded: 0, nursingNotes: 0, medsPrescribed: 0, medsAdministered: 0 };

    const admitted = await db.admissions.findMany({
        where: { status: 'Admitted' },
        take: MAX_PER_STATUS,
        select: { admission_id: true, patient_id: true, attending_doctor_id: true, admission_date: true },
    });
    if (!admitted.length) return out;

    for (const adm of admitted) {
        const nurse = actorFor(staff, 'nurse', now, tz);
        const doctor = doctors.find(d => d.id === adm.attending_doctor_id) ?? doctors[0];

        // ── Observations ─────────────────────────────────────────────────────
        const lastVitals = await db.iPDVitals.findFirst({
            where: { admission_id: adm.admission_id },
            orderBy: { created_at: 'desc' },
            select: { created_at: true },
        });
        const vitalsFrom = new Date(lastVitals?.created_at ?? adm.admission_date).getTime();
        const vitalsGapMs = VITALS_INTERVAL_MINUTES * 60_000;
        const vitalsDue = Math.min(
            MAX_BACKFILL_VITALS,
            Math.floor((now.getTime() - vitalsFrom) / vitalsGapMs),
        );
        for (let round = 1; round <= vitalsDue; round++) {
            const obs = observationSet();
            const { score, level } = calcNews(obs);
            // Space rounds across the elapsed period, jittered — a nurse does not chart
            // observations on an exact 16-minute metronome.
            const at = new Date(vitalsFrom + round * vitalsGapMs + Math.floor(rand(-4, 4) * 60_000));

            await db.iPDVitals.create({
                data: {
                    admission_id: adm.admission_id,
                    patient_id: adm.patient_id,
                    organizationId: orgId,
                    ...obs,
                    news_score: score,
                    news_level: level,
                    recorded_by: nurse?.username ?? null,
                    created_at: at,
                },
            });

            // Mirror into vital_signs — the patient-level history the OPD and doctor
            // screens read. The IPD action on main does not do this today; without it
            // an admitted patient's chart looks empty from every non-IPD screen.
            await db.vital_signs.create({
                data: {
                    patient_id: adm.patient_id,
                    blood_pressure: `${obs.bp_systolic}/${obs.bp_diastolic}`,
                    heart_rate: obs.heart_rate,
                    temperature: obs.temperature,
                    oxygen_sat: obs.spo2,
                    respiratory_rate: obs.respiratory_rate,
                    blood_sugar: obs.blood_sugar,
                    pain_scale: obs.pain_score,
                    recorded_by: nurse?.username ?? null,
                    organizationId: orgId,
                    created_at: at,
                },
            });

            await db.admissions.update({
                where: { admission_id: adm.admission_id },
                data: { news_score_latest: score },
            });
            out.vitalsRecorded++;

            await logSimAudit({
                organizationId: orgId, actor: nurse,
                action: score >= 7 ? 'NEWS_ESCALATION' : 'RECORD_VITALS',
                module: 'ipd',
                entityType: 'admission', entityId: adm.admission_id,
                details: `NEWS ${score} (${level})`,
                at,
            });
        }

        // ── Nursing notes ────────────────────────────────────────────────────
        const lastNote = await db.nursingNote.findFirst({
            where: { admission_id: adm.admission_id },
            orderBy: { created_at: 'desc' },
            select: { created_at: true },
        });
        const noteFrom = new Date(lastNote?.created_at ?? adm.admission_date).getTime();
        const noteGapMs = NURSING_NOTE_INTERVAL_MINUTES * 60_000;
        const notesDue = Math.min(
            MAX_BACKFILL_NOTES,
            Math.floor((now.getTime() - noteFrom) / noteGapMs),
        );
        for (let round = 1; round <= notesDue; round++) {
            const noteType = pick(NOTE_TYPES);
            const at = new Date(noteFrom + round * noteGapMs + Math.floor(rand(-5, 5) * 60_000));
            await db.nursingNote.create({
                data: {
                    admission_id: adm.admission_id,
                    nurse_id: nurse?.username ?? 'unassigned',
                    note_type: noteType,
                    details: pick(NURSING_NOTES[noteType]),
                    organizationId: orgId,
                    created_at: at,
                },
            });
            out.nursingNotes++;

            await logSimAudit({
                organizationId: orgId, actor: nurse,
                action: 'ADD_NURSING_NOTE', module: 'ipd',
                entityType: 'admission', entityId: adm.admission_id,
                details: `${noteType} note recorded`, at,
            });
        }

        // ── Prescribing ──────────────────────────────────────────────────────
        // A doctor prescribes on admission; the eMAR is driven off these rows, so with
        // no active medication the Medications screen is empty by construction.
        const activeCount = await db.activeMedication.count({
            where: { admission_id: adm.admission_id, status: 'active' },
        });
        if (activeCount === 0) {
            const formulary: { brand_name: string; generic_name: string | null }[] =
                await db.pharmacy_medicine_master.findMany({
                    where: { is_active: true }, select: { brand_name: true, generic_name: true }, take: 40,
                });
            if (formulary.length) {
                const count = rint(2, 4);
                for (let i = 0; i < count; i++) {
                    const med = pick(formulary);
                    const route = pick(ROUTES);
                    const frequency = pick(FREQUENCIES);
                    const dosage = `${pick([250, 400, 500, 650, 1])} ${route === 'Oral' ? 'mg' : 'mg'}`;
                    await db.activeMedication.create({
                        data: {
                            admission_id: adm.admission_id,
                            patient_id: adm.patient_id,
                            medication_name: med.brand_name,
                            dosage, route, frequency,
                            prescribed_by: doctor?.username ?? 'unassigned',
                            status: 'active',
                            start_date: new Date(adm.admission_date),
                            organizationId: orgId,
                            created_at: new Date(adm.admission_date),
                        },
                    });

                    // Seed the MAR for the next few doses so the chart has a forward
                    // schedule, not just a history.
                    const perDay = frequency === 'OD' ? 1 : frequency === 'BD' ? 2 : frequency === 'TDS' ? 3 : 4;
                    const gapMs = Math.floor(86_400_000 / perDay);
                    for (let d = 0; d < perDay; d++) {
                        await db.medicationAdministration.create({
                            data: {
                                admission_id: adm.admission_id,
                                medication_name: med.brand_name,
                                dose: dosage,
                                route, frequency,
                                scheduled_time: new Date(new Date(adm.admission_date).getTime() + d * gapMs),
                                status: 'Scheduled',
                                organizationId: orgId,
                                created_at: new Date(adm.admission_date),
                            },
                        });
                    }
                    out.medsPrescribed++;
                }

                await logSimAudit({
                    organizationId: orgId, actor: doctor,
                    action: 'PRESCRIBE_MEDICATION', module: 'ipd',
                    entityType: 'admission', entityId: adm.admission_id,
                    details: `${count} medication(s) started`, at: now,
                });
            }
        }
    }

    // ── eMAR administration ──────────────────────────────────────────────────
    // Doses whose scheduled time has passed get signed off by the nurse on duty.
    const dueDoses = await db.medicationAdministration.findMany({
        where: { status: 'Scheduled', scheduled_time: { lte: now } },
        take: MAX_PER_STATUS,
        select: { id: true, scheduled_time: true, medication_name: true, admission_id: true },
    });
    for (const dose of dueDoses) {
        const at = new Date(new Date(dose.scheduled_time).getTime() + rand(2, MAR_ADMINISTER_WINDOW_MINUTES) * 60_000);
        if (now.getTime() < at.getTime()) continue;
        const nurse = actorFor(staff, 'nurse', at, tz);
        // A small share are genuinely missed or refused — a chart with a 100% strike
        // rate is not what a real MAR looks like.
        const roll = Math.random();
        const status = roll < 0.93 ? 'Administered' : roll < 0.97 ? 'Refused' : 'Omitted';

        await db.medicationAdministration.update({
            where: { id: dose.id },
            data: {
                status,
                administered_at: status === 'Administered' ? at : null,
                administered_by: nurse?.username ?? null,
                notes: status === 'Refused' ? 'Patient declined dose' : status === 'Omitted' ? 'Withheld — patient nil by mouth' : null,
            },
        });
        out.medsAdministered++;

        await logSimAudit({
            organizationId: orgId, actor: nurse,
            action: status === 'Administered' ? 'ADMINISTER_MEDICATION' : 'MEDICATION_NOT_GIVEN',
            module: 'ipd',
            entityType: 'admission', entityId: dose.admission_id,
            details: `${dose.medication_name} — ${status}`, at,
        });
    }

    return out;
}
