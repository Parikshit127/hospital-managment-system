/**
 * One place to resolve why an admission was cancelled.
 *
 * This lookup existed in three copies (ipd-actions.ts, ipd/admissions-hub/actions.ts,
 * admin-actions.ts) and they had drifted apart in two ways, both of which hid the
 * reason from staff:
 *
 *   1. Two copies OVERWROTE the real `admissions.cancellation_reason` column with
 *      the audit-log value, falling back to null — so a row whose column was
 *      populated still rendered blank.
 *   2. All three matched only `action: 'CANCEL_ADMISSION'`. An admin override
 *      logs `FORCE_CANCEL_ADMISSION`, so force-cancels — every cancelled
 *      admission on the demo DB — resolved to no reason at all.
 *
 * The column is authoritative (cancelAdmission writes it for both paths); the
 * audit log is only a fallback for rows cancelled before the column existed.
 */

/** Both ways an admission can be cancelled. Keep in step with cancelAdmission(). */
export const ADMISSION_CANCEL_ACTIONS = ['CANCEL_ADMISSION', 'FORCE_CANCEL_ADMISSION'];

function parseReason(details: unknown): string | null {
    if (!details || typeof details !== 'string') return null;
    try {
        const reason = JSON.parse(details)?.reason;
        return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
    } catch {
        return null; // Malformed historical audit details.
    }
}

/**
 * Fill in `cancellation_reason` on a list of admissions.
 * Column first, audit log second, null only if neither has one.
 * Issues at most one extra query, and none when nothing is cancelled.
 */
export async function attachCancellationReasons<T extends Record<string, any>>(
    db: any,
    admissions: T[],
): Promise<T[]> {
    const needsLookup = admissions
        .filter(a => a.status === 'Cancelled' && !a.cancellation_reason)
        .map(a => a.admission_id);

    if (needsLookup.length === 0) {
        // Nothing to resolve — but still normalise the field so callers can rely
        // on it being present rather than undefined.
        return admissions.map(a => ({ ...a, cancellation_reason: a.cancellation_reason ?? null }));
    }

    const logs = await db.system_audit_logs.findMany({
        where: {
            action: { in: ADMISSION_CANCEL_ACTIONS },
            entity_type: 'admission',
            entity_id: { in: needsLookup },
        },
        orderBy: { created_at: 'desc' },
        select: { entity_id: true, details: true },
    });

    const fromLog = new Map<string, string>();
    for (const log of logs) {
        if (!log.entity_id || fromLog.has(log.entity_id)) continue; // newest wins
        const reason = parseReason(log.details);
        if (reason) fromLog.set(log.entity_id, reason);
    }

    return admissions.map(a => ({
        ...a,
        cancellation_reason: a.cancellation_reason || fromLog.get(a.admission_id) || null,
    }));
}
