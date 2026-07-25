/**
 * NEWS2 — National Early Warning Score 2 (Royal College of Physicians, 2017).
 *
 * Pure, dependency-free and deliberately NOT in a 'use server' module so it can
 * be imported by both server actions and client components, and unit-tested
 * directly. (It previously lived inside ipd-nursing-actions.ts, where exporting
 * it is illegal — every export of a 'use server' file must be an async action.)
 *
 * Reference chart:
 *   Respiration rate  <=8:3  9-11:1  12-20:0  21-24:2  >=25:3
 *   SpO2 (Scale 1)    <=91:3  92-93:2  94-95:1  >=96:0
 *   Air or oxygen     oxygen:2  air:0
 *   Systolic BP       <=90:3  91-100:2  101-110:1  111-219:0  >=220:3
 *   Pulse             <=40:3  41-50:1  51-90:0  91-110:1  111-130:2  >=131:3
 *   Consciousness     Alert:0  C/V/P/U:3
 *   Temperature (°C)  <=35.0:3  35.1-36.0:1  36.1-38.0:0  38.1-39.0:1  >=39.1:2
 *
 * Response thresholds:
 *   0            routine
 *   1-4          low
 *   3 in ANY single parameter -> low-medium, urgent review even if the total is low
 *   5-6          medium, urgent review
 *   >=7          high, emergency response
 */

export type NEWS2Input = {
    respiratory_rate?: number | null;
    spo2?: number | null;
    temperature?: number | null;
    bp_systolic?: number | null;
    heart_rate?: number | null;
    consciousness?: string | null;
    on_supplemental_oxygen?: boolean | null;
};

export type NEWS2Result = {
    /** Aggregate NEWS2 score. */
    score: number;
    /** Display band: Low | Medium | High | Critical. */
    level: string;
    /** Highest score contributed by any one parameter (3 triggers escalation alone). */
    maxSingleParam: number;
    /** Clinical response band, independent of the display colour. */
    response: 'routine' | 'urgent' | 'emergency';
    /** How many of the seven parameters were actually supplied. */
    parametersRecorded: number;
};

export function calcNEWS2(input: NEWS2Input): NEWS2Result {
    const {
        respiratory_rate, spo2, temperature, bp_systolic, heart_rate,
        consciousness, on_supplemental_oxygen,
    } = input;

    let score = 0;
    let maxSingleParam = 0;
    let parametersRecorded = 0;

    const add = (points: number) => {
        score += points;
        if (points > maxSingleParam) maxSingleParam = points;
        parametersRecorded++;
    };

    if (respiratory_rate != null) {
        if (respiratory_rate <= 8) add(3);
        else if (respiratory_rate <= 11) add(1);
        else if (respiratory_rate <= 20) add(0);
        else if (respiratory_rate <= 24) add(2);
        else add(3);
    }

    if (spo2 != null) {
        if (spo2 <= 91) add(3);
        else if (spo2 <= 93) add(2);
        else if (spo2 <= 95) add(1);
        else add(0);
    }

    // Air or oxygen. Omitting this scored an oxygen-dependent patient two points
    // below the chart, precisely where the score matters most.
    if (on_supplemental_oxygen) add(2);

    if (temperature != null) {
        if (temperature <= 35.0) add(3);
        else if (temperature <= 36.0) add(1);
        else if (temperature <= 38.0) add(0);
        else if (temperature <= 39.0) add(1);
        else add(2);
    }

    if (bp_systolic != null) {
        if (bp_systolic <= 90) add(3);
        else if (bp_systolic <= 100) add(2);
        else if (bp_systolic <= 110) add(1);
        else if (bp_systolic <= 219) add(0);
        else add(3);
    }

    if (heart_rate != null) {
        if (heart_rate <= 40) add(3);
        else if (heart_rate <= 50) add(1);
        else if (heart_rate <= 90) add(0);
        else if (heart_rate <= 110) add(1);
        else if (heart_rate <= 130) add(2);
        else add(3);
    }

    // ACVPU — anything other than Alert scores 3.
    if (consciousness) add(consciousness === 'Alert' ? 0 : 3);

    const response: NEWS2Result['response'] =
        score >= 7 ? 'emergency'
        : (score >= 5 || maxSingleParam >= 3) ? 'urgent'
        : 'routine';

    // "Critical" is a local band above the RCP's high-risk threshold, kept so the
    // existing badge colouring still has something to key on.
    const level =
        score >= 9 ? 'Critical'
        : score >= 7 ? 'High'
        : score >= 5 ? 'Medium'
        : maxSingleParam >= 3 ? 'Medium'
        : 'Low';

    return { score, level, maxSingleParam, response, parametersRecorded };
}

/** Human-readable action for a given result, used in alerts and banners. */
export function news2Guidance(r: NEWS2Result): string {
    if (r.response === 'emergency') {
        return `NEWS ${r.score} — emergency response. Continuous monitoring and immediate review by the treating doctor.`;
    }
    if (r.response === 'urgent') {
        return r.score >= 5
            ? `NEWS ${r.score} — urgent review by the treating doctor; increase observations to at least hourly.`
            : `NEWS ${r.score} with a single parameter scoring 3 — urgent review; increase observations to at least hourly.`;
    }
    return `NEWS ${r.score} — continue routine observations.`;
}
