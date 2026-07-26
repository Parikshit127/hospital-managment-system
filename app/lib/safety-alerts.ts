/**
 * Telling somebody when a safety rule was overridden or a dose never reached
 * the patient.
 *
 * Both events were recorded correctly and silently. A nurse could override a
 * severe allergy warning, or withhold the same antibiotic three times running,
 * and the prescriber would find out only if they happened to read the chart.
 * The record is the legal evidence; the alert is what makes it act on anything.
 *
 * Not a 'use server' module — callers are server actions that already hold the
 * tenant-scoped client and the authenticated user.
 */

type Db = any;

/**
 * Who owns clinical governance for the ward.
 *
 * IPD managers, and admins only when there is no IPD manager to receive it.
 * Sending to both put every withheld dose in front of all seven admin accounts
 * on the demo org — two of which are IT staff. A clinical alert delivered to
 * someone with no clinical role is noise, and noise is what makes real alerts
 * get ignored.
 */
async function governanceRecipients(db: Db, organizationId: string): Promise<string[]> {
    const managers = await db.user.findMany({
        where: { organizationId, is_active: true, role: 'ipd_manager' },
        select: { id: true },
    });
    if (managers.length) return managers.map((u: { id: string }) => u.id);

    const admins = await db.user.findMany({
        where: { organizationId, is_active: true, role: 'admin' },
        select: { id: true },
    });
    return admins.map((u: { id: string }) => u.id);
}

async function send(
    db: Db,
    organizationId: string,
    userIds: string[],
    title: string,
    body: string,
    type: 'error' | 'warning' | 'info',
    link?: string,
) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return 0;
    await db.notification.createMany({
        data: ids.map((user_id) => ({ organizationId, user_id, title, body, type, link })),
    });
    return ids.length;
}

/**
 * Resolve the prescriber of a drug to a user id.
 *
 * activeMedication.prescribed_by holds a display name ("Dr. Sharma") rather
 * than an id, so match on name. Returns null rather than guessing when there
 * is no unambiguous match — a wrong recipient is worse than the governance
 * copy that always goes out alongside.
 */
async function prescriberUserId(
    db: Db,
    organizationId: string,
    admissionId: string,
    medicationName: string,
): Promise<string | null> {
    try {
        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            select: { attending_doctor_id: true },
        });
        if (admission?.attending_doctor_id) return admission.attending_doctor_id;

        const med = await db.activeMedication.findFirst({
            where: { admission_id: admissionId, medication_name: medicationName },
            select: { prescribed_by: true },
            orderBy: { created_at: 'desc' },
        });
        const name = String(med?.prescribed_by || '').replace(/^Dr\.?\s*/i, '').trim();
        if (!name) return null;

        const matches = await db.user.findMany({
            where: { organizationId, is_active: true, role: 'doctor', name: { contains: name, mode: 'insensitive' } },
            select: { id: true },
            take: 2,
        });
        return matches.length === 1 ? matches[0].id : null;
    } catch {
        return null;
    }
}

/**
 * A dose was given despite a recorded allergy, with a typed justification.
 * The prescriber needs to know, and so does clinical governance.
 */
export async function notifyAllergyOverride(
    db: Db,
    organizationId: string,
    args: {
        admissionId: string;
        patientName: string;
        medicationName: string;
        allergen: string;
        severity?: string | null;
        reason: string;
        actedByName: string;
        stage: 'prescribed' | 'administered';
    },
): Promise<number> {
    const verb = args.stage === 'prescribed' ? 'prescribed' : 'given';
    const title = `Allergy override — ${args.medicationName}`;
    const body =
        `${args.patientName}: ${args.medicationName} was ${verb} by ${args.actedByName} despite a recorded ` +
        `${args.severity ? args.severity + ' ' : ''}allergy to "${args.allergen}". ` +
        `Reason given: "${args.reason}"`;

    const ids = await governanceRecipients(db, organizationId);
    const prescriber = await prescriberUserId(db, organizationId, args.admissionId, args.medicationName);
    if (prescriber) ids.push(prescriber);

    return send(db, organizationId, ids, title, body, 'error');
}

/**
 * A dose did not reach the patient.
 *
 * One miss is routine and the ward handles it. A repeated miss on the same
 * drug is a treatment failure the prescriber has to see, so the alert only
 * goes out from the second consecutive one — enough signal to matter, not so
 * much that it becomes background noise.
 */
export const REPEAT_MISS_THRESHOLD = 2;

export async function notifyDoseNotGiven(
    db: Db,
    organizationId: string,
    args: {
        admissionId: string;
        patientName: string;
        medicationName: string;
        status: string;
        reason: string;
        actedByName: string;
    },
): Promise<{ notified: number; consecutive: number }> {
    const recent = await db.medicationAdministration.findMany({
        where: {
            admission_id: args.admissionId,
            medication_name: args.medicationName,
            status: { in: ['Administered', 'Held', 'Refused', 'Missed'] },
        },
        orderBy: { scheduled_time: 'desc' },
        select: { status: true },
        take: 10,
    });

    let consecutive = 0;
    for (const r of recent) {
        if (['Held', 'Refused', 'Missed'].includes(r.status)) consecutive++;
        else break;
    }

    if (consecutive < REPEAT_MISS_THRESHOLD) return { notified: 0, consecutive };

    const title = `${args.medicationName} not given ×${consecutive}`;
    const body =
        `${args.patientName}: ${args.medicationName} has not been given ${consecutive} times in a row ` +
        `(latest ${args.status} by ${args.actedByName} — "${args.reason}"). Review whether the order still stands.`;

    const ids = await governanceRecipients(db, organizationId);
    const prescriber = await prescriberUserId(db, organizationId, args.admissionId, args.medicationName);
    if (prescriber) ids.push(prescriber);

    const notified = await send(db, organizationId, ids, title, body, 'warning');
    return { notified, consecutive };
}

/**
 * Tell the second nurse her name is on a controlled drug.
 *
 * A co-signature is a legal record that two people checked the dose. The
 * witness was selected from a dropdown and never told, so she could find her
 * name against a controlled drug she never saw given. Whether she agrees is
 * the entire point of the check.
 */
export async function notifyWitness(
    db: Db,
    organizationId: string,
    args: {
        witnessId: string;
        patientName: string;
        medicationName: string;
        dose: string;
        givenByName: string;
    },
): Promise<number> {
    if (!args.witnessId) return 0;
    return send(
        db,
        organizationId,
        [args.witnessId],
        `You co-signed ${args.medicationName}`,
        `${args.givenByName} recorded you as the second checker for ${args.medicationName} ` +
        `${args.dose} given to ${args.patientName}. If you did not witness this dose, tell the ` +
        `nurse in charge now — your name is on the controlled-drug record.`,
        'warning',
    );
}
