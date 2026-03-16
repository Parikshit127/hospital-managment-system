import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('\n--- ALL ACTIVE DOCTORS AND THEIR FEES ---');
  const doctors = await prisma.user.findMany({
    where: { role: 'doctor' },
    select: { id: true, name: true, consultation_fee: true, organizationId: true }
  });
  console.log(JSON.stringify(doctors, null, 2));

  console.log('\n--- LATEST 5 INVOICES WITH DETAILS ---');
  const invoices = await prisma.invoices.findMany({
    orderBy: { created_at: 'desc' },
    take: 5,
    include: {
        items: true,
        payments: true
    }
  });
  console.log(JSON.stringify(invoices, null, 2));

  console.log('\n--- LATEST 5 PAYMENTS ---');
  const payments = await prisma.payments.findMany({
    orderBy: { created_at: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(payments, null, 2));
}

main().catch(console.error).finally(()=>prisma.$disconnect());
