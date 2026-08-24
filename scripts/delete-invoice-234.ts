/**
 * HospitalOS — Delete / Remove Invoice AVS-IPD-26-27-234 or its Pharmacy items
 *
 * This script allows you to either:
 *  1. Completely delete the IPD invoice AVS-IPD-26-27-234 (items, snapshots, payments)
 *     so it disappears completely from Pharmacy Invoices and IPD billing.
 *  2. Or remove ONLY the Pharmacy line items from AVS-IPD-26-27-234 so it disappears
 *     from Pharmacy Sales while keeping the patient's Surgery and Lab charges (₹77,400).
 *
 * USAGE:
 *  Dry run (safe inspection):
 *    npx tsx scripts/delete-invoice-234.ts
 *
 *  To completely delete invoice AVS-IPD-26-27-234:
 *    npx tsx scripts/delete-invoice-234.ts --apply
 *
 *  To keep the surgery/lab charges and ONLY remove pharmacy items from the bill:
 *    npx tsx scripts/delete-invoice-234.ts --only-pharmacy-items --apply
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const ONLY_PHARMACY = process.argv.includes('--only-pharmacy-items');
const INVOICE_NUMBER = 'AVS-IPD-26-27-234';

const money = (n: any) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log(` HOSPITALOS — REMOVE RECORD "${INVOICE_NUMBER}"`);
  console.log('='.repeat(70));
  console.log(` Mode   : ${APPLY ? '🔴 APPLY (Writing changes to DB)' : '🟢 DRY RUN (No writes)'}`);
  console.log(` Target : ${ONLY_PHARMACY ? 'Remove only Pharmacy items from the invoice' : 'Delete entire invoice ' + INVOICE_NUMBER}`);
  console.log('-'.repeat(70) + '\n');

  const invoice = await prisma.invoices.findFirst({
    where: {
      OR: [
        { invoice_number: INVOICE_NUMBER },
        { final_bill_number: INVOICE_NUMBER },
      ],
    },
    include: {
      items: true,
      payments: true,
      payment_splits: true,
      patient: true,
      admission: true,
    },
  });

  if (!invoice) {
    console.log(`❌ Invoice ${INVOICE_NUMBER} was not found in the database.\n`);
    return;
  }

  console.log(`Found Invoice #${invoice.id} (${invoice.invoice_number || 'Draft'}):`);
  console.log(`  Patient  : ${invoice.patient?.full_name || invoice.patient_id} (${invoice.patient_id})`);
  console.log(`  Type     : ${invoice.invoice_type} | Status: ${invoice.status}`);
  console.log(`  Net Amt  : ${money(invoice.net_amount)} | Paid: ${money(invoice.paid_amount)} | Balance: ${money(invoice.balance_due)}`);
  console.log(`  Total line items: ${invoice.items.length}`);

  const pharmItems = invoice.items.filter(
    (it) =>
      it.department?.toLowerCase() === 'pharmacy' ||
      it.service_category?.toLowerCase() === 'pharmacy' ||
      it.description?.toLowerCase().startsWith('pharmacy:')
  );
  const nonPharmItems = invoice.items.filter((it) => !pharmItems.includes(it));

  const pharmTotal = pharmItems.reduce((s, it) => s + Number(it.net_price || 0), 0);
  const nonPharmTotal = nonPharmItems.reduce((s, it) => s + Number(it.net_price || 0), 0);

  console.log(`    - Pharmacy line items : ${pharmItems.length} (Total: ${money(pharmTotal)})`);
  console.log(`    - Other line items    : ${nonPharmItems.length} (Total: ${money(nonPharmTotal)})`);

  if (!APPLY) {
    console.log('\n⚠️  DRY RUN COMPLETED. No data was modified.');
    console.log('\nTo execute, choose one:');
    console.log('  1. To delete the entire invoice from Pharmacy & Billing:');
    console.log('     npx tsx scripts/delete-invoice-234.ts --apply\n');
    console.log('  2. To keep the patient admitted with Surgery/Lab bill and only remove the pharmacy charges:');
    console.log('     npx tsx scripts/delete-invoice-234.ts --only-pharmacy-items --apply\n');
    return;
  }

  console.log('\n🚀 EXECUTING IN ATOMIC TRANSACTION...\n');

  await prisma.$transaction(async (tx) => {
    if (ONLY_PHARMACY) {
      // Remove only pharmacy line items
      const pharmItemIds = pharmItems.map((i) => i.id);
      if (pharmItemIds.length > 0) {
        await tx.invoice_items.deleteMany({ where: { id: { in: pharmItemIds } } });
        console.log(`  ✓ Deleted ${pharmItemIds.length} pharmacy items from invoice`);
      }

      // Recompute invoice totals
      const newNet = new Prisma.Decimal(nonPharmTotal);
      const paid = Number(invoice.paid_amount || 0);
      const newBal = new Prisma.Decimal(Math.max(0, nonPharmTotal - paid));

      await tx.invoices.update({
        where: { id: invoice.id },
        data: {
          total_amount: newNet,
          net_amount: newNet,
          balance_due: newBal,
        },
      });
      console.log(`  ✓ Updated invoice net amount -> ${money(newNet)}, balance -> ${money(newBal)}`);
    } else {
      // Delete entire invoice and its payments/items
      await tx.paymentSplit.deleteMany({ where: { invoice_id: invoice.id } });
      await tx.payments.deleteMany({ where: { invoice_id: invoice.id } });
      await tx.patientDeposit.updateMany({
        where: { applied_to_invoice: invoice.id },
        data: { applied_to_invoice: null, applied_amount: 0, status: 'Active' },
      });
      await tx.invoice_snapshots.deleteMany({ where: { invoice_id: invoice.id } });
      await tx.invoice_items.deleteMany({ where: { invoice_id: invoice.id } });
      await tx.invoices.delete({ where: { id: invoice.id } });
      console.log(`  ✓ Deleted invoice ${INVOICE_NUMBER} and all its line items/payments`);
    }
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ COMPLETED SUCCESSFULLY');
  console.log('='.repeat(70) + '\n');
}

main()
  .catch((err) => {
    console.error('\n❌ FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
