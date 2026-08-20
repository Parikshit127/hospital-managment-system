/**
 * Create Bajaj Allianz's IPD package list for Avise Hospital.
 *
 * Why: user tried to bulk-import a Bajaj Allianz rate sheet via the TPA Rate
 * "Import" button on /admin/master/services. That importer only maps rates onto
 * *existing* packages by Package Code — it does not create new ones. All 37 rows
 * (BAGIC-001..037) were skipped because none of these packages exist yet in
 * Avise's Package Master.
 *
 * These are Bajaj-specific negotiated packages (Cash Rate = 0 in the sheet, i.e.
 * not for sale to cash patients) so they are created as *exclusive* packages for
 * Bajaj Allianz (provider_id 11) — hidden from the cash package list and from
 * every other TPA's rate view, per the existing createExclusivePackage() design
 * in app/actions/service-master-actions.ts. total_amount == tpa_amount, same as
 * that action does.
 *
 * Usage (dry run prints what would be created, writes nothing):
 *   DATABASE_URL="<url>" npx tsx scripts/import-bajaj-packages-avise.ts
 * Apply:
 *   DATABASE_URL="<url>" npx tsx scripts/import-bajaj-packages-avise.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const AVISE_ORG_ID = '0425857b-6293-4d91-86b2-bd049de66252';
const BAJAJ_PROVIDER_ID = 11;

const ROWS: { code: string; name: string; rate: number }[] = [
    { code: 'BAGIC-001', name: 'AGE / H Pylori Management.', rate: 22000 },
    { code: 'BAGIC-002', name: 'Acute Bronchitis / LTRI / UTRI.', rate: 22000 },
    { code: 'BAGIC-003', name: 'All Acid Peptic Disorders (Unknown Abdominal pain)', rate: 22000 },
    { code: 'BAGIC-004', name: 'UTI Medical Management.', rate: 22000 },
    { code: 'BAGIC-005', name: 'Dengue / Chikungunya', rate: 23500 },
    { code: 'BAGIC-006', name: 'Malaria.', rate: 22000 },
    { code: 'BAGIC-007', name: 'Seizures.', rate: 22000 },
    { code: 'BAGIC-008', name: 'Typhoid and Paratyphoid', rate: 23500 },
    { code: 'BAGIC-009', name: 'Diarrhoea & Dysentery (all type).', rate: 22000 },
    { code: 'BAGIC-010', name: 'Fever (All) / Enteric fever with tcp.', rate: 23500 },
    { code: 'BAGIC-011', name: 'AGE with Pancreatitis, hepatitis, Cholelithiasis.', rate: 22000 },
    { code: 'BAGIC-012', name: 'Accelerated Hypertension.', rate: 22000 },
    { code: 'BAGIC-013', name: 'AFI / Fever unknown origin.', rate: 22000 },
    { code: 'BAGIC-014', name: 'UTI with fever.', rate: 22000 },
    { code: 'BAGIC-015', name: 'Pneumonia with all associated problems.', rate: 22000 },
    { code: 'BAGIC-016', name: 'Acute viral hepatitis.', rate: 22000 },
    { code: 'BAGIC-017', name: 'Vomiting with dehydration with pneumonia.', rate: 22000 },
    { code: 'BAGIC-018', name: 'Renal colic with associated pains.', rate: 22000 },
    { code: 'BAGIC-019', name: 'Severe Anaemia (including blood transfusion).', rate: 22000 },
    { code: 'BAGIC-020', name: 'Hypo and Hyperglycaemia.', rate: 22000 },
    { code: 'BAGIC-021', name: 'DUB / PCOD.', rate: 22000 },
    { code: 'BAGIC-022', name: 'PIVD.', rate: 22000 },
    { code: 'BAGIC-023', name: 'Acute Exacerbation of COPD / ILD', rate: 22000 },
    { code: 'BAGIC-024', name: 'Pericarditis / Tuberculosis / Viral Encephalitis.', rate: 22000 },
    { code: 'BAGIC-025', name: 'Gastroesophageal Reflux Disease (GERD).', rate: 22000 },
    { code: 'BAGIC-026', name: 'Pelvic Inflammatory Disease / Cervicitis.', rate: 22000 },
    { code: 'BAGIC-027', name: 'Subacute Intestinal Obstruction (SAIO).', rate: 22000 },
    { code: 'BAGIC-028', name: 'Abdomen / Acute Abdomen.', rate: 22000 },
    { code: 'BAGIC-029', name: 'OA / Gout.', rate: 22000 },
    { code: 'BAGIC-030', name: 'Neuromuscular Disorder.', rate: 22000 },
    { code: 'BAGIC-031', name: 'Melena / GI Bleed.', rate: 22000 },
    { code: 'BAGIC-032', name: 'Pain Management.', rate: 22000 },
    { code: 'BAGIC-033', name: 'Enlargement of Prostate.', rate: 22000 },
    { code: 'BAGIC-034', name: 'All kind bacterial and viral infection.', rate: 22000 },
    { code: 'BAGIC-035', name: 'CSOM.', rate: 22000 },
    { code: 'BAGIC-036', name: 'Neonatal Jaundice +/- fever (NICU).', rate: 22000 },
    { code: 'BAGIC-037', name: 'Jaundice + Fever.', rate: 22000 },
];

async function main() {
    const provider = await prisma.insurance_providers.findFirst({
        where: { id: BAJAJ_PROVIDER_ID, organizationId: AVISE_ORG_ID },
    });
    if (!provider) throw new Error(`Provider ${BAJAJ_PROVIDER_ID} not found under Avise`);

    const existing = await prisma.ipdPackage.findMany({
        where: { organizationId: AVISE_ORG_ID, package_code: { in: ROWS.map((r) => r.code) } },
        select: { package_code: true },
    });
    const existingCodes = new Set(existing.map((e) => e.package_code));
    const toCreate = ROWS.filter((r) => !existingCodes.has(r.code));
    const skipped = ROWS.filter((r) => existingCodes.has(r.code));

    console.log(`Provider: ${provider.provider_name} (id ${provider.id})`);
    console.log(`${toCreate.length} package(s) to create, ${skipped.length} already exist (skipped):`);
    for (const r of skipped) console.log(`  SKIP (exists) ${r.code}`);
    for (const r of toCreate) console.log(`  ${APPLY ? 'CREATE' : 'WOULD CREATE'} ${r.code}  ₹${r.rate}  ${r.name}`);

    if (!APPLY) {
        console.log('\nDry run only — no changes written. Re-run with --apply to create these packages.');
        return;
    }

    await prisma.$transaction(async (tx) => {
        for (const r of toCreate) {
            const pkg = await tx.ipdPackage.create({
                data: {
                    package_code: r.code,
                    package_name: r.name,
                    total_amount: r.rate,
                    organizationId: AVISE_ORG_ID,
                    exclusive_provider_id: BAJAJ_PROVIDER_ID,
                },
            });
            await tx.ipdPackageTpaRate.create({
                data: {
                    package_id: pkg.id,
                    provider_id: BAJAJ_PROVIDER_ID,
                    organizationId: AVISE_ORG_ID,
                    tpa_amount: r.rate,
                },
            });
        }
    });
    console.log(`\nCreated ${toCreate.length} package(s) for Bajaj Allianz.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
