# Master Data Excel Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Excel template download + import buttons to all 5 master admin pages (Doctors, Services, Lab Tests, Packages, Medicines) plus extend the existing `/admin/data-import` wizard with those 5 new import types.

**Architecture:** A shared `MasterImportButton` client component handles the full inline UX (template download → file pick → client-side parse + validate → 5-row preview modal → server action bulk-create → error report download). A single server action `importMasterData` routes to the existing per-type create actions. No new DB tables needed.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, `xlsx` v0.18.5 (already installed), react-hot-toast, lucide-react, Zod (server-side), `requireTenantContext` from `@/backend/tenant`.

---

## Codebase Context (read before starting any task)

- `app/types/import.ts` — defines `ImportType` as a string union + all import-related interfaces. Must be extended with 5 new type values.
- `app/lib/import/templates.ts` — `TEMPLATES` record keyed by `ImportType`; `generateTemplateFile(headers, sampleRows, format)` utility in `parser.ts` creates Excel buffers. Must add 5 new entries.
- `app/lib/import/parser.ts` — `parseFile(buffer, fileName)` parses xlsx/xls/csv → `ParsedFile`. `generateTemplateFile(headers, sampleRows, format)` creates Excel. **Use both** in MasterImportButton.
- `app/admin/data-import/components/StepFileUpload.tsx` — `IMPORT_TYPES` array drives the wizard type selector. Must add 5 new entries.
- Existing server actions for create: `createDoctor` in `app/actions/doctor-master-actions.ts`, `createService`/`createLabTest`/`createPackage` in `app/actions/service-master-actions.ts`, `createMedicine` in `app/actions/medicine-master-actions.ts`.
- Extended Prisma client: `IpdServiceMaster` and `IpdPackage` are NOT in `TENANT_SCOPED_MODELS` — `organizationId` must be explicitly passed (already done in existing create actions; the import action calls those actions, so this is handled automatically).
- No unit testing framework in this repo — verification is build (`npm run build`) + manual smoke test.

---

## File Structure

**Create:**
- `app/lib/import/master-validators.ts` — client-safe validation for all 5 master types; returns `{ valid: T[], errors: RowError[] }`
- `app/lib/import/master-templates.ts` — client-side template download functions (one per type, uses `generateTemplateFile` from `parser.ts`)
- `app/actions/master-import-actions.ts` — server action `importMasterData(type, rows[])` with bulk routing + audit log
- `app/components/master/MasterImportButton.tsx` — shared `'use client'` component (template + import UX)

**Modify:**
- `app/types/import.ts` — extend `ImportType` union with 5 new values
- `app/lib/import/templates.ts` — add 5 new entries to `TEMPLATES` record + column definitions
- `app/admin/data-import/components/StepFileUpload.tsx` — add 5 entries to `IMPORT_TYPES` array
- `app/admin/master/doctors/page.tsx` — add `<MasterImportButton>` in header
- `app/admin/master/services/page.tsx` — add one `<MasterImportButton>` per sub-tab
- `app/admin/master/medicines/page.tsx` — add `<MasterImportButton>` in header

---

## Tasks

### Task 1: Extend ImportType + wizard templates

**Files:**
- Modify: `app/types/import.ts`
- Modify: `app/lib/import/templates.ts`
- Modify: `app/admin/data-import/components/StepFileUpload.tsx`

- [ ] **Step 1: Extend `ImportType` in `app/types/import.ts`**

Change line 1 from:
```ts
export type ImportType = 'patients' | 'staff' | 'invoices' | 'lab_results' | 'pharmacy' | 'appointments';
```
To:
```ts
export type ImportType =
  | 'patients'
  | 'staff'
  | 'invoices'
  | 'lab_results'
  | 'pharmacy'
  | 'appointments'
  | 'doctor_master'
  | 'service_master'
  | 'lab_test_master'
  | 'package_master'
  | 'medicine_master';
```

- [ ] **Step 2: Add column definitions + TEMPLATES entries in `app/lib/import/templates.ts`**

After the existing `appointmentColumns` array (line 78) and before the `TEMPLATES` constant (line 80), insert the 5 new column arrays:

```ts
const doctorMasterColumns: ImportColumn[] = [
    { name: 'name', required: true, type: 'string', description: 'Doctor full name', example: 'Dr. Priya Sharma', maxLength: 200 },
    { name: 'username', required: true, type: 'string', description: 'Login username (unique)', example: 'priya.sharma' },
    { name: 'password', required: true, type: 'string', description: 'Initial password (min 8 chars)', example: 'Welcome@123' },
    { name: 'specialty', required: true, type: 'string', description: 'Medical specialization', example: 'Cardiology' },
    { name: 'doctor_registration_no', required: false, type: 'string', description: 'Medical council registration number', example: 'MH-12345' },
    { name: 'qualifications', required: false, type: 'string', description: 'Degrees and qualifications', example: 'MBBS, MD' },
    { name: 'email', required: false, type: 'email', description: 'Email address', example: 'priya@hospital.com' },
    { name: 'phone', required: false, type: 'string', description: 'Phone number', example: '9876543210' },
    { name: 'consultation_fee', required: true, type: 'number', description: 'Consultation fee (INR)', example: '500' },
    { name: 'follow_up_fee', required: true, type: 'number', description: 'Follow-up fee (INR)', example: '300' },
    { name: 'working_hours', required: false, type: 'string', description: 'Working hours range', example: '09:00-17:00' },
    { name: 'slot_duration', required: false, type: 'number', description: 'Appointment slot duration (minutes)', example: '20' },
    { name: 'is_active', required: false, type: 'boolean', description: 'Active status (true/false)', example: 'true' },
];

const serviceMasterColumns: ImportColumn[] = [
    { name: 'service_code', required: true, type: 'string', description: 'Unique service code', example: 'SVC-001' },
    { name: 'service_name', required: true, type: 'string', description: 'Service name', example: 'ICU Bed (General)' },
    { name: 'service_category', required: true, type: 'enum', description: 'Category', example: 'ICU', values: ['OPD Consultation', 'ICU', 'Procedure', 'Room', 'Nursing', 'Diet', 'Consumable', 'Misc'] },
    { name: 'default_rate', required: true, type: 'number', description: 'Default rate (INR)', example: '3500' },
    { name: 'hsn_sac_code', required: false, type: 'string', description: 'HSN/SAC code for GST', example: '9993' },
    { name: 'tax_rate', required: false, type: 'number', description: 'Tax rate (%)', example: '5' },
    { name: 'is_active', required: false, type: 'boolean', description: 'Active status', example: 'true' },
];

const labTestMasterColumns: ImportColumn[] = [
    { name: 'test_name', required: true, type: 'string', description: 'Lab test name', example: 'Complete Blood Count' },
    { name: 'price', required: true, type: 'number', description: 'Test price (INR)', example: '350' },
    { name: 'category', required: false, type: 'string', description: 'Test category', example: 'Haematology' },
    { name: 'sample_type', required: false, type: 'string', description: 'Sample type required', example: 'Blood' },
    { name: 'unit', required: false, type: 'string', description: 'Result unit', example: 'g/dL' },
    { name: 'normal_range_min', required: false, type: 'number', description: 'Normal range minimum', example: '12' },
    { name: 'normal_range_max', required: false, type: 'number', description: 'Normal range maximum', example: '17' },
    { name: 'hsn_sac_code', required: false, type: 'string', description: 'HSN/SAC code', example: '9993' },
    { name: 'tax_rate', required: false, type: 'number', description: 'Tax rate (%)', example: '0' },
    { name: 'is_available', required: false, type: 'boolean', description: 'Available for order', example: 'true' },
];

const packageMasterColumns: ImportColumn[] = [
    { name: 'package_code', required: true, type: 'string', description: 'Unique package code', example: 'PKG-001' },
    { name: 'package_name', required: true, type: 'string', description: 'Package name', example: 'Appendectomy Package' },
    { name: 'description', required: false, type: 'string', description: 'Package description', example: 'Includes surgery, 3-day stay, meals' },
    { name: 'total_amount', required: true, type: 'number', description: 'Total package price (INR)', example: '35000' },
    { name: 'validity_days', required: false, type: 'number', description: 'Package validity (days)', example: '7' },
    { name: 'exclusions', required: false, type: 'string', description: 'What is excluded', example: 'Blood products, implants' },
    { name: 'is_active', required: false, type: 'boolean', description: 'Active status', example: 'true' },
];

const medicineMasterColumns: ImportColumn[] = [
    { name: 'brand_name', required: true, type: 'string', description: 'Medicine brand name (unique)', example: 'Paracetamol 500mg' },
    { name: 'generic_name', required: false, type: 'string', description: 'Generic/salt name', example: 'Paracetamol' },
    { name: 'category', required: false, type: 'string', description: 'Medicine category', example: 'Analgesic' },
    { name: 'manufacturer', required: false, type: 'string', description: 'Manufacturer name', example: 'GSK' },
    { name: 'form', required: false, type: 'string', description: 'Formulation (tablet/syrup/etc)', example: 'Tablet' },
    { name: 'strength', required: false, type: 'string', description: 'Strength', example: '500mg' },
    { name: 'mrp', required: true, type: 'number', description: 'Maximum retail price (INR)', example: '20' },
    { name: 'purchase_price', required: true, type: 'number', description: 'Purchase/cost price (INR)', example: '8' },
    { name: 'selling_price', required: true, type: 'number', description: 'Selling price (INR)', example: '15' },
    { name: 'gst_percent', required: false, type: 'number', description: 'GST percentage', example: '12' },
    { name: 'min_threshold', required: false, type: 'number', description: 'Minimum stock threshold', example: '10' },
    { name: 'hsn_sac_code', required: false, type: 'string', description: 'HSN/SAC code', example: '3004' },
    { name: 'is_active', required: false, type: 'boolean', description: 'Active status', example: 'true' },
];
```

Then in the `TEMPLATES` constant, add after the `appointments` entry (before the closing `}`):

```ts
    doctor_master: {
        name: 'Doctor Master',
        description: 'Bulk import doctors with fees, specialization, and working hours',
        columns: doctorMasterColumns,
    },
    service_master: {
        name: 'Service Master',
        description: 'Bulk import hospital services (ICU, procedures, nursing, etc.)',
        columns: serviceMasterColumns,
    },
    lab_test_master: {
        name: 'Lab Test Master',
        description: 'Bulk import lab test catalog with prices and reference ranges',
        columns: labTestMasterColumns,
    },
    package_master: {
        name: 'Package Master',
        description: 'Bulk import treatment/surgery packages with prices (inclusions added manually)',
        columns: packageMasterColumns,
    },
    medicine_master: {
        name: 'Medicine Master',
        description: 'Bulk import medicine catalog with MRP, purchase, and selling prices',
        columns: medicineMasterColumns,
    },
```

- [ ] **Step 3: Add 5 entries to the wizard's type selector**

In `app/admin/data-import/components/StepFileUpload.tsx`, add these imports at the top with the other lucide imports:
```ts
import { Database } from 'lucide-react';
```

Then append to the `IMPORT_TYPES` array (after the `appointments` entry):
```ts
    { value: 'doctor_master' as ImportType, label: 'Doctor Master', icon: Database, description: 'Bulk import doctors with fees and specialization' },
    { value: 'service_master' as ImportType, label: 'Service Master', icon: Database, description: 'Bulk import services (ICU, procedures, nursing)' },
    { value: 'lab_test_master' as ImportType, label: 'Lab Test Master', icon: Database, description: 'Bulk import lab test catalog with prices' },
    { value: 'package_master' as ImportType, label: 'Package Master', icon: Database, description: 'Bulk import treatment packages' },
    { value: 'medicine_master' as ImportType, label: 'Medicine Master', icon: Database, description: 'Bulk import medicine catalog with pricing' },
```

- [ ] **Step 4: Verify the build still passes**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main && npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors related to `ImportType`.

- [ ] **Step 5: Commit**

```bash
git add app/types/import.ts app/lib/import/templates.ts app/admin/data-import/components/StepFileUpload.tsx
git commit -m "feat(import): extend ImportType with 5 master data types + wizard entries"
```

---

### Task 2: master-validators.ts

**Files:**
- Create: `app/lib/import/master-validators.ts`

- [ ] **Step 1: Create the file**

Create `app/lib/import/master-validators.ts`:

```ts
// Client-safe — no 'use server', no Prisma imports.
// Returns validated+coerced rows OR per-row errors.

export type MasterImportType =
  | 'doctor_master'
  | 'service_master'
  | 'lab_test_master'
  | 'package_master'
  | 'medicine_master';

export interface RowError {
  rowIndex: number; // 1-based (row 1 = first data row)
  reason: string;
  originalData: Record<string, unknown>;
}

export interface ValidateResult<T> {
  valid: T[];
  errors: RowError[];
}

// ---- helpers ----

function toNum(v: unknown, fieldName: string): number | string {
  const n = parseFloat(String(v ?? ''));
  if (isNaN(n)) return `${fieldName} must be a number (got "${v}")`;
  return n;
}

function toBool(v: unknown): boolean {
  const s = String(v ?? '').toLowerCase().trim();
  return s === 'true' || s === 'yes' || s === '1';
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function optStr(v: unknown): string | undefined {
  const s = str(v);
  return s === '' ? undefined : s;
}

function optNum(v: unknown): number | undefined {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = parseFloat(String(v));
  return isNaN(n) ? undefined : n;
}

// ---- per-type validators ----

export interface DoctorRow {
  name: string; username: string; password: string; specialty: string;
  doctor_registration_no?: string; qualifications?: string;
  email?: string; phone?: string;
  consultation_fee: number; follow_up_fee: number;
  working_hours: string; slot_duration: number; is_active: boolean;
}

export interface ServiceRow {
  service_code: string; service_name: string;
  service_category: string; default_rate: number;
  hsn_sac_code?: string; tax_rate: number; is_active: boolean;
}

export interface LabTestRow {
  test_name: string; price: number;
  category?: string; sample_type?: string; unit?: string;
  normal_range_min?: number; normal_range_max?: number;
  hsn_sac_code?: string; tax_rate: number; is_available: boolean;
}

export interface PackageRow {
  package_code: string; package_name: string;
  description?: string; total_amount: number;
  validity_days: number; exclusions?: string; is_active: boolean;
}

export interface MedicineRow {
  brand_name: string; generic_name?: string; category?: string;
  manufacturer?: string; form?: string; strength?: string;
  mrp: number; purchase_price: number; selling_price: number;
  gst_percent: number; min_threshold: number;
  hsn_sac_code?: string; is_active: boolean;
}

const SERVICE_CATEGORIES = ['OPD Consultation', 'ICU', 'Procedure', 'Room', 'Nursing', 'Diet', 'Consumable', 'Misc'];

export function validateDoctorRows(rows: Record<string, unknown>[]): ValidateResult<DoctorRow> {
  const valid: DoctorRow[] = [];
  const errors: RowError[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;
    const errs: string[] = [];
    const name = str(r.name); if (name.length < 2) errs.push('name is required (min 2 chars)');
    const username = str(r.username); if (username.length < 3) errs.push('username is required (min 3 chars)');
    const password = str(r.password); if (password.length < 8) errs.push('password is required (min 8 chars)');
    const specialty = str(r.specialty); if (!specialty) errs.push('specialty is required');
    const cfRaw = toNum(r.consultation_fee, 'consultation_fee');
    if (typeof cfRaw === 'string') errs.push(cfRaw);
    const ffRaw = toNum(r.follow_up_fee, 'follow_up_fee');
    if (typeof ffRaw === 'string') errs.push(ffRaw);
    const sdRaw = toNum(r.slot_duration ?? 20, 'slot_duration');
    if (typeof sdRaw === 'string') errs.push(sdRaw);
    if (errs.length > 0) { errors.push({ rowIndex: rowNum, reason: errs.join('; '), originalData: r }); continue; }
    valid.push({
      name, username, password, specialty,
      doctor_registration_no: optStr(r.doctor_registration_no),
      qualifications: optStr(r.qualifications),
      email: optStr(r.email),
      phone: optStr(r.phone),
      consultation_fee: cfRaw as number,
      follow_up_fee: ffRaw as number,
      working_hours: str(r.working_hours) || '09:00-17:00',
      slot_duration: Math.round(sdRaw as number) || 20,
      is_active: r.is_active !== undefined ? toBool(r.is_active) : true,
    });
  }
  return { valid, errors };
}

export function validateServiceRows(rows: Record<string, unknown>[]): ValidateResult<ServiceRow> {
  const valid: ServiceRow[] = [];
  const errors: RowError[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;
    const errs: string[] = [];
    const service_code = str(r.service_code); if (!service_code) errs.push('service_code is required');
    const service_name = str(r.service_name); if (!service_name) errs.push('service_name is required');
    const service_category = str(r.service_category);
    if (!SERVICE_CATEGORIES.map(c => c.toLowerCase()).includes(service_category.toLowerCase())) {
      errs.push(`service_category must be one of: ${SERVICE_CATEGORIES.join(', ')}`);
    }
    const drRaw = toNum(r.default_rate, 'default_rate');
    if (typeof drRaw === 'string') errs.push(drRaw);
    if (errs.length > 0) { errors.push({ rowIndex: rowNum, reason: errs.join('; '), originalData: r }); continue; }
    const matchedCategory = SERVICE_CATEGORIES.find(c => c.toLowerCase() === service_category.toLowerCase())!;
    valid.push({
      service_code, service_name,
      service_category: matchedCategory,
      default_rate: drRaw as number,
      hsn_sac_code: optStr(r.hsn_sac_code),
      tax_rate: optNum(r.tax_rate) ?? 0,
      is_active: r.is_active !== undefined ? toBool(r.is_active) : true,
    });
  }
  return { valid, errors };
}

export function validateLabTestRows(rows: Record<string, unknown>[]): ValidateResult<LabTestRow> {
  const valid: LabTestRow[] = [];
  const errors: RowError[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;
    const errs: string[] = [];
    const test_name = str(r.test_name); if (!test_name) errs.push('test_name is required');
    const priceRaw = toNum(r.price, 'price');
    if (typeof priceRaw === 'string') errs.push(priceRaw);
    if (errs.length > 0) { errors.push({ rowIndex: rowNum, reason: errs.join('; '), originalData: r }); continue; }
    valid.push({
      test_name, price: priceRaw as number,
      category: optStr(r.category), sample_type: optStr(r.sample_type), unit: optStr(r.unit),
      normal_range_min: optNum(r.normal_range_min), normal_range_max: optNum(r.normal_range_max),
      hsn_sac_code: optStr(r.hsn_sac_code),
      tax_rate: optNum(r.tax_rate) ?? 0,
      is_available: r.is_available !== undefined ? toBool(r.is_available) : true,
    });
  }
  return { valid, errors };
}

export function validatePackageRows(rows: Record<string, unknown>[]): ValidateResult<PackageRow> {
  const valid: PackageRow[] = [];
  const errors: RowError[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;
    const errs: string[] = [];
    const package_code = str(r.package_code); if (!package_code) errs.push('package_code is required');
    const package_name = str(r.package_name); if (!package_name) errs.push('package_name is required');
    const taRaw = toNum(r.total_amount, 'total_amount');
    if (typeof taRaw === 'string') errs.push(taRaw);
    const vdRaw = toNum(r.validity_days ?? 7, 'validity_days');
    if (typeof vdRaw === 'string') errs.push(vdRaw);
    if (errs.length > 0) { errors.push({ rowIndex: rowNum, reason: errs.join('; '), originalData: r }); continue; }
    valid.push({
      package_code, package_name,
      description: optStr(r.description),
      total_amount: taRaw as number,
      validity_days: Math.max(1, Math.round(vdRaw as number)),
      exclusions: optStr(r.exclusions),
      is_active: r.is_active !== undefined ? toBool(r.is_active) : true,
    });
  }
  return { valid, errors };
}

export function validateMedicineRows(rows: Record<string, unknown>[]): ValidateResult<MedicineRow> {
  const valid: MedicineRow[] = [];
  const errors: RowError[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;
    const errs: string[] = [];
    const brand_name = str(r.brand_name); if (!brand_name) errs.push('brand_name is required');
    const mrpRaw = toNum(r.mrp, 'mrp');
    if (typeof mrpRaw === 'string') errs.push(mrpRaw);
    const ppRaw = toNum(r.purchase_price, 'purchase_price');
    if (typeof ppRaw === 'string') errs.push(ppRaw);
    const spRaw = toNum(r.selling_price, 'selling_price');
    if (typeof spRaw === 'string') errs.push(spRaw);
    if (errs.length > 0) { errors.push({ rowIndex: rowNum, reason: errs.join('; '), originalData: r }); continue; }
    valid.push({
      brand_name,
      generic_name: optStr(r.generic_name), category: optStr(r.category),
      manufacturer: optStr(r.manufacturer), form: optStr(r.form), strength: optStr(r.strength),
      mrp: mrpRaw as number, purchase_price: ppRaw as number, selling_price: spRaw as number,
      gst_percent: optNum(r.gst_percent) ?? 0,
      min_threshold: Math.round(optNum(r.min_threshold) ?? 10),
      hsn_sac_code: optStr(r.hsn_sac_code),
      is_active: r.is_active !== undefined ? toBool(r.is_active) : true,
    });
  }
  return { valid, errors };
}

export function validateMasterRows(
  type: MasterImportType,
  rows: Record<string, unknown>[],
): ValidateResult<DoctorRow | ServiceRow | LabTestRow | PackageRow | MedicineRow> {
  switch (type) {
    case 'doctor_master': return validateDoctorRows(rows);
    case 'service_master': return validateServiceRows(rows);
    case 'lab_test_master': return validateLabTestRows(rows);
    case 'package_master': return validatePackageRows(rows);
    case 'medicine_master': return validateMedicineRows(rows);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main && npx tsc --noEmit 2>&1 | grep master-validators | head -10
```
Expected: no output (no errors in this file).

- [ ] **Step 3: Commit**

```bash
git add app/lib/import/master-validators.ts
git commit -m "feat(import): add master data row validators (client-safe)"
```

---

### Task 3: master-templates.ts (client-side template download)

**Files:**
- Create: `app/lib/import/master-templates.ts`

- [ ] **Step 1: Create the file**

Create `app/lib/import/master-templates.ts`:

```ts
// Client-safe — no 'use server'. Generates Excel template files in-browser.
import { generateTemplateFile, } from './parser';
import { getTemplateHeaders } from './templates';
import type { MasterImportType } from './master-validators';

// Sample rows shown in each template so admins understand the expected format.
const SAMPLE_ROWS: Record<MasterImportType, Record<string, string>> = {
  doctor_master: {
    name: 'Dr. Priya Sharma', username: 'priya.sharma', password: 'Welcome@123',
    specialty: 'Cardiology', doctor_registration_no: 'MH-12345', qualifications: 'MBBS, MD',
    email: 'priya@hospital.com', phone: '9876543210',
    consultation_fee: '500', follow_up_fee: '300',
    working_hours: '09:00-17:00', slot_duration: '20', is_active: 'true',
  },
  service_master: {
    service_code: 'SVC-001', service_name: 'ICU Bed (General)', service_category: 'ICU',
    default_rate: '3500', hsn_sac_code: '9993', tax_rate: '5', is_active: 'true',
  },
  lab_test_master: {
    test_name: 'Complete Blood Count', price: '350', category: 'Haematology',
    sample_type: 'Blood', unit: 'g/dL', normal_range_min: '12', normal_range_max: '17',
    hsn_sac_code: '9993', tax_rate: '0', is_available: 'true',
  },
  package_master: {
    package_code: 'PKG-001', package_name: 'Appendectomy Package',
    description: 'Includes surgery, 3-day stay, meals',
    total_amount: '35000', validity_days: '7',
    exclusions: 'Blood products, implants', is_active: 'true',
  },
  medicine_master: {
    brand_name: 'Paracetamol 500mg', generic_name: 'Paracetamol', category: 'Analgesic',
    manufacturer: 'GSK', form: 'Tablet', strength: '500mg',
    mrp: '20', purchase_price: '8', selling_price: '15',
    gst_percent: '12', min_threshold: '10', hsn_sac_code: '3004', is_active: 'true',
  },
};

function triggerDownload(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadMasterTemplate(type: MasterImportType) {
  const headers = getTemplateHeaders(type);
  const sampleRow = SAMPLE_ROWS[type];
  // Only include keys that are in headers (in the right order)
  const orderedSample: Record<string, string> = {};
  for (const h of headers) { orderedSample[h] = sampleRow[h] ?? ''; }
  const buffer = generateTemplateFile(headers, [orderedSample], 'xlsx');
  const label = type.replace('_master', '').replace('_', '-');
  triggerDownload(buffer, `${label}-master-template.xlsx`);
}
```

- [ ] **Step 2: Verify no import errors**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main && npx tsc --noEmit 2>&1 | grep master-templates | head -10
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/lib/import/master-templates.ts
git commit -m "feat(import): add client-side master template download helper"
```

---

### Task 4: master-import-actions.ts (server action)

**Files:**
- Create: `app/actions/master-import-actions.ts`

- [ ] **Step 1: Create the server action file**

Create `app/actions/master-import-actions.ts`:

```ts
'use server';

import { requireTenantContext } from '@/backend/tenant';
import {
  createDoctor,
} from './doctor-master-actions';
import {
  createService, createLabTest, createPackage,
} from './service-master-actions';
import {
  createMedicine,
} from './medicine-master-actions';
import type { MasterImportType } from '@/app/lib/import/master-validators';

export interface ImportRowFailure {
  rowIndex: number;
  reason: string;
  originalData: Record<string, unknown>;
}

export interface ImportMasterResult {
  imported: number;
  failed: ImportRowFailure[];
}

const MAX_ROWS = 500;

export async function importMasterData(
  type: MasterImportType,
  rows: Record<string, unknown>[],
): Promise<{ success: boolean; data?: ImportMasterResult; error?: string }> {
  try {
    const { session, organizationId } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    if (rows.length > MAX_ROWS) {
      return { success: false, error: `Maximum ${MAX_ROWS} rows per import (got ${rows.length})` };
    }

    let imported = 0;
    const failed: ImportRowFailure[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        let result: { success: boolean; error?: string };
        if (type === 'doctor_master') {
          result = await createDoctor(row);
        } else if (type === 'service_master') {
          result = await createService(row);
        } else if (type === 'lab_test_master') {
          result = await createLabTest(row);
        } else if (type === 'package_master') {
          result = await createPackage({ ...(row as any), inclusions: [] });
        } else {
          result = await createMedicine(row);
        }
        if (result.success) {
          imported++;
        } else {
          failed.push({ rowIndex: i + 1, reason: result.error || 'Unknown error', originalData: row });
        }
      } catch (e: any) {
        failed.push({ rowIndex: i + 1, reason: e.message || 'Unexpected error', originalData: row });
      }
    }

    // Single audit log entry for the bulk operation
    try {
      const { db } = await requireTenantContext();
      await db.system_audit_logs.create({
        data: {
          action: `BULK_IMPORT_${type.toUpperCase()}`,
          module: 'master-data',
          details: `Bulk import ${type}: ${imported} imported, ${failed.length} failed`,
          organizationId,
          user_id: session.id,
          username: session.username,
          role: session.role,
        },
      });
    } catch {
      // audit failure should not fail the import response
    }

    return { success: true, data: { imported, failed } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main && npx tsc --noEmit 2>&1 | grep master-import-actions | head -10
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/actions/master-import-actions.ts
git commit -m "feat(import): add importMasterData server action with bulk routing + audit"
```

---

### Task 5: MasterImportButton component

**Files:**
- Create: `app/components/master/MasterImportButton.tsx`

- [ ] **Step 1: Create the component**

Create `app/components/master/MasterImportButton.tsx`:

```tsx
'use client';

import React, { useRef, useState } from 'react';
import { Upload, Download, Loader2, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { parseFile } from '@/app/lib/import/parser';
import { validateMasterRows } from '@/app/lib/import/master-validators';
import { downloadMasterTemplate } from '@/app/lib/import/master-templates';
import { importMasterData } from '@/app/actions/master-import-actions';
import type { MasterImportType, RowError } from '@/app/lib/import/master-validators';

const MAX_ROWS = 500;

interface Props {
  type: MasterImportType;
  onImportComplete: () => void;
}

type Stage = 'idle' | 'parsing' | 'preview' | 'importing' | 'done';

interface PreviewState {
  totalRows: number;
  previewRows: Record<string, unknown>[];
  validCount: number;
  errors: RowError[];
  validRows: Record<string, unknown>[];
}

export default function MasterImportButton({ type, onImportComplete }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; failed: { rowIndex: number; reason: string; originalData: Record<string, unknown> }[] } | null>(null);

  function handleTemplateDownload() {
    try {
      downloadMasterTemplate(type);
    } catch (e: any) {
      toast.error('Failed to generate template: ' + e.message);
    }
  }

  async function handleFile(file: File) {
    setStage('parsing');
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseFile(buffer, file.name);

      if (parsed.totalRows > MAX_ROWS) {
        toast.error(`File has ${parsed.totalRows} rows. Maximum is ${MAX_ROWS}.`);
        setStage('idle');
        return;
      }

      const { valid, errors } = validateMasterRows(type, parsed.data as Record<string, unknown>[]);

      setPreview({
        totalRows: parsed.totalRows,
        previewRows: (valid as Record<string, unknown>[]).slice(0, 5),
        validCount: valid.length,
        errors,
        validRows: valid as Record<string, unknown>[],
      });
      setStage('preview');
    } catch (e: any) {
      toast.error('Could not read file: ' + e.message);
      setStage('idle');
    }
    // reset file input so the same file can be re-selected
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleProceed() {
    if (!preview || preview.validCount === 0) return;
    setStage('importing');
    const res = await importMasterData(type, preview.validRows);
    if (!res.success) {
      toast.error(res.error || 'Import failed');
      setStage('preview');
      return;
    }
    setImportResult(res.data!);
    setStage('done');
    if (res.data!.imported > 0) {
      toast.success(`Imported ${res.data!.imported} rows successfully`);
      onImportComplete();
    }
  }

  function handleErrorReportDownload() {
    if (!importResult || importResult.failed.length === 0) return;
    // Get all keys from first failed row's originalData for headers
    const firstRow = importResult.failed[0]?.originalData ?? {};
    const dataKeys = Object.keys(firstRow);
    const headers = ['Row', 'Error', ...dataKeys];
    const rows = importResult.failed.map(f => ({
      Row: f.rowIndex,
      Error: f.reason,
      ...f.originalData,
    }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 15) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import Errors');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-import-errors.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function close() {
    setStage('idle');
    setPreview(null);
    setImportResult(null);
  }

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleTemplateDownload}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50"
        >
          <Download className="h-4 w-4" /> Template
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={stage === 'parsing' || stage === 'importing'}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50"
        >
          {(stage === 'parsing' || stage === 'importing') ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {stage === 'parsing' ? 'Reading…' : stage === 'importing' ? 'Importing…' : 'Import'}
        </button>
      </div>

      {/* Modal — preview or done */}
      {(stage === 'preview' || stage === 'done') && preview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">
                {stage === 'done' ? 'Import Complete' : `Preview — ${preview.validCount} of ${preview.totalRows} rows valid`}
              </h2>
              <button onClick={close} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Validation error summary */}
            {preview.errors.length > 0 && stage === 'preview' && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">
                      {preview.errors.length} row{preview.errors.length > 1 ? 's' : ''} will be skipped (validation errors):
                    </p>
                    <ul className="mt-1 space-y-0.5 text-xs text-amber-700 max-h-24 overflow-y-auto">
                      {preview.errors.slice(0, 10).map((e, idx) => (
                        <li key={idx}>Row {e.rowIndex}: {e.reason}</li>
                      ))}
                      {preview.errors.length > 10 && <li>…and {preview.errors.length - 10} more</li>}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Import result summary */}
            {stage === 'done' && importResult && (
              <div className={`mb-4 p-3 rounded-xl border ${importResult.failed.length === 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <p className="text-sm font-semibold text-green-800">
                    {importResult.imported} row{importResult.imported !== 1 ? 's' : ''} imported
                    {importResult.failed.length > 0 && `, ${importResult.failed.length} failed`}
                  </p>
                </div>
              </div>
            )}

            {/* Preview table — first 5 valid rows */}
            {preview.previewRows.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-gray-200 mb-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {Object.keys(preview.previewRows[0]).map(k => (
                        <th key={k} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.previewRows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="px-3 py-2 text-gray-700 max-w-[140px] truncate">{String(v ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.validCount > 5 && (
                  <p className="text-xs text-center text-gray-400 py-2 border-t border-gray-100">
                    Showing 5 of {preview.validCount} valid rows
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {stage === 'done' && importResult && importResult.failed.length > 0 && (
                <button
                  onClick={handleErrorReportDownload}
                  className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-700 text-sm font-semibold rounded-xl hover:bg-red-50"
                >
                  <Download className="h-4 w-4" /> Download Error Report
                </button>
              )}
              <div className="flex-1" />
              <button onClick={close} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50">
                {stage === 'done' ? 'Close' : 'Cancel'}
              </button>
              {stage === 'preview' && (
                <button
                  onClick={handleProceed}
                  disabled={preview.validCount === 0}
                  className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50"
                >
                  Import {preview.validCount} row{preview.validCount !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main && npx tsc --noEmit 2>&1 | grep MasterImportButton | head -10
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/components/master/MasterImportButton.tsx
git commit -m "feat(import): add MasterImportButton shared component"
```

---

### Task 6: Wire MasterImportButton into master pages

**Files:**
- Modify: `app/admin/master/doctors/page.tsx`
- Modify: `app/admin/master/services/page.tsx`
- Modify: `app/admin/master/medicines/page.tsx`

- [ ] **Step 1: Add import to Doctors page**

In `app/admin/master/doctors/page.tsx`:

1. Add import at the top of the file (after the existing imports):
```tsx
import MasterImportButton from '@/app/components/master/MasterImportButton';
```

2. Find the header row div (the one containing the Search input and "Add Doctor" button). It looks like:
```tsx
<div className="flex items-center justify-between">
```

Change the "Add Doctor" button section so both import and add buttons appear:
```tsx
<div className="flex items-center gap-2">
  <MasterImportButton type="doctor_master" onImportComplete={load} />
  <button onClick={openCreate}
    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
    <Plus className="h-4 w-4" /> Add Doctor
  </button>
</div>
```

- [ ] **Step 2: Add imports to Services page**

In `app/admin/master/services/page.tsx`:

1. Add import:
```tsx
import MasterImportButton from '@/app/components/master/MasterImportButton';
```

2. The Services page has three sub-tabs, each with their own header + "Add" button. Find the header row for each sub-tab and add the appropriate import button:

For the **Services** sub-tab header (contains "Add Service" button):
```tsx
<div className="flex items-center gap-2">
  <MasterImportButton type="service_master" onImportComplete={loadServices} />
  {/* existing Add Service button */}
</div>
```

For the **Lab Tests** sub-tab header (contains "Add Lab Test" button):
```tsx
<div className="flex items-center gap-2">
  <MasterImportButton type="lab_test_master" onImportComplete={loadLabTests} />
  {/* existing Add Lab Test button */}
</div>
```

For the **Packages** sub-tab header (contains "Add Package" button):
```tsx
<div className="flex items-center gap-2">
  <MasterImportButton type="package_master" onImportComplete={loadPackages} />
  {/* existing Add Package button */}
</div>
```

> **Note:** Read `app/admin/master/services/page.tsx` first to find the exact load function names and button placement before editing. The load function names may be `loadServices`, `loadLabTests`, `loadPackages` or similar.

- [ ] **Step 3: Add import to Medicines page**

In `app/admin/master/medicines/page.tsx`:

1. Add import:
```tsx
import MasterImportButton from '@/app/components/master/MasterImportButton';
```

2. Find the header div with the "Add Medicine" button and add:
```tsx
<div className="flex items-center gap-2">
  <MasterImportButton type="medicine_master" onImportComplete={load} />
  {/* existing Add Medicine button */}
</div>
```

> **Note:** Read the file first to find the exact load function name and header structure.

- [ ] **Step 4: Build check**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main && npm run build 2>&1 | tail -30
```
Expected: build completes with exit code 0 and no TypeScript errors.

- [ ] **Step 5: Lint check**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main && npm run lint 2>&1 | tail -20
```
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add app/admin/master/doctors/page.tsx app/admin/master/services/page.tsx app/admin/master/medicines/page.tsx
git commit -m "feat(import): wire MasterImportButton into all 3 master admin pages"
```

---

### Task 7: End-to-end smoke test

- [ ] **Step 1: Start dev server**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main && npm run dev
```

- [ ] **Step 2: Test template download**

Navigate to `/admin/master/doctors` and click "Template". Verify `doctor-master-template.xlsx` downloads with correct headers: name, username, password, specialty, doctor_registration_no, qualifications, email, phone, consultation_fee, follow_up_fee, working_hours, slot_duration, is_active — and one sample row.

- [ ] **Step 3: Test doctor import**

Create a local `test-doctors.xlsx` with these 3 rows (use the downloaded template):

| name | username | password | specialty | consultation_fee | follow_up_fee |
|---|---|---|---|---|---|
| Dr. Test Import | test.import | Welcome@123 | General Medicine | 400 | 200 |
| Dr. Bad Row | | Welcome@123 | Surgery | 500 | 250 |
| Dr. Second | second.doc | Pass1234! | Orthopaedics | 600 | 300 |

Row 2 has no username — expect it to be rejected.

Click "Import", pick the file. Verify:
- Preview modal shows "2 of 3 rows valid"
- Row 2 error is shown in amber section
- Click "Import 2 rows"
- Success toast: "Imported 2 rows successfully"
- Table refreshes and shows Dr. Test Import + Dr. Second

- [ ] **Step 4: Test error report download**

Create a file where all 3 rows are invalid (empty required fields). Import it. Verify:
- 0 imported, error summary shown
- "Download Error Report" button appears
- Download file has columns: Row, Error, + all original columns

- [ ] **Step 5: Test medicine import**

Navigate to `/admin/master/medicines`. Download template. Fill 1 valid row (brand_name, mrp, purchase_price, selling_price required). Import. Verify medicine appears in list with correct prices.

- [ ] **Step 6: Test wizard integration**

Navigate to `/admin/data-import`. Verify "Doctor Master", "Service Master", "Lab Test Master", "Package Master", "Medicine Master" appear in the import type selector.

- [ ] **Step 7: Test 500-row limit**

Create an xlsx with 501 rows (can script with Node). Attempt import. Verify toast: "File has 501 rows. Maximum is 500."

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat(master): Excel import complete — templates, validation, bulk import, error reports"
```

---

## Verification Checklist

- [ ] `npm run build` exits 0 with no TS errors
- [ ] `npm run lint` exits 0 with no new errors
- [ ] Template download works for all 5 types (correct headers + sample row)
- [ ] Import with mixed valid/invalid rows: valid ones imported, invalid ones skipped and listed
- [ ] Error report downloads as Excel with Row, Error, + original data columns
- [ ] 501-row file blocked client-side before server call
- [ ] Wizard dropdown shows 5 new master data types
- [ ] Audit log entry created after successful import
- [ ] Page table refreshes automatically after import
