/**
 * Move a deposit that was applied to the WRONG bill onto the right one.
 *
 * Why: a deposit is not tied to an admission (patient_deposits.admission_id is left
 * NULL by most collection flows), so the "apply" screen just lists every unpaid bill
 * for that patient. When a patient is re-admitted, the old discharged admission's
 * bill still shows a balance and carries a proper invoice number, while the CURRENT
 * admission's bill is an unnumbered Draft — so the wrong one looks like the right
 * one. Two live deposits landed on a previous admission's bill this way.
 *
 * Detection: a deposit whose target invoice belongs to an admission that was already
 * closed when the deposit was taken, while a different admission was open.
 *
 * What it changes, per deposit:
 *   payments                : the RCP-DEP row is re-pointed at the correct invoice
 *   patient_deposits        : applied_to_invoice re-pointed
 *   invoices (both)         : paid_amount / balance_due recomputed from their own
 *                             completed payments — never from a stored figure
 *
 * Never touched: the deposit amount, the receipt number, line items, or any other
 * payment. The money is not re-collected or refunded — only re-attributed, which is
 * what makes it safe on a reimbursement case where a payer may audit the bill.
 *
 * Usage (dry run prints what would change, writes nothing):
 *   DATABASE_URL="<url>" npx tsx scripts/fix-deposit-wrong-invoice.ts
 * Apply (optionally limit to one deposit):
 *   DATABASE_URL="<url>" npx tsx scripts/fix-deposit-wrong-invoice.ts --apply
 *   DATABASE_URL="<url>" npx tsx scripts/fix-deposit-wrong-invoice.ts --apply --only=AVS-DEP-26-27-056
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => Number(v ?? 0);
const ist = (d: Date | null) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—');

/** Recompute a bill's paid/balance from its own completed payments. */
async function recompute(tx: any, invoiceId: number) {
    const inv = await tx.invoices.findUnique({ where: { id: invoiceId }, select: { net_amount: true } });
    const pays = await tx.payments.findMany({ where: { invoice_id: invoiceId, status: 'Completed' }, select: { amount: true } });
    const paid = r2(pays.reduce((s: number, p: any) => s + num(p.amount), 0));
    const bal = r2(num(inv?.net_amount) - paid);
    await tx.invoices.update({ where: { id: invoiceId }, data: { paid_amount: paid, balance_due: bal } });
    return { paid, bal };
}

async function main() {
    const deposits = await prisma.patientDeposit.findMany({
        where: { applied_amount: { gt: 0 }, ...(ONLY ? { deposit_number: ONLY } : {}) },
        select: {
            id: true, deposit_number: true, patient_id: true, amount: true,
            applied_amount: true, applied_to_invoice: true, created_at: true,
        },
        orderBy: { created_at: 'asc' },
    });

    const fixes: Array<any> = [];

    for (const d of deposits) {
        if (!d.applied_to_invoice) continue;
        const target = await prisma.invoices.findUnique({
            where: { id: d.applied_to_invoice },
            select: { id: true, invoice_number: true, admission_id: true, net_amount: true, paid_amount: true, balance_due: true },
        });
        if (!target?.admission_id) continue;

        // The admission that was actually open when the money was taken.
        const openThen = await prisma.admissions.findFirst({
            where: {
                patient_id: d.patient_id,
                admission_date: { lte: d.created_at },
                OR: [{ discharge_date: null }, { discharge_date: { gte: d.created_at } }],
            },
            select: { admission_id: true, admission_date: true },
            orderBy: { admission_date: 'desc' },
        });
        if (!openThen || openThen.admission_id === target.admission_id) continue;

        const correct = await prisma.invoices.findFirst({
            where: { admission_id: openThen.admission_id, patient_id: d.patient_id },
            select: { id: true, invoice_number: true, net_amount: true, paid_amount: true, balance_due: true },
        });
        if (!correct) continue;

        const pay = await prisma.payments.findFirst({
            where: { invoice_id: target.id, notes: { contains: d.deposit_number } },
            select: { id: true, receipt_number: true, amount: true, status: true },
        });
        if (!pay || pay.status !== 'Completed') continue;

        const pt = await prisma.oPD_REG.findFirst({ where: { patient_id: d.patient_id }, select: { full_name: true } });
        fixes.push({ d, pt, target, correct, pay, openThen });
    }

    console.log(`Deposits mis-applied to a previous admission's bill : ${fixes.length}`);
    console.log(`Mode : ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}\n`);

    for (const f of fixes) {
        const amt = num(f.pay.amount);
        console.log(`  ${f.d.deposit_number}  Rs.${amt.toFixed(2)}  —  ${f.pt?.full_name || f.d.patient_id}`);
        console.log(`     taken            : ${ist(f.d.created_at)}`);
        console.log(`     receipt          : ${f.pay.receipt_number}`);
        console.log(`     WRONG bill       : ${f.target.invoice_number || '#' + f.target.id} (adm ${f.target.admission_id})`);
        console.log(`         paid ${num(f.target.paid_amount).toFixed(2)} -> ${r2(num(f.target.paid_amount) - amt).toFixed(2)}   balance ${num(f.target.balance_due).toFixed(2)} -> ${r2(num(f.target.balance_due) + amt).toFixed(2)}`);
        console.log(`     CORRECT bill     : ${f.correct.invoice_number || '#' + f.correct.id} (adm ${f.openThen.admission_id}, open at the time)`);
        console.log(`         paid ${num(f.correct.paid_amount).toFixed(2)} -> ${r2(num(f.correct.paid_amount) + amt).toFixed(2)}   balance ${num(f.correct.balance_due).toFixed(2)} -> ${r2(num(f.correct.balance_due) - amt).toFixed(2)}\n`);
    }

    if (!APPLY) {
        console.log('Dry run — nothing written. Re-run with --apply to make these changes.');
        return;
    }

    for (const f of fixes) {
        await prisma.$transaction(async (tx) => {
            await tx.payments.update({
                where: { id: f.pay.id },
                data: {
                    invoice_id: f.correct.id,
                    notes: `Applied from deposit ${f.d.deposit_number} (re-attributed from ${f.target.invoice_number || '#' + f.target.id} — deposit belonged to admission ${f.openThen.admission_id})`,
                },
            });
            await tx.patientDeposit.update({ where: { id: f.d.id }, data: { applied_to_invoice: f.correct.id } });
            await recompute(tx, f.target.id);
            await recompute(tx, f.correct.id);
        });
        console.log(`  moved ${f.d.deposit_number} -> ${f.correct.invoice_number || '#' + f.correct.id}`);
    }
    console.log(`\nApplied to ${fixes.length} deposit(s).`);
}

main()
    .catch((e) => { console.error('ERR', e instanceof Error ? e.message : e); process.exit(1); })
    .finally(() => prisma.$disconnect());
