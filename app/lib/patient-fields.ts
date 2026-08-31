/**
 * The single list of patient fields that staff may edit.
 *
 * This existed as three hand-maintained copies — the allowlist in
 * updatePatientField(), the allowlist in updatePatient(), and the `draft` seed
 * in the admin patient screen's startEdit(). They drifted: the admin screen
 * rendered Nationality, Govt Proof Type and Govt Proof Number but never seeded
 * them, so those three boxes opened EMPTY in edit mode no matter what the
 * patient record held. Anything added to a form now has exactly one list to
 * appear in.
 *
 * Plain module, not a server action — a 'use server' file may only export
 * async functions.
 */

/** Demographics, contact, address and identity. */
export const EDITABLE_PATIENT_FIELDS = [
    'full_name', 'phone', 'email',
    // Address — `address` is the street/landmark line, the rest are structured.
    'address', 'city', 'state', 'pincode', 'country',
    'age', 'gender', 'date_of_birth', 'blood_group', 'department',
    'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
    // Identity documents
    'aadhar_card', 'abha_number', 'pan_number',
    'nationality', 'govt_id_type', 'govt_id_number',
    // Medical
    'allergies', 'chronic_conditions',
] as const;

/** Payer fields — editable in the admin screen only, not by inline field edit. */
export const EDITABLE_PATIENT_BILLING_FIELDS = [
    'patient_type', 'corporate_id', 'corporate_card_number', 'employee_id',
] as const;

export const ALL_EDITABLE_PATIENT_FIELDS: readonly string[] = [
    ...EDITABLE_PATIENT_FIELDS,
    ...EDITABLE_PATIENT_BILLING_FIELDS,
];

/** Fields whose sensible empty value is not '' — used when seeding an edit form. */
const FIELD_DEFAULTS: Record<string, string> = {
    country: 'India',
    patient_type: 'cash',
};

/**
 * Build the edit-form draft for a patient record. Every editable field gets a
 * key, so a form control can never render blank while the record holds a value.
 */
export function buildPatientDraft(patient: Record<string, any>): Record<string, string> {
    const draft: Record<string, string> = {};
    for (const field of ALL_EDITABLE_PATIENT_FIELDS) {
        draft[field] = patient?.[field] ?? FIELD_DEFAULTS[field] ?? '';
    }
    return draft;
}
