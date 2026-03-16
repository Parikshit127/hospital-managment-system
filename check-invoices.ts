import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const invoices = await prisma.invoices.findMany({
    orderBy: { created_at: 'desc' },
    take: 5,
    include: { payments: true }
  });
  console.log(JSON.stringify(invoices, null, 2));
}

main().catch(console.error).finally(()=>prisma.$disconnect());
