/**
 * One-off: discharge a single IPD admission with a back-dated date and a zero bill.
 *
 * The app's normal discharge always stamps discharge_date = now and has no waiver
 * path, so this handles a manual correction for AVS-ADM-26-27-006.
 *
 * SAFE BY DEFAULT:
 *   - No flags  -> DRY RUN. Prints the admission, invoice(s), items, payments, deposits.
 *                  Changes nothing.
 *   - --apply   -> Performs the discharge. ABORTS if it finds posted charges or any
 *                  non-reversed payment/deposit (so real money/charges are never wiped
 *                  silently). Use --waive to also zero out posted charges on purpose.
 *   - --waive   -> Together with --apply, deletes any posted line items and zeroes the
 *                  invoice (only allowed when there are NO payments).
 *
 * Run on the server (where DATABASE_URL points at the production DB):
 *   cd ~/hospitalos
 *   npx ts-node scripts/discharge-zero-bill.ts            # dry run — paste me the output
 *   npx ts-node scripts/discharge-zero-bill.ts --apply    # do it (empty-bill case)
 *   npx ts-node scripts/discharge-zero-bill.ts --apply --waive   # also zero posted charges
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Parameters ──────────────────────────────────────────────────────────────
const ADMISSION_ID = 'AVS-ADM-26-27-006';
// 5 Jun 2026, 3:59 PM India time. The +05:30 offset makes the stored UTC instant
// render as 03:59 pm IST in the app.
const DISCHARGE_AT = new Date('2026-06-05T15:59:00+05:30');
const FREE_BED_STATUS = 'Available';
// ────────────────────────────────────────────────────────────────────────────

const APPLY = process.argv.includes('--apply');
const WAIVE = process.argv.includes('--waive');

function money(v: unknown) {
  return `₹${Number(v ?? 0).toLocaleString('en-IN')}`;
}

async function main() {
  const adm = await prisma.admissions.findUnique({
    where: { admission_id: ADMISSION_ID },
    include: { patient: { select: { full_name: true, patient_id: true } }, bed: true },
  });
  if (!adm) throw new Error(`Admission ${ADMISSION_ID} not found`);

  console.log('─'.repeat(60));
  console.log(`Admission : ${ADMISSION_ID}`);
  console.log(`Patient   : ${adm.patient?.full_name} (${adm.patient?.patient_id})`);
  console.log(`Status    : ${adm.status}`);
  console.log(`Admitted  : ${adm.admission_date?.toISOString()}`);
  console.log(`Bed       : ${adm.bed_id ?? '—'} (current: ${adm.bed?.status ?? '—'})`);
  console.log(`Will set discharge_date -> ${DISCHARGE_AT.toISOString()}  (5 Jun 2026, 3:59 PM IST)`);

  if (adm.status === 'Discharged') {
    console.log(`\n⚠ Already discharged at ${adm.discharge_date?.toISOString()}. Nothing to do.`);
    return;
  }

  const invoices = await prisma.invoices.findMany({
    where: { admission_id: ADMISSION_ID, status: { not: 'Cancelled' } },
    include: {
      items: true,
      payments: { where: { status: { not: 'Reversed' } } },
    },
  });

  const deposits = await prisma.patientDeposit.findMany({
    where: { admission_id: ADMISSION_ID, status: 'Active' },
  });

  let totalItems = 0;
  let totalPayments = 0;
  console.log('\nInvoices:');
  if (invoices.length === 0) console.log('  (none)');
  for (const inv of invoices) {
    totalItems += inv.items.length;
    totalPayments += inv.payments.length;
    console.log(
      `  ${inv.invoice_number}  net=${money(inv.net_amount)} paid=${money(inv.paid_amount)} ` +
      `balance=${money(inv.balance_due)} status=${inv.status} items=${inv.items.length} payments=${inv.payments.length}`,
    );
    for (const it of inv.items) {
      console.log(`      • ${it.description}  qty ${it.quantity} × ${money(it.unit_price)} = ${money(it.net_price)}`);
    }
    for (const p of inv.payments) {
      console.log(`      $ payment ${p.receipt_number}  ${money(p.amount)} (${p.payment_method})`);
    }
  }
  console.log(`\nActive deposits: ${deposits.length}${deposits.length ? ' — ' + deposits.map(d => `${d.deposit_number} ${money(d.amount)}`).join(', ') : ''}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing changed. Re-run with --apply once this looks right.');
    return;
  }

  // ── Safety gates ──────────────────────────────────────────────────────────
  if (totalPayments > 0 || deposits.length > 0) {
    throw new Error(
      'ABORT: this admission has payment(s) or active deposit(s). Money was collected — ' +
      'handle the refund first; this script will not wipe receipts.',
    );
  }
  if (totalItems > 0 && !WAIVE) {
    throw new Error(
      `ABORT: expected an empty bill but found ${totalItems} posted charge(s). ` +
      'Re-run with "--apply --waive" only if you intend to zero out these charges.',
    );
  }

  await prisma.$transaction(async (tx) => {
    // Zero / close the invoice(s)
    for (const inv of invoices) {
      if (inv.items.length > 0) {
        await tx.invoice_items.deleteMany({ where: { invoice_id: inv.id } });
      }
      await tx.invoices.update({
        where: { id: inv.id },
        data: {
          total_amount: 0,
          total_discount: 0,
          net_amount: 0,
          total_tax: 0,
          cgst_amount: 0,
          sgst_amount: 0,
          igst_amount: 0,
          balance_due: 0,
          status: 'Paid',
          finalized_at: DISCHARGE_AT,
          notes: `${inv.notes ? inv.notes + ' | ' : ''}Zero-billed on manual discharge ${DISCHARGE_AT.toISOString()}`,
        },
      });
    }

    // Discharge the admission with the back-dated date
    await tx.admissions.update({
      where: { admission_id: ADMISSION_ID },
      data: { status: 'Discharged', discharge_date: DISCHARGE_AT },
    });

    // Free the bed
    if (adm.bed_id) {
      await tx.beds.update({ where: { bed_id: adm.bed_id }, data: { status: FREE_BED_STATUS } });
    }

    // Audit trail
    await tx.system_audit_logs.create({
      data: {
        action: 'MANUAL_DISCHARGE_ZERO_BILL',
        module: 'IPD',
        entity_type: 'admission',
        entity_id: ADMISSION_ID,
        details: JSON.stringify({
          discharge_at: DISCHARGE_AT.toISOString(),
          zero_billing: true,
          waived_items: totalItems,
        }),
        organizationId: adm.organizationId,
      },
    });
  });

  console.log('\n✓ Done. Patient discharged (5 Jun 2026, 3:59 PM IST), bill zeroed, bed freed.');
}

main()
  .catch((e) => {
    console.error('\n✗', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
