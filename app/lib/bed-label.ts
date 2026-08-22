export type BedInput = 
    | { bed_id?: string | null; bed_name?: string | null; ward_id?: number | string | null; organizationId?: string | null }
    | string 
    | null 
    | undefined;

// bed_id is an internal key ("{organizationId}-{ward_id}-{label}"), never meant
// for display. bed_name is the human label a hospital staff member expects to
// see (e.g. "Room 201 - Bed 1"). Older/bulk-created beds can still be missing
// bed_name (see bulkAddBeds in app/admin/ipd-setup/actions.ts) — for those, fall
// back to stripping the id's known prefix or UUID pattern rather than ever showing the raw id.
export function bedLabel(bed: BedInput): string {
    if (!bed) return 'No bed';
    if (typeof bed === 'object' && bed.bed_name) {
        return bed.bed_name;
    }

    const rawId = typeof bed === 'string' ? bed : (bed.bed_id || '');
    if (!rawId) return 'No bed';

    // 1. If organizationId and ward_id are present on object, try standard prefix strip
    if (typeof bed === 'object' && bed.organizationId && bed.ward_id) {
        const prefix = `${bed.organizationId}-${bed.ward_id}-`;
        if (rawId.startsWith(prefix)) {
            return rawId.slice(prefix.length);
        }
    }

    // 2. Generic fallback for raw keys formatted as UUID-wardId-bedLabel or UUID-bedLabel
    // UUID pattern: 8-4-4-4-12 hex characters
    const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-/;
    if (uuidPattern.test(rawId)) {
        // Strip the 36-char UUID and the trailing hyphen
        let rest = rawId.replace(uuidPattern, '');
        // If the remaining part starts with a numeric wardId followed by hyphen (e.g. "35-204-1"), strip wardId prefix
        const wardPrefixPattern = /^\d+-/;
        if (wardPrefixPattern.test(rest)) {
            rest = rest.replace(wardPrefixPattern, '');
        }
        if (rest) return rest;
    }

    return rawId;
}

