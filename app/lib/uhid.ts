/**
 * Unified UHID (Unique Hospital ID) generator.
 * Single source of truth — used by both registration and triage flows.
 *
 * Format: {PREFIX}-{YEAR}-{SEQUENCE}
 * Example: AVN-2026-00042
 */
export async function generateUHID(
    db: { oPD_REG: { count: () => Promise<number> } },
    prefix: string = 'AVN'
): Promise<string> {
    const year = new Date().getFullYear();
    const count = await db.oPD_REG.count();
    const seq = String(count + 1).padStart(5, '0');
    return `${prefix}-${year}-${seq}`;
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
