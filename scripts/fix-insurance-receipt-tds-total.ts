/**
 * Repair InsuranceReceipt.tds_total where it disagrees with its allocation lines.
 *
 * Why: allocateReceipt used to INCREMENT the header's tds_total from the lines,
 * while recordAndAllocateReceipt had already seeded the same figure at creation.
 * Every receipt recorded through the combined "record + map" flow therefore stored
 * twice its real TDS. Both paths are fixed in code (the header is now recomputed
 * from the lines), but rows written before that fix still hold the inflated value.
 *
 * Scope: header figure only. The per-bill postings (invoices.tpa_tds_amount, the
 * allocation rows and the GL) were always correct and are NOT touched.
 *
 * Skipped deliberately:
 *   - receipts with no allocations — an unmapped receipt legitimately carries a
 *     declared TDS on the header and has no lines to reconcile against
 *   - Reversed receipts — reversal zeroes the header but keeps the lines for audit
 *
 * Usage (dry run prints what would change, writes nothing):
 *   npx tsx scripts/fix-insurance-receipt-tds-total.ts
 *   DATABASE_URL="<url>" npx tsx scripts/fix-insurance-receipt-tds-total.ts
 * Apply:
 *   npx tsx scripts/fix-insurance-receipt-tds-total.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function main() {
    const receipts = await prisma.insuranceReceipt.findMany({
        include: { allocations: { select: { tds_amount: true } }, provider: { select: { provider_name: true } } },
        orderBy: { id: 'asc' },
    });

    const fixes: Array<{ id: number; number: string; from: number; to: number; payer: string }> = [];
    let skippedUnmapped = 0;
    let skippedReversed = 0;

    for (const r of receipts) {
        if (r.status === 'Reversed') { skippedReversed++; continue; }
        if (r.allocations.length === 0) { skippedUnmapped++; continue; }
        const lineTds = round2(r.allocations.reduce((s, a) => s + Number(a.tds_amount || 0), 0));
        const headTds = round2(Number(r.tds_total || 0));
        if (Math.abs(headTds - lineTds) <= 0.01) continue;
        fixes.push({
            id: r.id, number: r.receipt_number, from: headTds, to: lineTds,
            payer: r.provider?.provider_name || '—',
        });
    }

    console.log(`Receipts scanned      : ${receipts.length}`);
    console.log(`Skipped (unmapped)    : ${skippedUnmapped}`);
    console.log(`Skipped (reversed)    : ${skippedReversed}`);
    console.log(`Needing correction    : ${fixes.length}\n`);

    for (const f of fixes) {
        console.log(`  ${f.number.padEnd(20)} ${String(f.from).padStart(12)} -> ${String(f.to).padStart(12)}   ${f.payer}`);
    }

    if (!fixes.length) { console.log('\nNothing to do.'); return; }

    if (!APPLY) {
        console.log('\nDRY RUN — nothing written. Re-run with --apply to correct these.');
        return;
    }

    for (const f of fixes) {
        await prisma.insuranceReceipt.update({ where: { id: f.id }, data: { tds_total: f.to } });
    }
    console.log(`\nUpdated ${fixes.length} receipt(s).`);
}

main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
