/**
 * Background activity engine — one tick.
 *
 * Advances the hospital by however much time has passed since the last tick: registers
 * new arrivals against an hourly shift curve, and moves existing OPD visits, lab orders
 * and pharmacy indents one step along their real workflow.
 *
 * Design notes worth knowing before editing:
 *
 *  - NO run-state table. Every state machine reads the domain status columns the real
 *    workflow already uses, so there is nothing extra that could surface in a query
 *    result, a report, or an export.
 *
 *  - Every identifier comes from the app's own generator (generateUHID,
 *    generateAppointmentId, generateIndentNumber). Hand-formatting an id here would
 *    produce documents whose numbering disagrees with every other document in the
 *    system — the single most visible way this could look wrong in close-up.
 *
 *  - Timestamps are jittered. Records that all transition on the same boundary, or land
 *    on exact minutes, read as generated the moment two are on screen together.
 *
 *  - This is a plain library, NOT a 'use server' module. It exports constants and sync
 *    helpers; adding 'use server' here would crash every page that imports it.
 */
import { prisma, getTenantPrisma } from '@/backend/db';
import { getTodayRange } from '@/app/lib/timezone';
import { generateUHID, generateAppointmentId } from '@/app/lib/uhid';
import {
    generateIndentNumber,
    generateInvoiceNumber,
    generateReceiptNumber,
    createWithUniqueRetry,
} from '@/app/lib/sequence-generator';
import {
    loadStaff, syncStaffSessions, actorFor, logSimAudit, dailyVolumeMultiplier,
} from '@/app/lib/sim-staff';
import { runWardCare } from '@/app/lib/sim-ward';
import { runBackOffice } from '@/app/lib/sim-back-office';
import { assertActivityTarget, resolveActivityTarget } from '@/scripts/sim/guard';
import { castPerson } from '@/scripts/sim/cast';

// ---------------------------------------------------------------------------
// Volume model
// ---------------------------------------------------------------------------

/**
 * Relative arrival rate by hour of day, in the organization's own timezone.
 * Morning OPD peak, a lunch dip, a smaller evening peak, and a floor overnight
 * because a hospital is never actually at zero.
 */
const HOURLY_WEIGHT: readonly number[] = [
    0.05, 0.04, 0.04, 0.04, 0.05, 0.08, // 00–05
    0.18, 0.42, 0.80, 1.00, 1.00, 0.88, // 06–11
    0.68, 0.48, 0.55, 0.72, 0.86, 0.90, // 12–17
    0.74, 0.50, 0.30, 0.18, 0.11, 0.07, // 18–23
];

/** Weekends are quieter; Sunday is OPD-light almost everywhere. */
const DAY_WEIGHT: readonly number[] = [0.45, 1.0, 1.0, 1.0, 1.0, 1.0, 0.78]; // Sun–Sat

const INTENSITY_MULTIPLIER: Record<string, number> = { low: 0.4, moderate: 1.0, high: 2.5 };

/** Arrivals per hour at the busiest hour of a normal weekday, at moderate intensity. */
const PEAK_ARRIVALS_PER_HOUR = 9;

/** Ceiling on registrations per day, so a stuck scheduler cannot flood the org. */
const DAILY_ARRIVAL_CAP = 400;

/** Bound the work in any one tick — keeps a long gap from producing a huge burst. */
const MAX_ARRIVALS_PER_TICK = 12;
const MAX_TRANSITIONS_PER_STATUS = 40;

/** Typical minutes in each state before moving on. Jittered per row at read time. */
const DWELL_MINUTES = {
    scheduledToCheckedIn: 14,
    checkedInToInProgress: 22,
    inProgressToCompleted: 13,
    labOrderedToProcessing: 26,
    labProcessingToCompleted: 95,
    indentToVerified: 16,
    verifiedToDispensed: 34,
    /**
     * ponytail: inpatient stays run on compressed wall-clock time — roughly 90 minutes
     * from admission to discharge, so a shoot sees the whole IPD cycle rather than
     * waiting days. Recorded admission and discharge timestamps are therefore hours
     * apart, which reads correctly for day-care, observation and minor procedures but
     * will never show a multi-day stay. If the production needs "day 4 of 6" on a ward
     * board, backdate admission_date at creation and move the discharge trigger onto a
     * separate real-time deadline field.
     */
    admissionToDischarge: 90,
    bedCleaning: 40,
};

/** Probability a completed consultation generates downstream work. */
const P_LAB_AFTER_CONSULT = 0.4;
const P_PHARMACY_AFTER_CONSULT = 0.55;
const P_CRITICAL_RESULT = 0.06;
const P_ADMIT_AFTER_CONSULT = 0.09;

/** Ward day-rate fallback if a ward has no cost_per_day configured. */
const DEFAULT_BED_RATE = 2800;
const NURSING_CHARGE = 600;

const IPD_DIAGNOSES = [
    'Acute gastroenteritis with dehydration', 'Lower respiratory tract infection',
    'Dengue fever with thrombocytopenia', 'Uncontrolled type 2 diabetes mellitus',
    'Acute appendicitis', 'Urinary tract infection with pyelonephritis',
    'Community-acquired pneumonia', 'Anaemia under evaluation',
    'Hypertensive urgency', 'Acute exacerbation of bronchial asthma',
];

const DISCHARGE_CONDITIONS = [
    'Afebrile, haemodynamically stable, tolerating orals.',
    'Symptomatically improved. Vitals stable at discharge.',
    'Pain controlled on oral analgesia. Wound healthy.',
    'Blood counts improving. Advised outpatient review.',
];

const REASONS_FOR_VISIT = [
    'Fever with body ache', 'Persistent cough', 'Abdominal pain', 'Follow-up review',
    'Headache and giddiness', 'Breathlessness on exertion', 'Joint pain', 'Loose motions',
    'Chest discomfort', 'Routine health check', 'Skin rash', 'Back pain',
];

/** Plausible result strings per test, so a lab report reads correctly in close-up. */
const RESULT_TEMPLATES: Record<string, () => string> = {
    'Complete Blood Count': () => `Hb ${(11 + Math.random() * 5).toFixed(1)} g/dL, WBC ${(4 + Math.random() * 7).toFixed(1)} x10³/µL, Platelets ${Math.round(150 + Math.random() * 250)} x10³/µL`,
    'Random Blood Sugar': () => `${Math.round(78 + Math.random() * 110)} mg/dL`,
    'Liver Function Test': () => `Bilirubin ${(0.3 + Math.random() * 1.2).toFixed(1)} mg/dL, SGOT ${Math.round(15 + Math.random() * 45)} U/L, SGPT ${Math.round(12 + Math.random() * 50)} U/L`,
    'Kidney Function Test': () => `Urea ${Math.round(15 + Math.random() * 30)} mg/dL, Creatinine ${(0.6 + Math.random() * 0.8).toFixed(2)} mg/dL`,
    'Thyroid Profile (T3 T4 TSH)': () => `T3 ${(0.8 + Math.random() * 1.2).toFixed(2)} ng/mL, T4 ${(5 + Math.random() * 6).toFixed(1)} µg/dL, TSH ${(0.4 + Math.random() * 4).toFixed(2)} µIU/mL`,
    'Urine Routine & Microscopy': () => `Pale yellow, clear. Albumin ${Math.random() < 0.75 ? 'Nil' : 'Trace'}, Sugar Nil, Pus cells ${Math.round(Math.random() * 6)}/hpf`,
    'C-Reactive Protein': () => `${(0.4 + Math.random() * 18).toFixed(1)} mg/L`,
    'Chest X-Ray PA View': () => `${Math.random() < 0.7 ? 'No focal consolidation. Cardiac silhouette within normal limits.' : 'Mild bronchovascular prominence in bilateral lower zones.'}`,
    'Serum Electrolytes': () => `Na ${Math.round(134 + Math.random() * 10)} mEq/L, K ${(3.4 + Math.random() * 1.4).toFixed(1)} mEq/L, Cl ${Math.round(98 + Math.random() * 9)} mEq/L`,
    'Dengue NS1 Antigen': () => (Math.random() < 0.82 ? 'Non-reactive' : 'Reactive'),
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/** Jitter a dwell time so rows never transition in lockstep. */
const jitteredDwellMs = (baseMinutes: number) => rand(0.6, 1.55) * baseMinutes * 60_000;

/**
 * Hour of day (0–23) in the given timezone.
 *
 * Deliberately NOT derived from Date#getHours(), which reads the host clock — the
 * staging host runs UTC while the organization runs IST, so a host-local hour would
 * shift the entire shift curve by five and a half hours and put the morning OPD peak
 * in the middle of the night.
 */
function hourInTimezone(at: Date, timezone: string): number {
    const hour = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        hour12: false,
    }).format(at);
    return Number(hour) % 24;
}

/** Day of week (0=Sunday) in the given timezone, for the same reason as above. */
function weekdayInTimezone(at: Date, timezone: string): number {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(at);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

export interface TickResult {
    ran: boolean;
    reason?: string;
    elapsedMinutes?: number;
    registered: number;
    checkedIn: number;
    consultStarted: number;
    consultCompleted: number;
    labOrdered: number;
    labProcessing: number;
    labCompleted: number;
    indentsRaised: number;
    indentsVerified: number;
    indentsDispensed: number;
    staffLoggedIn: number;
    staffLoggedOut: number;
    opdBilled: number;
    admitted: number;
    discharged: number;
    ipdBilled: number;
    bedsReleased: number;
    vitalsRecorded: number;
    nursingNotes: number;
    medsPrescribed: number;
    medsAdministered: number;
    depositsCollected: number;
    claimsSubmitted: number;
    claimsSettled: number;
    journalEntries: number;
    erTriaged: number;
}

const EMPTY: TickResult = {
    ran: false, registered: 0, checkedIn: 0, consultStarted: 0, consultCompleted: 0,
    labOrdered: 0, labProcessing: 0, labCompleted: 0,
    indentsRaised: 0, indentsVerified: 0, indentsDispensed: 0,
    staffLoggedIn: 0, staffLoggedOut: 0, opdBilled: 0,
    admitted: 0, discharged: 0, ipdBilled: 0, bedsReleased: 0,
    vitalsRecorded: 0, nursingNotes: 0, medsPrescribed: 0, medsAdministered: 0,
    depositsCollected: 0, claimsSubmitted: 0, claimsSettled: 0, journalEntries: 0, erTriaged: 0,
};

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

/**
 * Advance the organization by one tick. Safe to call at any cadence — the arrival
 * volume is derived from time actually elapsed since the last generated arrival, not
 * from an assumed interval, so calling every minute and calling every ten minutes
 * produce the same rate.
 */
export async function runActivityTick(now: Date = new Date(), targetOrgId?: string): Promise<TickResult> {
    // Resolve from the SIM_ORG_ID pin or the single flagged simulation environment.
    // Passing an explicit id is for callers driving several environments in one process.
    const orgId = targetOrgId?.trim() || await resolveActivityTarget();

    // Throws unless the environment AND the organization's own flag permit this write.
    // Never soften this into a silent return — a misconfigured deploy should fail loudly,
    // not quietly write clinical-shaped rows somewhere unintended.
    await assertActivityTarget(orgId);

    // OrganizationConfig is not tenant-scoped, so it is read on the global client.
    const config = await prisma.organizationConfig.findUnique({
        where: { organizationId: orgId },
        select: {
            timezone: true,
            uhid_prefix: true,
            activity_generator_enabled: true,
            activity_generator_intensity: true,
        },
    });

    if (!config?.activity_generator_enabled) {
        return { ...EMPTY, reason: 'disabled in organization config' };
    }

    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { code: true } });
    const orgCode = org?.code || 'HOS';
    const tz = config.timezone || 'Asia/Kolkata';
    const intensity = INTENSITY_MULTIPLIER[config.activity_generator_intensity] ?? 1.0;
    const db = getTenantPrisma(orgId);

    const result: TickResult = { ...EMPTY, ran: true };

    // Doctors on staff — every visit, lab order and indent is attributed to one, so a
    // record never shows a dangling reference under a close-up.
    const staff = await loadStaff(orgId);
    const doctors = staff.filter(s => s.role === 'doctor');
    if (!doctors.length) return { ...EMPTY, reason: 'no active doctors in this organization' };

    // Reconcile the roster against the audit log first, so anyone attributed to an
    // action below is already recorded as logged in at this moment.
    const sessions = await syncStaffSessions(orgId, staff, now, tz);
    result.staffLoggedIn = sessions.loggedIn;
    result.staffLoggedOut = sessions.loggedOut;

    const actor = (role: string) => actorFor(staff, role, now, tz);

    // ── Arrivals ─────────────────────────────────────────────────────────────
    // Elapsed time comes from the newest generated patient rather than an assumed
    // interval, so an irregular or restarted scheduler does not change the rate.
    const newest = await db.oPD_REG.findFirst({
        orderBy: { created_at: 'desc' },
        select: { created_at: true },
    });
    const elapsedMinutes = newest?.created_at
        ? Math.min(60, Math.max(0.5, (now.getTime() - new Date(newest.created_at).getTime()) / 60_000))
        : 5;
    result.elapsedMinutes = Number(elapsedMinutes.toFixed(1));

    const tpaProviders: { id: number; provider_code: string }[] =
        await db.insurance_providers.findMany({ where: { is_active: true }, select: { id: true, provider_code: true } });

    const { start: dayStart, end: dayEnd } = getTodayRange(tz);
    const registeredToday = await db.oPD_REG.count({
        where: { created_at: { gte: dayStart, lte: dayEnd } },
    });

    // Hour-of-day shape × weekday shape × this particular day's busyness. The last one
    // is keyed on the date, so two days of reports never look like carbon copies.
    const weight = HOURLY_WEIGHT[hourInTimezone(now, tz)]
        * DAY_WEIGHT[weekdayInTimezone(now, tz)]
        * dailyVolumeMultiplier(now, tz);
    const expected = weight * intensity * PEAK_ARRIVALS_PER_HOUR * (elapsedMinutes / 60);
    // Fractional expectation becomes a probability, so low-rate hours still produce the
    // occasional arrival instead of always flooring to zero.
    let arrivals = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
    arrivals = Math.min(arrivals, MAX_ARRIVALS_PER_TICK, Math.max(0, DAILY_ARRIVAL_CAP - registeredToday));

    for (let i = 0; i < arrivals; i++) {
        const doctor = pick(doctors);
        const department = doctor.specialty || 'General Medicine';
        // Seed from the running total so a person is reproducible from DB state.
        const totalSoFar = await db.oPD_REG.count();
        const person = castPerson(totalSoFar + i + 1);

        const patientType = Math.random() < 0.14 ? 'tpa_insurance' : 'cash';
        const patientId = await createWithUniqueRetry(async () => {
            const patientId = await generateUHID(db, config.uhid_prefix || 'AVN');
            await db.oPD_REG.create({
                data: {
                    patient_id: patientId,
                    full_name: person.full_name,
                    age: person.age,
                    gender: person.gender,
                    phone: person.phone,
                    address: person.address,
                    blood_group: person.blood_group,
                    date_of_birth: person.date_of_birth,
                    aadhar_card: person.aadhar_card,
                    abha_number: person.abha_number,
                    emergency_contact_name: person.emergency_contact_name,
                    emergency_contact_phone: person.emergency_contact_phone,
                    emergency_contact_relation: person.emergency_contact_relation,
                    department,
                    registration_consent: true,
                    patient_type: patientType,
                    // Back-date slightly so arrivals within one tick are not all identical.
                    created_at: new Date(now.getTime() - Math.floor(rand(0, elapsedMinutes * 60_000))),
                } as any,
            });

            await db.appointments.create({
                data: {
                    appointment_id: generateAppointmentId(),
                    patient_id: patientId,
                    doctor_id: doctor.id,
                    doctor_name: doctor.name,
                    department,
                    status: 'Scheduled',
                    reason_for_visit: pick(REASONS_FOR_VISIT),
                    booking_channel: Math.random() < 0.75 ? 'walk_in' : 'phone',
                    queue_token: registeredToday + i + 1,
                    appointment_date: new Date(now.getTime() - Math.floor(rand(0, elapsedMinutes * 60_000))),
                } as any,
            });
            return patientId;
        });

        // An insured patient needs a policy on file, or the TPA claim raised against
        // their bill later would have nothing to attach to and the claim never appears.
        if (patientType === 'tpa_insurance' && tpaProviders.length) {
            const provider = pick(tpaProviders);
            const limit = pick([100000, 200000, 300000, 500000]);
            await db.insurance_policies.create({
                data: {
                    patient_id: patientId,
                    provider_id: provider.id,
                    policy_number: `${provider.provider_code}/${new Date().getFullYear()}/${String(Math.floor(rand(10000, 99999)))}`,
                    policy_holder: person.full_name,
                    plan_name: 'Family Floater',
                    policy_type: 'Individual',
                    coverage_limit: limit,
                    remaining_limit: limit,
                    valid_from: new Date(now.getFullYear(), 0, 1),
                    valid_until: new Date(now.getFullYear(), 11, 31),
                    status: 'Active',
                    organizationId: orgId,
                } as any,
            });
        }

        await logSimAudit({
            organizationId: orgId,
            actor: actor('receptionist'),
            action: 'REGISTER_PATIENT',
            module: 'opd',
            entityType: 'patient',
            entityId: patientId,
            details: `Registered ${person.full_name} for ${department}`,
            at: now,
        });
        result.registered++;
    }

    // ── OPD flow ─────────────────────────────────────────────────────────────
    // Each step uses the timestamp the real workflow writes, so a record's history is
    // internally consistent if anyone opens it.

    // Consultation fees by department, fetched once rather than per appointment.
    const departments: { name: string; base_consultation_fee: number }[] =
        await db.department.findMany({ where: { is_active: true }, select: { name: true, base_consultation_fee: true } });
    const feeFor = (dept: string | null) =>
        departments.find(d => d.name === dept)?.base_consultation_fee ?? 700;

    const scheduled = await db.appointments.findMany({
        where: { status: 'Scheduled' },
        take: MAX_TRANSITIONS_PER_STATUS,
        select: { id: true, appointment_date: true, patient_id: true, department: true, doctor_id: true, doctor_name: true },
    });
    for (const appt of scheduled) {
        const due = new Date(appt.appointment_date).getTime() + jitteredDwellMs(DWELL_MINUTES.scheduledToCheckedIn);
        if (now.getTime() < due) continue;
        await db.appointments.update({
            where: { id: appt.id },
            data: { status: 'Checked In', checked_in_at: new Date(due) },
        });
        result.checkedIn++;

        // The OPD consultation fee is collected at the counter on check-in, so the
        // receipt and the check-in timestamp agree.
        const cashier = actor('receptionist');
        const fee = feeFor(appt.department);
        await createWithUniqueRetry(async () => {
            const invoiceNumber = await generateInvoiceNumber(orgId, 'OPD', false, db);
            const invoice = await db.invoices.create({
                data: {
                    invoice_number: invoiceNumber,
                    patient_id: appt.patient_id,
                    invoice_type: 'OPD',
                    is_fee_receipt: true,
                    total_amount: fee, net_amount: fee, paid_amount: fee, balance_due: 0,
                    status: 'Final',
                    finalized_at: new Date(due),
                    doctor_id: appt.doctor_id, doctor_name: appt.doctor_name,
                    created_at: new Date(due),
                } as any,
            });
            await db.invoice_items.create({
                data: {
                    invoice_id: invoice.id,
                    department: appt.department || 'General Medicine',
                    description: `Consultation — ${appt.department || 'General Medicine'}`,
                    quantity: 1, unit_price: fee, total_price: fee, net_price: fee,
                    rendered_by_doctor_id: appt.doctor_id,
                    created_at: new Date(due),
                } as any,
            });
            await db.payments.create({
                data: {
                    receipt_number: await generateReceiptNumber(orgId, db),
                    invoice_id: invoice.id,
                    amount: fee,
                    payment_method: Math.random() < 0.55 ? 'Cash' : 'UPI',
                    payment_type: 'OPD',
                    status: 'Completed',
                    received_by: cashier?.username ?? null,
                    created_at: new Date(due),
                } as any,
            });
        });
        result.opdBilled++;

        await logSimAudit({
            organizationId: orgId, actor: cashier,
            action: 'RECORD_PAYMENT', module: 'billing',
            entityType: 'invoice', entityId: appt.patient_id,
            details: `OPD consultation fee collected — Rs ${fee}`,
            at: new Date(due),
        });
    }

    const checkedIn = await db.appointments.findMany({
        where: { status: 'Checked In' },
        take: MAX_TRANSITIONS_PER_STATUS,
        select: { id: true, checked_in_at: true, appointment_date: true },
    });
    for (const appt of checkedIn) {
        const from = new Date(appt.checked_in_at ?? appt.appointment_date).getTime();
        const due = from + jitteredDwellMs(DWELL_MINUTES.checkedInToInProgress);
        if (now.getTime() < due) continue;
        await db.appointments.update({
            where: { id: appt.id },
            data: { status: 'In Progress', called_at: new Date(due) },
        });
        result.consultStarted++;
    }

    const inProgress = await db.appointments.findMany({
        where: { status: 'In Progress' },
        take: MAX_TRANSITIONS_PER_STATUS,
        select: { id: true, called_at: true, appointment_date: true, patient_id: true, doctor_id: true },
    });

    // Lab test menu, fetched once. A nested include per appointment would issue a
    // separate query per row against the pooler — that fan-out is what makes a tick slow.
    // getTenantPrisma() is typed `any`, so annotate what comes back — otherwise every
    // downstream use infers `unknown` and the compiler cannot check these at all.
    const labMenu: { test_name: string }[] = await db.lab_test_inventory.findMany({
        where: { is_available: true },
        select: { test_name: true },
    });
    const medicines: { id: number; brand_name: string; selling_price: number | null }[] =
        await db.pharmacy_medicine_master.findMany({
            where: { is_active: true },
            select: { id: true, brand_name: true, selling_price: true },
        });

    for (const appt of inProgress) {
        const from = new Date(appt.called_at ?? appt.appointment_date).getTime();
        const due = from + jitteredDwellMs(DWELL_MINUTES.inProgressToCompleted);
        if (now.getTime() < due) continue;

        await db.appointments.update({ where: { id: appt.id }, data: { status: 'Completed' } });
        result.consultCompleted++;

        const doctorId = appt.doctor_id || doctors[0].id;
        const consultingDoctor = doctors.find(d => d.id === doctorId) ?? doctors[0];

        await logSimAudit({
            organizationId: orgId, actor: consultingDoctor,
            action: 'COMPLETE_CONSULTATION', module: 'doctor',
            entityType: 'appointment', entityId: appt.patient_id,
            details: 'Consultation completed', at: new Date(due),
        });

        // ── Admission ────────────────────────────────────────────────────────
        // Only admits if a bed is genuinely free; the bed is flipped to Occupied in the
        // same step so two admissions can never claim it.
        //
        // Insured patients are admitted more readily — planned and elective admissions
        // skew heavily towards people with cover. That is realistic on its own, and it
        // also keeps the TPA pipeline fed: at a flat rate, insured-AND-admitted is ~1% of
        // arrivals, so whether the claims screens had any data at all came down to luck.
        const insured = await db.oPD_REG.findFirst({
            where: { patient_id: appt.patient_id }, select: { patient_type: true },
        });
        const admitChance = insured?.patient_type === 'tpa_insurance'
            ? P_ADMIT_AFTER_CONSULT * 2.6
            : P_ADMIT_AFTER_CONSULT;
        if (Math.random() < admitChance) {
            const freeBed = await db.beds.findFirst({
                where: { status: 'Available' },
                select: { bed_id: true, ward_id: true, bed_name: true },
            });
            if (freeBed) {
                const admittedBy = actor('ipd_manager') ?? actor('nurse');
                await createWithUniqueRetry(async () => {
                    // Admission id format mirrors ipd-actions.ts: {ORG}-ADM-{FY}-{seq}
                    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
                    const fy = `${String(fyStart).slice(-2)}-${String(fyStart + 1).slice(-2)}`;
                    const prefix = `${orgCode}-ADM-${fy}-`;
                    const lastAdm = await db.admissions.findFirst({
                        where: { admission_id: { startsWith: prefix } },
                        orderBy: { admission_id: 'desc' },
                        select: { admission_id: true },
                    });
                    const seq = lastAdm
                        ? (parseInt(lastAdm.admission_id.split('-').pop() || '0', 10) || 0) + 1
                        : 1;
                    const admissionId = `${prefix}${String(seq).padStart(3, '0')}`;

                    await db.admissions.create({
                        data: {
                            admission_id: admissionId,
                            patient_id: appt.patient_id,
                            bed_id: freeBed.bed_id,
                            ward_id: freeBed.ward_id,
                            status: 'Admitted',
                            diagnosis: pick(IPD_DIAGNOSES),
                            doctor_name: consultingDoctor.name,
                            attending_doctor_id: consultingDoctor.id,
                            admission_type: Math.random() < 0.25 ? 'Emergency' : 'Planned',
                            admission_source: 'OPD',
                            admission_date: new Date(due),
                            expected_discharge_date: new Date(due + 2 * 86_400_000),
                            organizationId: orgId,
                        } as any,
                    });

                    await db.beds.update({
                        where: { bed_id: freeBed.bed_id },
                        data: { status: 'Occupied', last_occupied_by: appt.patient_id },
                    });

                    await logSimAudit({
                        organizationId: orgId, actor: admittedBy,
                        action: 'ADMIT_PATIENT', module: 'ipd',
                        entityType: 'admission', entityId: admissionId,
                        details: `Admitted to ${freeBed.bed_name || freeBed.bed_id}`,
                        at: new Date(due),
                    });
                });
                result.admitted++;
            }
        }

        if (labMenu.length && Math.random() < P_LAB_AFTER_CONSULT) {
            const tests = Math.random() < 0.3 ? 2 : 1;
            for (let t = 0; t < tests; t++) {
                await createWithUniqueRetry(async () => {
                    // Barcode format matches orderLabTest() in doctor-actions.ts exactly —
                    // a lab slip printed from generated data must be indistinguishable
                    // from one a doctor raised through the UI.
                    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                    const count = await db.lab_orders.count();
                    const barcode = `LAB-${dateStr}-${String(count + 1).padStart(4, '0')}`;
                    await db.lab_orders.create({
                        data: {
                            barcode,
                            patient_id: appt.patient_id,
                            doctor_id: doctorId,
                            test_type: pick(labMenu).test_name,
                            status: 'Pending',
                            created_at: new Date(due),
                        } as any,
                    });
                });
                result.labOrdered++;
            }
        }

        if (medicines.length && Math.random() < P_PHARMACY_AFTER_CONSULT) {
            await createWithUniqueRetry(async () => {
                const indentNumber = await generateIndentNumber(orgId, db);
                const lines = Math.floor(rand(1, 4));
                // Quantities are decided before the total so the header amount is the sum
                // of the line items. A header that disagrees with its own lines is the
                // first thing that looks wrong when a bill is held up to camera.
                const chosen = Array.from({ length: lines }, () => {
                    const medicine = pick(medicines);
                    const quantity = Math.floor(rand(1, 4));
                    return { medicine, quantity, lineTotal: (medicine.selling_price || 0) * quantity };
                });
                const total = chosen.reduce((s, line) => s + line.lineTotal, 0);

                const order = await db.pharmacy_orders.create({
                    data: {
                        indent_number: indentNumber,
                        patient_id: appt.patient_id,
                        doctor_id: doctorId,
                        status: 'Pending',
                        total_amount: Number(total.toFixed(2)),
                        total_items_requested: chosen.length,
                        created_at: new Date(due),
                    } as any,
                });

                for (const line of chosen) {
                    await db.pharmacy_order_items.create({
                        data: {
                            order_id: order.id,
                            medicine_id: line.medicine.id,
                            medicine_name: line.medicine.brand_name,
                            quantity_requested: line.quantity,
                            unit_price: line.medicine.selling_price || 0,
                            total_price: Number(line.lineTotal.toFixed(2)),
                            status: 'Pending',
                        } as any,
                    });
                }
            });
            result.indentsRaised++;
        }
    }

    // ── Lab flow ─────────────────────────────────────────────────────────────
    // lab_orders carries only created_at, so both steps are measured from it with
    // cumulative thresholds rather than a per-status timestamp.

    const labPending = await db.lab_orders.findMany({
        where: { status: 'Pending' },
        take: MAX_TRANSITIONS_PER_STATUS,
        select: { id: true, created_at: true },
    });
    for (const order of labPending) {
        const due = new Date(order.created_at).getTime() + jitteredDwellMs(DWELL_MINUTES.labOrderedToProcessing);
        if (now.getTime() < due) continue;
        await db.lab_orders.update({ where: { id: order.id }, data: { status: 'Processing' } });
        result.labProcessing++;
    }

    const labProcessing = await db.lab_orders.findMany({
        where: { status: 'Processing' },
        take: MAX_TRANSITIONS_PER_STATUS,
        select: { id: true, created_at: true, test_type: true },
    });
    for (const order of labProcessing) {
        const due = new Date(order.created_at).getTime()
            + jitteredDwellMs(DWELL_MINUTES.labOrderedToProcessing + DWELL_MINUTES.labProcessingToCompleted);
        if (now.getTime() < due) continue;
        const template = RESULT_TEMPLATES[order.test_type];
        const isCritical = Math.random() < P_CRITICAL_RESULT;
        const technician = actor('lab_technician');
        await db.lab_orders.update({
            where: { id: order.id },
            data: {
                status: 'Completed',
                result_value: template ? template() : 'Within normal limits',
                is_critical: isCritical,
                assigned_technician_id: technician?.username ?? null,
                ...(isCritical ? { critical_notified_at: new Date(due) } : {}),
            },
        });
        result.labCompleted++;

        await logSimAudit({
            organizationId: orgId, actor: technician,
            action: isCritical ? 'CRITICAL_RESULT_NOTIFIED' : 'UPLOAD_RESULT',
            module: 'lab',
            entityType: 'lab_order', entityId: String(order.id),
            details: `${order.test_type} resulted${isCritical ? ' — critical value flagged' : ''}`,
            at: new Date(due),
        });
    }

    // ── Pharmacy flow ────────────────────────────────────────────────────────

    const indentsPending = await db.pharmacy_orders.findMany({
        where: { status: 'Pending' },
        take: MAX_TRANSITIONS_PER_STATUS,
        select: { id: true, created_at: true },
    });
    for (const order of indentsPending) {
        const due = new Date(order.created_at).getTime() + jitteredDwellMs(DWELL_MINUTES.indentToVerified);
        if (now.getTime() < due) continue;
        await db.pharmacy_orders.update({
            where: { id: order.id },
            data: { status: 'Verified', verified_at: new Date(due) },
        });
        result.indentsVerified++;
    }

    const indentsVerified = await db.pharmacy_orders.findMany({
        where: { status: 'Verified' },
        take: MAX_TRANSITIONS_PER_STATUS,
        select: { id: true, verified_at: true, created_at: true, total_items_requested: true },
    });
    for (const order of indentsVerified) {
        const from = new Date(order.verified_at ?? order.created_at).getTime();
        const due = from + jitteredDwellMs(DWELL_MINUTES.verifiedToDispensed);
        if (now.getTime() < due) continue;
        await db.pharmacy_orders.update({
            where: { id: order.id },
            data: { status: 'Completed', items_dispensed: order.total_items_requested ?? 0, items_missing: 0 },
        });
        result.indentsDispensed++;

        await logSimAudit({
            organizationId: orgId, actor: actor('pharmacist'),
            action: 'DISPENSE_MEDICATION', module: 'Pharmacy',
            entityType: 'pharmacy_order', entityId: String(order.id),
            details: `Dispensed ${order.total_items_requested ?? 0} item(s)`, at: new Date(due),
        });
    }

    // ── Ward care ────────────────────────────────────────────────────────────
    // Runs BEFORE discharge, deliberately. Ward care only looks at admissions still in
    // 'Admitted', so discharging first would mean a patient who arrived and left within
    // one tick was never observed, never medicated and never charted — leaving a
    // discharge summary attached to an empty record.
    const ward = await runWardCare(db, orgId, staff, doctors, now, tz);
    Object.assign(result, ward);

    // ── Discharge ────────────────────────────────────────────────────────────
    // Summary, final bill, payment and bed release happen as one sequence, the way a
    // real discharge does — a discharged admission with no bill, or a freed bed with no
    // discharge summary, is the kind of gap that shows up immediately on a ward board.

    const wards: { ward_id: number; ward_name: string; cost_per_day: number | null; nursing_charge: number | null }[] =
        await db.wards.findMany({ select: { ward_id: true, ward_name: true, cost_per_day: true, nursing_charge: true } });

    const admitted = await db.admissions.findMany({
        where: { status: 'Admitted' },
        take: MAX_TRANSITIONS_PER_STATUS,
        select: {
            admission_id: true, patient_id: true, bed_id: true, ward_id: true,
            admission_date: true, diagnosis: true, doctor_name: true, attending_doctor_id: true,
        },
    });

    for (const adm of admitted) {
        const due = new Date(adm.admission_date).getTime() + jitteredDwellMs(DWELL_MINUTES.admissionToDischarge);
        if (now.getTime() < due) continue;

        const dischargeAt = new Date(due);
        const patient = await db.oPD_REG.findFirst({
            where: { patient_id: adm.patient_id }, select: { full_name: true },
        });
        const ward = wards.find(w => w.ward_id === adm.ward_id);
        const attending = doctors.find(d => d.id === adm.attending_doctor_id) ?? doctors[0];
        // At least one day is billed even for a same-day stay, which is how hospitals
        // actually charge bed occupancy.
        const days = Math.max(1, Math.ceil((due - new Date(adm.admission_date).getTime()) / 86_400_000));
        const bedRate = ward?.cost_per_day ?? DEFAULT_BED_RATE;
        const nursingRate = ward?.nursing_charge ?? NURSING_CHARGE;

        await db.discharge_summaries.create({
            data: {
                admission_id: adm.admission_id,
                patient_name: patient?.full_name ?? null,
                prepared_by: attending?.username ?? null,
                generated_summary:
                    `Final diagnosis: ${adm.diagnosis ?? 'Under evaluation'}. ` +
                    `Admitted under ${adm.doctor_name ?? 'the attending physician'} and managed conservatively. ` +
                    `Condition at discharge: ${pick(DISCHARGE_CONDITIONS)} ` +
                    `Advised outpatient review after one week, or earlier if symptoms recur.`,
                organizationId: orgId,
                created_at: dischargeAt,
            } as any,
        });

        const lines = [
            { description: `${ward?.ward_name ?? 'Ward'} bed charges`, quantity: days, unit_price: bedRate },
            { description: 'Nursing charges', quantity: days, unit_price: nursingRate },
            { description: 'Consultant visit charges', quantity: days, unit_price: 800 },
        ];
        const netAmount = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
        const biller = actor('finance');

        await createWithUniqueRetry(async () => {
            const invoiceNumber = await generateInvoiceNumber(orgId, 'IPD', true, db);
            const invoice = await db.invoices.create({
                data: {
                    invoice_number: invoiceNumber,
                    patient_id: adm.patient_id,
                    admission_id: adm.admission_id,
                    invoice_type: 'IPD',
                    total_amount: netAmount, net_amount: netAmount,
                    paid_amount: netAmount, balance_due: 0,
                    status: 'Final',
                    finalized_at: dischargeAt,
                    approved_by: biller?.username ?? null,
                    doctor_id: attending?.id, doctor_name: attending?.name,
                    created_at: dischargeAt,
                } as any,
            });

            for (const line of lines) {
                const total = line.quantity * line.unit_price;
                await db.invoice_items.create({
                    data: {
                        invoice_id: invoice.id,
                        department: ward?.ward_name ?? 'IPD',
                        description: line.description,
                        quantity: line.quantity,
                        unit_price: line.unit_price,
                        total_price: total,
                        net_price: total,
                        created_at: dischargeAt,
                    } as any,
                });
            }

            await db.payments.create({
                data: {
                    receipt_number: await generateReceiptNumber(orgId, db),
                    invoice_id: invoice.id,
                    amount: netAmount,
                    payment_method: pick(['Cash', 'Card', 'UPI', 'Bank Transfer']),
                    payment_type: 'IPD',
                    status: 'Completed',
                    received_by: biller?.username ?? null,
                    created_at: dischargeAt,
                } as any,
            });
        });
        result.ipdBilled++;

        await db.admissions.update({
            where: { admission_id: adm.admission_id },
            data: {
                status: 'Discharged',
                discharge_date: dischargeAt,
                discharge_type: 'Routine',
                discharge_disposition: 'Home',
                fit_for_discharge_at: dischargeAt,
                fit_for_discharge_by: attending?.username ?? null,
            },
        });

        // A bed only auto-releases if cleaning_started_at is stamped on entry to
        // Cleaning. Omitting it strands the bed in Cleaning permanently.
        if (adm.bed_id) {
            await db.beds.update({
                where: { bed_id: adm.bed_id },
                data: { status: 'Cleaning', cleaning_started_at: dischargeAt, last_occupied_by: adm.patient_id },
            });
        }

        await logSimAudit({
            organizationId: orgId, actor: attending,
            action: 'DISCHARGE_PATIENT', module: 'discharge',
            entityType: 'admission', entityId: adm.admission_id,
            details: `Discharged after ${days} day(s). Final bill Rs ${netAmount}`,
            at: dischargeAt,
        });
        result.discharged++;
    }

    // ── Bed turnaround ───────────────────────────────────────────────────────
    const cleaning = await db.beds.findMany({
        where: { status: 'Cleaning' },
        take: MAX_TRANSITIONS_PER_STATUS,
        select: { bed_id: true, cleaning_started_at: true },
    });
    for (const bed of cleaning) {
        if (!bed.cleaning_started_at) continue;
        const due = new Date(bed.cleaning_started_at).getTime() + jitteredDwellMs(DWELL_MINUTES.bedCleaning);
        if (now.getTime() < due) continue;
        await db.beds.update({
            where: { bed_id: bed.bed_id },
            data: { status: 'Available', cleaning_completed_at: new Date(due) },
        });
        result.bedsReleased++;

        await logSimAudit({
            organizationId: orgId, actor: actor('nurse'),
            action: 'BED_MARKED_AVAILABLE', module: 'ipd',
            entityType: 'bed', entityId: bed.bed_id,
            details: 'Terminal cleaning completed', at: new Date(due),
        });
    }

    // ── Back office ──────────────────────────────────────────────────────────
    // Runs last: deposits, claims and ledger postings all reference admissions and
    // invoices created earlier in this same tick.
    const backOffice = await runBackOffice(db, orgId, staff, now, tz);
    Object.assign(result, backOffice);

    return result;
}
