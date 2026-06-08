const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function run() {
  const orgs = await p.organization.findMany({
    select: { id: true, name: true, code: true },
  });
  console.log('\nOrganizations in DB:');
  orgs.forEach(o => console.log(`  ${o.name} (${o.code}) → id: ${o.id}`));

  const medCount = await p.pharmacy_medicine_master.groupBy({
    by: ['organizationId'],
    _count: { id: true },
  });
  console.log('\nMedicine counts per org:');
  medCount.forEach(m => console.log(`  orgId: ${m.organizationId} → ${m._count.id} medicines`));

  await p.$disconnect();
}

run().catch(e => { console.error(e.message); p.$disconnect(); });
