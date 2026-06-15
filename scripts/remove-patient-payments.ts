/**
 * One-off data correction: remove erroneously-recorded payments for a single
 * patient so the invoices show as UNPAID (outstanding) and the receipts no
 * longer appear anywhere in finance (Master Billing, Payment Ledger,
 * Collections, cash book).
 *
 * SAFETY
 * ──────
 *  - DRY-RUN by default: prints exactly what WOULD change and exits without
 *    touching anything. Run it once and review the output first.
 *  - Only mutates when you pass `--apply`.
 *  - Tightly scoped: it resolves the target invoices by invoice_number AND
 *    patient_id, derives the organization from those rows, and refuses to run
 *    if anything looks unexpected (patient mismatch, multiple orgs, missing
 *    invoice).
 *  - All writes happen inside a single transaction.
 *
 * USAGE (run on a host that has DATABASE_URL pointing at the live DB)
 *    npx tsx scripts/remove-patient-payments.ts            # dry run (safe)
 *    npx tsx scripts/remove-patient-payments.ts --apply    # actually delete
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Target (edit here if reused for another correction) ─────────────────────
const PATIENT_ID = 'AXT-2026-00109';
const INVOICE_NUMBERS = ['AXT-PHM-26-27-003', 'AXT-IPD-26-27-010'];
// Status to leave the invoice in once its payments are removed (unpaid/finalized).
const UNPAID_STATUS = 'Final';

const APPLY = process.argv.includes('--apply');
const money = (n: any) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });

async function main() {
  console.log(`\n=== Remove payments for patient ${PATIENT_ID} ===`);
  console.log(APPLY ? '*** APPLY MODE — changes WILL be written ***\n' : '--- DRY RUN (no changes) ---\n');

  const invoices = await prisma.invoices.findMany({
    where: { invoice_number: { in: INVOICE_NUMBERS }, patient_id: PATIENT_ID },
    include: { payments: true, payment_splits: true },
  });

  // ── Safety guards ─────────────────────────────────────────────────────────
  if (invoices.length !== INVOICE_NUMBERS.length) {
    const found = invoices.map((i) => i.invoice_number);
    throw new Error(
      `Expected ${INVOICE_NUMBERS.length} invoices for ${PATIENT_ID}, found ${invoices.length} ` +
      `(${found.join(', ') || 'none'}). Aborting — nothing changed.`,
    );
  }
  const orgIds = [...new Set(invoices.map((i) => i.organizationId))];
  if (orgIds.length !== 1) {
    throw new Error(`Invoices span multiple organizations (${orgIds.join(', ')}). Aborting.`);
  }
  const organizationId = orgIds[0];
  console.log(`Organization: ${organizationId}\n`);

  const invoiceIds = invoices.map((i) => i.id);
  let totalPaymentsToDelete = 0;
  let totalSplitsToDelete = 0;

  for (const inv of invoices) {
    const net = Number(inv.net_amount);
    console.log(`Invoice ${inv.invoice_number}  (id=${inv.id}, type=${inv.invoice_type})`);
    console.log(`  status=${inv.status}  net=₹${money(net)}  paid=₹${money(inv.paid_amount)}  balance=₹${money(inv.balance_due)}`);

    if (inv.payments.length === 0) {
      console.log('  ⚠️  No payment rows on this invoice — its "paid" amount may come from a deposit/insurance settlement, NOT a payments row. Review before applying.');
    }
    for (const p of inv.payments) {
      console.log(`    payment  receipt=${p.receipt_number}  amount=₹${money(p.amount)}  method=${p.payment_method}  status=${p.status}  → DELETE`);
      totalPaymentsToDelete++;
    }
    for (const s of inv.payment_splits) {
      console.log(`    split    payer=${s.payer_type}  amount=₹${money(s.amount)}  method=${s.payment_method ?? '-'}  → DELETE`);
      totalSplitsToDelete++;
    }
    console.log(`  → AFTER: paid=₹0.00  balance=₹${money(net)}  status=${UNPAID_STATUS}\n`);
  }

  console.log(`Summary: ${totalPaymentsToDelete} payment(s) + ${totalSplitsToDelete} split(s) to delete across ${invoices.length} invoice(s).`);

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to perform the deletion.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentSplit.deleteMany({ where: { invoice_id: { in: invoiceIds }, organizationId } });
    await tx.payments.deleteMany({ where: { invoice_id: { in: invoiceIds }, organizationId } });
    for (const inv of invoices) {
      await tx.invoices.update({
        where: { id: inv.id },
        data: { paid_amount: 0, balance_due: inv.net_amount, status: UNPAID_STATUS },
      });
    }
  });

  console.log('\n✅ Done. Payments removed; invoices reset to unpaid/outstanding.');
  console.log('NOTE: if a cash closure was already finalized for any of these receipts\' dates, reconcile that closure total manually (no automatic link exists).');
}

main()
  .catch((e) => { console.error('\n❌ Failed (no partial changes — transaction rolls back):\n', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
