import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const org = '0425857b-6293-4d91-86b2-bd049de66252';
  const dep = await prisma.patientDeposit.findFirst({ where: { organizationId: org }, select: { patient_id: true } });
  console.log('patient id from existing deposit:', dep?.patient_id || 'NONE FOUND');
}
main().finally(() => prisma.$disconnect());
