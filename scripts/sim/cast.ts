/**
 * Identity generation for the background activity generator.
 *
 * Generated people must render as completely ordinary patient records — no naming
 * convention, no prefix, nothing that reads as placeholder at any resolution a camera
 * can resolve. They must also be *unclaimable*: no generated identifier may collide
 * with a real person's.
 *
 * Those two goals only appear to conflict. Authenticity is a property of how a value
 * renders; collision-safety is a property of the value itself. A national ID that
 * fails its checksum is pixel-identical to one that passes, so we get both:
 *
 *   - Aadhaar / ABHA  — structurally correct (length, leading digit, grouping) but
 *                       deliberately failing the Verhoeff check digit, so the number
 *                       cannot belong to anyone and fails any real verification.
 *   - Phone           — passes every validation regex in the app; block is
 *                       configurable pending legal clearance (see PHONE_BLOCK).
 *
 * Generation is seeded and deterministic: the same seed yields the same person, so a
 * take can be reproduced exactly.
 */

// ---------------------------------------------------------------------------
// Verhoeff check digit (the Aadhaar / ABHA scheme)
// ---------------------------------------------------------------------------

// Multiplication table for the dihedral group D5.
const D: readonly (readonly number[])[] = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

// Permutation table, applied by position.
const P: readonly (readonly number[])[] = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

// Multiplicative inverse in D5.
const INV: readonly number[] = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** Correct Verhoeff check digit for a payload that does not yet include one. */
export function verhoeffCheckDigit(payload: readonly number[]): number {
    let c = 0;
    for (let i = payload.length - 1, pos = 1; i >= 0; i--, pos++) {
        c = D[c][P[pos % 8][payload[i]]];
    }
    return INV[c];
}

/** True when a complete number (payload + trailing check digit) satisfies Verhoeff. */
export function verhoeffValid(full: readonly number[]): boolean {
    let c = 0;
    for (let i = full.length - 1, pos = 0; i >= 0; i--, pos++) {
        c = D[c][P[pos % 8][full[i]]];
    }
    return c === 0;
}

// ---------------------------------------------------------------------------
// Deterministic PRNG — seeded so a take can be reproduced exactly
// ---------------------------------------------------------------------------

/** mulberry32. Small, fast, good enough for casting; not for anything security-bearing. */
function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const rint = (r: () => number, min: number, max: number) => min + Math.floor(r() * (max - min + 1));

// ---------------------------------------------------------------------------
// Identifier casting
// ---------------------------------------------------------------------------

/**
 * A 12-digit Aadhaar-shaped number that DELIBERATELY fails its Verhoeff check digit.
 *
 * Leading digit is 2–9, matching real issuance, so it looks correct on screen and in
 * print. The check digit is set to a value other than the correct one, which makes the
 * number impossible to issue and guarantees it belongs to no one.
 */
export function castAadhaar(r: () => number): string {
    const payload = [rint(r, 2, 9), ...Array.from({ length: 10 }, () => rint(r, 0, 9))];
    const correct = verhoeffCheckDigit(payload);
    // Any digit but the correct one. Offset by 1–9 mod 10 so it can never land back on it.
    const wrong = (correct + rint(r, 1, 9)) % 10;
    return [...payload, wrong].join('');
}

/**
 * A 14-digit ABHA-shaped number, same Verhoeff treatment as Aadhaar.
 * `grouped` renders it in the familiar xx-xxxx-xxxx-xxxx form for display fields.
 */
export function castAbha(r: () => number, grouped = true): string {
    const payload = Array.from({ length: 13 }, () => rint(r, 0, 9));
    const correct = verhoeffCheckDigit(payload);
    const wrong = (correct + rint(r, 1, 9)) % 10;
    const digits = [...payload, wrong].join('');
    return grouped
        ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}`
        : digits;
}

/**
 * Ten-digit Indian mobile number, leading 6–9, so every validation regex in the app
 * accepts it.
 *
 * India has no reserved fictional-drama range equivalent to the North American 555
 * block, and there is no public register that would let this repo certify a prefix as
 * permanently unallocated. Blocks are therefore a named constant, overridable via
 * SIM_PHONE_BLOCK (comma-separated), so clearing ranges with legal is a one-value
 * change rather than a code change.
 *
 * Several blocks rather than one: a patient list where every phone shares the same
 * four leading digits reads as generated the moment more than a couple are on screen
 * together.
 *
 * ponytail: default blocks are arbitrary and NOT legally cleared. Any number that
 * appears legibly on camera must be cleared by the production's legal team, or replaced
 * with a number the production controls, before the shoot.
 */
export const PHONE_BLOCKS: readonly string[] = (
    process.env.SIM_PHONE_BLOCK?.trim() || '7000,7011,8025,9013,6291,9740'
)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

export function castPhone(r: () => number): string {
    const invalid = PHONE_BLOCKS.filter(b => !/^[6-9]\d{3}$/.test(b));
    if (invalid.length || !PHONE_BLOCKS.length) {
        throw new Error(
            `SIM_PHONE_BLOCK entries must be 4 digits starting 6-9 (bad: ${invalid.join(', ') || '<empty>'}). ` +
            'A number outside that range fails the app\'s own phone validation.',
        );
    }
    return pick(r, PHONE_BLOCKS) + Array.from({ length: 6 }, () => rint(r, 0, 9)).join('');
}

// ---------------------------------------------------------------------------
// Person casting
// ---------------------------------------------------------------------------

// Pools mirror scripts/seed-demo-org.ts so generated people sit naturally alongside
// existing demo records. Cleared-for-broadcast review is a Phase 1 item.
const MALE_FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Reyansh', 'Ishaan', 'Rohan', 'Kabir', 'Rajesh', 'Suresh', 'Amit', 'Vikram', 'Sanjay', 'Deepak', 'Manoj', 'Anil', 'Farhan', 'Imran', 'Rahul', 'Karan', 'Nikhil', 'Varun', 'Harsh'] as const;
const FEMALE_FIRST = ['Ananya', 'Diya', 'Aadhya', 'Saanvi', 'Riya', 'Ishita', 'Meera', 'Kavya', 'Neha', 'Pooja', 'Sunita', 'Rekha', 'Kavita', 'Priya', 'Anjali', 'Shalini', 'Nisha', 'Ritu', 'Geeta', 'Seema', 'Zoya', 'Ayesha', 'Tanvi', 'Sneha', 'Divya'] as const;
const LAST = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Joshi', 'Mehta', 'Chauhan', 'Yadav', 'Mishra', 'Pandey', 'Agarwal', 'Bansal', 'Malhotra', 'Kapoor', 'Rao'] as const;
const AREAS = ['Sector 14, Gurugram', 'Rohini, Delhi', 'Andheri, Mumbai', 'Koramangala, Bengaluru', 'Salt Lake, Kolkata', 'Banjara Hills, Hyderabad', 'Aundh, Pune', 'Adyar, Chennai'] as const;
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] as const;

/**
 * Emergency contact relations, each carrying the kin's gender and the patient age band
 * the relation is plausible for. A male "Mother", or a 12-year-old whose next of kin is
 * their "Son", is exactly the incoherence a demographics close-up catches.
 */
const KIN: readonly { relation: string; gender: 'Male' | 'Female'; min: number; max: number }[] = [
    { relation: 'Father', gender: 'Male', min: 0, max: 60 },
    { relation: 'Mother', gender: 'Female', min: 0, max: 60 },
    { relation: 'Brother', gender: 'Male', min: 5, max: 89 },
    { relation: 'Sister', gender: 'Female', min: 5, max: 89 },
    { relation: 'Spouse', gender: 'Male', min: 21, max: 89 },
    { relation: 'Spouse', gender: 'Female', min: 21, max: 89 },
    { relation: 'Son', gender: 'Male', min: 40, max: 89 },
    { relation: 'Daughter', gender: 'Female', min: 40, max: 89 },
];

export interface CastPerson {
    full_name: string;
    gender: 'Male' | 'Female';
    age: string;
    date_of_birth: string;
    phone: string;
    address: string;
    blood_group: string;
    aadhar_card: string;
    abha_number: string;
    emergency_contact_name: string;
    emergency_contact_phone: string;
    emergency_contact_relation: string;
}

/**
 * Cast one person. Field names and shapes map straight onto OPD_REG columns.
 *
 * `date_of_birth` is DD/MM/YYYY (the app's default date_format) and is derived with
 * UTC arithmetic — never local-time parsing, which would shift the date across the
 * IST/UTC boundary between a dev box and the deploy host.
 */
export function castPerson(seed: number): CastPerson {
    const r = rng(seed);
    const gender = r() < 0.5 ? 'Male' : 'Female';
    const first = pick(r, gender === 'Male' ? MALE_FIRST : FEMALE_FIRST);
    const surname = pick(r, LAST);
    const age = rint(r, 1, 89);

    const now = new Date();
    const dob = new Date(Date.UTC(now.getUTCFullYear() - age, rint(r, 0, 11), rint(r, 1, 28)));
    const pad = (n: number) => String(n).padStart(2, '0');

    // Kin relation is chosen first, then the name is drawn to match its gender — so the
    // pairing is coherent under a close-up rather than merely populated.
    const kin = pick(r, KIN.filter(k => age >= k.min && age <= k.max));
    const kinFirst = pick(r, kin.gender === 'Male' ? MALE_FIRST : FEMALE_FIRST);

    return {
        full_name: `${first} ${surname}`,
        gender,
        age: String(age),
        date_of_birth: `${pad(dob.getUTCDate())}/${pad(dob.getUTCMonth() + 1)}/${dob.getUTCFullYear()}`,
        phone: castPhone(r),
        address: `${rint(r, 1, 240)}, ${pick(r, AREAS)}`,
        blood_group: pick(r, BLOOD),
        aadhar_card: castAadhaar(r),
        abha_number: castAbha(r),
        emergency_contact_name: `${kinFirst} ${surname}`,
        emergency_contact_phone: castPhone(r),
        emergency_contact_relation: kin.relation,
    };
}

// ---------------------------------------------------------------------------
// Self-check:  npx tsx scripts/sim/cast.ts
// ---------------------------------------------------------------------------

function selfCheck(): void {
    const assert = (cond: boolean, msg: string) => {
        if (!cond) throw new Error(`cast self-check failed: ${msg}`);
    };
    const toDigits = (s: string) => s.replace(/\D/g, '').split('').map(Number);

    // Verhoeff round-trip: a payload plus its correct check digit must validate.
    // Without this, "deliberately invalid" could silently mean "always invalid because
    // the implementation is wrong", and every generated ID would be invalid by accident.
    for (let i = 0; i < 500; i++) {
        const r = rng(i);
        const payload = Array.from({ length: 11 }, () => rint(r, 0, 9));
        assert(verhoeffValid([...payload, verhoeffCheckDigit(payload)]), `round-trip failed at seed ${i}`);
        assert(!verhoeffValid([...payload, (verhoeffCheckDigit(payload) + 1) % 10]), `false accept at seed ${i}`);
    }

    for (let seed = 0; seed < 500; seed++) {
        const p = castPerson(seed);

        assert(/^[2-9]\d{11}$/.test(p.aadhar_card), `aadhaar shape wrong at seed ${seed}: ${p.aadhar_card}`);
        assert(!verhoeffValid(toDigits(p.aadhar_card)), `aadhaar at seed ${seed} is checksum-VALID — could collide`);

        assert(/^\d{2}-\d{4}-\d{4}-\d{4}$/.test(p.abha_number), `abha shape wrong at seed ${seed}`);
        assert(!verhoeffValid(toDigits(p.abha_number)), `abha at seed ${seed} is checksum-VALID — could collide`);

        assert(/^[6-9]\d{9}$/.test(p.phone), `phone fails app validation at seed ${seed}: ${p.phone}`);
        assert(/^[6-9]\d{9}$/.test(p.emergency_contact_phone), `kin phone fails validation at seed ${seed}`);

        assert(/^\d{2}\/\d{2}\/\d{4}$/.test(p.date_of_birth), `dob format wrong at seed ${seed}`);
        assert(!/test|demo|sim|sample|dummy|fake/i.test(p.full_name), `name carries a marker at seed ${seed}`);

        // Kin coherence — the failure a demographics close-up would show.
        const kinFirst = p.emergency_contact_name.split(' ')[0];
        const kinIsMale = (MALE_FIRST as readonly string[]).includes(kinFirst);
        const expected = KIN.find(k => k.relation === p.emergency_contact_relation && k.gender === (kinIsMale ? 'Male' : 'Female'));
        assert(
            !!expected,
            `kin gender contradicts relation at seed ${seed}: ${kinFirst} as ${p.emergency_contact_relation}`,
        );
        const patientAge = Number(p.age);
        assert(
            patientAge >= expected!.min && patientAge <= expected!.max,
            `implausible kin at seed ${seed}: age ${patientAge} with ${p.emergency_contact_relation}`,
        );
    }

    // Phone blocks must actually vary, or a queue list reads as generated.
    const prefixes = new Set(Array.from({ length: 200 }, (_, i) => castPerson(i).phone.slice(0, 4)));
    assert(prefixes.size >= 3, `phone prefixes not varied enough (${prefixes.size} distinct)`);

    // Determinism — the same seed must reproduce the same person for a repeat take.
    assert(
        JSON.stringify(castPerson(42)) === JSON.stringify(castPerson(42)),
        'casting is not deterministic for a fixed seed',
    );
    assert(
        JSON.stringify(castPerson(42)) !== JSON.stringify(castPerson(43)),
        'different seeds produced identical people',
    );

    console.log('cast.ts self-check passed (1000 Verhoeff round-trips, 500 cast identities)');
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/sim/cast.ts')) selfCheck();
