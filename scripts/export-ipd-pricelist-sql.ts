/**
 * Export the 34 IPD packages + 7 daily charges as portable SQL INSERTs.
 *
 * Generates `scripts/ipd-pricelist-seed.sql`. Open the file in your DB console
 * (Supabase SQL editor / pgAdmin / psql) — replace :ORG_ID with the target
 * organization UUID — then run.
 *
 * Usage:
 *   npx tsx scripts/export-ipd-pricelist-sql.ts
 *
 * The SQL is idempotent (ON CONFLICT DO UPDATE).
 */
import { writeFileSync } from 'fs';
import { join } from 'path';

const INCLUSIONS = [
  'Room Rent (Day of Surgery)',
  'Nursing Care',
  'RMO Charges',
  'File Charges',
  'Surgeon Fees',
  'Medicines & Consumables',
  'Operation Theatre',
];

const EXCLUSIONS = [
  'Implants (charged as per actuals + patient choice)',
  'Pre-Surgery Test / Doctor Consultation',
  'Lab Tests',
  'Post Discharge Medicines',
  'Post Discharge Consultations',
  'Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)',
  'Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance',
];

type ProcedureRow = {
  sno: number;
  category: string;
  categoryCode: string;
  procedure: string;
  price: number;
  isDayCare?: boolean;
};

const PROCEDURES: ProcedureRow[] = [
  { sno: 1, category: 'E.N.T.', categoryCode: 'ENT', procedure: 'Tonsillectomy / Adenoidectomy', price: 40000 },
  { sno: 2, category: 'E.N.T.', categoryCode: 'ENT', procedure: 'Tympanoplasty', price: 45000 },
  { sno: 3, category: 'E.N.T.', categoryCode: 'ENT', procedure: 'Cochlear Implant - Unilateral', price: 800000 },
  { sno: 4, category: 'General & Laparoscopic Surgery', categoryCode: 'GSURG', procedure: 'Haemorrhoidectomy / Fistulectomy', price: 48000 },
  { sno: 5, category: 'General & Laparoscopic Surgery', categoryCode: 'GSURG', procedure: 'Appendectomy - Lap.', price: 48000 },
  { sno: 6, category: 'General & Laparoscopic Surgery', categoryCode: 'GSURG', procedure: 'Cholecystectomy - Lap.', price: 48000 },
  { sno: 7, category: 'General & Laparoscopic Surgery', categoryCode: 'GSURG', procedure: 'Hernioplasty - Lap. - Unilateral - Inguinal / Femoral / Umbilical / Incisional', price: 48000 },
  { sno: 8, category: 'Obstetrics & Gynaecology', categoryCode: 'OBG', procedure: 'Normal Delivery', price: 60000 },
  { sno: 9, category: 'Obstetrics & Gynaecology', categoryCode: 'OBG', procedure: 'Lower Segment Cesarean Section (LSCS)', price: 80000 },
  { sno: 10, category: 'Obstetrics & Gynaecology', categoryCode: 'OBG', procedure: 'Laparoscopic Assisted Vaginal Hysterectomy (LAVH)', price: 120000 },
  { sno: 11, category: 'Obstetrics & Gynaecology', categoryCode: 'OBG', procedure: 'Total Abdominal Hysterectomy (TAH) - Lap.', price: 120000 },
  { sno: 12, category: 'Obstetrics & Gynaecology', categoryCode: 'OBG', procedure: 'Ovarian Cystectomy - Lap.', price: 60000 },
  { sno: 13, category: 'Obstetrics & Gynaecology', categoryCode: 'OBG', procedure: 'Dilatation & Curettage (D&C)', price: 30000, isDayCare: true },
  { sno: 14, category: 'Obstetrics & Gynaecology', categoryCode: 'OBG', procedure: 'Cystoscopy', price: 25000, isDayCare: true },
  { sno: 15, category: 'Obstetrics & Gynaecology', categoryCode: 'OBG', procedure: 'Myomectomy - Lap.', price: 100000 },
  { sno: 16, category: 'Orthopaedics', categoryCode: 'ORTHO', procedure: 'Total Knee Replacement - Unilateral - With Implant', price: 200000 },
  { sno: 17, category: 'Orthopaedics', categoryCode: 'ORTHO', procedure: 'Hip Replacement - Unilateral', price: 200000 },
  { sno: 18, category: 'Orthopaedics', categoryCode: 'ORTHO', procedure: 'ACL Reconstruction / Repair', price: 130000 },
  { sno: 19, category: 'Urology & Nephrology', categoryCode: 'URO', procedure: 'RIRS', price: 95000 },
  { sno: 20, category: 'Urology & Nephrology', categoryCode: 'URO', procedure: 'PCNL - Unilateral', price: 80000 },
  { sno: 21, category: 'Urology & Nephrology', categoryCode: 'URO', procedure: 'Circumcision', price: 20000, isDayCare: true },
  { sno: 22, category: 'Urology & Nephrology', categoryCode: 'URO', procedure: 'Prostate Removal - TURP', price: 80000 },
  { sno: 23, category: 'Urology & Nephrology', categoryCode: 'URO', procedure: 'Dialysis (All inclusive)', price: 2800, isDayCare: true },
  { sno: 24, category: 'Urology & Nephrology', categoryCode: 'URO', procedure: 'DJ Stent Removal', price: 7500, isDayCare: true },
  { sno: 25, category: 'Vascular Surgery', categoryCode: 'VASC', procedure: 'Varicose Veins - Unilateral', price: 70000 },
  { sno: 26, category: 'Vascular Surgery', categoryCode: 'VASC', procedure: 'AV Fistula', price: 35000, isDayCare: true },
  { sno: 27, category: 'Cosmetic / Plastic Surgery', categoryCode: 'COSM', procedure: 'Bariatric Surgery', price: 280000 },
  { sno: 28, category: 'Cosmetic / Plastic Surgery', categoryCode: 'COSM', procedure: 'Liposuction - Per Body Area', price: 135000 },
  { sno: 29, category: 'Cosmetic / Plastic Surgery', categoryCode: 'COSM', procedure: 'Breast Implant - Bilateral with Implant', price: 140000 },
  { sno: 30, category: 'Cosmetic / Plastic Surgery', categoryCode: 'COSM', procedure: 'Lipoma Removal - Per Lipoma', price: 5500 },
  { sno: 31, category: 'Cosmetic / Plastic Surgery', categoryCode: 'COSM', procedure: 'Gynaecomastia', price: 45000 },
  { sno: 32, category: 'Oncology', categoryCode: 'ONCO', procedure: 'Chemotherapy - Per Chemo (Medicine Extra on Actuals)', price: 18000, isDayCare: true },
  { sno: 33, category: 'Oncology', categoryCode: 'ONCO', procedure: 'Breast Cancer Surgery - Unilateral', price: 180000 },
  { sno: 34, category: 'Oncology', categoryCode: 'ONCO', procedure: 'Commando Surgery with Reconstruction - Including ICU Stay', price: 410000 },
];

const DAILY_CHARGES = [
  { code: 'ADM-GEN', name: 'General Admission - Per Day', category: 'Room Charges', price: 8000 },
  { code: 'ADM-ICU', name: 'ICU Admission - Per Day', category: 'Room Charges', price: 20000 },
  { code: 'ADM-NICU', name: 'Nursery / NICU Admission - Per Day', category: 'Room Charges', price: 15000 },
  { code: 'CONS-BASIC', name: 'Doctor Consultation - Basic', category: 'Consultation', price: 500 },
  { code: 'CONS-SPEC', name: 'Doctor Consultation - Specialist', category: 'Consultation', price: 1000 },
  { code: 'CONS-SUPER', name: 'Doctor Consultation - Super Specialist', category: 'Consultation', price: 1500 },
  { code: 'MON-BP', name: 'BP Monitoring', category: 'Monitoring', price: 150 },
];

// Postgres-safe escape (doubles single quotes)
function esc(s: string): string {
  return s.replace(/'/g, "''");
}

function jsonArr(arr: string[]): string {
  return `'${esc(JSON.stringify(arr))}'::jsonb`;
}

const inclusionsLit = jsonArr(INCLUSIONS);
const exclusionsLit = jsonArr(EXCLUSIONS);

const lines: string[] = [];
lines.push('-- ====================================================================');
lines.push('-- Axten IPD Price List — 34 packages + 7 daily charges');
lines.push('-- ====================================================================');
lines.push('-- INSTRUCTIONS:');
lines.push('-- 1. Replace :ORG_ID below with the target organization UUID.');
lines.push("--    (Find it: SELECT id, name FROM organizations;)");
lines.push("-- 2. Run in your DB console (Supabase SQL editor / pgAdmin / psql).");
lines.push("-- 3. Idempotent — safe to re-run.");
lines.push("-- ====================================================================");
lines.push("");
lines.push("BEGIN;");
lines.push("");
lines.push("-- ===== Set the target organization here =====");
lines.push("-- Replace 'PUT-ORG-UUID-HERE' with the actual UUID, then run.");
lines.push("DO $$");
lines.push("DECLARE");
lines.push("    org_id TEXT := 'PUT-ORG-UUID-HERE';");
lines.push("BEGIN");
lines.push("");
lines.push("-- ===== 34 IPD packages =====");
for (const row of PROCEDURES) {
  const packageCode = `${row.categoryCode}-${String(row.sno).padStart(3, '0')}`;
  const packageName = row.isDayCare ? `${row.procedure} (Day Care)` : row.procedure;
  const description = JSON.stringify({
    category: row.category,
    is_day_care: row.isDayCare ?? false,
    sno: row.sno,
  });
  lines.push(`    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)`);
  lines.push(`    VALUES ('${packageCode}', '${esc(packageName)}', '${esc(description)}', ${row.price}, 7, ${inclusionsLit}, ${exclusionsLit}, true, org_id, NOW(), NOW())`);
  lines.push(`    ON CONFLICT (package_code, "organizationId") DO UPDATE`);
  lines.push(`      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,`);
  lines.push(`          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();`);
  lines.push('');
}

lines.push("-- ===== 7 daily / consultation charges =====");
for (const row of DAILY_CHARGES) {
  lines.push(`    INSERT INTO ipd_service_master (service_code, service_name, service_category, default_rate, tax_rate, is_active, "organizationId", created_at, updated_at)`);
  lines.push(`    VALUES ('${row.code}', '${esc(row.name)}', '${esc(row.category)}', ${row.price}, 0, true, org_id, NOW(), NOW())`);
  lines.push(`    ON CONFLICT (service_code, "organizationId") DO UPDATE`);
  lines.push(`      SET service_name = EXCLUDED.service_name, service_category = EXCLUDED.service_category,`);
  lines.push(`          default_rate = EXCLUDED.default_rate, is_active = true, updated_at = NOW();`);
  lines.push('');
}

lines.push("END $$;");
lines.push('');
lines.push('COMMIT;');
lines.push('');
lines.push("-- Verify: SELECT COUNT(*) FROM ipd_packages WHERE \"organizationId\" = '<ORG_ID>';");
lines.push("-- Expect: 34 (assuming org had none before)");

const out = lines.join('\n');
const outPath = join(__dirname, 'ipd-pricelist-seed.sql');
writeFileSync(outPath, out, 'utf-8');
console.log(`✓ Wrote ${out.length.toLocaleString()} bytes → ${outPath}`);
console.log(`  Contains: ${PROCEDURES.length} packages + ${DAILY_CHARGES.length} daily charges.`);
console.log(`\nNext steps:`);
console.log(`  1. Open scripts/ipd-pricelist-seed.sql`);
console.log(`  2. Replace 'PUT-ORG-UUID-HERE' with the target organization UUID`);
console.log(`  3. Paste into Supabase SQL editor / pgAdmin / psql and run`);
