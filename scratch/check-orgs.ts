import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- ORGANIZATIONS IN DB ---');
  const orgs = await prisma.organization.findMany({
    include: {
      config: true,
      branding: true,
    }
  });
  console.log(JSON.stringify(orgs, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
