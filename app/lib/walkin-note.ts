// Walk-in / OTC pharmacy bills all share one patient record (patient_id =
// 'WALKIN'), so the customer's name — and now an optional contact number and
// address — are stored on the invoice's `notes` field.
//
// Backward compatibility: a name-only note stays a plain string (as before);
// as soon as a contact or address is also captured the fields are packed as
// JSON. Readers use parseWalkinNote() which understands both shapes.

export function buildWalkinNote(name?: string, contact?: string, address?: string): string | undefined {
    const n = (name || '').trim();
    const c = (contact || '').trim();
    const a = (address || '').trim();
    if (!n && !c && !a) return undefined;
    if (!c && !a) return n; // name only → plain string (unchanged from old behaviour)
    return JSON.stringify({ n, c, a });
}

export function parseWalkinNote(notes?: string | null): { name: string; contact: string; address: string } {
    const raw = (notes || '').trim();
    if (!raw) return { name: '', contact: '', address: '' };
    if (raw.startsWith('{')) {
        try {
            const o = JSON.parse(raw);
            if (o && typeof o === 'object') {
                return {
                    name: String(o.n || o.name || '').trim(),
                    contact: String(o.c || o.contact || '').trim(),
                    address: String(o.a || o.address || '').trim(),
                };
            }
        } catch { /* not JSON — treat as plain name below */ }
    }
    return { name: raw, contact: '', address: '' };
}
