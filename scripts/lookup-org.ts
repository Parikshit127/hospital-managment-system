/**
 * List all organizations + their existing IPD package count.
 * Use the printed `id` as ORGANIZATION_ID when running seed-ipd-pricelist.ts.
 *
 * Usage:
 *   npx tsx scripts/lookup-org.ts                      (uses .env DATABASE_URL)
 *   DATABASE_URL=<remote-url> npx tsx scripts/lookup-org.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log(`DATABASE_URL: ${(process.env.DATABASE_URL || '<from .env>').replace(/:[^:@]+@/, ':***@')}\n`);

  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, created_at: true },
    orderBy: { created_at: 'asc' },
  });

  console.log(`Found ${orgs.length} organization(s):\n`);
  for (const org of orgs) {
    const pkgCount = await prisma.ipdPackage.count({ where: { organizationId: org.id } });
    const svcCount = await prisma.ipdServiceMaster.count({ where: { organizationId: org.id } });
    console.log(`  📌 ${org.name}`);
    console.log(`     id:          ${org.id}`);
    console.log(`     created:     ${org.created_at.toISOString().slice(0, 10)}`);
    console.log(`     IpdPackages: ${pkgCount}`);
    console.log(`     IpdServices: ${svcCount}`);
    console.log('');
  }

  console.log('To seed packages into one of these orgs, run:');
  console.log(`  DATABASE_URL="$DATABASE_URL" ORGANIZATION_ID="<id-above>" npx tsx scripts/seed-ipd-pricelist.ts`);
}

main()
  .catch((e) => {
    console.error('ERR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
