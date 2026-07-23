/**
 * Repair IPD bills that carry GST.
 *
 * Why: treating an admitted patient is a composite supply of healthcare services,
 * exempt under Notification 12/2017-CT(R) entry 74 (CBIC circular 32/06/2018 Q.5).
 * Pharmacy used to pass each medicine's retail GST rate onto the in-patient bill,
 * so IPD bills collected tax that should never have been charged. The code is fixed
 * (postChargeToIpdBill now forces a nil rate) but rows written before that still
 * hold the tax — and it leaves patients showing a balance they do not owe.
 *
 * What it changes, per affected IPD invoice:
 *   invoice_items : tax_rate -> 0, tax_amount -> 0
 *   invoices      : total_tax / cgst_amount / sgst_amount / igst_amount -> 0,
 *                   net_amount and balance_due recomputed from the line items
 *
 * Never touched: line net_price (the actual charge), payments, deposits, receipts.
 * A patient who already paid the inflated amount is reported, not silently adjusted
 * — that is a refund decision for finance, not a script.
 *
 * Usage (dry run prints what would change, writes nothing):
 *   DATABASE_URL="<url>" npx tsx scripts/fix-ipd-gst-exempt.ts
 * Apply:
 *   DATABASE_URL="<url>" npx tsx scripts/fix-ipd-gst-exempt.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
/** --only=<invoice_number|id> restricts the repair to a single bill. */
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => Number(v ?? 0);

async function main() {
    const invoices = await prisma.invoices.findMany({
        where: {
            invoice_type: 'IPD',
            items: { some: { tax_amount: { gt: 0 } } },
            ...(ONLY
                ? /^\d+$/.test(ONLY)
                    ? { id: Number(ONLY) }
                    : { invoice_number: ONLY }
                : {}),
        },
        select: {
            id: true, invoice_number: true, status: true, organizationId: true,
            total_amount: true, total_discount: true, net_amount: true,
            paid_amount: true, balance_due: true, total_tax: true,
            patient: { select: { full_name: true } },
            items: { select: { id: true, net_price: true, tax_amount: true, description: true } },
        },
        orderBy: { id: 'asc' },
    });

    let totalGst = 0;
    let overpaid = 0;
    const rows: Array<{ id: number; num: string; name: string; gst: number; oldNet: number; newNet: number; oldBal: number; newBal: number; paid: number }> = [];

    for (const inv of invoices) {
        const gst = r2(inv.items.reduce((s, it) => s + num(it.tax_amount), 0));
        if (gst <= 0) continue;
        const oldNet = r2(num(inv.net_amount));
        const paid = r2(num(inv.paid_amount));

        // SUBTRACT the GST — do not recompute net from the line items.
        //
        // Some headers have already drifted from their lines for unrelated reasons
        // (e.g. AXT-IPD-26-27-040 stores 30,000 against 32,348 of lines). Rebuilding
        // net from the lines would silently "fix" that drift too, raising a settled
        // bill by thousands and inventing a balance the patient never owed. This
        // repair is about GST and nothing else, so it moves exactly the GST amount.
        const newNet = r2(oldNet - gst);
        const newBal = r2(num(inv.balance_due) - gst);
        totalGst += gst;
        if (newBal < 0) overpaid += Math.abs(newBal);
        rows.push({
            id: inv.id, num: inv.invoice_number || `#${inv.id}`,
            name: inv.patient?.full_name || '—',
            gst, oldNet, newNet, oldBal: r2(num(inv.balance_due)), newBal, paid,
        });
    }

    console.log(`IPD bills carrying GST : ${rows.length}`);
    console.log(`GST to be removed      : Rs.${totalGst.toFixed(2)}`);
    console.log(`Mode                   : ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}\n`);
    console.log('  Bill                 Patient                    GST      net before -> after     bal before -> after');
    for (const r of rows) {
        console.log(
            `  ${r.num.padEnd(20)} ${r.name.slice(0, 24).padEnd(25)} ${r.gst.toFixed(2).padStart(8)}` +
            `   ${r.oldNet.toFixed(2).padStart(11)} -> ${r.newNet.toFixed(2).padStart(11)}` +
            `   ${r.oldBal.toFixed(2).padStart(10)} -> ${r.newBal.toFixed(2).padStart(10)}` +
            (r.newBal < 0 ? '   <-- OVERPAID, refund decision' : ''),
        );
    }
    if (overpaid > 0) {
        console.log(`\n  ${overpaid.toFixed(2)} was collected above the corrected bill total across the rows marked OVERPAID.`);
        console.log('  Those are NOT adjusted here — finance decides refund vs credit.');
    }

    if (!APPLY) {
        console.log('\nDry run — nothing written. Re-run with --apply to make these changes.');
        return;
    }

    for (const r of rows) {
        await prisma.$transaction(async (tx) => {
            await tx.invoice_items.updateMany({ where: { invoice_id: r.id }, data: { tax_rate: 0, tax_amount: 0 } });
            await tx.invoices.update({
                where: { id: r.id },
                data: {
                    total_tax: 0, cgst_amount: 0, sgst_amount: 0, igst_amount: 0,
                    net_amount: r.newNet, balance_due: r.newBal,
                },
            });
        });
        console.log(`  fixed ${r.num}`);
    }
    console.log(`\nApplied to ${rows.length} bill(s).`);
}

main()
    .catch((e) => { console.error('ERR', e instanceof Error ? e.message : e); process.exit(1); })
    .finally(() => prisma.$disconnect());
