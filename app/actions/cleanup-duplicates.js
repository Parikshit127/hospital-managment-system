const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanup(invoiceId) {
  const items = await prisma.invoice_items.findMany({
    where: { invoice_id: invoiceId, description: 'ER Consultation & Observation Fee' },
    orderBy: { id: 'asc' }
  });

  if (items.length > 1) {
    const toDelete = items.slice(1).map(i => i.id);
    await prisma.invoice_items.deleteMany({
      where: { id: { in: toDelete } }
    });
    console.log(`Deleted ${toDelete.length} duplicate items from invoice ${invoiceId}`);
  }

  // Recalculate everything for safety
  const remainingItems = await prisma.invoice_items.findMany({ where: { invoice_id: invoiceId } });
  const total = remainingItems.reduce((acc, i) => acc + Number(i.net_price), 0);
  
  await prisma.invoices.update({
    where: { id: invoiceId },
    data: { 
      total_amount: total, 
      net_amount: total,
      balance_due: total // Since it's Draft, balance_due = net_amount
    }
  });
  console.log(`Updated invoice ${invoiceId} totals to ${total}`);
}

async function main() {
  await cleanup(64);
  await cleanup(65);
}

main().then(() => process.exit(0));
