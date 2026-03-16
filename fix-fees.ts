import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const updated0 = await prisma.user.updateMany({
    where: { role: 'doctor', consultation_fee: 0 },
    data: { consultation_fee: 500 }
  });
  console.log('Fixed (zero) doctors consultation fees: ', updated0.count);
}

main().catch(console.error).finally(()=>prisma.$disconnect());
