// Single source of truth for the admission (admissions.status) lifecycle.
//
//   Admitted ──(discharge summary authored: discharge_date recorded)──> Admitted*
//            ──(full discharge: TPA approved / settled)──────────────> Discharged
//            ──(cancel)──────────────────────────────────────────────> Cancelled
//
// * "Semi Discharged" is a DERIVED state, not a stored status value:
//
//       semi discharged  ==  status === 'Admitted' && discharge_date != null
//
// Authoring the discharge summary records the discharge date/time but leaves the
// patient Admitted: they still occupy a bed while waiting on TPA approval or
// payment formalities, so every existing "is this patient active" query, ward
// list, bed-occupancy check and charge-posting path keeps working unchanged.
// The bill also stays Draft — it is finalized only at full discharge
// (see canFinalizeInvoice in bill-status.ts, which still requires 'Discharged').
//
// This combination cannot occur any other way: discharge_date is only ever set
// together with status='Discharged', and undischargeAdmission clears it.

export const ADMISSION_STATUS = {
  ADMITTED: 'Admitted',
  DISCHARGED: 'Discharged',
  CANCELLED: 'Cancelled',
} as const;

export type AdmissionStatus = (typeof ADMISSION_STATUS)[keyof typeof ADMISSION_STATUS];

/** Minimal shape needed to reason about an admission's discharge state. */
export type AdmissionLike = {
  status?: string | null;
  discharge_date?: Date | string | null;
};

/** Patient is physically in the hospital, holding a bed (incl. semi discharged). */
export function isActiveAdmission(status?: string | null): boolean {
  return status === ADMISSION_STATUS.ADMITTED;
}

/** Fully discharged — bed released, bill finalized. */
export function isFullyDischarged(status?: string | null): boolean {
  return status === ADMISSION_STATUS.DISCHARGED;
}

/**
 * Discharge summary is done and the discharge date/time is recorded, but the
 * patient is still in a bed awaiting TPA approval / payment formalities.
 */
export function isSemiDischarged(admission: AdmissionLike | null | undefined): boolean {
  if (!admission) return false;
  return isActiveAdmission(admission.status) && !!admission.discharge_date;
}

/**
 * The discharge date/time is known once the summary is authored — i.e. from
 * semi-discharge onward. Bills and the summary print it from this point.
 */
export function hasDischargeDateTime(admission: AdmissionLike | null | undefined): boolean {
  return !!admission?.discharge_date;
}

/** Label for badges/pills — surfaces the derived semi-discharged state. */
export function admissionStatusLabel(admission: AdmissionLike | null | undefined): string {
  if (!admission) return '—';
  if (isSemiDischarged(admission)) return 'Semi Discharged';
  return String(admission.status ?? '—');
}
