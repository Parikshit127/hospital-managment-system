// bed_id is an internal key ("{organizationId}-{ward_id}-{label}"), never meant
// for display. bed_name is the human label a hospital staff member expects to
// see (e.g. "Room 201 - Bed 1"). Older/bulk-created beds can still be missing
// bed_name (see bulkAddBeds in app/admin/ipd-setup/actions.ts) — for those, fall
// back to stripping the id's known prefix rather than ever showing the raw id.
export function bedLabel(bed: { bed_id: string; bed_name?: string | null; ward_id?: number | string | null; organizationId?: string | null }): string {
    if (bed.bed_name) return bed.bed_name;
    const prefix = `${bed.organizationId}-${bed.ward_id}-`;
    return bed.bed_id.startsWith(prefix) ? bed.bed_id.slice(prefix.length) : bed.bed_id;
}
