/**
 * Whose ward is this nurse on, and does this hospital care?
 *
 * Two mechanisms existed and disagreed. User.assigned_ward_id was the one every
 * query actually read; NurseShiftAssignment recorded who was covering which
 * ward this shift and was read by nothing, so assigning a nurse to ICU for
 * tonight changed nothing about what she saw. This resolves both, shift first,
 * so there is one answer rather than two.
 *
 * The scoping itself sorts and labels — it does not hide. A nurse who walks past
 * a deteriorating patient on another ward must still be able to act on them, and
 * a system that hides patients gets worked around by sharing logins, which
 * destroys every record it was meant to protect.
 *
 * Not a 'use server' module — callers are server actions holding the session
 * and the tenant client.
 */

export type WardContext = {
    /** Hospital has asked for ward-first nursing screens. */
    enabled: boolean;
    /** Wards this nurse is covering right now. Empty = not assigned to any. */
    wardIds: number[];
    /** Where the answer came from, for the UI to explain itself. */
    source: 'shift' | 'profile' | 'none';
};

const OFF: WardContext = { enabled: false, wardIds: [], source: 'none' };

/**
 * @param db   tenant-scoped client
 * @param session  the signed-in user
 */
export async function getWardContext(db: any, session: any): Promise<WardContext> {
    // Only nurses are scoped. A manager or doctor looking at the ward needs the
    // whole picture by definition.
    if (session?.role !== 'nurse') return OFF;

    let enabled = false;
    try {
        const cfg = await db.organizationConfig.findFirst({
            select: { ward_scoping_enabled: true },
        });
        enabled = !!cfg?.ward_scoping_enabled;
    } catch {
        // A missing config must not break the ward screens.
        return OFF;
    }
    if (!enabled) return OFF;

    // Today's shift wins: it is the more specific and more current statement of
    // who is covering what.
    try {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date();
        dayEnd.setHours(23, 59, 59, 999);

        const shifts = await db.nurseShiftAssignment.findMany({
            where: { nurse_id: session.id, shift_date: { gte: dayStart, lte: dayEnd } },
            select: { ward_id: true },
        });
        const shiftWards = [...new Set(shifts.map((s: { ward_id: number }) => s.ward_id))] as number[];
        if (shiftWards.length) return { enabled: true, wardIds: shiftWards, source: 'shift' };
    } catch {
        // fall through to the profile
    }

    const profileWard = session.assigned_ward_id ?? null;
    if (profileWard != null) {
        return { enabled: true, wardIds: [Number(profileWard)], source: 'profile' };
    }

    // Scoping is on but this nurse is not assigned anywhere. Show her everything
    // rather than an empty ward — an empty screen reads as "the system is
    // broken" and is the fastest route to someone borrowing a colleague's login.
    return { enabled: true, wardIds: [], source: 'none' };
}

/** Is this row on one of the nurse's wards? */
export function isOwnWard(ctx: WardContext, wardId: number | null | undefined): boolean {
    if (!ctx.enabled || !ctx.wardIds.length) return false;
    return wardId != null && ctx.wardIds.includes(Number(wardId));
}

/**
 * Sort so the nurse's own ward comes first, preserving the caller's order
 * within each group. Deliberately a sort and not a filter.
 */
export function wardFirst<T>(
    ctx: WardContext,
    rows: T[],
    wardOf: (row: T) => number | null | undefined,
): T[] {
    if (!ctx.enabled || !ctx.wardIds.length) return rows;
    const mine: T[] = [];
    const others: T[] = [];
    for (const r of rows) (isOwnWard(ctx, wardOf(r)) ? mine : others).push(r);
    return [...mine, ...others];
}
