/**
 * Seed IPD Price List for Axten Hospitals
 * Source: axten-ipd-pricelist-agent.md
 *
 * Usage (local — uses .env DATABASE_URL):
 *   npx tsx scripts/seed-ipd-pricelist.ts
 *
 * Usage (remote — point at a different DB, set org explicitly):
 *   DATABASE_URL=<remote-pooled-url> ORGANIZATION_ID=<remote-org-uuid> npx tsx scripts/seed-ipd-pricelist.ts
 *
 * To find the right ORGANIZATION_ID for a DB, run:
 *   DATABASE_URL=<that-db-url> npx tsx scripts/lookup-org.ts
 *
 * Idempotent: upserts by (package_code, organizationId) — safe to re-run.
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const ORGANIZATION_ID = process.env.ORGANIZATION_ID || 'org-avani-default'; // Axten Hospitals (local default)

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
  // E.N.T.
  { sno: 1, category: 'E.N.T.', categoryCode: 'ENT', procedure: 'Tonsillectomy / Adenoidectomy', price: 40000 },
  { sno: 2, category: 'E.N.T.', categoryCode: 'ENT', procedure: 'Tympanoplasty', price: 45000 },
  { sno: 3, category: 'E.N.T.', categoryCode: 'ENT', procedure: 'Cochlear Implant - Unilateral', price: 800000 },

  // General & Laparoscopic Surgery
  { sno: 4, category: 'General & Laparoscopic Surgery', categoryCode: 'GSURG', procedure: 'Haemorrhoidectomy / Fistulectomy', price: 48000 },
  { sno: 5, category: 'General & Laparoscopic Surgery', categoryCode: 'GSURG', procedure: 'Appendectomy - Lap.', price: 48000 },
  { sno: 6, category: 'General & Laparoscopic Surgery', categoryCode: 'GSURG', procedure: 'Cholecystectomy - Lap.', price: 48000 },
  { sno: 7, category: 'General & Laparoscopic Surgery', categoryCode: 'GSURG', procedure: 'Hernioplasty - Lap. - Unilateral - Inguinal / Femoral / Umbilical / Incisional', price: 48000 },

  // Obstetrics & Gynaecology
  { sno: 8, category: 'Obstetrics & Gynaecology', categoryCode: 'OBG', procedure: 'Normal Delivery', price: 60000 },
  { sno: 9, category: 'Obstetrics & Gynaecology', categoryCode: 'OBG', procedure: 'Lower Segment Cesarean Section (LSCS)', price: 80000 },
  { sno: 10, category: 'Obstetrics & Gynaecology', categoryCode: 'OBG', procedure: 'Laparoscopic Assisted Vaginal Hysterectomy (LAVH)', price: 120000 },
  { sno: 11, category: 'Obstetrics & Gynaecology', categoryCode: 'OBG', procedure: 'Total Abdominal Hysterectomy (TAH) - Lap.', price: 120000 },
  { sno: 12, category: 'Obstetrics & Gynaecology', categoryCode: 'OBG', procedure: 'Ovarian Cystectomy - Lap.', price: 60000 },
  { sno: 13, category: 'Obstetrics & Gynaecology', categoryCode: 'OBG', procedure: 'Dilatation & Curettage (D&C)', price: 30000, isDayCare: true },
  { sno: 14, category: 'Obstetrics & Gynaecology', categoryCode: 'OBG', procedure: 'Cystoscopy', price: 25000, isDayCare: true },
  { sno: 15, category: 'Obstetrics & Gynaecology', categoryCode: 'OBG', procedure: 'Myomectomy - Lap.', price: 100000 },

  // Orthopaedics
  { sno: 16, category: 'Orthopaedics', categoryCode: 'ORTHO', procedure: 'Total Knee Replacement - Unilateral - With Implant', price: 200000 },
  { sno: 17, category: 'Orthopaedics', categoryCode: 'ORTHO', procedure: 'Hip Replacement - Unilateral', price: 200000 },
  { sno: 18, category: 'Orthopaedics', categoryCode: 'ORTHO', procedure: 'ACL Reconstruction / Repair', price: 130000 },

  // Urology & Nephrology
  { sno: 19, category: 'Urology & Nephrology', categoryCode: 'URO', procedure: 'RIRS', price: 95000 },
  { sno: 20, category: 'Urology & Nephrology', categoryCode: 'URO', procedure: 'PCNL - Unilateral', price: 80000 },
  { sno: 21, category: 'Urology & Nephrology', categoryCode: 'URO', procedure: 'Circumcision', price: 20000, isDayCare: true },
  { sno: 22, category: 'Urology & Nephrology', categoryCode: 'URO', procedure: 'Prostate Removal - TURP', price: 80000 },
  { sno: 23, category: 'Urology & Nephrology', categoryCode: 'URO', procedure: 'Dialysis (All inclusive)', price: 2800, isDayCare: true },
  { sno: 24, category: 'Urology & Nephrology', categoryCode: 'URO', procedure: 'DJ Stent Removal', price: 7500, isDayCare: true },

  // Vascular Surgery
  { sno: 25, category: 'Vascular Surgery', categoryCode: 'VASC', procedure: 'Varicose Veins - Unilateral', price: 70000 },
  { sno: 26, category: 'Vascular Surgery', categoryCode: 'VASC', procedure: 'AV Fistula', price: 35000, isDayCare: true },

  // Cosmetic / Plastic Surgery
  { sno: 27, category: 'Cosmetic / Plastic Surgery', categoryCode: 'COSM', procedure: 'Bariatric Surgery', price: 280000 },
  { sno: 28, category: 'Cosmetic / Plastic Surgery', categoryCode: 'COSM', procedure: 'Liposuction - Per Body Area', price: 135000 },
  { sno: 29, category: 'Cosmetic / Plastic Surgery', categoryCode: 'COSM', procedure: 'Breast Implant - Bilateral with Implant', price: 140000 },
  { sno: 30, category: 'Cosmetic / Plastic Surgery', categoryCode: 'COSM', procedure: 'Lipoma Removal - Per Lipoma', price: 5500 },
  { sno: 31, category: 'Cosmetic / Plastic Surgery', categoryCode: 'COSM', procedure: 'Gynaecomastia', price: 45000 },

  // Oncology
  { sno: 32, category: 'Oncology', categoryCode: 'ONCO', procedure: 'Chemotherapy - Per Chemo (Medicine Extra on Actuals)', price: 18000, isDayCare: true },
  { sno: 33, category: 'Oncology', categoryCode: 'ONCO', procedure: 'Breast Cancer Surgery - Unilateral', price: 180000 },
  { sno: 34, category: 'Oncology', categoryCode: 'ONCO', procedure: 'Commando Surgery with Reconstruction - Including ICU Stay', price: 410000 },
];

type DailyChargeRow = {
  serviceCode: string;
  serviceName: string;
  serviceCategory: string;
  price: number;
};

const DAILY_CHARGES: DailyChargeRow[] = [
  { serviceCode: 'ADM-GEN', serviceName: 'General Admission - Per Day', serviceCategory: 'Room Charges', price: 8000 },
  { serviceCode: 'ADM-ICU', serviceName: 'ICU Admission - Per Day', serviceCategory: 'Room Charges', price: 20000 },
  { serviceCode: 'ADM-NICU', serviceName: 'Nursery / NICU Admission - Per Day', serviceCategory: 'Room Charges', price: 15000 },
  { serviceCode: 'CONS-BASIC', serviceName: 'Doctor Consultation - Basic', serviceCategory: 'Consultation', price: 500 },
  { serviceCode: 'CONS-SPEC', serviceName: 'Doctor Consultation - Specialist', serviceCategory: 'Consultation', price: 1000 },
  { serviceCode: 'CONS-SUPER', serviceName: 'Doctor Consultation - Super Specialist', serviceCategory: 'Consultation', price: 1500 },
  { serviceCode: 'MON-BP', serviceName: 'BP Monitoring', serviceCategory: 'Monitoring', price: 150 },
];

async function ensureOrg() {
  const org = await prisma.organization.findUnique({ where: { id: ORGANIZATION_ID } });
  if (!org) {
    console.error(`\n❌ Organization "${ORGANIZATION_ID}" not found in this database.\n`);
    console.error('This script assumes the Axten organization already exists.');
    console.error('On a fresh database, run the base production seed first:');
    console.error('  ALLOW_SEED=1 npx tsx prisma/seed-production.ts');
    console.error('That creates the Axten org with id "org-axten-production".\n');
    console.error('Then re-run this script with that id:');
    console.error('  ORGANIZATION_ID="org-axten-production" npx tsx scripts/seed-ipd-pricelist.ts\n');
    console.error('To see all existing orgs in this DB:');
    console.error('  npx tsx scripts/lookup-org.ts\n');
    throw new Error(`Organization "${ORGANIZATION_ID}" not found`);
  }
  console.log(`✓ Org found: ${org.name} (${org.id})`);
}

async function seedPackages() {
  console.log(`\n→ Seeding ${PROCEDURES.length} IPD packages...`);
  let inserted = 0;
  let updated = 0;

  for (const row of PROCEDURES) {
    const package_code = `${row.categoryCode}-${String(row.sno).padStart(3, '0')}`;
    const package_name = row.isDayCare ? `${row.procedure} (Day Care)` : row.procedure;
    const description = JSON.stringify({
      category: row.category,
      is_day_care: row.isDayCare ?? false,
      sno: row.sno,
    });

    const existing = await prisma.ipdPackage.findUnique({
      where: { package_code_organizationId: { package_code, organizationId: ORGANIZATION_ID } },
    });

    await prisma.ipdPackage.upsert({
      where: { package_code_organizationId: { package_code, organizationId: ORGANIZATION_ID } },
      update: {
        package_name,
        description,
        total_amount: new Prisma.Decimal(row.price),
        inclusions: INCLUSIONS,
        exclusions: EXCLUSIONS,
        is_active: true,
      },
      create: {
        package_code,
        package_name,
        description,
        total_amount: new Prisma.Decimal(row.price),
        validity_days: 7,
        inclusions: INCLUSIONS,
        exclusions: EXCLUSIONS,
        is_active: true,
        organizationId: ORGANIZATION_ID,
      },
    });

    if (existing) updated++;
    else inserted++;
  }

  console.log(`✓ Packages: ${inserted} inserted, ${updated} updated`);
}

async function seedDailyCharges() {
  console.log(`\n→ Seeding ${DAILY_CHARGES.length} daily/consult charges to IpdServiceMaster...`);
  let inserted = 0;
  let updated = 0;

  for (const row of DAILY_CHARGES) {
    const existing = await prisma.ipdServiceMaster.findUnique({
      where: { service_code_organizationId: { service_code: row.serviceCode, organizationId: ORGANIZATION_ID } },
    });

    await prisma.ipdServiceMaster.upsert({
      where: { service_code_organizationId: { service_code: row.serviceCode, organizationId: ORGANIZATION_ID } },
      update: {
        service_name: row.serviceName,
        service_category: row.serviceCategory,
        default_rate: new Prisma.Decimal(row.price),
        is_active: true,
      },
      create: {
        service_code: row.serviceCode,
        service_name: row.serviceName,
        service_category: row.serviceCategory,
        default_rate: new Prisma.Decimal(row.price),
        tax_rate: new Prisma.Decimal(0),
        is_active: true,
        organizationId: ORGANIZATION_ID,
      },
    });

    if (existing) updated++;
    else inserted++;
  }

  console.log(`✓ Daily charges: ${inserted} inserted, ${updated} updated`);
}

async function main() {
  console.log('=== Axten Hospitals — IPD Price List Seed ===');
  console.log(`Target ORGANIZATION_ID: ${ORGANIZATION_ID}`);
  console.log(`Target DATABASE_URL:    ${(process.env.DATABASE_URL || '<from .env>').replace(/:[^:@]+@/, ':***@')}\n`);
  await ensureOrg();
  await seedPackages();
  await seedDailyCharges();

  console.log('\n=== Verification ===');
  const totalPackages = await prisma.ipdPackage.count({ where: { organizationId: ORGANIZATION_ID } });
  const totalServices = await prisma.ipdServiceMaster.count({ where: { organizationId: ORGANIZATION_ID } });
  console.log(`Total IpdPackage rows for Axten: ${totalPackages}`);
  console.log(`Total IpdServiceMaster rows for Axten: ${totalServices}`);
  console.log('\n✅ Seed complete.');
  console.log('⚠️  Lab/Diagnostics prices (ECG, X-Ray, USG, CT, MRI, PAC) NOT seeded — source doc had no prices. Flagged as TBD.');
}

main()
  .catch((e) => {
    console.error('❌ ERR:', e.message);
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
