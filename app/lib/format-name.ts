/**
 * Doctor name formatting helpers.
 *
 * The data layer is inconsistent: some doctor names are stored as "Dr. Sharma"
 * (with prefix), some as just "Sharma" (without). UI code that hardcoded
 * "Dr. {name}" was producing "Dr. Dr. Sharma" — visible in the patient portal.
 *
 * Use `formatDoctorName()` everywhere a doctor name is shown to a user.
 */

const DR_PREFIX_RE = /^\s*(dr\.?|doctor)\s+/i;

/**
 * Returns the canonical "Dr. <name>" form regardless of whether the input
 * already starts with "Dr.", "Dr ", "Doctor ", or has no title.
 *
 *   formatDoctorName("Sharma")           → "Dr. Sharma"
 *   formatDoctorName("Dr. Sharma")       → "Dr. Sharma"
 *   formatDoctorName("Dr Sharma")        → "Dr. Sharma"
 *   formatDoctorName("DOCTOR Sharma")    → "Dr. Sharma"
 *   formatDoctorName("")                 → ""
 *   formatDoctorName(null)               → ""
 */
export function formatDoctorName(name: string | null | undefined): string {
    if (!name) return '';
    const trimmed = String(name).trim();
    if (!trimmed) return '';
    const stripped = trimmed.replace(DR_PREFIX_RE, '').trim();
    if (!stripped) return ''; // input was just "Dr." with nothing after
    return `Dr. ${stripped}`;
}

/**
 * Returns just the bare name (no Dr. prefix), useful when you want to put
 * the title in markup separately (e.g. in PDFs with a styled prefix).
 */
export function stripDoctorPrefix(name: string | null | undefined): string {
    if (!name) return '';
    return String(name).trim().replace(DR_PREFIX_RE, '').trim();
}
