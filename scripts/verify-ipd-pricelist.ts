/**
 * Verify seeded IPD Price List for Axten Hospitals (Checkpoint 3).
 *  - Count of new packages = 34
 *  - Spot-check 3 prices across categories
 *  - Day-care procedure tagging is correct
 *  - All categories represented
 *  - Daily charges seeded into IpdServiceMaster
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ORG = process.env.ORGANIZATION_ID || 'org-avani-default';

const CATEGORY_PREFIXES = ['ENT', 'GSURG', 'OBG', 'ORTHO', 'URO', 'VASC', 'COSM', 'ONCO'];
const EXPECTED_DAY_CARE = ['OBG-013', 'OBG-014', 'URO-021', 'URO-023', 'URO-024', 'VASC-026', 'ONCO-032'];

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];

function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${name} — ${detail}`);
}

async function main() {
  console.log('=== Checkpoint 3: Fetch Verification ===\n');

  const seededPrefixes = CATEGORY_PREFIXES.map((p) => `${p}-`);
  const ourPackages = await prisma.ipdPackage.findMany({
    where: {
      organizationId: ORG,
      OR: seededPrefixes.map((prefix) => ({ package_code: { startsWith: prefix } })),
    },
    orderBy: { package_code: 'asc' },
  });

  record(
    'Total seeded packages = 34',
    ourPackages.length === 34,
    `found ${ourPackages.length}`,
  );

  // Spot-check 3 prices
  const cochlear = ourPackages.find((p) => p.package_code === 'ENT-003');
  record(
    'Cochlear Implant (ENT-003) = ₹8,00,000',
    !!cochlear && Number(cochlear.total_amount) === 800000,
    cochlear ? `total_amount=${cochlear.total_amount}` : 'NOT FOUND',
  );

  const lscs = ourPackages.find((p) => p.package_code === 'OBG-009');
  record(
    'LSCS (OBG-009) = ₹80,000',
    !!lscs && Number(lscs.total_amount) === 80000,
    lscs ? `total_amount=${lscs.total_amount}` : 'NOT FOUND',
  );

  const bariatric = ourPackages.find((p) => p.package_code === 'COSM-027');
  record(
    'Bariatric Surgery (COSM-027) = ₹2,80,000',
    !!bariatric && Number(bariatric.total_amount) === 280000,
    bariatric ? `total_amount=${bariatric.total_amount}` : 'NOT FOUND',
  );

  // Category coverage
  const categoriesSeen = new Set(
    ourPackages.map((p) => p.package_code.split('-')[0]),
  );
  record(
    'All 8 categories represented',
    CATEGORY_PREFIXES.every((c) => categoriesSeen.has(c)),
    `seen: ${[...categoriesSeen].sort().join(', ')}`,
  );

  // Day-care flags via description JSON
  const dayCarePkgs = ourPackages.filter((p) => {
    try {
      const meta = p.description ? JSON.parse(p.description) : null;
      return meta?.is_day_care === true;
    } catch {
      return false;
    }
  });
  record(
    'Day-care procedures = 7',
    dayCarePkgs.length === 7,
    `found ${dayCarePkgs.length}: ${dayCarePkgs.map((p) => p.package_code).join(', ')}`,
  );

  const dayCareCodes = new Set(dayCarePkgs.map((p) => p.package_code));
  record(
    'Expected day-care codes all flagged',
    EXPECTED_DAY_CARE.every((c) => dayCareCodes.has(c)),
    `expected: ${EXPECTED_DAY_CARE.join(', ')}`,
  );

  // Inclusions/exclusions populated
  const sample = ourPackages[0];
  const inclusionsArr = Array.isArray(sample.inclusions) ? sample.inclusions : [];
  const exclusionsArr = Array.isArray(sample.exclusions) ? sample.exclusions : [];
  record(
    'Inclusions populated (7)',
    inclusionsArr.length === 7,
    `length=${inclusionsArr.length}`,
  );
  record(
    'Exclusions populated (7)',
    exclusionsArr.length === 7,
    `length=${exclusionsArr.length}`,
  );

  // Daily charges in IpdServiceMaster
  const dailyServices = await prisma.ipdServiceMaster.findMany({
    where: {
      organizationId: ORG,
      service_code: { in: ['ADM-GEN', 'ADM-ICU', 'ADM-NICU', 'CONS-BASIC', 'CONS-SPEC', 'CONS-SUPER', 'MON-BP'] },
    },
  });
  record(
    'Daily/consult charges seeded (7)',
    dailyServices.length === 7,
    `found ${dailyServices.length}`,
  );

  const icu = dailyServices.find((s) => s.service_code === 'ADM-ICU');
  record(
    'ICU per day = ₹20,000',
    !!icu && Number(icu.default_rate) === 20000,
    icu ? `default_rate=${icu.default_rate}` : 'NOT FOUND',
  );

  // Print full categorized summary
  console.log('\n--- Seeded packages by category ---');
  const byCategory: Record<string, { code: string; name: string; price: number }[]> = {};
  for (const p of ourPackages) {
    const cat = p.package_code.split('-')[0];
    (byCategory[cat] ??= []).push({
      code: p.package_code,
      name: p.package_name,
      price: Number(p.total_amount),
    });
  }
  for (const [cat, items] of Object.entries(byCategory)) {
    console.log(`\n[${cat}] ${items.length} items`);
    for (const it of items) {
      console.log(`  ${it.code}  ₹${it.price.toLocaleString('en-IN').padStart(10)}  ${it.name}`);
    }
  }

  // Final result
  const failed = checks.filter((c) => !c.pass);
  console.log('\n=== Result ===');
  if (failed.length === 0) {
    console.log('✅ ALL CHECKS PASSED');
    process.exit(0);
  } else {
    console.log(`❌ ${failed.length} CHECK(S) FAILED`);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('ERR:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
