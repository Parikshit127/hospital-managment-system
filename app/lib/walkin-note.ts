// Walk-in / OTC pharmacy bills all share one patient record (patient_id =
// 'WALKIN'), so the customer's name — and now an optional contact number — are
// stored on the invoice's `notes` field.
//
// Backward compatibility: a name-only note stays a plain string (as before);
// only when a contact is also captured are the two packed as JSON. Readers use
// parseWalkinNote() which understands both shapes.

export function buildWalkinNote(name?: string, contact?: string): string | undefined {
    const n = (name || '').trim();
    const c = (contact || '').trim();
    if (!n && !c) return undefined;
    if (!c) return n; // name only → plain string (unchanged from old behaviour)
    return JSON.stringify({ n, c });
}

export function parseWalkinNote(notes?: string | null): { name: string; contact: string } {
    const raw = (notes || '').trim();
    if (!raw) return { name: '', contact: '' };
    if (raw.startsWith('{')) {
        try {
            const o = JSON.parse(raw);
            if (o && typeof o === 'object') {
                return { name: String(o.n || o.name || '').trim(), contact: String(o.c || o.contact || '').trim() };
            }
        } catch { /* not JSON — treat as plain name below */ }
    }
    return { name: raw, contact: '' };
}
