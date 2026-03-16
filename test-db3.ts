import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const charges = await prisma.charge_catalog.findMany({ take: 10 });
  console.log('Charges:', charges);
}
main().catch(console.error).finally(() => prisma.$disconnect());
