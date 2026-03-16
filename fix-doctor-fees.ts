import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- DOCTORS WITHOUT FEE ---');
  const doctors = await prisma.user.findMany({
    where: { role: 'doctor' },
    select: { id: true, name: true, consultation_fee: true, organizationId: true }
  });
  console.log(JSON.stringify(doctors, null, 2));

  console.log('\n--- ATTEMPTING TO SET DEFAULT FEE (500) FOR ALL DOCTORS ---');
  const updateResult = await prisma.user.updateMany({
    where: { role: 'doctor' },
    data: { consultation_fee: 500 }
  });
  console.log('Updated doctors count:', updateResult.count);

  console.log('\n--- RE-CHECKING DOCTORS ---');
  const doctorsAfter = await prisma.user.findMany({
    where: { role: 'doctor' },
    select: { id: true, name: true, consultation_fee: true }
  });
  console.log(JSON.stringify(doctorsAfter, null, 2));
}

main().catch(console.error).finally(()=>prisma.$disconnect());
