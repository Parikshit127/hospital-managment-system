 /**
 * Release deposits that are marked Applied but no longer back any bill payment.
 *
 * Why: reversing/deleting the "Applied from deposit <no>" payment on a bill used to
 * leave the PatientDeposit as fully Applied (applied_amount = amount), so the money
 * showed as used while the bill showed Paid 0. reversePayment now releases the deposit
 * itself; this script cleans up the ones that were orphaned before that fix.
 *
 * Detection, per deposit with applied_amount > 0: sum the Completed payments whose
 * notes say "Applied from deposit <deposit_number>". If that sum is less than
 * applied_amount, the difference is orphaned and is handed back to the deposit
 * (applied_amount reduced, status recomputed, applied_to_invoice cleared when nothing
 * is applied any more). Payments, invoices and receipts are never touched.
 *
 * Usage (dry run prints what would change, writes nothing):
 *   DATABASE_URL="<url>" npx tsx scripts/release-orphaned-deposits.ts
 * Apply (optionally limit to some deposits):
 *   DATABASE_URL="<url>" npx tsx scripts/release-orphaned-deposits.ts --apply
 *   DATABASE_URL="<url>" npx tsx scripts/release-orphaned-deposits.ts --apply --only=AVS-DEP-26-27-252,AVS-DEP-26-27-253
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const ONLY = ((process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => Number(v ?? 0);

async function main() {
    const deposits = await prisma.patientDeposit.findMany({
        where: {
            applied_amount: { gt: 0 },
            status: { not: 'Cancelled' },
            ...(ONLY.length ? { deposit_number: { in: ONLY } } : {}),
        },
        orderBy: { created_at: 'asc' },
    });

    let found = 0;
    for (const d of deposits) {
        const pays = await prisma.payments.findMany({
            where: {
                payment_method: 'Deposit',
                status: 'Completed',
                notes: { contains: `Applied from deposit ${d.deposit_number}` },
            },
            select: { amount: true },
        });
        const backed = r2(pays.reduce((s, p) => s + num(p.amount), 0));
        const applied = num(d.applied_amount);
        const orphan = r2(applied - backed);
        if (orphan <= 0.01) continue;

        found++;
        const newApplied = r2(applied - orphan);
        const used = newApplied + num(d.refunded_amount);
        const status = used >= num(d.amount) - 0.01 ? (newApplied > 0 ? 'Applied' : 'Refunded') : 'Active';
        console.log(
            `${d.deposit_number}  patient ${d.patient_id}  amount ${num(d.amount)}  applied ${applied} -> ${newApplied}` +
            `  (bill payments backing it: ${backed})  status ${d.status} -> ${status}`,
        );

        if (APPLY) {
            await prisma.$transaction([
                prisma.patientDeposit.update({
                    where: { id: d.id },
                    data: {
                        applied_amount: newApplied,
                        applied_to_invoice: newApplied > 0 ? d.applied_to_invoice : null,
                        status,
                    },
                }),
                prisma.system_audit_logs.create({
                    data: {
                        action: 'RELEASE_ORPHANED_DEPOSIT',
                        module: 'finance',
                        entity_type: 'deposit',
                        entity_id: d.deposit_number,
                        details: JSON.stringify({ released: orphan, previous_applied: applied, invoice_id: d.applied_to_invoice }),
                        organizationId: d.organizationId,
                    },
                }),
            ]);
        }
    }

    console.log(
        found === 0
            ? 'No orphaned deposits found.'
            : APPLY ? `Released ${found} deposit(s).` : `${found} deposit(s) would be released. Re-run with --apply.`,
    );
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
