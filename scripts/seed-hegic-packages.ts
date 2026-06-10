/**
 * Seed: HDFC ERGO HEGIC Surgical Packages → IpdPackage
 *
 * Source list: 147 surgical procedures (HDFC ERGO HEGIC, AVISE Hospital, Gurugram).
 * Prices are NOT in the source, so every package is created with total_amount = 0
 * as a PLACEHOLDER — set the real amounts later via the admin IPD-package UI.
 *
 * Scope: imports ONLY into the organization you pass via ORGANIZATION_ID, on the
 * database you pass via DATABASE_URL. Nothing else is touched. No insurer record
 * is created (packages only).
 *
 * 1) Find the AVISE org id on its hosted DB:
 *      DATABASE_URL="<avise-db-url>" npx tsx scripts/lookup-org.ts
 *
 * 2) Run the import against that DB + org:
 *      DATABASE_URL="<avise-db-url>" ORGANIZATION_ID="<avise-org-id>" npx tsx scripts/seed-hegic-packages.ts
 *
 * Idempotent: upserts by (package_code, organizationId) — safe to re-run.
 * Re-running will NOT overwrite a price you've already set, because update only
 * touches the name/description/flags (total_amount is set on create only).
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const ORGANIZATION_ID = process.env.ORGANIZATION_ID;

const PACKAGE_PREFIX = 'HEGIC';
const PLACEHOLDER_AMOUNT = 0; // no prices in source — fill in later

const PACKAGES: { serial_no: number; procedure_name: string }[] = [
  { serial_no: 1, procedure_name: 'Angiography / Check Angiography (CAG)' },
  { serial_no: 2, procedure_name: 'Angioplasty - PTCA' },
  { serial_no: 3, procedure_name: 'Angiography with Angioplasty (CAG + PTCA)' },
  { serial_no: 4, procedure_name: 'Aortic Valve Replacement' },
  { serial_no: 5, procedure_name: 'CABG' },
  { serial_no: 6, procedure_name: 'Double Valve Replacement (DVR)' },
  { serial_no: 7, procedure_name: 'Permanent Pacemaker Implantation' },
  { serial_no: 8, procedure_name: 'RF Ablation with EPS' },
  { serial_no: 9, procedure_name: 'Temporary Pacemaker Implantation' },
  { serial_no: 10, procedure_name: 'Tonsillectomy / Adenoidectomy' },
  { serial_no: 11, procedure_name: 'Adenotonsillectomy' },
  { serial_no: 12, procedure_name: 'Tympanoplasty' },
  { serial_no: 13, procedure_name: 'Mastoidectomy' },
  { serial_no: 14, procedure_name: 'Mastoidectomy & Tympanoplasty' },
  { serial_no: 15, procedure_name: 'FESS With Septoplasty & Turbinectomy / Polypectomy - Unilateral' },
  { serial_no: 16, procedure_name: 'FESS With Septoplasty & Turbinectomy / Polypectomy - Bilateral' },
  { serial_no: 17, procedure_name: 'Cortical Mastoidectomy with Myringoplasty' },
  { serial_no: 18, procedure_name: 'Peritonsillar Abscess Drainage (Day Care)' },
  { serial_no: 19, procedure_name: 'Microlaryngeal Surgeries for Cysts and Polyps' },
  { serial_no: 20, procedure_name: 'Myringotomy with Grommet Insertion' },
  { serial_no: 21, procedure_name: 'Haemorrhoidectomy' },
  { serial_no: 22, procedure_name: 'Haemorrhoidectomy + Fissurectomy' },
  { serial_no: 23, procedure_name: 'Fissurectomy and Fissure Dilatation' },
  { serial_no: 24, procedure_name: 'High End Fistulectomy' },
  { serial_no: 25, procedure_name: 'Low End Fistulectomy' },
  { serial_no: 26, procedure_name: 'Appendectomy (Lap) ± Adhesiolysis' },
  { serial_no: 27, procedure_name: 'Appendectomy (Open) ± Adhesiolysis' },
  { serial_no: 28, procedure_name: 'Cholecystectomy (Lap) ± Adhesiolysis' },
  { serial_no: 29, procedure_name: 'Cholecystectomy (Open) ± Adhesiolysis' },
  { serial_no: 30, procedure_name: 'Excision of Pilonidal Sinus with Flap Cover' },
  { serial_no: 31, procedure_name: 'Excision of Pilonidal Sinus with Primary Closure' },
  { serial_no: 32, procedure_name: 'Mastectomy (Simple)' },
  { serial_no: 33, procedure_name: 'Mastectomy (Radical) or Modified Radical Mastectomy' },
  { serial_no: 34, procedure_name: 'Thyroidectomy (Total/Subtotal/Enucleation/Partial/Lingual/Isthmectomy)' },
  { serial_no: 35, procedure_name: 'Inguinal / Femoral Hernioplasty - Unilateral' },
  { serial_no: 36, procedure_name: 'Inguinal / Femoral Hernioplasty - Bilateral' },
  { serial_no: 37, procedure_name: 'Umbilical Hernioplasty' },
  { serial_no: 38, procedure_name: 'Incisional Hernioplasty' },
  { serial_no: 39, procedure_name: 'Circumcision (Day Care)' },
  { serial_no: 40, procedure_name: 'Perianal Abscess Incision & Drainage' },
  { serial_no: 41, procedure_name: 'Breast Lumpectomy' },
  { serial_no: 42, procedure_name: 'AV Fistula (Day Care)' },
  { serial_no: 43, procedure_name: 'Hydrocele' },
  { serial_no: 44, procedure_name: 'Right or Left Hemicolectomy' },
  { serial_no: 45, procedure_name: 'Resection and Anastomosis of Small Intestine (Single)' },
  { serial_no: 46, procedure_name: 'Exploratory Laparotomy ± Adhesiolysis' },
  { serial_no: 47, procedure_name: 'ERCP - EPT / Stenting / Stone Removal' },
  { serial_no: 48, procedure_name: 'Sphincterotomy for Anal Fissure' },
  { serial_no: 49, procedure_name: 'Dialysis Reuse' },
  { serial_no: 50, procedure_name: 'Hemo-Dialysis Per Sitting' },
  { serial_no: 51, procedure_name: 'Normal Delivery (with Well Baby Care)' },
  { serial_no: 52, procedure_name: 'Caesarean Section / LSCS (with Baby Care)' },
  { serial_no: 53, procedure_name: 'LAVH < 500gm / > 500gm' },
  { serial_no: 54, procedure_name: 'TAH / TLH + BSO + Adhesiolysis (Open / Lap)' },
  { serial_no: 55, procedure_name: 'Hysterectomy with Pelvic Floor Repair (PFR)' },
  { serial_no: 56, procedure_name: 'Instrumental Delivery (with Well Baby Care)' },
  { serial_no: 57, procedure_name: 'Ovarian Cystectomy Lap / Open' },
  { serial_no: 58, procedure_name: 'Dilatation and Curettage (D&C) ± EUA (Day Care)' },
  { serial_no: 59, procedure_name: 'Vaginal Vault Prolapse Repair' },
  { serial_no: 60, procedure_name: 'Myomectomy (Lap / Open)' },
  { serial_no: 61, procedure_name: 'Dilatation & Evacuation (D&E) / MTP (Day Care)' },
  { serial_no: 62, procedure_name: 'Diagnostic ± Hysteroscopy ± Polypectomy ± D&C/D&E (Day Care)' },
  { serial_no: 63, procedure_name: 'Cataract - Phaco with Unifocal Lens' },
  { serial_no: 64, procedure_name: 'Cataract - MICS with Unifocal Lens' },
  { serial_no: 65, procedure_name: 'Vitrectomy' },
  { serial_no: 66, procedure_name: 'Vitrectomy with Gas Tamponade' },
  { serial_no: 67, procedure_name: 'Vitrectomy with Silicone Tamponade' },
  { serial_no: 68, procedure_name: 'Vitrectomy - Membrane Peeling - Endolaser - Gas/Silicone Tamponade' },
  { serial_no: 69, procedure_name: 'Vitrectomy (Sutureless) + Membrane Peeling - Endolaser Gas/Silicone' },
  { serial_no: 70, procedure_name: 'Trabeculectomy with MMC / 5-Fluorouracil' },
  { serial_no: 71, procedure_name: 'Trabeculectomy with Ologen' },
  { serial_no: 72, procedure_name: 'Retinal Detachment - Scleral Buckling' },
  { serial_no: 73, procedure_name: 'C3R - Corneal Collagen Cross Linking with Riboflavin' },
  { serial_no: 74, procedure_name: 'Femto Cataract' },
  { serial_no: 75, procedure_name: 'Femto Lasik' },
  { serial_no: 76, procedure_name: 'Total Knee Replacement - Unilateral' },
  { serial_no: 77, procedure_name: 'Total Knee Replacement - Bilateral' },
  { serial_no: 78, procedure_name: 'Hip Replacement - Unilateral' },
  { serial_no: 79, procedure_name: 'Hip Replacement - Bilateral' },
  { serial_no: 80, procedure_name: 'Fracture Neck Femur' },
  { serial_no: 81, procedure_name: 'Hemiarthroplasty' },
  { serial_no: 82, procedure_name: 'Femur Shaft Fracture - Proximal / Middle / Distal' },
  { serial_no: 83, procedure_name: 'Tibia Fracture Proximal Unicondylar / Middle / Distal ORIF' },
  { serial_no: 84, procedure_name: 'Tibia Fracture Proximal Bicondylar ORIF' },
  { serial_no: 85, procedure_name: 'Ankle Fracture - ORIF / ORIF with Screws / TBW' },
  { serial_no: 86, procedure_name: 'Arthrodesis - Wrist / Ankle Subtalar' },
  { serial_no: 87, procedure_name: 'Hand or Foot Fractures with Plates or Screws' },
  { serial_no: 88, procedure_name: 'Calcaneal Fracture with Plates' },
  { serial_no: 89, procedure_name: 'ORIF of Shoulder / Humerus' },
  { serial_no: 90, procedure_name: 'ORIF of Elbow' },
  { serial_no: 91, procedure_name: 'ORIF - Fracture of Both Bones Forearm' },
  { serial_no: 92, procedure_name: 'ORIF - Fracture of Single Bone Forearm / Wrist' },
  { serial_no: 93, procedure_name: 'Scaphoid Fracture Fixation' },
  { serial_no: 94, procedure_name: 'Arthroscopic Debridement and Synovectomy' },
  { serial_no: 95, procedure_name: 'Shoulder Arthroscopy - Bankart Repair' },
  { serial_no: 96, procedure_name: 'Shoulder Arthroscopy / Open - Sub Acromial Decompression' },
  { serial_no: 97, procedure_name: 'ACL Reconstruction / Repair' },
  { serial_no: 98, procedure_name: 'MCL Reconstruction / Repair' },
  { serial_no: 99, procedure_name: 'ACL & PCL Reconstruction / Repair' },
  { serial_no: 100, procedure_name: 'Laminectomy / Discectomy' },
  { serial_no: 101, procedure_name: 'Stabilization of Cervical Spine' },
  { serial_no: 102, procedure_name: 'Thoraco / Lumbar Global Fixation / Bone Graft' },
  { serial_no: 103, procedure_name: 'Thoraco / Lumbar Anterior Interbody Fixation / Bone Graft' },
  { serial_no: 104, procedure_name: 'Carpal Tunnel Release - Unilateral' },
  { serial_no: 105, procedure_name: 'Carpal Tunnel Release - Bilateral' },
  { serial_no: 106, procedure_name: 'Close Reduction of Fractures / Dislocations' },
  { serial_no: 107, procedure_name: 'Implant Removal of Small Bones' },
  { serial_no: 108, procedure_name: 'Implant Removal of Large Bones' },
  { serial_no: 109, procedure_name: 'Implant Removal of Spine' },
  { serial_no: 110, procedure_name: 'Bone Grafting for Non-Union of Small Bones' },
  { serial_no: 111, procedure_name: 'Bone Grafting for Non-Union of Large Bones' },
  { serial_no: 112, procedure_name: 'Acetabular Fracture Fixation' },
  { serial_no: 113, procedure_name: 'Pelvis Fracture - External Fixation' },
  { serial_no: 114, procedure_name: 'Reduction of Dislocation in GA' },
  { serial_no: 115, procedure_name: 'Amputation of Digit - Single' },
  { serial_no: 116, procedure_name: 'Amputation of Digit - Multiple' },
  { serial_no: 117, procedure_name: 'Amputation Above Elbow / Knee' },
  { serial_no: 118, procedure_name: 'Amputation Below Elbow / Knee' },
  { serial_no: 119, procedure_name: 'Small Wound Debridement' },
  { serial_no: 120, procedure_name: 'Large Wound Debridement' },
  { serial_no: 121, procedure_name: 'Tendon Repair Single' },
  { serial_no: 122, procedure_name: 'Tendon Repair Multiple' },
  { serial_no: 123, procedure_name: 'PCNL + DJ / JJ Stenting - Unilateral' },
  { serial_no: 124, procedure_name: 'PCNL + DJ / JJ Stenting - Bilateral' },
  { serial_no: 125, procedure_name: 'Prostate Removal - TURP' },
  { serial_no: 126, procedure_name: 'Prostate Removal - Open' },
  { serial_no: 127, procedure_name: 'Prostate Removal - Holmium / Diode Laser' },
  { serial_no: 128, procedure_name: 'Meatotomy (Day Care)' },
  { serial_no: 129, procedure_name: 'Renal Transplant Surgery (All Inclusive Except Organ)' },
  { serial_no: 130, procedure_name: 'DJ Stent Removal (Day Care)' },
  { serial_no: 131, procedure_name: 'Cystoscopy (Therapeutic)' },
  { serial_no: 132, procedure_name: 'Cystoscopy + URS with DJ Stenting Unilateral' },
  { serial_no: 133, procedure_name: 'Open Nephrectomy / Nephrolithotomy / Pyelolithotomy' },
  { serial_no: 134, procedure_name: 'Orchidectomy - Unilateral' },
  { serial_no: 135, procedure_name: 'Orchidectomy - Bilateral' },
  { serial_no: 136, procedure_name: 'ESWL - Extra Corporeal Shock Wave Lithotripsy (Day Care)' },
  { serial_no: 137, procedure_name: 'URS / Therapeutic' },
  { serial_no: 138, procedure_name: 'Balloon Dilation of Ureteric Stricture' },
  { serial_no: 139, procedure_name: 'Bladder Neck Incision (BNI) with Holmium Laser' },
  { serial_no: 140, procedure_name: 'RIRS + DJ Stenting - Unilateral' },
  { serial_no: 141, procedure_name: 'RIRS + DJ Stenting - Bilateral' },
  { serial_no: 142, procedure_name: 'Nephrolithotomy / Pyelolithotomy' },
  { serial_no: 143, procedure_name: 'VP Shunting' },
  { serial_no: 144, procedure_name: 'Craniotomy with Evacuation of Haematoma' },
  { serial_no: 145, procedure_name: 'Decompression Craniotomy' },
  { serial_no: 146, procedure_name: 'Varicose Veins (Surgical)' },
  { serial_no: 147, procedure_name: 'Varicose Veins (Laser or Radio Frequency Ablation)' },
];

async function ensureOrg(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    console.error(`\n❌ Organization "${orgId}" not found in this database.\n`);
    console.error('List the orgs on this DB with:');
    console.error(`  DATABASE_URL="${(process.env.DATABASE_URL || '<db-url>').replace(/:[^:@]+@/, ':***@')}" npx tsx scripts/lookup-org.ts\n`);
    throw new Error(`Organization "${orgId}" not found`);
  }
  console.log(`✓ Org found: ${org.name} (${org.id})`);
  return org;
}

async function seedPackages(orgId: string) {
  console.log(`\n→ Seeding ${PACKAGES.length} HEGIC packages (total_amount = ${PLACEHOLDER_AMOUNT} placeholder)...`);
  let inserted = 0;
  let updated = 0;

  for (const row of PACKAGES) {
    const package_code = `${PACKAGE_PREFIX}-${String(row.serial_no).padStart(3, '0')}`;
    const package_name = row.procedure_name;
    const description = JSON.stringify({
      source: 'HDFC ERGO HEGIC',
      sno: row.serial_no,
      price_status: 'placeholder',
    });

    const existing = await prisma.ipdPackage.findUnique({
      where: { package_code_organizationId: { package_code, organizationId: orgId } },
    });

    await prisma.ipdPackage.upsert({
      where: { package_code_organizationId: { package_code, organizationId: orgId } },
      update: {
        // Refresh the catalog text/flags only. Do NOT overwrite total_amount —
        // a price set by staff after import must survive a re-run.
        package_name,
        description,
        is_active: true,
      },
      create: {
        package_code,
        package_name,
        description,
        total_amount: new Prisma.Decimal(PLACEHOLDER_AMOUNT),
        validity_days: 7,
        inclusions: [],
        exclusions: [],
        is_active: true,
        organizationId: orgId,
      },
    });

    if (existing) updated++;
    else inserted++;
  }

  console.log(`✓ Packages: ${inserted} inserted, ${updated} updated (left unchanged where priced)`);
}

async function main() {
  if (!ORGANIZATION_ID) {
    console.error('\n❌ ORGANIZATION_ID is required (the AVISE org id on its hosted DB).');
    console.error('Find it with:  DATABASE_URL="<avise-db-url>" npx tsx scripts/lookup-org.ts');
    console.error('Then:          DATABASE_URL="<avise-db-url>" ORGANIZATION_ID="<id>" npx tsx scripts/seed-hegic-packages.ts\n');
    process.exit(1);
  }

  const masked = (process.env.DATABASE_URL || '<from .env>').replace(/:[^:@]+@/, ':***@');
  console.log(`DATABASE_URL: ${masked}`);
  console.log(`ORGANIZATION_ID: ${ORGANIZATION_ID}`);

  await ensureOrg(ORGANIZATION_ID);
  await seedPackages(ORGANIZATION_ID);
  console.log('\n✅ Done. Set real prices via Admin → IPD Setup / Packages (currently ₹0 placeholders).\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Seed failed:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
