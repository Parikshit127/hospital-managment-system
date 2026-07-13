# Doctor Portal — IPD Patients Design

## Problem

Doctors currently have no way to see their hospital's admitted IPD patients from the doctor portal (`app/doctor/*`). The doctor portal is entirely OPD-appointment-based today — the "Admitted" status in the doctor queue is an OPD appointment flag, not a real IPD admission. Doctors need to view admitted patients, review their profile/clinical context, update diagnosis, and author the NABH discharge summary — without any billing or bed-admission capability (those stay reception/finance/IPD-manager responsibilities).

## Scope

In scope:
- A new "IPD Patients" list page in the doctor portal showing all currently admitted (incl. semi-discharged) patients hospital-wide.
- A patient detail page with read-only clinical context (profile, vitals, nursing, clinical notes) plus editable diagnosis and the discharge summary editor.

Out of scope (explicitly excluded from doctor view):
- Billing, TPA/insurance tabs, charge posting, deposits.
- Bed admission, transfer, or discharge/undischarge actions.
- Any modification to the existing `/ipd/admission/[id]` chart page used by other portals.

## Navigation

Add one entry to the doctor section of `app/components/layout/Sidebar.tsx`'s nav config:
`{ label: "IPD Patients", href: "/doctor/ipd-patients", icon: BedDouble }`

The `/doctor` path prefix already role-gates to `doctor` in `PATH_ROLE`, so `/doctor/ipd-patients` inherits that automatically — no new route-gating entry required.

## Pages

### `app/doctor/ipd-patients/page.tsx` (list)

- Fetches admissions via the existing `getIPDAdmissions(statusFilter)` action (`app/actions/ipd-actions.ts`) — no new server action. Semi-Discharged is not a distinct DB status (it's a derived UI label for an Admitted patient with a locked bill), so filtering to "not yet Discharged" naturally includes both Admitted and Semi-Discharged patients.
- Columns: patient name, ID, ward/bed, admission date, current diagnosis (truncated), status badge.
- Client-side search by name/ID (matches existing reception dashboard pattern).
- Row click → `/doctor/ipd-patients/[admissionId]`.
- Empty state: "No IPD patients currently admitted."

### `app/doctor/ipd-patients/[admissionId]/page.tsx` (detail)

- On mount: one call to the existing `getAdmissionFullDetails(admissionId)` (`ipd-actions.ts`), which already returns diagnosis fields, `medical_notes[]`, `ward_rounds[]`, `diet_plans[]`, `nursing_tasks[]`, plus patient/bed/ward info.
- Tabs:
  - **Profile** (read-only): demographics, ward/bed, admission date, admitting doctor.
  - **Diagnosis** (editable): form bound to the existing `updateAdmissionDiagnosis` action (diagnosis, ICD code, secondary diagnoses). Save button, toast on success/failure.
  - **Clinical** (read-only): renders `medical_notes` + `ward_rounds` already fetched.
  - **Vitals** (read-only): lazy-loads `getIPDVitalsHistory` (`ipd-nursing-actions.ts`) on tab activation, rendered with the existing `VitalsChart` component (`app/components/ipd/VitalsChart.tsx`).
  - **Nursing** (read-only): lazy-loads `getNursingAssessments` (`ipd-nursing-actions.ts`); rendered as simple new read-only cards (no prebuilt component exists for this).
  - **Discharge Summary** (editable): mounts the existing `<DischargeSummaryEditor admissionId={...} />` (`app/components/ipd/DischargeSummaryEditor.tsx`) unchanged. It is already server-side role-gated to `doctor/admin/ipd_manager/superadmin` in `discharge-summary-actions.ts`.
- No Billing/TPA tabs, no admit/undischarge/discharge buttons, no charge-posting UI are imported or rendered anywhere on this page.

## Error handling

- List: loading skeleton; empty state as above.
- Detail: invalid/missing `admissionId` → redirect to the list with a toast.
- Diagnosis save: surfaces the existing server-side role check's error message if `updateAdmissionDiagnosis` rejects the caller's role (to be confirmed during implementation that `doctor` role is permitted — if not already, this is a small additive change to that action's role list, not a new capability).
- Discharge summary tab: uses its own existing error handling; unchanged.

## Known dependency (pre-existing, not part of this feature)

The discharge summary DB migration (`prisma/migrations/20260622140000_discharge_summary_structured`) has not been applied to production yet. Until it is, `DischargeSummaryEditor` will throw when loading/saving. This blocks end-to-end testing of the Discharge Summary tab specifically, independent of this feature's code.

## Testing

- `tsc --noEmit` after implementation.
- Manual walkthrough as a doctor-role user: nav item appears, list shows admitted/semi-discharged patients hospital-wide, detail page has no billing/TPA/admit UI, diagnosis edits save, discharge summary authors/prints (pending migration above).
- Confirm no regressions to `/ipd/admission/[id]` or other portals — this feature adds new files and one nav entry only.
