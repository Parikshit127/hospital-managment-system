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
    loadStaff, syncStaffSessions, actorFor, actorOnDuty, logSimAudit, dailyVolumeMultiplier, isOnDuty,
} from '@/app/lib/sim-staff';
import { syncMasterDataIfDue } from '@/app/lib/sim-master-data';
import { runWardCare } from '@/app/lib/sim-ward';
import { runBackOffice } from '@/app/lib/sim-back-office';
import { assertActivityTarget, resolveActivityTarget } from '@/scripts/sim/guard';
import { castPerson } from '@/scripts/sim/cast';

// ---------------------------------------------------------------------------
// Which streams the engine generates
// ---------------------------------------------------------------------------

/**
 * Currently narrowed to the OPD patient journey only:
 *
 *   register → queue → check in (+ fee receipt) → consultation
 *              → lab test ordered, resulted
 *              → prescription raised, verified, dispensed
 *
 * Everything else is switched off, NOT deleted. sim-ward.ts and sim-back-office.ts are
 * untouched and still typecheck; flipping a flag back to true restores that stream in
 * full. Consequences of the current setting, so they are not a surprise on camera:
 *
 *   ipd: false        — nobody is ever admitted. Beds stay Available, the ward board,
 *                       eMAR, vitals, nursing notes and discharge summaries stay empty.
 *   backOffice: false — no deposits, no TPA claims, no ledger entries, no ER triage.
 *                       OPD invoices and payments still happen (that is opdBilling),
 *                       but nothing posts to the general ledger.
 *
 * Staff still clock in and out on their real shifts and every action is still audited.
 *
 * Turning a stream off stops NEW work being created; anything already in flight still
 * progresses to completion. Freezing half-finished orders in "Pending" would look far
 * more broken on screen than letting the queue drain. Bed cleaning is released for the
 * same reason even with ipd off — a bed stranded mid-clean never becomes available again.
 */
const GENERATE = {
    /** Consultation fee invoice + payment, collected at check-in. */
    opdBilling: true,
    /** Lab orders raised from a completed consultation, through to a result. */
    lab: true,
    /** Pharmacy indents raised from a completed consultation, through to dispensing. */
    pharmacy: true,
    /** Admissions, bed occupancy, ward care, discharge, final bill, bed turnaround. */
    ipd: false,
    /** Deposits, TPA claims, GL journal entries, ER triage. */
    backOffice: false,
};

/**
 * Roles the current settings give no work to.
 *
 * They are left off the duty roster entirely — no login, no logout, no audit rows. A
 * nurse who clocks in at seven every morning and then does nothing all day is more
 * conspicuous on an audit screen than one who simply is not on the system.
 *
 * The accounts still exist and are still cloned; they are only absent from the roster.
 * Turning `ipd` back on restores them automatically.
 */
const IDLE_ROLES: ReadonlySet<string> = new Set(GENERATE.ipd ? [] : ['nurse']);

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

/**
 * Presenting complaints, weighted and split by department.
 *
 * Two problems this fixes. A flat twelve-item list repeats visibly once a queue holds
 * more than a few patients; and picking from one shared list produced a cardiology
 * patient complaining of loose motions — internally consistent data, obviously wrong to
 * anyone who reads the screen.
 *
 * Frequencies follow Indian OPD morbidity data: fever is the single largest complaint
 * (~35% of primary-care presentations), respiratory symptoms appear in over half of all
 * encounters, then digestive, musculoskeletal, circulatory and skin. Gynaecology is led
 * by lower abdominal pain (~50%) then menstrual irregularity. Weights are relative, not
 * percentages.
 */
type Weighted = readonly (readonly [number, string])[];

const REASONS_BY_DEPARTMENT: Record<string, Weighted> = {
    'General Medicine': [
        [10, 'Fever with chills for 3 days'], [9, 'Fever with body ache'],
        [8, 'Cough with expectoration'], [7, 'Dry cough and sore throat'],
        [6, 'Cold, running nose and sneezing'], [6, 'Acidity and burning in chest'],
        [5, 'Abdominal pain and bloating'], [5, 'Loose motions since morning'],
        [5, 'Generalised weakness and fatigue'], [4, 'Headache and giddiness'],
        [4, 'Blood pressure review'], [4, 'Diabetes follow-up, sugar review'],
        [3, 'Breathlessness on exertion'], [3, 'Vomiting and nausea'],
        [3, 'Body ache and joint pains'], [2, 'Chest discomfort'],
        [2, 'Routine health check'], [2, 'Itching and skin rash'],
        [2, 'Swelling of both feet'], [2, 'Burning micturition'],
        [1, 'Disturbed sleep and anxiety'], [1, 'Weight loss under evaluation'],
        [1, 'Follow-up with reports'],
    ],
    'Paediatrics': [
        [10, 'Fever for 2 days, child not feeding well'], [8, 'Cough and cold'],
        [7, 'Loose motions and vomiting'], [6, 'Fever with rash'],
        [5, 'Ear pain and irritability'], [5, 'Cold with blocked nose'],
        [4, 'Vomiting after feeds'], [4, 'Immunisation due'],
        [3, 'Abdominal pain, child pointing to navel'], [3, 'Poor weight gain'],
        [3, 'Wheezing episode'], [2, 'Routine growth check'],
        [2, 'Constipation for 4 days'], [2, 'Skin rash over trunk'],
        [1, 'Fall at home, minor injury'], [1, 'Follow-up after fever'],
    ],
    'Orthopaedics': [
        [10, 'Low back pain radiating to leg'], [8, 'Knee pain on climbing stairs'],
        [6, 'Neck pain and stiffness'], [6, 'Shoulder pain, difficulty lifting arm'],
        [5, 'Joint pains in both hands'], [5, 'Ankle sprain after a fall'],
        [4, 'Heel pain in the morning'], [4, 'Wrist pain after injury'],
        [3, 'Follow-up, plaster review'], [3, 'Swelling over knee joint'],
        [2, 'Numbness and tingling in fingers'], [2, 'Post-operative review'],
        [2, 'Difficulty walking, hip pain'], [1, 'Sports injury, thigh muscle'],
    ],
    'Obstetrics & Gynaecology': [
        [10, 'Lower abdominal pain'], [8, 'Irregular menstrual cycles'],
        [7, 'Antenatal check-up'], [6, 'White discharge per vaginum'],
        [5, 'Heavy menstrual bleeding'], [4, 'Painful periods'],
        [4, 'Missed period, pregnancy confirmation'], [3, 'Post-natal follow-up'],
        [3, 'Difficulty conceiving'], [2, 'Backache in pregnancy'],
        [2, 'Burning micturition'], [2, 'Routine gynaecological check'],
        [1, 'Contraception advice'],
    ],
    'Emergency': [
        [8, 'Chest pain radiating to left arm'], [7, 'Breathlessness since morning'],
        [6, 'Road traffic accident, abrasions'], [5, 'High-grade fever with rigors'],
        [5, 'Severe abdominal pain'], [4, 'Fall at home, suspected fracture'],
        [3, 'Vomiting with dehydration'], [3, 'Giddiness and palpitations'],
        [2, 'Seizure episode at home'], [2, 'Severe headache'],
    ],
};

/**
 * Ayurvedic / Panchakarma practice sees a different mix entirely: chronic joint and
 * spine disorders, neurological rehabilitation, skin conditions, digestive weakness,
 * obesity and stress — people who have usually tried allopathic care first. "Acidity"
 * and "blood pressure review" would read as wrong on a Panchakarma clinic's queue.
 *
 * Department names differ too (Kayachikitsa, Panchakarma, Prasuti Tantra), so most
 * hospitals will land on the fallback list rather than a department-specific one.
 */
const AYURVEDIC_GENERAL: Weighted = [
    [10, 'Joint pain and stiffness, both knees'], [9, 'Low back pain, chronic'],
    [8, 'Cervical spondylosis, neck stiffness'], [7, 'Indigestion and loss of appetite'],
    [6, 'Generalised weakness and fatigue'], [6, 'Sleeplessness and stress'],
    [6, 'Skin rash and itching, chronic'], [5, 'Weight gain, seeking Panchakarma'],
    [5, 'Constipation, long-standing'], [5, 'Migraine, recurrent episodes'],
    [4, 'Hair fall and dandruff'], [4, 'Acidity and bloating after meals'],
    [4, 'Sciatica, pain radiating down the leg'], [4, 'Frozen shoulder'],
    [3, 'Post-stroke weakness, seeking rehabilitation'], [3, 'Bronchial asthma, seasonal'],
    [3, 'Piles, discomfort and bleeding'], [3, 'Psoriasis, patches over elbows'],
    [3, 'Diabetes, seeking Ayurvedic management'], [2, 'Rheumatoid arthritis follow-up'],
    [2, 'Wellness consultation and diet advice'], [2, 'Facial palsy, seeking Nasya'],
    [2, 'Varicose veins, leg heaviness'], [2, 'Anxiety and palpitations'],
    [1, 'Panchakarma follow-up review'], [1, 'Seasonal detox consultation'],
];

const AYURVEDIC_BY_DEPARTMENT: Record<string, Weighted> = {
    'Panchakarma': [
        [10, 'Joint pain, advised Abhyanga and Swedana'], [8, 'Chronic back pain for Kati Basti'],
        [7, 'Sleeplessness, advised Shirodhara'], [6, 'Obesity, advised Udvartana'],
        [5, 'Skin disorder, advised Vamana'], [5, 'Sinusitis, advised Nasya'],
        [4, 'Constipation, advised Basti'], [3, 'Panchakarma follow-up review'],
        [3, 'Seasonal detox, Ritu Shodhana'], [2, 'Post-treatment diet counselling'],
    ],
    'Kayachikitsa': [
        [10, 'Indigestion and loss of appetite'], [8, 'Joint pain, chronic'],
        [7, 'Generalised weakness'], [6, 'Acidity and bloating'],
        [5, 'Diabetes, Ayurvedic management'], [5, 'Skin rash, chronic'],
        [4, 'Constipation'], [4, 'Migraine'], [3, 'Anaemia under evaluation'],
        [3, 'Fever with body ache'], [2, 'Hypertension, seeking Ayurvedic care'],
    ],
    'Prasuti Tantra': [
        [9, 'Irregular menstrual cycles'], [7, 'White discharge per vaginum'],
        [6, 'Painful periods'], [6, 'PCOD, seeking Ayurvedic management'],
        [5, 'Antenatal care and diet advice'], [4, 'Difficulty conceiving'],
        [3, 'Post-natal care, Sutika Paricharya'], [2, 'Menopausal symptoms'],
    ],
    'Kaumarbhritya': [
        [9, 'Poor appetite in child'], [7, 'Recurrent cold and cough'],
        [6, 'Poor weight gain'], [5, 'Skin rash over body'],
        [4, 'Constipation in child'], [3, 'Suvarnaprashan due'],
        [3, 'Recurrent tonsillitis'], [2, 'Delayed milestones'],
    ],
    'Shalya Tantra': [
        [9, 'Piles, bleeding and discomfort'], [7, 'Fistula in ano'],
        [6, 'Fissure, painful defecation'], [5, 'Varicose veins'],
        [4, 'Non-healing ulcer over leg'], [3, 'Post Ksharasutra follow-up'],
    ],
    'Shalakya Tantra': [
        [8, 'Sinusitis and nasal blockage'], [7, 'Dry eyes and strain'],
        [6, 'Recurrent tonsillitis'], [5, 'Hearing difficulty'],
        [4, 'Headache with heaviness of head'], [3, 'Netra Tarpana advised'],
    ],
};

/**
 * The two complaint vocabularies, selected per simulation by
 * `organization_configs.simulation_complaint_style`.
 */
const REASON_SETS: Record<string, { byDepartment: Record<string, Weighted>; fallback: Weighted }> = {
    general: {
        byDepartment: REASONS_BY_DEPARTMENT,
        fallback: REASONS_BY_DEPARTMENT['General Medicine'],
    },
    ayurvedic: {
        byDepartment: AYURVEDIC_BY_DEPARTMENT,
        fallback: AYURVEDIC_GENERAL,
    },
};

function weightedPick(items: Weighted): string {
    const total = items.reduce((s, [w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [w, text] of items) {
        r -= w;
        if (r <= 0) return text;
    }
    return items[items.length - 1][1];
}

/**
 * Pick a complaint for this visit. `style` comes from the simulation's own config, so a
 * Panchakarma clinic and a multi-specialty hospital running side by side each get their
 * own vocabulary.
 */
export function reasonFor(department: string | null, style: string = 'general'): string {
    const set = REASON_SETS[style] ?? REASON_SETS.general;
    return weightedPick(set.byDepartment[department ?? ''] ?? set.fallback);
}

// ---------------------------------------------------------------------------
// Prescribing
// ---------------------------------------------------------------------------

export interface SimMedicine {
    id: number;
    brand_name: string;
    selling_price: number | null;
    category?: string | null;
}

/**
 * How often each drug class appears on an Indian OPD prescription.
 *
 * Picking uniformly from the formulary meant a rare injectable turned up as often as
 * paracetamol, and the same three or four brands recurred across every indent on screen.
 * Prescription-audit studies of Indian outpatient departments consistently show acid
 * suppressants and analgesics dominating, vitamins close behind, and antibiotics on
 * roughly one encounter in five or six.
 */
const CLASS_WEIGHTS: Weighted = [
    [34, 'acid'],
    [26, 'analgesic'],
    [20, 'vitamin'],
    [17, 'antibiotic'],
    [14, 'antiallergic'],
    [9, 'antiemetic'],
    [7, 'respiratory'],
    [6, 'chronic'],
    [4, 'other'],
];

/**
 * Brand-name fragments that identify a class, so this works off whatever formulary the
 * hospital actually has.
 *
 * Every alternative is anchored with \b. Without it `pan` (Pantoprazole) matched
 * "**Pan**chakarma" and filed an Ayurvedic therapy as a stomach tablet — a real
 * false positive found while looking at an Ayurvedic hospital's master data. Anchoring
 * only the START is deliberate: several entries are prefixes (`amox`, `cefix`) meant to
 * catch a family of brand names.
 */
const CLASS_MATCHERS: Record<string, RegExp> = {
    acid: /\b(pan|omez|rantac|ulcer|razo|aciloc|gelusil|sucral|pantop|esomep|nexpro)/i,
    analgesic: /\b(crocin|dolo|combiflam|brufen|voveran|zerodol|paracet|ibupro|diclo|nise|aceclo|etoshine)/i,
    vitamin: /\b(becosule|shelcal|neurobion|zincovit|calcium|vitamin|limcee|folvite|orofer|supradyn|a to z)/i,
    antibiotic: /\b(augment|azithral|zifi|monocef|taxim|cifran|metrogyl|amox|cefix|doxy|levoflox|ofloxa)/i,
    antiallergic: /\b(allegra|cetriz|cetzine|montek|avil|levocet|okacet|teczine)/i,
    antiemetic: /\b(emeset|domstal|perinorm|ondans|vomikind|rebalanz)/i,
    respiratory: /\b(asthalin|deriphyllin|ascoril|montair|budecort|foracort|seroflo)/i,
    chronic: /\b(metformin|glycomet|amlo|telma|atorva|thyronorm|losar|januvia|rosuva|olmesar)/i,
};

const classOf = (m: SimMedicine): string => {
    for (const [name, re] of Object.entries(CLASS_MATCHERS)) {
        if (re.test(m.brand_name)) return name;
    }
    return 'other';
};

/**
 * Build one prescription: 1–4 lines, each from a different drug class, weighted by how
 * often that class is actually prescribed. Distinct classes matter — two acid
 * suppressants on the same slip is the kind of thing a pharmacist would query.
 */
export function composePrescription(medicines: SimMedicine[]): SimMedicine[] {
    if (!medicines.length) return [];
    const byClass = new Map<string, SimMedicine[]>();
    for (const m of medicines) {
        const c = classOf(m);
        if (!byClass.has(c)) byClass.set(c, []);
        byClass.get(c)!.push(m);
    }

    const lines = weightedPick([[30, '1'], [38, '2'], [22, '3'], [10, '4']]);
    const wanted = Number(lines);

    // An Ayurvedic or otherwise non-allopathic formulary matches none of the classes
    // above, leaving everything under "other". Weighting would then almost never select
    // anything and prescriptions would come out empty, so fall back to a plain pick.
    if (byClass.size === 1 && byClass.has('other')) {
        const pool = [...medicines];
        const out: SimMedicine[] = [];
        while (out.length < Math.min(wanted, pool.length)) {
            const m = pick(pool);
            if (!out.includes(m)) out.push(m);
        }
        return out;
    }
    const chosen: SimMedicine[] = [];
    const usedClasses = new Set<string>();

    for (let attempt = 0; chosen.length < wanted && attempt < 24; attempt++) {
        const cls = weightedPick(CLASS_WEIGHTS);
        if (usedClasses.has(cls)) continue;
        const pool = byClass.get(cls);
        if (!pool?.length) continue;
        usedClasses.add(cls);
        chosen.push(pick(pool));
    }

    // Formulary too narrow to fill the slip by class — top up rather than return short.
    while (chosen.length < wanted && chosen.length < medicines.length) {
        const m = pick(medicines);
        if (!chosen.includes(m)) chosen.push(m);
    }
    return chosen;
}

// ---------------------------------------------------------------------------
// Lab results
// ---------------------------------------------------------------------------

/**
 * Reference ranges as used by Indian laboratories, so a printed report reads correctly
 * against its own stated normals.
 *
 * The previous version drew every analyte from one uniform band, which made every CBC
 * on screen look like every other CBC — the same three values, the same spread, nothing
 * ever flagged. Real reports are mostly normal with the occasional value outside range,
 * and that outlier is what makes the page look like a real result rather than filler.
 */
interface Analyte {
    label: string;
    unit: string;
    /** Reference interval printed alongside the value. */
    low: number;
    high: number;
    /** Decimal places. 0 = integer. */
    dp: number;
    /** How far outside the range an abnormal value may stray, as a fraction of the range. */
    spread?: number;
    /**
     * Only ever drift upward. For some analytes a low result is not a clinical finding at
     * all — nobody is investigated for a low HbA1c — so generating one produces a number
     * a real lab would never report.
     */
    highOnly?: boolean;
}

/** Probability any single analyte on a panel comes back outside its reference range. */
const P_ANALYTE_ABNORMAL = 0.16;

function measure(a: Analyte): string {
    const range = a.high - a.low;
    let value: number;

    if (Math.random() < P_ANALYTE_ABNORMAL) {
        // Outside the range, and usually only just outside — grossly deranged values on
        // every other report would read as a hospital full of dying people.
        const drift = range * (a.spread ?? 0.45) * (0.15 + Math.random() * 0.85);
        // Low-side drift is additionally capped against the lower bound itself, not just
        // the width of the range. Blood urea has a narrow reference band (15–40) sitting
        // well above zero, so a range-proportional drop produced values like 4 mg/dL —
        // arithmetically fine, clinically impossible, and obvious to anyone who reads it.
        // An analyte whose normal floor is zero (ESR) can only ever drift upward.
        const canGoLow = a.low > 0 && !a.highOnly;
        value = canGoLow && Math.random() < 0.5
            ? a.low - Math.min(drift, a.low * 0.35)
            : a.high + drift;
    } else {
        // Bunched toward the middle of the range rather than flat across it, so repeated
        // reports vary the way real ones do instead of looking uniformly scattered.
        const t = (Math.random() + Math.random()) / 2;
        value = a.low + range * t;
    }

    const shown = value.toFixed(a.dp);
    const flag = value < a.low ? ' (L)' : value > a.high ? ' (H)' : '';
    const refLow = a.low.toFixed(a.dp);
    const refHigh = a.high.toFixed(a.dp);
    return `${a.label} ${shown} ${a.unit}${flag} [${refLow}–${refHigh}]`;
}

const panel = (...analytes: Analyte[]) => () => analytes.map(measure).join(', ');

/** Result text per test. Keys must match `lab_test_inventory.test_name`. */
export const RESULT_TEMPLATES: Record<string, () => string> = {
    'Complete Blood Count': panel(
        { label: 'Hb', unit: 'g/dL', low: 12.0, high: 16.5, dp: 1 },
        { label: 'TLC', unit: '/µL', low: 4000, high: 11000, dp: 0 },
        { label: 'Platelets', unit: '/µL', low: 150000, high: 410000, dp: 0 },
        { label: 'PCV', unit: '%', low: 36, high: 48, dp: 1 },
    ),
    'Random Blood Sugar': panel(
        { label: 'Glucose (R)', unit: 'mg/dL', low: 80, high: 140, dp: 0, spread: 0.9 },
    ),
    'Fasting Blood Sugar': panel(
        { label: 'Glucose (F)', unit: 'mg/dL', low: 70, high: 100, dp: 0, spread: 1.1 },
    ),
    'HbA1c': panel(
        { label: 'HbA1c', unit: '%', low: 4.0, high: 5.7, dp: 1, spread: 0.9, highOnly: true },
    ),
    'Lipid Profile': panel(
        { label: 'Total Cholesterol', unit: 'mg/dL', low: 125, high: 200, dp: 0 },
        { label: 'LDL', unit: 'mg/dL', low: 50, high: 100, dp: 0 },
        { label: 'HDL', unit: 'mg/dL', low: 40, high: 60, dp: 0 },
        { label: 'Triglycerides', unit: 'mg/dL', low: 50, high: 150, dp: 0, spread: 0.8 },
    ),
    'Liver Function Test': panel(
        { label: 'Total Bilirubin', unit: 'mg/dL', low: 0.1, high: 1.2, dp: 2 },
        { label: 'SGOT', unit: 'U/L', low: 10, high: 40, dp: 0 },
        { label: 'SGPT', unit: 'U/L', low: 7, high: 56, dp: 0 },
        { label: 'Alk. Phosphatase', unit: 'U/L', low: 44, high: 147, dp: 0 },
    ),
    'Kidney Function Test': panel(
        { label: 'Blood Urea', unit: 'mg/dL', low: 15, high: 40, dp: 0 },
        { label: 'Creatinine', unit: 'mg/dL', low: 0.6, high: 1.3, dp: 2 },
        { label: 'Uric Acid', unit: 'mg/dL', low: 3.5, high: 7.2, dp: 1 },
    ),
    'Thyroid Profile (T3 T4 TSH)': panel(
        { label: 'T3', unit: 'pg/mL', low: 2.3, high: 4.2, dp: 2 },
        { label: 'T4', unit: 'ng/dL', low: 0.8, high: 1.8, dp: 2 },
        { label: 'TSH', unit: 'µIU/mL', low: 0.4, high: 4.0, dp: 2, spread: 1.4 },
    ),
    'Serum Electrolytes': panel(
        { label: 'Sodium', unit: 'mEq/L', low: 136, high: 145, dp: 0 },
        { label: 'Potassium', unit: 'mEq/L', low: 3.5, high: 5.0, dp: 1 },
        { label: 'Chloride', unit: 'mEq/L', low: 98, high: 106, dp: 0 },
    ),
    'C-Reactive Protein': panel(
        { label: 'CRP', unit: 'mg/L', low: 0.3, high: 6.0, dp: 1, spread: 2.5, highOnly: true },
    ),
    // Descriptive reports — no numeric panel, so these vary by wording instead.
    'Urine Routine & Microscopy': () => {
        const albumin = weightedPick([[8, 'Nil'], [2, 'Trace'], [1, '1+']]);
        const pus = Math.random() < 0.75 ? `${rint(0, 4)}` : `${rint(6, 18)}`;
        return `Colour pale yellow, clear. Albumin ${albumin}, Sugar Nil, `
            + `Pus cells ${pus}/hpf [0–5], Epithelial cells ${rint(1, 6)}/hpf, RBC ${Math.random() < 0.88 ? 'Nil' : `${rint(2, 8)}/hpf`}`;
    },
    'Chest X-Ray PA View': () => weightedPick([
        [70, 'Both lung fields clear. No focal consolidation. Cardiac silhouette within normal limits. CP angles clear.'],
        [10, 'Mild bronchovascular prominence in bilateral lower zones. No consolidation.'],
        [7, 'Ill-defined opacity in right lower zone — suggest clinical correlation.'],
        [7, 'Hyperinflated lung fields with flattened diaphragm.'],
        [6, 'Cardiomegaly noted, CT ratio increased. Suggest echocardiography.'],
    ]),
    'Dengue NS1 Antigen': () => weightedPick([[82, 'Non-reactive'], [18, 'Reactive']]),
    'Widal Test': () => weightedPick([
        [78, 'S. typhi O <1:40, H <1:40 — Non-significant'],
        [12, 'S. typhi O 1:80, H 1:160 — Significant titre'],
        [10, 'S. typhi O 1:160, H 1:320 — Significant titre'],
    ]),
    'Malaria Rapid Test': () => weightedPick([[90, 'Negative for P. vivax and P. falciparum'], [10, 'Positive for P. vivax']]),
    'ESR': panel({ label: 'ESR', unit: 'mm/hr', low: 0, high: 20, dp: 0, spread: 2.0, highOnly: true }),

    // Single-analyte tests that hospitals often list separately rather than as a panel.
    'Blood Urea': panel({ label: 'Blood Urea', unit: 'mg/dL', low: 15, high: 40, dp: 0 }),
    'Serum Creatinine': panel({ label: 'Creatinine', unit: 'mg/dL', low: 0.6, high: 1.3, dp: 2 }),
    'Serum Uric Acid': panel({ label: 'Uric Acid', unit: 'mg/dL', low: 3.5, high: 7.2, dp: 1 }),
    'Haemoglobin': panel({ label: 'Hb', unit: 'g/dL', low: 12.0, high: 16.5, dp: 1 }),
    'Serum Bilirubin': panel({ label: 'Total Bilirubin', unit: 'mg/dL', low: 0.1, high: 1.2, dp: 2 }),
    'ABO & Rh Typing': () => weightedPick([
        [32, 'Blood Group O Positive'], [25, 'Blood Group B Positive'],
        [21, 'Blood Group A Positive'], [8, 'Blood Group AB Positive'],
        [5, 'Blood Group O Negative'], [4, 'Blood Group B Negative'],
        [3, 'Blood Group A Negative'], [2, 'Blood Group AB Negative'],
    ]),
    'ASO Titre': () => weightedPick([[80, 'ASO Titre <200 IU/mL — Non-significant'], [20, 'ASO Titre 400 IU/mL — Significant']]),
    'Absolute Eosinophil Count': panel({ label: 'AEC', unit: '/µL', low: 40, high: 440, dp: 0, spread: 1.6 }),
    'Bleeding Time / Clotting Time': () => `BT ${rint(1, 4)} min ${rint(0, 59)} sec [1–6 min], CT ${rint(4, 9)} min ${rint(0, 59)} sec [4–10 min]`,
};

// ---------------------------------------------------------------------------
// Matching a hospital's own test names to a result template
// ---------------------------------------------------------------------------

/**
 * Hospitals name the same test differently — "CBC (Complete Blood Count)",
 * "Complete Blood Count", "C.B.C.", "Blood Sugar (Random)". Keying templates on an exact
 * name meant a cloned hospital's tests all fell through to a blank result, which is
 * exactly what a real lab report never looks like.
 *
 * Fragments are checked longest-first so "fasting blood sugar" is not swallowed by
 * "blood sugar".
 */
const TEST_ALIASES: readonly (readonly [string, string])[] = [
    ['fasting blood sugar', 'Fasting Blood Sugar'], ['blood sugar fasting', 'Fasting Blood Sugar'],
    ['fbs', 'Fasting Blood Sugar'], ['random blood sugar', 'Random Blood Sugar'],
    ['blood sugar random', 'Random Blood Sugar'], ['rbs', 'Random Blood Sugar'],
    ['blood sugar', 'Random Blood Sugar'], ['glucose', 'Random Blood Sugar'],
    ['complete blood count', 'Complete Blood Count'], ['cbc', 'Complete Blood Count'],
    ['haemogram', 'Complete Blood Count'], ['hemogram', 'Complete Blood Count'],
    ['liver function', 'Liver Function Test'], ['lft', 'Liver Function Test'],
    ['kidney function', 'Kidney Function Test'], ['renal function', 'Kidney Function Test'],
    ['kft', 'Kidney Function Test'], ['rft', 'Kidney Function Test'],
    ['thyroid', 'Thyroid Profile (T3 T4 TSH)'], ['tsh', 'Thyroid Profile (T3 T4 TSH)'],
    ['lipid', 'Lipid Profile'], ['cholesterol', 'Lipid Profile'],
    ['hba1c', 'HbA1c'], ['glycosylated', 'HbA1c'],
    ['electrolyte', 'Serum Electrolytes'], ['sodium', 'Serum Electrolytes'],
    ['c-reactive', 'C-Reactive Protein'], ['crp', 'C-Reactive Protein'],
    ['urine routine', 'Urine Routine & Microscopy'], ['urine', 'Urine Routine & Microscopy'],
    ['chest x-ray', 'Chest X-Ray PA View'], ['x-ray chest', 'Chest X-Ray PA View'],
    ['dengue', 'Dengue NS1 Antigen'], ['widal', 'Widal Test'], ['typhoid', 'Widal Test'],
    ['malaria', 'Malaria Rapid Test'], ['esr', 'ESR'], ['sedimentation', 'ESR'],
    ['blood urea', 'Blood Urea'], ['urea', 'Blood Urea'],
    ['creatinine', 'Serum Creatinine'], ['uric acid', 'Serum Uric Acid'],
    ['haemoglobin', 'Haemoglobin'], ['hemoglobin', 'Haemoglobin'], ['bilirubin', 'Serum Bilirubin'],
    ['blood group', 'ABO & Rh Typing'], ['abo', 'ABO & Rh Typing'], ['rh typing', 'ABO & Rh Typing'],
    ['aso', 'ASO Titre'], ['eosinophil', 'Absolute Eosinophil Count'], ['aec', 'Absolute Eosinophil Count'],
    ['bleeding time', 'Bleeding Time / Clotting Time'], ['bt/ct', 'Bleeding Time / Clotting Time'],
];

const ALIASES_BY_LENGTH = [...TEST_ALIASES].sort((a, b) => b[0].length - a[0].length);

const normaliseTestName = (name: string) =>
    name.toLowerCase().replace(/[().,_-]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Result text for a test, whatever the hospital happens to call it.
 *
 * Unrecognised tests get a plausible descriptive line rather than nothing — a cloned
 * hospital may have hundreds of tests we have no template for, and a blank result column
 * looks broken in a way "Within normal limits" does not.
 */
export function resultForTest(testName: string): string {
    const direct = RESULT_TEMPLATES[testName];
    if (direct) return direct();

    const norm = normaliseTestName(testName);
    for (const [fragment, key] of ALIASES_BY_LENGTH) {
        if (norm.includes(fragment)) return RESULT_TEMPLATES[key]();
    }
    return weightedPick([
        [70, 'Within normal limits.'],
        [12, 'No significant abnormality detected.'],
        [10, 'Mild abnormality noted — suggest clinical correlation.'],
        [8, 'Sample adequate. Results within expected reference range.'],
    ]);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const rint = (min: number, max: number) => Math.floor(rand(min, max + 1));
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
            simulation_use_master_data: true,
            simulation_complaint_style: true,
            simulation_department_mode: true,
            simulation_workstation_ips: true,
        },
    });

    if (!config?.activity_generator_enabled) {
        return { ...EMPTY, reason: 'disabled in organization config' };
    }

    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { code: true } });
    const orgCode = org?.code || 'HOS';
    const tz = config.timezone || 'Asia/Kolkata';
    const complaintStyle = config.simulation_complaint_style || 'general';
    // Per-simulation workstation addresses, matching the source hospital's own network
    // pattern. Null for a blank simulation, where the generated default applies.
    const workstations = (config.simulation_workstation_ips as Record<string, string> | null) ?? null;

    // Pull any master-data changes made in the real hospital. Costs one timestamp
    // comparison on the ticks where nothing is due, which is all but one a day.
    const synced = await syncMasterDataIfDue(orgId, now);
    if (synced) {
        const changed = Object.entries(synced)
            .filter(([, v]) => v.created || v.updated || v.retired)
            .map(([table, v]) => `${table} +${v.created} ~${v.updated} -${v.retired}`);
        console.log(`[sim-tick] master data synced for ${orgId}: ${changed.join(', ') || 'no changes'}`);
    }
    const intensity = INTENSITY_MULTIPLIER[config.activity_generator_intensity] ?? 1.0;
    const db = getTenantPrisma(orgId);

    const result: TickResult = { ...EMPTY, ran: true };

    // Doctors on staff — every visit, lab order and indent is attributed to one, so a
    // record never shows a dangling reference under a close-up.
    // Idle roles are dropped before anything else sees the roster, so they cannot clock
    // in, cannot be picked as a stand-in, and never appear in the audit trail.
    const staff = (await loadStaff(orgId)).filter(s => !IDLE_ROLES.has(s.role));
    const doctors = staff.filter(s => s.role === 'doctor');
    if (!doctors.length) return { ...EMPTY, reason: 'no active doctors in this organization' };

    // Reconcile the roster against the audit log first, so anyone attributed to an
    // action below is already recorded as logged in at this moment.
    const sessions = await syncStaffSessions(orgId, staff, now, tz, workstations);
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

    // Only doctors actually on shift can be given patients.
    //
    // Previously any active doctor could be assigned, which meant a consultation could be
    // recorded against someone who had gone home — the completion audit row uses the
    // assigned doctor directly rather than the on-duty picker every other role goes
    // through, so it was the one place the "never attributed to somebody off shift" rule
    // did not hold.
    const onDutyDoctors = doctors.filter(d => isOnDuty(d, now, tz));

    // Registration needs BOTH a doctor to see the patient and someone at the counter to
    // register them. No doctor means the clinic is not running; no receptionist means
    // there is nobody to do the registering. The hourly curve already makes overnight
    // arrivals rare — this stops the last few appearing with the front desk unstaffed.
    const registrar = actorOnDuty(staff, 'receptionist', now, tz);
    if (!onDutyDoctors.length || !registrar) arrivals = 0;

    for (let i = 0; i < arrivals; i++) {
        const doctor = pick(onDutyDoctors);
        // A hospital may run without departments at all — Axten Nulife has twelve doctors
        // and zero department records. The doctor's own specialty stands in, and where
        // even that is blank the field is left EMPTY rather than filled with an invented
        // "General Medicine" the hospital does not have.
        const department = doctor.specialty?.trim() || null;
        // Seed from the running total so a person is reproducible from DB state.
        const totalSoFar = await db.oPD_REG.count();
        const person = castPerson(totalSoFar + i + 1);

        const patientId = await createWithUniqueRetry(async () => {
            const patientId = await generateUHID(db, config.uhid_prefix || 'AVN');
            // Deliberately narrow: identity, age and the department only.
            //
            // castPerson() still generates a phone, address, blood group, Aadhaar, ABHA
            // and next-of-kin — those are simply not written. Keeping the generator whole
            // means re-adding a field here is one line, and cast.ts's checksum guarantees
            // stay covered by its own self-check.
            //
            // Consequences, so they are not a surprise on screen: phone, address, blood
            // group and emergency contact render blank, and patient_type falls back to
            // the column default 'cash'.
            await db.oPD_REG.create({
                data: {
                    patient_id: patientId,
                    full_name: person.full_name,
                    gender: person.gender,
                    age: person.age,
                    date_of_birth: person.date_of_birth,
                    department,
                    // Set explicitly: the column defaults to false, which would show every
                    // patient as not having consented to registration.
                    registration_consent: true,
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
                    reason_for_visit: reasonFor(department, complaintStyle),
                    // Every visit is a walk-in. The app also recognises phone, online,
                    // whatsapp, referral and call_center, so any report broken down by
                    // channel will show a single bar.
                    booking_channel: 'walk_in',
                    queue_token: registeredToday + i + 1,
                    appointment_date: new Date(now.getTime() - Math.floor(rand(0, elapsedMinutes * 60_000))),
                } as any,
            });
            return patientId;
        });

        await logSimAudit({
            organizationId: orgId,
            workstations,
            actor: registrar,
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

    // Consultation fees by department, fetched once rather than per appointment. A
    // simulation set to "no departments" simply returns none and falls back to the
    // doctor's own rate.
    const departments: { name: string; base_consultation_fee: number }[] =
        await db.department.findMany({ where: { is_active: true }, select: { name: true, base_consultation_fee: true } });

    // Per-doctor rates from Doctor Master, keyed by id for the fee lookup below.
    const doctorFees = new Map(
        (await prisma.user.findMany({
            where: { organizationId: orgId, role: 'doctor', is_active: true },
            select: { id: true, consultation_fee: true, follow_up_fee: true },
        })).map(d => [d.id, d]),
    );
    /**
     * Consultation fee for one visit.
     *
     * The department's base fee is the list price, but a counter does not charge every
     * patient the same amount: roughly a quarter of OPD footfall is a follow-up within
     * the free/reduced window, which Indian private hospitals typically bill at 40–50%
     * of a new consultation. Charging one flat figure to every patient made the whole
     * day's collection a single number repeated down the page.
     */
    const feeFor = (dept: string | null, doctorId: string | null): { fee: number; isFollowUp: boolean } => {
        // The doctor's own fee wins. A cloned hospital sets consultation_fee per doctor in
        // Doctor Master, and reading only the department rate threw that away — every
        // consultant billed the same amount regardless of what their record said. Falls
        // back to the department rate, then to a flat default, so a simulation running
        // with no departments at all still bills something sensible.
        const doctor = doctorId ? doctorFees.get(doctorId) : undefined;
        const departmentRate = departments.find(d => d.name === dept)?.base_consultation_fee;
        const base = doctor?.consultation_fee || departmentRate || 600;
        const isFollowUp = Math.random() < 0.26;
        if (!isFollowUp) return { fee: base, isFollowUp };
        // The doctor's own follow-up rate when set, otherwise 40–50% of the new-visit fee
        // rounded to the nearest ₹50, the way a real tariff card is written.
        const followUp = doctor?.follow_up_fee || Math.round((base * rand(0.4, 0.5)) / 50) * 50;
        return { fee: followUp, isFollowUp };
    };

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

        if (!GENERATE.opdBilling) continue;

        // The OPD consultation fee is collected at the counter on check-in, so the
        // receipt and the check-in timestamp agree. The cashier must be on duty at the
        // moment the audit row claims, not merely at the moment the tick runs.
        const cashier = actorOnDuty(staff, 'receptionist', now, tz);
        if (!cashier) continue;
        const { fee, isFollowUp } = feeFor(appt.department, appt.doctor_id);
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
                    // invoice_items.department is NOT NULL, so a hospital without
                    // departments gets the neutral "OPD" rather than a specialty invented
                    // for it. The line description simply drops the suffix.
                    department: appt.department || 'OPD',
                    description: `${isFollowUp ? 'Follow-up consultation' : 'Consultation'}`
                        + (appt.department ? ` — ${appt.department}` : ''),
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
            organizationId: orgId, workstations, actor: cashier,
            action: 'RECORD_PAYMENT', module: 'billing',
            entityType: 'invoice', entityId: appt.patient_id,
            details: `OPD consultation fee collected — Rs ${fee}`,
            at: now,
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

        const doctorId = appt.doctor_id || doctors[0].id;
        const consultingDoctor = doctors.find(d => d.id === doctorId) ?? doctors[0];

        // The consultation is completed by the assigned doctor, so it can only complete
        // while that doctor is actually in clinic. If they have gone home the patient is
        // still waiting, and the visit finishes when the doctor is next on shift.
        if (!isOnDuty(consultingDoctor, now, tz)) continue;

        await db.appointments.update({ where: { id: appt.id }, data: { status: 'Completed' } });
        result.consultCompleted++;

        await logSimAudit({
            organizationId: orgId, workstations, actor: consultingDoctor,
            action: 'COMPLETE_CONSULTATION', module: 'doctor',
            entityType: 'appointment', entityId: appt.patient_id,
            details: 'Consultation completed', at: now,
        });

        // ── Admission ────────────────────────────────────────────────────────
        // Only admits if a bed is genuinely free; the bed is flipped to Occupied in the
        // same step so two admissions can never claim it.
        //
        // Insured patients are admitted more readily — planned and elective admissions
        // skew heavily towards people with cover. That is realistic on its own, and it
        // also keeps the TPA pipeline fed: at a flat rate, insured-AND-admitted is ~1% of
        // arrivals, so whether the claims screens had any data at all came down to luck.
        const insured = GENERATE.ipd
            ? await db.oPD_REG.findFirst({
                where: { patient_id: appt.patient_id }, select: { patient_type: true },
            })
            : null;
        const admitChance = insured?.patient_type === 'tpa_insurance'
            ? P_ADMIT_AFTER_CONSULT * 2.6
            : P_ADMIT_AFTER_CONSULT;
        if (GENERATE.ipd && Math.random() < admitChance) {
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
                        organizationId: orgId, workstations, actor: admittedBy,
                        action: 'ADMIT_PATIENT', module: 'ipd',
                        entityType: 'admission', entityId: admissionId,
                        details: `Admitted to ${freeBed.bed_name || freeBed.bed_id}`,
                        at: new Date(due),
                    });
                });
                result.admitted++;
            }
        }

        if (GENERATE.lab && labMenu.length && Math.random() < P_LAB_AFTER_CONSULT) {
            const tests = Math.random() < 0.3 ? 2 : 1;
            for (let t = 0; t < tests; t++) {
                // Chosen outside the retry so the audit line names the same test that was
                // written, and so a P2002 retry cannot silently order a different one.
                const testName = pick(labMenu).test_name;
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
                            test_type: testName,
                            status: 'Pending',
                            created_at: new Date(due),
                        } as any,
                    });
                });
                result.labOrdered++;

                // The ordering itself is now logged. Previously only the result upload
                // appeared, so the audit trail showed a technician releasing a test
                // nobody was recorded as having asked for.
                await logSimAudit({
                    organizationId: orgId, workstations, actor: consultingDoctor,
                    action: 'ORDER_LAB_TEST', module: 'lab',
                    entityType: 'patient', entityId: appt.patient_id,
                    details: `Ordered ${testName}`, at: now,
                });
            }
        }

        if (GENERATE.pharmacy && medicines.length && Math.random() < P_PHARMACY_AFTER_CONSULT) {
            // Captured from inside the retry so the audit line lists exactly what was
            // written, not a second roll of the dice.
            let prescribed: string[] = [];
            await createWithUniqueRetry(async () => {
                const indentNumber = await generateIndentNumber(orgId, db);
                // Quantities are decided before the total so the header amount is the sum
                // of the line items. A header that disagrees with its own lines is the
                // first thing that looks wrong when a bill is held up to camera.
                const chosen = composePrescription(medicines).map(medicine => {
                    const quantity = rint(1, 3);
                    return { medicine, quantity, lineTotal: (medicine.selling_price || 0) * quantity };
                });
                const total = chosen.reduce((s, line) => s + line.lineTotal, 0);

                const order = await db.pharmacy_orders.create({
                    data: {
                        indent_number: indentNumber,
                        patient_id: appt.patient_id,
                        doctor_id: doctorId,
                        // The pharmacy queue prints `requested_by_name || doctor_id`, and
                        // doctor_id is a UUID in real hospital data too — leaving this null
                        // put a raw UUID in the Doctor column of every row on screen.
                        requested_by_name: consultingDoctor.name,
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
                prescribed = chosen.map(line => line.medicine.brand_name);
            });
            result.indentsRaised++;

            await logSimAudit({
                organizationId: orgId, workstations, actor: consultingDoctor,
                action: 'PRESCRIBE_MEDICATION', module: 'Pharmacy',
                entityType: 'patient', entityId: appt.patient_id,
                details: `Prescribed ${prescribed.length} item(s): ${prescribed.join(', ')}`,
                at: now,
            });
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
        select: { id: true, created_at: true, test_type: true, barcode: true },
    });
    for (const order of labProcessing) {
        const due = new Date(order.created_at).getTime()
            + jitteredDwellMs(DWELL_MINUTES.labOrderedToProcessing + DWELL_MINUTES.labProcessingToCompleted);
        if (now.getTime() < due) continue;
        // The result is released by whoever is in the lab NOW, and stamped now. Choosing
        // the technician for the tick time but stamping the row at the due time put
        // results in the log at 19:15 signed by someone whose shift ended at 17:00.
        const technician = actorOnDuty(staff, 'lab_technician', now, tz);
        if (!technician) continue; // lab closed — the sample waits until it reopens
        const isCritical = Math.random() < P_CRITICAL_RESULT;
        await db.lab_orders.update({
            where: { id: order.id },
            data: {
                status: 'Completed',
                // Alias-aware: a cloned hospital names its tests however it likes
                // ("CBC (Complete Blood Count)"), and an exact-key lookup left every one
                // of them blank.
                result_value: resultForTest(order.test_type),
                is_critical: isCritical,
                assigned_technician_id: technician.username,
                ...(isCritical ? { critical_notified_at: now } : {}),
            },
        });
        result.labCompleted++;

        // Mirrors the stamp uploadResult() writes. The lab dashboard's average
        // turnaround time is measured off this row, so without it every generated
        // result left "Average TAT (Today): 0 minutes" on screen.
        const tracked = await db.labSampleTracking.findUnique({ where: { barcode: order.barcode } });
        if (tracked) {
            await db.labSampleTracking.update({
                where: { barcode: order.barcode },
                data: { status: 'Completed', completed_at: now },
            });
        } else {
            await db.labSampleTracking.create({
                data: { barcode: order.barcode, status: 'Completed', collected_at: order.created_at, completed_at: now },
            });
        }

        await logSimAudit({
            organizationId: orgId, workstations, actor: technician,
            action: isCritical ? 'CRITICAL_RESULT_NOTIFIED' : 'UPLOAD_RESULT',
            module: 'lab',
            entityType: 'lab_order', entityId: String(order.id),
            details: `${order.test_type} resulted${isCritical ? ' — critical value flagged' : ''}`,
            at: now,
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
        // Nobody dispenses from a closed counter — the prescription waits.
        const dispenser = actorOnDuty(staff, 'pharmacist', now, tz);
        if (!dispenser) continue;

        await db.pharmacy_orders.update({
            where: { id: order.id },
            data: { status: 'Completed', items_dispensed: order.total_items_requested ?? 0, items_missing: 0 },
        });
        result.indentsDispensed++;

        await logSimAudit({
            organizationId: orgId, workstations, actor: dispenser,
            action: 'DISPENSE_MEDICATION', module: 'Pharmacy',
            entityType: 'pharmacy_order', entityId: String(order.id),
            details: `Dispensed ${order.total_items_requested ?? 0} item(s)`, at: now,
        });
    }

    // ── Ward care ────────────────────────────────────────────────────────────
    // Runs BEFORE discharge, deliberately. Ward care only looks at admissions still in
    // 'Admitted', so discharging first would mean a patient who arrived and left within
    // one tick was never observed, never medicated and never charted — leaving a
    // discharge summary attached to an empty record.
    if (GENERATE.ipd) {
        const ward = await runWardCare(db, orgId, staff, doctors, now, tz);
        Object.assign(result, ward);
    }

    // ── Discharge ────────────────────────────────────────────────────────────
    // Summary, final bill, payment and bed release happen as one sequence, the way a
    // real discharge does — a discharged admission with no bill, or a freed bed with no
    // discharge summary, is the kind of gap that shows up immediately on a ward board.

    const wards: { ward_id: number; ward_name: string; cost_per_day: number | null; nursing_charge: number | null }[] =
        GENERATE.ipd
            ? await db.wards.findMany({ select: { ward_id: true, ward_name: true, cost_per_day: true, nursing_charge: true } })
            : [];

    const admitted = !GENERATE.ipd ? [] : await db.admissions.findMany({
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
            organizationId: orgId, workstations, actor: attending,
            action: 'DISCHARGE_PATIENT', module: 'discharge',
            entityType: 'admission', entityId: adm.admission_id,
            details: `Discharged after ${days} day(s). Final bill Rs ${netAmount}`,
            at: dischargeAt,
        });
        result.discharged++;
    }

    // ── Bed turnaround ───────────────────────────────────────────────────────
    // Still runs when IPD is off, so any bed left mid-clean by an earlier run is
    // released rather than stranded in Cleaning forever.
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
            organizationId: orgId, workstations, actor: actor('nurse'),
            action: 'BED_MARKED_AVAILABLE', module: 'ipd',
            entityType: 'bed', entityId: bed.bed_id,
            details: 'Terminal cleaning completed', at: new Date(due),
        });
    }

    // ── Back office ──────────────────────────────────────────────────────────
    // Runs last: deposits, claims and ledger postings all reference admissions and
    // invoices created earlier in this same tick.
    if (GENERATE.backOffice) {
        const backOffice = await runBackOffice(db, orgId, staff, now, tz);
        Object.assign(result, backOffice);
    }

    return result;
}
