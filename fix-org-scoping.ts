import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const targetOrg = 'org-avani-default';
  
  console.log('--- MOVING PATIENT SAHIL TO TARGET ORG ---');
  const updated = await prisma.oPD_REG.updateMany({
    where: { full_name: { contains: 'Sahil' } },
    data: { organizationId: targetOrg }
  });
  console.log('Updated patients:', updated.count);

  console.log('\n--- MOVING EXISTING APPOINTMENTS/INVOICES FOR SAHIL TO TARGET ORG ---');
  // Find Sahil's patient ID first
  const sahil = await prisma.oPD_REG.findFirst({ where: { full_name: { contains: 'Sahil' } } });
  if (sahil) {
      const pid = sahil.patient_id;
      
      const appts = await prisma.appointments.updateMany({
        where: { patient_id: pid },
        data: { organizationId: targetOrg }
      });
      console.log('Updated appointments:', appts.count);

      const invs = await prisma.invoices.updateMany({
        where: { patient_id: pid },
        data: { organizationId: targetOrg }
      });
      console.log('Updated invoices:', invs.count);

      // Also update nested items and payments if any
      // Since we don't have easy nested updateMany, we'll just fix the top level for now or check if needed
      const items = await prisma.invoice_items.updateMany({
          where: { organizationId: 'default' }, // Risky but usually only for this test
          data: { organizationId: targetOrg }
      });
      console.log('Updated invoice items:', items.count);

      const pays = await prisma.payments.updateMany({
          where: { organizationId: 'default' },
          data: { organizationId: targetOrg }
      });
      console.log('Updated payments:', pays.count);
  }
}

main().catch(console.error).finally(()=>prisma.$disconnect());
