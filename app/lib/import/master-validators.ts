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

function parseBool(v: unknown): boolean {
  if (v === undefined || v === null || String(v).trim() === '') return true; // default active
  const s = String(v).toLowerCase().trim();
  if (s === 'true' || s === 'yes' || s === '1') return true;
  if (s === 'false' || s === 'no' || s === '0') return false;
  return true; // unrecognised — default to true, do not error (admin data, lenient)
}

// ---- per-type validators ----

export interface DoctorRow {
  name: string; username: string; password: string; specialty: string;
  doctor_registration_no?: string; qualifications?: string;
  email?: string; phone?: string;
  consultation_fee: number; follow_up_fee: number;
  working_hours: string; slot_duration?: number; is_active: boolean;
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
  validity_days?: number; exclusions?: string; is_active: boolean;
}

export interface MedicineRow {
  brand_name: string; generic_name?: string; category?: string;
  manufacturer?: string; form?: string; strength?: string;
  mrp: number; purchase_price: number; selling_price: number;
  gst_percent: number; min_threshold: number;
  hsn_sac_code?: string; is_active: boolean;
}

export const SERVICE_CATEGORIES = ['OPD Consultation', 'ICU', 'Procedure', 'Room', 'Nursing', 'Diet', 'Consumable', 'Misc'] as const;

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
      is_active: parseBool(r.is_active),
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
      is_active: parseBool(r.is_active),
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
      is_available: parseBool(r.is_available),
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
      is_active: parseBool(r.is_active),
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
      is_active: parseBool(r.is_active),
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
