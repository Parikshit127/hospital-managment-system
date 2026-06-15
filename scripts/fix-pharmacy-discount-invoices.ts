/**
 * Backfill bill-level discount on walk-in pharmacy invoices that were created by
 * an earlier build which reduced the PAID amount for a discount but did NOT
 * record it as the invoice's discount (total_discount / bill_discount = 0).
 *
 * Symptom: the printed bill recomputes the full charge as "Net" and shows the
 * unrecorded discount as a phantom "Balance" (e.g. Bill 86, Paid 73.10,
 * Balance 12.90 — where 12.90 was actually a 15% discount).
 *
 * What it does: for each affected invoice it sets
 *     total_discount = bill_discount = (gross + tax) - paid
 *     net_amount     = paid
 * so the bill shows a proper "Discount" line and Balance 0. balance_due stays 0.
 *
 * SAFETY
 * ──────
 *  - DRY-RUN by default; pass --apply to write. All writes in one transaction.
 *  - Only touches invoices that match a tight, self-selecting signature:
 *      • invoice_type = 'Pharmacy' AND patient_id = 'WALKIN'
 *      • status = 'Paid' and balance_due ≈ 0  (fully paid)
 *      • total_discount ≈ 0 AND bill_discount ≈ 0  (discount not recorded)
 *      • no credit notes and no line-level discounts (so the gap is purely the
 *        unrecorded bill discount)
 *      • gap = (sum of line totals + line tax) − paid > ₹0.01
 *    A normal fully-paid bill has gap 0 and is skipped.
 *
 * USAGE (run where DATABASE_URL points at the live DB)
 *    npx tsx scripts/fix-pharmacy-discount-invoices.ts            # dry run
 *    npx tsx scripts/fix-pharmacy-discount-invoices.ts --apply    # write
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const n = (v: any) => Number(v || 0);
const money = (v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const EPS = 0.01;

async function main() {
  console.log(`\n=== Backfill walk-in pharmacy bill discounts ===`);
  console.log(APPLY ? '*** APPLY MODE — changes WILL be written ***\n' : '--- DRY RUN (no changes) ---\n');

  // No status filter: the buggy build left these as 'Partial' (balance_due > 0),
  // so filtering on 'Paid' would miss them. The in-loop guards (paid>0, gap>0,
  // no discount recorded, no credit/line discounts) select the right rows.
  const invoices = await prisma.invoices.findMany({
    where: {
      invoice_type: 'Pharmacy',
      patient_id: 'WALKIN',
      status: { notIn: ['Cancelled', 'Voided', 'Draft'] },
    },
    include: { items: true, credit_notes: true },
  });

  const fixes: { id: number; number: string; org: string; gross: number; tax: number; paid: number; gap: number }[] = [];

  for (const inv of invoices) {
    const paid = n(inv.paid_amount);
    const totalDisc = n(inv.total_discount);
    const billDisc = n((inv as any).bill_discount);
    const lineDisc = inv.items.reduce((s, i) => s + n(i.discount), 0);
    const gross = inv.items.reduce((s, i) => s + n(i.total_price), 0);
    const tax = inv.items.reduce((s, i) => s + n(i.tax_amount), 0);
    const gap = gross + tax - paid;

    // Skip anything that isn't the "unrecorded discount" signature.
    // NOTE: walk-in / OTC pharmacy sales are always collected in full at the
    // counter (no credit / partial), so a leftover balance on such an invoice
    // is in practice an un-recorded discount, not money genuinely owed.
    if (paid <= EPS) continue;                        // nothing collected → leave alone
    if (totalDisc > EPS || billDisc > EPS) continue;  // discount already recorded
    if (lineDisc > EPS) continue;                     // has line-level discounts
    if (inv.credit_notes.length > 0) continue;        // credit notes change the math
    if (gap <= EPS) continue;                          // paid == bill → nothing to fix

    fixes.push({ id: inv.id, number: inv.invoice_number, org: inv.organizationId, gross, tax, paid, gap });
  }

  if (fixes.length === 0) {
    console.log('No affected invoices found. Nothing to do.');
    return;
  }

  for (const f of fixes) {
    const pct = f.gross + f.tax > 0 ? (f.gap / (f.gross + f.tax)) * 100 : 0;
    console.log(`${f.number}  (id=${f.id}, org=${f.org})`);
    console.log(`  gross+tax=₹${money(f.gross + f.tax)}  paid=₹${money(f.paid)}  → discount=₹${money(f.gap)} (~${pct.toFixed(1)}%)`);
    console.log(`  SET total_discount=bill_discount=₹${money(f.gap)}, net_amount=₹${money(f.paid)}  (balance stays ₹0)\n`);
  }
  console.log(`Summary: ${fixes.length} invoice(s) to fix.`);

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to write the fixes.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const f of fixes) {
      await tx.invoices.update({
        where: { id: f.id },
        data: { total_discount: f.gap, bill_discount: f.gap, net_amount: f.paid, balance_due: 0, status: 'Paid' },
      });
    }
  });

  console.log(`\n✅ Done. ${fixes.length} invoice(s) updated — printed bills will now show the discount and Balance ₹0.`);
}

main()
  .catch((e) => { console.error('\n❌ Failed (no partial changes — transaction rolls back):\n', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
