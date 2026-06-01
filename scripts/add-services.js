const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient();

const ORGS = [
  'org-axten-production',
  '0425857b-6293-4d91-86b2-bd049de66252'
];

async function run() {
  const services = JSON.parse(fs.readFileSync('/tmp/services-to-add.json', 'utf8'));
  let added = 0;
  let skipped = 0;

  for (const orgId of ORGS) {
    const orgName = orgId === 'org-axten-production' ? 'Axten' : 'Avise';
    let orgAdded = 0;

    for (const svc of services) {
      // Make item_code unique per org
      const itemCode = `${svc.item_code}-${orgId.substring(0, 6)}`;

      // Check if already exists
      const existing = await p.charge_catalog.findFirst({
        where: {
          organizationId: orgId,
          item_name: svc.item_name,
        }
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Also check by item_code
      const existingCode = await p.charge_catalog.findUnique({
        where: { item_code: itemCode }
      });

      if (existingCode) {
        skipped++;
        continue;
      }

      try {
        await p.charge_catalog.create({
          data: {
            item_name: svc.item_name,
            item_code: itemCode,
            category: svc.category,
            service_category: svc.service_category,
            default_price: svc.default_price,
            department: svc.department || null,
            hsn_sac_code: svc.hsn_sac_code,
            tax_rate: 0,
            is_active: true,
            organizationId: orgId,
          }
        });
        orgAdded++;
        added++;
      } catch (e) {
        console.log(`  Skip: ${svc.item_name} - ${e.message.split('\n')[0]}`);
        skipped++;
      }
    }
    console.log(`${orgName}: Added ${orgAdded} services`);
  }

  console.log(`\nTotal: ${added} added, ${skipped} skipped`);
  await p.$disconnect();
}

run();
