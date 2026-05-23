import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, created_at: true },
    orderBy: { created_at: 'asc' },
  });
  console.log(JSON.stringify(orgs, null, 2));
}

main()
  .catch((e) => {
    console.error('ERR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
