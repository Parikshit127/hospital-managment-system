/**
 * Single implementation of the safety rules for giving a dose.
 *
 * The nurse portal (/nurse/medications) and the IPD eMAR (/ipd/medication-admin)
 * each had their own administerMedication action against the same table. They
 * drifted: a check added to one silently did not apply to the other, so a drug
 * the patient was allergic to could still be given from whichever screen had not
 * been updated. Both actions now call in here, so a rule is enforced once.
 *
 * Not a 'use server' module — it is called by server actions, which own the
 * session and the tenant-scoped client.
 */

/**
 * Administration times of day for each supported frequency.
 *
 * Lives here rather than beside the scheduler because that file is 'use server',
 * where every export must be an async action — a sync helper there fails to
 * compile and takes the whole module graph down with it.
 */
export function dosingHours(frequency: string): { hours: number[]; isPrn: boolean } {
    const f = (frequency || 'OD').toUpperCase();
    if (f === 'BD' || f === 'BID' || f === '1-0-1') return { hours: [9, 21], isPrn: false };
    if (f === 'TDS' || f === 'TID' || f === '1-1-1') return { hours: [9, 14, 21], isPrn: false };
    if (f === 'QID' || f === '1-1-1-1') return { hours: [9, 13, 17, 21], isPrn: false };
    if (f === 'Q6H' || f === 'QID6H') return { hours: [6, 12, 18, 24], isPrn: false };
    if (f === 'Q8H') return { hours: [6, 14, 22], isPrn: false };
    if (f === 'HS' || f === 'NOCTE') return { hours: [21], isPrn: false };
    if (f === 'PRN') return { hours: [9], isPrn: true };
    if (f === 'STAT') return { hours: [new Date().getHours()], isPrn: false };
    return { hours: [9], isPrn: false }; // OD and anything unrecognised
}

/** How far ahead the MAR is kept populated for an open-ended medication. */
export const MAR_HORIZON_DAYS = 14;

export type AllergyConflict = {
    allergen: string;
    severity: string | null;
    reaction: string | null;
};

/** Statuses meaning the dose did not reach the patient. All require a reason. */
export const DOSE_NOT_GIVEN = ['Held', 'Refused', 'Missed'] as const;

export function isNotGiven(status: string): boolean {
    return (DOSE_NOT_GIVEN as readonly string[]).includes(status);
}

/**
 * Does this scheduled dose collide with an allergy recorded for the patient?
 *
 * Substring match in both directions, plus a token match on words of four or
 * more characters. That catches "Penicillin" against "Penicillin V 250mg" and
 * "Amoxicillin (penicillin class)" against "Penicillin", which a plain equality
 * check would miss. Deliberately errs toward flagging: a false positive costs
 * one override with a typed reason, a false negative can kill someone.
 */
export async function findAllergyConflict(
    db: any,
    medId: number,
): Promise<AllergyConflict | null> {
    const med = await db.medicationAdministration.findUnique({
        where: { id: medId },
        select: { medication_name: true, admission_id: true },
    });
    if (!med?.medication_name) return null;

    const admission = await db.admissions.findUnique({
        where: { admission_id: med.admission_id },
        select: { patient_id: true },
    });
    if (!admission?.patient_id) return null;

    const allergies = await db.patientAllergy.findMany({
        where: { patient_id: admission.patient_id, status: 'active' },
        select: { allergen_name: true, severity: true, reaction: true },
    });
    if (!allergies.length) return null;

    const drug = String(med.medication_name).toLowerCase();
    const drugWords = drug.split(/[^a-z]+/i).filter((w: string) => w.length >= 4);

    for (const a of allergies) {
        const allergen = String(a.allergen_name || '').toLowerCase().trim();
        if (!allergen) continue;

        const allergenWords = allergen.split(/[^a-z]+/i).filter((w: string) => w.length >= 4);
        const hit =
            drug.includes(allergen) ||
            allergen.includes(drug) ||
            drugWords.some((w: string) => allergen.includes(w)) ||
            allergenWords.some((w: string) => drug.includes(w));

        if (hit) {
            return {
                allergen: a.allergen_name,
                severity: a.severity ?? null,
                reaction: a.reaction ?? null,
            };
        }
    }
    return null;
}

export function allergyBlockMessage(c: AllergyConflict): string {
    const parts = [`ALLERGY ALERT: this patient has a recorded allergy to "${c.allergen}"`];
    if (c.severity) parts.push(`(${c.severity}`);
    if (c.reaction) parts.push(`— ${c.reaction})`);
    else if (c.severity) parts.push(')');
    return `${parts.join(' ')}. Confirm with the prescriber. To proceed anyway, re-submit with an override reason.`;
}

export type AdministerInput = {
    med_id: number;
    status: 'Administered' | 'Missed' | 'Held' | 'Refused';
    notes?: string;
    not_given_reason?: string;
    witness_id?: string;
    allergy_override_reason?: string;
    pain_score_before?: number;
    pain_score_after?: number;
    prn_reason?: string;
};

export type AdministerOutcome =
    | { ok: false; error: string; allergyConflict?: AllergyConflict }
    | { ok: true; data: Record<string, unknown> };

/**
 * Apply one administration event. Callers supply the tenant-scoped client and the
 * authenticated user id — this never reads identity from its arguments.
 */
export async function applyAdministration(
    db: any,
    userId: string,
    input: AdministerInput,
): Promise<AdministerOutcome> {
    const notGiven = isNotGiven(input.status);

    // A dose that was not given must say why, or the record cannot be told apart
    // from a charting slip when it is read back months later.
    if (notGiven && !input.not_given_reason?.trim() && !input.notes?.trim()) {
        return { ok: false, error: `A reason is required when a dose is marked ${input.status}.` };
    }

    if (input.status === 'Administered' && !input.allergy_override_reason?.trim()) {
        const conflict = await findAllergyConflict(db, input.med_id);
        if (conflict) {
            return { ok: false, error: allergyBlockMessage(conflict), allergyConflict: conflict };
        }
    }

    const updated = await db.medicationAdministration.update({
        where: { id: input.med_id },
        data: {
            status: input.status,
            administered_at: input.status === 'Administered' ? new Date() : null,
            // The eMAR is a legal record: the actor is the signed-in user.
            administered_by: userId,
            notes: input.notes ?? null,
            not_given_reason: notGiven
                ? (input.not_given_reason?.trim() || input.notes?.trim() || null)
                : null,
            witness_id: input.witness_id || null,
            allergy_override_reason: input.allergy_override_reason?.trim() || null,
            pain_score_before: input.pain_score_before,
            pain_score_after: input.pain_score_after,
            prn_reason: input.prn_reason,
        },
    });

    return { ok: true, data: updated };
}
