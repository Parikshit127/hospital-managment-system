import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findUnique({
    where: { id: 'org-avani-default' },
  });
  console.log('Org:', org);
}

main().catch(console.error).finally(() => prisma.$disconnect());
