import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- USER ORG CHECK ---');
  const patients = await prisma.oPD_REG.findMany({
    where: { full_name: { contains: 'Sahil' } },
    select: { patient_id: true, full_name: true, organizationId: true }
  });
  console.log('Patients:', JSON.stringify(patients, null, 2));

  const staff = await prisma.user.findMany({
    where: { OR: [{ name: { contains: 'Ankit' } }, { role: 'admin' }] },
    select: { id: true, name: true, role: true, organizationId: true }
  });
  console.log('Staff:', JSON.stringify(staff, null, 2));
}

main().catch(console.error).finally(()=>prisma.$disconnect());
