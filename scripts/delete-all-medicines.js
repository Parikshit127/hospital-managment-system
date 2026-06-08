/**
 * DELETE ALL MEDICINES from both Axten and Avise on AWS
 * Run: DATABASE_URL="<your-aws-url>" node scripts/delete-all-medicines.js
 *
 * This deletes:
 *   1. pharmacy_batch_inventory (batches) — must go first (FK)
 *   2. pharmacy_medicine_master (master catalog)
 * for both orgs.
 */

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const ORGS = [
  { id: 'org-avani-default', name: 'Axten' },
  { id: '690d5783-1da9-4fc2-b379-35577df7b31b', name: 'Oscar hospitals' },
  { id: '9be65dac-6fbc-48df-bf23-19c6ce5d0225', name: 'Golden hos' },
];

async function run() {
  console.log('⚠️  Deleting ALL medicines from AWS DB...\n');

  for (const org of ORGS) {
    console.log(`\n── ${org.name} (${org.id}) ──`);

    // 1. Delete batches first (FK constraint)
    const batchDel = await p.pharmacy_batch_inventory.deleteMany({
      where: {
        medicine: { organizationId: org.id }
      }
    });
    console.log(`  Batches deleted: ${batchDel.count}`);

    // 2. Delete medicine master
    const medDel = await p.pharmacy_medicine_master.deleteMany({
      where: { organizationId: org.id }
    });
    console.log(`  Medicines deleted: ${medDel.count}`);
  }

  console.log('\n✅ Done. All medicines cleared for both orgs.');
  await p.$disconnect();
}

run().catch(e => {
  console.error('❌ Error:', e.message);
  p.$disconnect();
  process.exit(1);
});
