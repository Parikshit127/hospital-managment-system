const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  const orgId = '0425857b-6293-4d91-86b2-bd049de66252';

  const tpaPayment = await prisma.payments.findUnique({
    where: { receipt_number: 'RCP-TPA-1781676856749' }
  });
  const cashPayment = await prisma.payments.findUnique({
    where: { receipt_number: 'RCP-1781676856759-gs96' }
  });

  if (!tpaPayment || !cashPayment) {
    console.log('TPA payment found:', tpaPayment ? 'YES' : 'NO');
    console.log('Cash payment found:', cashPayment ? 'YES' : 'NO');
    await prisma.$disconnect();
    return;
  }

  const invoiceId = tpaPayment.invoice_id;
  console.log('Invoice ID:', invoiceId);
  console.log('TPA payment:', { id: tpaPayment.id, amount: tpaPayment.amount.toString(), method: tpaPayment.payment_method });
  console.log('Cash payment:', { id: cashPayment.id, amount: cashPayment.amount.toString(), method: cashPayment.payment_method });

  const invoiceBefore = await prisma.invoices.findUnique({ where: { id: invoiceId } });
  console.log('INVOICE BEFORE:', {
    paid: invoiceBefore.paid_amount.toString(),
    balance: invoiceBefore.balance_due.toString(),
    status: invoiceBefore.status
  });

  // 1. Reverse both payments
  await prisma.payments.update({
    where: { id: tpaPayment.id },
    data: { status: 'Reversed', notes: 'Reversed - payments were added by mistake' }
  });
  await prisma.payments.update({
    where: { id: cashPayment.id },
    data: { status: 'Reversed', notes: 'Reversed - payments were added by mistake' }
  });

  // 2. Recalculate invoice totals
  const tpaAmt = Number(tpaPayment.amount);
  const cashAmt = Number(cashPayment.amount);
  const totalReversed = tpaAmt + cashAmt;
  const newPaid = Math.max(0, Number(invoiceBefore.paid_amount) - totalReversed);
  const netAmount = Number(invoiceBefore.net_amount);
  const newBalance = netAmount - newPaid;

  await prisma.invoices.update({
    where: { id: invoiceId },
    data: {
      paid_amount: newPaid,
      balance_due: newBalance > 0 ? newBalance : 0,
      status: newBalance > 0 ? 'Draft' : invoiceBefore.status
    }
  });

  // 3. Clear TPA settlement if exists
  try {
    const tpaSettlement = await prisma.tpa_settlements.findFirst({
      where: { invoice_id: invoiceId, organizationId: orgId }
    });
    if (tpaSettlement) {
      await prisma.tpa_settlements.update({
        where: { id: tpaSettlement.id },
        data: {
          claim_status: 'Pending',
          tpa_approved_amount: 0,
          tpa_received_amount: 0,
          tpa_outstanding: 0
        }
      });
      console.log('TPA settlement reset');
    }
  } catch (e) {
    console.log('TPA settlement table not found or skipped:', e.message);
  }

  // Verify
  const invoiceAfter = await prisma.invoices.findUnique({ where: { id: invoiceId } });
  console.log('INVOICE AFTER:', {
    paid: invoiceAfter.paid_amount.toString(),
    balance: invoiceAfter.balance_due.toString(),
    status: invoiceAfter.status
  });

  console.log('Done - both payments reversed, outstanding restored to', newBalance.toFixed(2));
  await prisma.$disconnect();
}

fix().catch(e => { console.error(e); process.exit(1); });
