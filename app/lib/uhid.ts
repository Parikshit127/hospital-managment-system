/**
 * Unified UHID (Unique Hospital ID) generator.
 * Single source of truth — used by both registration and triage flows.
 *
 * Format: {PREFIX}-{YEAR}-{SEQUENCE}
 * Example: AVN-2026-00042
 *
 * Uses the highest existing sequence number to avoid collisions,
 * not count() which breaks when records are deleted or IDs collide.
 */
export async function generateUHID(
    db: { oPD_REG: { findFirst: (args: any) => Promise<{ patient_id: string } | null> } },
    prefix: string = 'AVN'
): Promise<string> {
    const year = new Date().getFullYear();
    const yearPrefix = `${prefix}-${year}-`;

    // Find the highest existing ID for this prefix+year
    const last = await db.oPD_REG.findFirst({
        where: { patient_id: { startsWith: yearPrefix } },
        orderBy: { patient_id: 'desc' },
        select: { patient_id: true },
    } as any);

    let nextSeq = 1;
    if (last?.patient_id) {
        const parts = last.patient_id.split('-');
        const lastSeq = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
    }

    return `${yearPrefix}${String(nextSeq).padStart(5, '0')}`;
}

/**
 * Unified appointment ID generator.
 * Format: APT-{YYYYMMDD}-{RANDOM_4}
 * Example: APT-20260319-4821
 */
export function generateAppointmentId(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `APT-${dateStr}-${seq}`;
}
