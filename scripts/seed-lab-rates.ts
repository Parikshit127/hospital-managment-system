/**
 * Seed Lab Test Rates for Axten Hospitals
 *
 * Usage (local — uses .env DATABASE_URL):
 *   npx tsx scripts/seed-lab-rates.ts
 *
 * Usage (remote — point at a different DB):
 *   DATABASE_URL=<remote-url> ORGANIZATION_ID=<org-uuid> npx tsx scripts/seed-lab-rates.ts
 *
 * Idempotent: upserts by test_name — safe to re-run.
 * Category is derived from the test_code prefix.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ORGANIZATION_ID = process.env.ORGANIZATION_ID || 'org-avani-default';

// Map test_code prefix → category name
const CATEGORY_MAP: Record<string, string> = {
  BC: 'Biochemistry',
  HE: 'Haematology',
  CP: 'Clinical Pathology',
  MI: 'Microbiology',
  SE: 'Serology',
  MD: 'Miscellaneous',
  ME: 'Miscellaneous',
  HA: 'Histopathology',
};

function getCategory(testCode: string): string {
  const prefix = testCode.slice(0, 2).toUpperCase();
  return CATEGORY_MAP[prefix] ?? 'Miscellaneous';
}

// Sample type heuristics based on category
function getSampleType(category: string, testName: string): string {
  const name = testName.toLowerCase();
  if (name.includes('urine') || name.includes('microalbumin urine')) return 'Urine';
  if (name.includes('stool') || name.includes('occult blood stool')) return 'Stool';
  if (name.includes('sputum')) return 'Sputum';
  if (name.includes('csf') || name.includes('cerebrospinal')) return 'CSF';
  if (name.includes('biopsy') || name.includes('histopathology') || name.includes('fnac')) return 'Tissue';
  if (name.includes('swab')) return 'Swab';
  if (name.includes('semen')) return 'Semen';
  if (name.includes('pap smear')) return 'Cervical Swab';
  if (name.includes('fluid')) return 'Body Fluid';
  if (category === 'Histopathology') return 'Tissue';
  if (category === 'Clinical Pathology') return 'Urine';
  return 'Blood';
}

interface LabTestInput {
  test_code: string;
  test_name: string;
  price: number;
}

const LAB_TESTS: LabTestInput[] = [
  { test_code: 'BC0245', test_name: 'Fasting Blood Sugar-FBS', price: 100 },
  { test_code: 'BC0248', test_name: 'Post Prandial Blood Sugar-PPBS', price: 100 },
  { test_code: 'BC0249', test_name: 'Random Blood Sugar-RBS', price: 100 },
  { test_code: 'BC0092', test_name: 'Bilirubin Total', price: 200 },
  { test_code: 'BC0091', test_name: 'Bilirubin Direct', price: 200 },
  { test_code: 'BC0072', test_name: 'Aspartate Aminotransferase (AST/SGOT)', price: 200 },
  { test_code: 'BC0013', test_name: 'Alanine Aminotransferase (ALT/SGPT)', price: 200 },
  { test_code: 'HE0035', test_name: 'HbA1c (Glycosylated Hemoglobin)', price: 550 },
  { test_code: 'BC0340', test_name: 'Liver Function Test (LFT)', price: 770 },
  { test_code: 'BC0317', test_name: 'Kidney Function Test (KFT)', price: 800 },
  { test_code: 'BC0334', test_name: 'Lipid Profile', price: 800 },
  { test_code: 'BC0161', test_name: 'Creatine Phosphokinase Total (CPK Total)', price: 440 },
  { test_code: 'BC0162', test_name: 'Creatine Phosphokinase MB (CPK MB)', price: 770 },
  { test_code: 'BC0322', test_name: 'Lactate Dehydrogenase Serum (LDH)', price: 440 },
  { test_code: 'BC0166', test_name: 'Creatinine Clearance Rate 24 Hrs. Urine', price: 725 },
  { test_code: 'BC0250', test_name: 'Glucose Tolerance Test (GTT) 75gm 2 samples', price: 200 },
  { test_code: 'BC0347', test_name: 'Magnesium (Mg) Serum', price: 600 },
  { test_code: 'BC0311', test_name: 'Iron', price: 530 },
  { test_code: 'MD0042', test_name: 'Complete Blood Count (CBC)', price: 400 },
  { test_code: 'HE0036', test_name: 'Hb (Hemoglobin)', price: 150 },
  { test_code: 'HE0047', test_name: 'Platelet Count', price: 200 },
  { test_code: 'CP0015', test_name: 'Peripheral Smear Examination', price: 330 },
  { test_code: 'HE0020', test_name: 'Erythrocyte Sedimentation Rate-ESR', price: 150 },
  { test_code: 'HE0012', test_name: 'Blood Grouping ABO and Rh Typing (BG)', price: 150 },
  { test_code: 'HE0054', test_name: 'Smear examination for Malaria Parasite', price: 200 },
  { test_code: 'HE0014', test_name: 'Direct Coombs Test (DCT)', price: 550 },
  { test_code: 'HE0015', test_name: 'Indirect Coombs Test (ICT)', price: 660 },
  { test_code: 'BC0231', test_name: 'G6PD Qualitative', price: 935 },
  { test_code: 'BC0264', test_name: 'Hemoglobin Electrophoresis', price: 1150 },
  { test_code: 'HE0017', test_name: 'D-Dimer', price: 1375 },
  { test_code: 'BC0308', test_name: 'Interleukin 6 (IL6)', price: 2860 },
  { test_code: 'CP0024', test_name: 'Stool Routine Examination', price: 200 },
  { test_code: 'CP0027', test_name: 'Reducing substance and pH examination - Stool', price: 200 },
  { test_code: 'CP0020', test_name: 'Occult Blood Stool', price: 140 },
  { test_code: 'CP0018', test_name: 'UPT (Urine Pregnancy Test)', price: 220 },
  { test_code: 'CP0029', test_name: 'Urine Routine Examination', price: 120 },
  { test_code: 'BC0363', test_name: 'Microalbumin Urine', price: 660 },
  { test_code: 'MI0054', test_name: 'Culture & Sensitivity Aerobic Urine', price: 800 },
  { test_code: 'CP0022', test_name: 'Semen Routine Examination', price: 550 },
  { test_code: 'BC0515', test_name: 'Thyroid Stimulating Hormone-TSH', price: 300 },
  { test_code: 'BC0230', test_name: 'FSH (Follicle Stimulating Hormone)', price: 600 },
  { test_code: 'BC0344', test_name: 'Luteinizing Hormone (LH)', price: 600 },
  { test_code: 'BC0457', test_name: 'Prolactin-PRL', price: 600 },
  { test_code: 'BC0208', test_name: 'Estradiol-E2', price: 700 },
  { test_code: 'BC0454', test_name: 'Progesterone', price: 600 },
  { test_code: 'BC0510', test_name: 'Testosterone Total', price: 800 },
  { test_code: 'BC0459', test_name: 'Prostate Specific Antigen (PSA) Total', price: 800 },
  { test_code: 'BC0458', test_name: 'Free PSA', price: 900 },
  { test_code: 'BC0011', test_name: 'Alpha Feto Protein-AFP', price: 1000 },
  { test_code: 'BC0086', test_name: 'Beta-HCG Total Quantitative', price: 700 },
  { test_code: 'BC0112', test_name: 'Ovarian Cancer Marker-CA 125', price: 1300 },
  { test_code: 'BC0114', test_name: 'CA 19.9', price: 2640 },
  { test_code: 'BC0113', test_name: 'Breast Cancer Marker-CA 15.3', price: 1500 },
  { test_code: 'MI0154', test_name: 'Torch Antibodies IgG & IgM', price: 3000 },
  { test_code: 'MI0153', test_name: 'Torch Antibodies panel IgG', price: 1700 },
  { test_code: 'MI0155', test_name: 'Torch Antibodies Panel IgM', price: 1700 },
  { test_code: 'MI0156', test_name: 'Toxoplasma Antibody IgG', price: 770 },
  { test_code: 'MI0157', test_name: 'Toxoplasma Antibody IgM', price: 770 },
  { test_code: 'MI0142', test_name: 'Rubella Antibody IgG', price: 700 },
  { test_code: 'MI0143', test_name: 'Rubella Antibody IgM', price: 700 },
  { test_code: 'MI0033', test_name: 'Cytomegalo Virus (CMV) Antibody IgG', price: 725 },
  { test_code: 'MI0034', test_name: 'Cytomegalo Virus (CMV) Antibody IgM', price: 725 },
  { test_code: 'BC0293', test_name: 'Immunoglobulin G-IgG', price: 450 },
  { test_code: 'MI0100', test_name: 'HIV I & II Ab & p24 Ag Combo', price: 900 },
  { test_code: 'BC0158', test_name: 'Cortisol 4 PM', price: 750 },
  { test_code: 'BC0159', test_name: 'Cortisol 8 AM', price: 750 },
  { test_code: 'BC0217', test_name: 'Ferritin', price: 650 },
  { test_code: 'MI0089', test_name: 'Hepatitis-A Antibody (Anti-HAV) IgG', price: 1200 },
  { test_code: 'MI0084', test_name: 'Hepatitis A Antibody (Anti-HAV) IgM', price: 1200 },
  { test_code: 'MI0091', test_name: 'Hepatitis-B Core Antibody (Anti-HBc) Total', price: 1375 },
  { test_code: 'MI0013', test_name: 'Anti-HCV Rapid Qualitative', price: 700 },
  { test_code: 'MI0167', test_name: 'Anti ds DNA Serum', price: 2000 },
  { test_code: 'MI0087', test_name: 'Hepatitis E Antibody (Anti-HEV) IgG', price: 1800 },
  { test_code: 'BC0560', test_name: 'Vitamin D 25 Hydroxy', price: 1500 },
  { test_code: 'BC0552', test_name: 'Vitamin B12 Cyanocobalamin', price: 1100 },
  { test_code: 'SE0020', test_name: 'VDRL RPR', price: 275 },
  { test_code: 'BC0476', test_name: 'Rheumatoid Arthritis Factor (RA Factor)', price: 660 },
  { test_code: 'SE0016', test_name: 'Anti Streptolysin O Antibody-ASO', price: 975 },
  { test_code: 'BC0103', test_name: 'C-Reactive Protein (CRP)', price: 450 },
  { test_code: 'SE0005', test_name: 'Anti Nuclear Antibody/Factor (ANA/ANF) IFA', price: 1200 },
  { test_code: 'MI0099', test_name: 'HIV Antibodies Serum', price: 550 },
  { test_code: 'SE0024', test_name: 'Widal Test by Tube Method', price: 425 },
  { test_code: 'MI0160', test_name: 'Typhidot IgG IgM', price: 825 },
  { test_code: 'MI0120', test_name: 'Malarial Antigen By Rapid Card', price: 770 },
  { test_code: 'MI0067', test_name: 'Dengue NS1 Antigen by ELISA', price: 750 },
  { test_code: 'MI0068', test_name: 'Dengue Panel (IgG/IgM)', price: 1980 },
  { test_code: 'MI0065', test_name: 'Dengue IgG Ab by ELISA', price: 950 },
  { test_code: 'MI0066', test_name: 'Dengue IgM Ab by ELISA', price: 950 },
  { test_code: 'SE0011', test_name: 'Anti-dsDNA Antibody', price: 2000 },
  { test_code: 'BC0255', test_name: 'Growth Hormone-GH', price: 1100 },
  { test_code: 'MI0139', test_name: 'QuantiFERON TB Gold', price: 3000 },
  { test_code: 'ME0153', test_name: 'Mycobacterium Tuberculosis', price: 2420 },
  { test_code: 'SE0015', test_name: 'Anti-Sperm Antibody', price: 1600 },
  { test_code: 'BC0065', test_name: 'Anti-Thyroglobulin Antibodies (Tg)', price: 1500 },
  { test_code: 'BC0180', test_name: 'DHEA Sulphate', price: 1430 },
  { test_code: 'MD0048', test_name: 'CSF Routine Examination', price: 1100 },
  { test_code: 'BC0222', test_name: 'Fluid examination for biochemistry', price: 500 },
  { test_code: 'MI0173', test_name: 'Culture & Sensitivity Aerobic Blood', price: 1200 },
  { test_code: 'MI0050', test_name: 'Culture & Sensitivity Aerobic Sputum', price: 990 },
  { test_code: 'MI0044', test_name: 'Culture & Sensitivity Aerobic Semen', price: 990 },
  { test_code: 'MI0055', test_name: 'Culture & Sensitivity Aerobic Swab', price: 990 },
  { test_code: 'MI0007', test_name: 'ZN Stain for AFB', price: 550 },
  { test_code: 'MI0074', test_name: 'KOH Stain for Fungus', price: 440 },
  { test_code: 'HA0027', test_name: 'Histopathology Biopsy - Small Specimen', price: 800 },
  { test_code: 'HA0074', test_name: 'Histopathology Biopsy - Small 2 Specimen', price: 1900 },
  { test_code: 'HA0075', test_name: 'Histopathology Biopsy - Small 3 Specimen', price: 2850 },
  { test_code: 'HA0028', test_name: 'Histopathology Biopsy - Medium Specimen', price: 1500 },
  { test_code: 'HA0029', test_name: 'Histopathology Biopsy - Large Specimen', price: 3000 },
  { test_code: 'HA0016', test_name: 'FNAC Fine Needle Aspiration Cytology', price: 1200 },
  { test_code: 'CP0010', test_name: 'PAP Smear LBC', price: 1300 },
  { test_code: 'BC0514', test_name: 'Thyroid Function Test-TFT', price: 600 },
  { test_code: 'BC0513', test_name: 'Free Thyroid Function Test-FTFT', price: 900 },
  { test_code: 'MI0158', test_name: 'Toxoplasma Antibody IgG & IgM', price: 1375 },
  { test_code: 'MI0103', test_name: 'Herpes Simplex Virus (HSV 1 & 2) IgG', price: 825 },
  { test_code: 'MI0104', test_name: 'Herpes Simplex Virus (HSV 1 & 2) IgM', price: 825 },
  { test_code: 'MI0106', test_name: 'Herpes Simplex Virus-1 IgM', price: 900 },
  { test_code: 'MI0105', test_name: 'Herpes Simplex Virus-1 IgG', price: 900 },
  { test_code: 'MI0108', test_name: 'Herpes Simplex Virus-2 IgG', price: 900 },
  { test_code: 'MI0109', test_name: 'Herpes Simplex Virus-2 IgM', price: 900 },
];

async function main() {
  console.log(`\n🔬 Seeding lab test rates for organization: ${ORGANIZATION_ID}`);
  console.log(`   Total tests to upsert: ${LAB_TESTS.length}\n`);

  let inserted = 0;
  let updated = 0;

  for (const test of LAB_TESTS) {
    const category = getCategory(test.test_code);
    const sample_type = getSampleType(category, test.test_name);

    // Check if record already exists to track insert vs update
    const existing = await prisma.lab_test_inventory.findUnique({
      where: { test_name: test.test_name },
    });

    await prisma.lab_test_inventory.upsert({
      where: { test_name: test.test_name },
      update: {
        test_code: test.test_code,
        price: test.price,
        category,
        sample_type,
        is_available: true,
        organizationId: ORGANIZATION_ID,
      },
      create: {
        test_name: test.test_name,
        test_code: test.test_code,
        price: test.price,
        category,
        sample_type,
        is_available: true,
        organizationId: ORGANIZATION_ID,
      },
    });

    if (existing) {
      updated++;
      console.log(`  ↻  [${test.test_code}] ${test.test_name} — ₹${test.price} (updated)`);
    } else {
      inserted++;
      console.log(`  ✓  [${test.test_code}] ${test.test_name} — ₹${test.price} (inserted)`);
    }
  }

  console.log('\n========================================');
  console.log(`✅ Done! ${inserted} inserted, ${updated} updated`);
  console.log(`   Total: ${inserted + updated} / ${LAB_TESTS.length} records processed`);
  console.log('========================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
