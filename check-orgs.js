const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orgs = await prisma.organization.findMany();
  console.log("All orgs:", orgs);
}

main().catch(console.error).finally(() => prisma.$disconnect());
