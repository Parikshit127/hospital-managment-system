import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const targetOrg = 'org-avani-default';
  
  console.log('--- UNIFYING ALL TESTING DATA TO:', targetOrg, '---');

  // 1. Move all OPD_REG
  const opdResult = await prisma.oPD_REG.updateMany({
    data: { organizationId: targetOrg }
  });
  console.log('Moved OPD_REG patients:', opdResult.count);

  // 2. Move all appointments
  const apptResult = await prisma.appointments.updateMany({
    data: { organizationId: targetOrg }
  });
  console.log('Moved appointments:', apptResult.count);

  // 3. Move all invoices
  const invResult = await prisma.invoices.updateMany({
    data: { organizationId: targetOrg }
  });
  console.log('Moved invoices:', invResult.count);

  // 4. Move all invoice items
  const itemResult = await prisma.invoice_items.updateMany({
    data: { organizationId: targetOrg }
  });
  console.log('Moved invoice items:', itemResult.count);

  // 5. Move all payments
  const payResult = await prisma.payments.updateMany({
    data: { organizationId: targetOrg }
  });
  console.log('Moved payments:', payResult.count);

  // 6. Move all doctors (User role=doctor)
  const docResult = await prisma.user.updateMany({
    where: { role: 'doctor' },
    data: { organizationId: targetOrg, consultation_fee: 500 }
  });
  console.log('Moved doctors and set fee to 500:', docResult.count);

  // 7. Verify the latest invoice amount
  const latestInvoice = await prisma.invoices.findFirst({
    orderBy: { created_at: 'desc' },
    include: { items: true, payments: true }
  });
  
  if (latestInvoice && Number(latestInvoice.net_amount) === 0) {
      console.log('Fixing latest invoice amount to 500...');
      await prisma.invoices.update({
          where: { id: latestInvoice.id },
          data: { 
              net_amount: 500, 
              total_amount: 500, 
              paid_amount: 500, 
              balance_due: 0, 
              status: 'Paid' 
          }
      });
      // Add a line item if missing
      if (latestInvoice.items.length === 0) {
          await prisma.invoice_items.create({
              data: {
                  invoice_id: latestInvoice.id,
                  department: 'OPD',
                  description: 'Consultation Fee',
                  quantity: 1,
                  unit_price: 500,
                  total_price: 500,
                  net_price: 500,
                  organizationId: targetOrg
              }
          });
      }
      // Add a payment if missing
      if (latestInvoice.payments.length === 0) {
          await prisma.payments.create({
              data: {
                  receipt_number: `RCP-${Date.now()}`,
                  invoice_id: latestInvoice.id,
                  amount: 500,
                  payment_method: 'Online',
                  payment_type: 'Settlement',
                  status: 'Completed',
                  organizationId: targetOrg
              }
          });
      }
      console.log('Fixed latest invoice.');
  }
}

main().catch(console.error).finally(()=>prisma.$disconnect());
