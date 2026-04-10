# Master Data Excel Import — Design Spec

**Date:** 2026-04-10
**Status:** Approved

---

## Goal

Allow admins to bulk-import master data (Doctors, Services, Lab Tests, Packages, Medicines) from Excel files, with downloadable templates, a 5-row preview, and a downloadable error report.

---

## Scope

### What's included
- Each of the 5 master admin pages gets two new buttons: **Download Template** and **Import**
- Shared `MasterImportButton` component handles the full import UX (template download, file pick, preview, progress, error report)
- Single server action `importMasterData(type, rows[])` bulk-routes to the existing create actions
- The `/admin/data-import` wizard also gets the 5 new import types added to its dropdown

### What's NOT included
- Update/upsert existing records (import is create-only; duplicates are reported as errors)
- Validation of relational integrity beyond enum checks (e.g., no cross-checking package inclusions against existing services at import time)
- Async/background processing (all imports are synchronous; limit enforced at 500 rows per file)

---

## Data Flow

```
User clicks "Download Template"
  → client generates Excel (xlsx.utils.aoa_to_sheet) with headers + 1 sample row
  → instant download, no server call

User clicks "Import"
  → file picker (accepts .xlsx, .xls, .csv)
  → client reads file with existing parser.ts
  → master-validators.ts validates each row (type coercion, required fields, enum checks)
  → preview modal: shows first 5 valid rows + validation error count
  → user confirms
  → calls importMasterData(type, validRows[]) server action
  → server bulk-creates via existing create actions (in sequence, collecting errors)
  → returns { imported: number, failed: { row: number, reason: string }[] }
  → if failed.length > 0: show error summary + "Download Error Report" button
  → error report is client-generated Excel (row number, original data, error reason)
  → page reloads master list on success
```

---

## File Structure

### Create

**`app/lib/import/master-templates.ts`**
Client-side only (no 'use server'). Exports one function per master type:
- `downloadDoctorTemplate()` — columns: name, username, password, specialty, doctor_registration_no, qualifications, email, phone, consultation_fee, follow_up_fee, working_hours, slot_duration, is_active
- `downloadServiceTemplate()` — columns: service_code, service_name, service_category, default_rate, hsn_sac_code, tax_rate, is_active
- `downloadLabTestTemplate()` — columns: test_name, price, category, sample_type, unit, normal_range_min, normal_range_max, hsn_sac_code, tax_rate, is_available
- `downloadPackageTemplate()` — columns: package_code, package_name, description, total_amount, validity_days, exclusions, is_active (inclusions excluded — too complex for flat Excel)
- `downloadMedicineTemplate()` — columns: brand_name, generic_name, category, manufacturer, form, strength, mrp, purchase_price, selling_price, gst_percent, min_threshold, hsn_sac_code, is_active

Each function uses `xlsx` to build an `aoa_to_sheet` with the header row + one sample row, then triggers browser download. No server round-trip.

**`app/lib/import/master-validators.ts`**
Exports `validateMasterRows(type: MasterImportType, rows: Record<string, unknown>[]): { valid: ValidatedRow[]; errors: RowError[] }`.

Validation rules per type:
- **doctor**: name required (min 2), username required (min 3), password required (min 8), specialty required, consultation_fee & follow_up_fee must be non-negative numbers, slot_duration must be positive integer
- **service**: service_code required, service_name required, service_category must be one of the 8 enum values, default_rate non-negative
- **lab_test**: test_name required, price non-negative
- **package**: package_code required, package_name required, total_amount non-negative, validity_days positive integer
- **medicine**: brand_name required (unique check deferred to DB), mrp/purchase_price/selling_price non-negative, gst_percent 0–100

Returns `valid` (coerced to correct types) and `errors` (row index + human-readable reason).

**`app/lib/import/master-transformer.ts`**
Transforms a validated row Record into the exact input shape for each create server action. Handles:
- Boolean coercion: "true"/"yes"/"1" → true, anything else → false
- Number coercion: parseFloat with fallback to 0
- Empty string → undefined for optional fields
- `is_active` defaults to true if omitted

**`app/components/master/MasterImportButton.tsx`**
`'use client'` component. Props: `{ type: MasterImportType; onImportComplete: () => void }`.

UI states:
1. **Idle**: two buttons — "Download Template" (secondary) and "Import" (primary with Upload icon)
2. **Parsing**: spinner, "Reading file…"
3. **Preview modal**: table showing first 5 rows + row count + validation error count; "Proceed" and "Cancel" buttons
4. **Importing**: progress bar or spinner, "Importing N rows…"
5. **Success toast**: "Imported X rows successfully" (react-hot-toast)
6. **Error summary**: inline section showing failed count + "Download Error Report" button; downloadable Excel lists row number, all original columns, and error reason

**`app/actions/master-import-actions.ts`**
`'use server'`. Single export: `importMasterData(type: MasterImportType, rows: Record<string, unknown>[])`.

```ts
export async function importMasterData(type: MasterImportType, rows: Record<string, unknown>[]) {
  const { session, organizationId } = await requireTenantContext();
  if (session.role !== 'admin') return { success: false, error: 'Admin only' };
  if (rows.length > 500) return { success: false, error: 'Maximum 500 rows per import' };
  // route to per-type bulk create
  // collect { imported, failed }
  // write single audit log entry
  return { success: true, data: { imported, failed } };
}
```

Per-type routing calls the existing individual create actions in a for-loop (not Promise.all — avoids overwhelming the DB and keeps error attribution per-row accurate). Each failed row is caught and added to `failed[]` without aborting the rest.

Writes one `system_audit_logs` entry at the end: `action: 'BULK_IMPORT_${TYPE}'`, `details: 'Imported N rows, M failed'`.

### Modify

**`app/admin/master/doctors/page.tsx`**
Add `<MasterImportButton type="doctor_master" onImportComplete={load} />` in the header row next to "Add Doctor".

**`app/admin/master/services/page.tsx`**
Add one `<MasterImportButton>` per sub-tab:
- Services sub-tab: `type="service_master"`
- Lab Tests sub-tab: `type="lab_test_master"`
- Packages sub-tab: `type="package_master"`

**`app/admin/master/medicines/page.tsx`**
Add `<MasterImportButton type="medicine_master" onImportComplete={load} />` in header.

**`app/lib/import/templates.ts`** (existing wizard templates)
Add 5 new entries to the template map for `doctor_master`, `service_master`, `lab_test_master`, `package_master`, `medicine_master`. These reuse the same column definitions from `master-templates.ts`.

**`app/lib/import/validators.ts`** (existing wizard validators)
Add 5 new `case` branches delegating to the new `master-validators.ts` functions.

**`app/admin/data-import/page.tsx`** (or the wizard entry component)
Add the 5 new `MasterImportType` values to the import-type dropdown/selector.

---

## Types

```ts
// Extend existing ImportType
type MasterImportType =
  | 'doctor_master'
  | 'service_master'
  | 'lab_test_master'
  | 'package_master'
  | 'medicine_master';

type RowError = { rowIndex: number; reason: string; originalData: Record<string, unknown> };
```

---

## Constraints & Rules

- **Max 500 rows** per import (enforced both client-side in preview modal and server-side)
- **Create-only**: no upsert. Duplicate `username` (doctors) or `brand_name` (medicines) or `service_code` (services) → reported as a per-row error, import continues for other rows
- **Client-side template generation**: uses `xlsx.utils.aoa_to_sheet`, no server round-trip
- **Error report**: generated client-side from the `failed[]` array returned by the server action
- **Package inclusions**: omitted from the import template (the JSON structure is too complex for flat Excel). Inclusions can be added manually via the edit modal after import.
- **Backward compat**: existing import types (patients, staff, etc.) are untouched
- **Soft-delete safety**: import never deactivates or deletes existing records

---

## Error Handling

| Scenario | Behavior |
|---|---|
| File parse failure | Toast: "Could not read file. Use .xlsx, .xls, or .csv" |
| All rows invalid (0 valid) | Preview modal shows 0 valid rows, "Proceed" disabled |
| Some rows invalid | Preview shows valid count + error count; user can proceed with valid rows only |
| Server returns partial failure | Success toast for imported count + error summary section with download |
| Server returns total failure | Error toast with message |
| > 500 rows | Client blocks before server call: "File has N rows. Maximum is 500." |

---

## Non-Goals (Future)

- Upsert / update existing records by code/name
- Package inclusions import
- Async background processing for large files
- Import history per master type (the existing `/admin/data-import/history` covers this generically)
