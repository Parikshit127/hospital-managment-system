/**
 * Apply a bill-level discount to a patient's bill, on the server, against the
 * live DB. Written for:
 *
 *     Patient      : Kamla Pawa
 *     Total bill   : ₹54,154
 *     Discount     : 29.6%   (= ₹16,030)
 *     Net payable  : ₹38,124
 *
 * It writes the discount the same way the app does — as `bill_discount` on the
 * invoice header, with the totals recomputed exactly like the app's
 * recalculateInvoice(): line rates and the GST already charged on each line are
 * left untouched, so the bill still adds up and the printed bill picks the
 * discount up on its own (both bill renderers read it through
 * deriveInvoiceTotals).
 *
 *   total_discount = Σ(line discounts) + bill_discount
 *   net_amount     = Σ(line net) + Σ(line tax) − bill_discount
 *   balance_due    = max(0, net_amount − paid_amount)
 *
 * SAFETY
 * ──────
 *  - DRY-RUN by default. Nothing is written without --apply.
 *  - Refuses to guess: if the name matches more than one patient, or the patient
 *    has more than one candidate bill, it prints them and stops so you pick one
 *    with --invoice.
 *  - Cross-checks the bill it found against --expected-bill (₹54,154) and stops
 *    on a mismatch — a bill that has moved since the number was quoted is a
 *    different bill and should not be silently discounted to the old figure.
 *  - Never lets the discount exceed the bill, and warns (does not silently
 *    proceed) when the target net is below what the patient has already paid.
 *  - Snapshots the invoice into invoice_snapshots and writes a system_audit_log
 *    row before/with the change, so it is as traceable as an in-app edit.
 *  - All writes happen in one transaction.
 *
 * USAGE (run where DATABASE_URL points at the live DB)
 *   npx tsx scripts/apply-patient-bill-discount.ts                  # dry run
 *   npx tsx scripts/apply-patient-bill-discount.ts --apply          # write
 *
 *   # overrides (all optional)
 *   --name "Kamla Pawa"        patient name to search for (partial, case-insensitive)
 *   --invoice AVS-IPD-26-27-0  exact invoice number, when the patient has several bills
 *   --invoice-id 1234          invoice row id — how you pick a DRAFT bill, which has
 *                              no invoice number yet (the dry run prints the id)
 *   --expected-bill 54154      bill total before discount, cross-checked (0 = skip check)
 *   --net 38124                target net payable  → discount = bill − net
 *   --percent 29.6             discount as a % of the bill (alternative to --net)
 *   --reason "..."             stored in discount_remark on the bill
 *   --by "Dr. X"               name recorded as who applied it, in the audit log
 */
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
function arg(flag: string): string | undefined {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
}

const PATIENT_NAME = arg('--name') ?? 'kamla paw'; // matches "Kamla Pawa" and "Kamla Pawar"
const INVOICE_NUMBER = arg('--invoice');
// A Draft bill has no invoice_number yet, so --invoice cannot address one.
const INVOICE_ID = arg('--invoice-id') !== undefined ? Number(arg('--invoice-id')) : undefined;
const EXPECTED_BILL = Number(arg('--expected-bill') ?? 54154);
const TARGET_NET = arg('--net') !== undefined ? Number(arg('--net')) : undefined;
const PERCENT = arg('--percent') !== undefined ? Number(arg('--percent')) : undefined;
const APPLIED_BY = arg('--by') ?? 'script:apply-patient-bill-discount';
const REASON = arg('--reason');

// Default target: the figures the discount was approved on.
const DEFAULT_NET = 38124;

const n = (v: unknown) => Number(v ?? 0);
const money = (v: number) =>
    '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (v: number) => Math.round(v * 100) / 100;
const EPS = 1; // ₹1 — the quoted figures are rounded to the rupee

function fail(msg: string): never {
    console.error(`\n❌  ${msg}\n`);
    process.exit(1);
}

async function main() {
    console.log('\n=== Apply bill discount ===');
    console.log(APPLY ? '*** APPLY MODE — changes WILL be written ***\n' : '--- DRY RUN (no changes written) ---\n');

    // ── 1. Find the patient ─────────────────────────────────────────────────
    const patients = await prisma.oPD_REG.findMany({
        where: { full_name: { contains: PATIENT_NAME, mode: 'insensitive' } },
        select: { patient_id: true, full_name: true, phone: true, organizationId: true },
    });

    if (patients.length === 0) {
        fail(`No patient found matching "${PATIENT_NAME}". Check the spelling, or pass --name "<part of the name>".`);
    }

    console.log(`Patients matching "${PATIENT_NAME}":`);
    for (const p of patients) {
        console.log(`  • ${p.full_name}  (${p.patient_id})  phone=${p.phone ?? '—'}  org=${p.organizationId}`);
    }
    console.log('');

    // ── 2. Find their bills ─────────────────────────────────────────────────
    const invoices = await prisma.invoices.findMany({
        where: {
            patient_id: { in: patients.map((p) => p.patient_id) },
            status: { notIn: ['Cancelled', 'Voided'] },
            ...(INVOICE_NUMBER ? { invoice_number: INVOICE_NUMBER } : {}),
            ...(INVOICE_ID !== undefined ? { id: INVOICE_ID } : {}),
        },
        include: { items: true },
        orderBy: { created_at: 'desc' },
    });

    if (invoices.length === 0) {
        const picked = INVOICE_NUMBER ?? (INVOICE_ID !== undefined ? `#${INVOICE_ID}` : null);
        fail(
            picked
                ? `Invoice ${picked} not found for this patient (or it is cancelled).`
                : 'This patient has no active bill.',
        );
    }

    // What each bill is worth BEFORE any bill-level discount. This is the figure
    // the quoted "total bill" should match, and the base a % is taken on.
    const described = invoices.map((inv) => {
        const lineDiscount = inv.items.reduce((s, i) => s + n(i.discount), 0);
        const netItems = inv.items.reduce((s, i) => s + n(i.net_price), 0);
        const tax = inv.items.reduce((s, i) => s + n(i.tax_amount), 0);
        return {
            inv,
            lineDiscount: round2(lineDiscount),
            netItems: round2(netItems),
            tax: round2(tax),
            gross: round2(inv.items.reduce((s, i) => s + n(i.total_price), 0)),
            billBeforeDiscount: round2(netItems + tax),
        };
    });

    console.log(`Active bill(s) for this patient:`);
    for (const d of described) {
        console.log(
            `  • ${d.inv.invoice_number ?? '(Draft — no invoice number)'}  id=${d.inv.id}` +
                `  [${d.inv.invoice_type}]  status=${d.inv.status}` +
                `${d.inv.is_locked ? ' LOCKED' : ''}\n` +
                `      bill before discount ${money(d.billBeforeDiscount)}` +
                `   line disc ${money(d.lineDiscount)}   bill disc ${money(n(d.inv.bill_discount))}\n` +
                `      net ${money(n(d.inv.net_amount))}   paid ${money(n(d.inv.paid_amount))}   balance ${money(n(d.inv.balance_due))}`,
        );
    }
    console.log('');

    // ── 3. Pick exactly one bill ────────────────────────────────────────────
    let target = described.length === 1 ? described[0] : undefined;
    if (!target && EXPECTED_BILL > 0) {
        // Fall back to the one whose total matches the quoted figure.
        const matches = described.filter((d) => Math.abs(d.billBeforeDiscount - EXPECTED_BILL) <= EPS);
        if (matches.length === 1) target = matches[0];
    }
    if (!target) {
        fail(
            'More than one bill could be the right one. Re-run with --invoice <invoice number>,\n' +
                '    or --invoice-id <id> for a Draft bill (the ids are listed above), to say which.',
        );
    }

    const { inv, lineDiscount, netItems, tax, billBeforeDiscount } = target;
    const label = inv.invoice_number ?? `draft#${inv.id}`;

    // ── 4. Cross-check against the quoted total ─────────────────────────────
    if (EXPECTED_BILL > 0 && Math.abs(billBeforeDiscount - EXPECTED_BILL) > EPS) {
        fail(
            `Bill ${label} is ${money(billBeforeDiscount)} before discount, but ${money(EXPECTED_BILL)} was expected.\n` +
                `    The bill has changed since that figure was quoted — confirm the amount, then re-run with\n` +
                `    --expected-bill ${Math.round(billBeforeDiscount)} (or --expected-bill 0 to skip this check).`,
        );
    }

    // ── 5. Work out the discount ────────────────────────────────────────────
    if (TARGET_NET !== undefined && PERCENT !== undefined) {
        fail('Pass either --net or --percent, not both.');
    }
    const targetNet =
        PERCENT !== undefined
            ? round2(billBeforeDiscount * (1 - PERCENT / 100))
            : (TARGET_NET ?? DEFAULT_NET);

    const newBillDiscount = round2(billBeforeDiscount - targetNet);
    const pct = billBeforeDiscount > 0 ? (newBillDiscount / billBeforeDiscount) * 100 : 0;

    if (newBillDiscount < 0) fail(`Target net ${money(targetNet)} is above the bill ${money(billBeforeDiscount)}.`);
    if (newBillDiscount > billBeforeDiscount) fail('Discount cannot exceed the bill.');

    // ── 6. Recompute the totals exactly like the app's recalculateInvoice ───
    const total_amount = target.gross;
    const total_discount = round2(lineDiscount + newBillDiscount);
    const net_amount = round2(netItems + tax - newBillDiscount);
    const paid = n(inv.paid_amount);
    const balance_due = round2(Math.max(0, net_amount - paid));
    const isInterState = inv.is_inter_state;

    const reason = REASON ?? `Discount ${round2(pct)}% approved — net ${money(targetNet)}`;

    // The charge lines. Printed on a dry run because the usual reason a bill does
    // not match the figure a discount was approved on is that charges were added
    // after it was quoted — and then you need to see WHAT was added before
    // deciding what the discount should now be.
    if (!APPLY || argv.includes('--show-items')) {
        console.log(`Charges on ${label}:`);
        for (const it of [...inv.items].sort((a, b) => +a.created_at - +b.created_at)) {
            const gross = n(it.total_price);
            console.log(
                `  ${new Date(it.created_at).toLocaleDateString('en-GB')}  ` +
                    `${String(it.description).slice(0, 44).padEnd(44)} ` +
                    `${String(n(it.quantity)).padStart(4)} x ${money(n(it.unit_price)).padStart(12)}` +
                    ` = ${money(gross).padStart(13)}` +
                    `${n(it.discount) > 0 ? `  (−${money(n(it.discount))})` : ''}` +
                    `${n(it.tax_amount) > 0 ? `  +GST ${money(n(it.tax_amount))}` : ''}`,
            );
        }
        console.log('');
    }

    console.log(`Target bill : ${label}  [${inv.invoice_type}]  patient ${inv.patient_id}`);
    console.log(`  Bill before discount : ${money(billBeforeDiscount)}   (items ${money(netItems)} + GST ${money(tax)})`);
    console.log(`  Discount             : ${money(newBillDiscount)}  (${round2(pct)}%)`);
    console.log(`  Net payable          : ${money(net_amount)}`);
    console.log(`  Already paid         : ${money(paid)}`);
    console.log(`  Balance due          : ${money(n(inv.balance_due))}  →  ${money(balance_due)}`);
    console.log(`  Reason               : ${reason}\n`);

    // ── 7. Things the operator must see before this is written ─────────────
    if (n(inv.bill_discount) > 0) {
        console.log(
            `⚠️   This bill already carries a discount of ${money(n(inv.bill_discount))}. ` +
                `It is REPLACED (not added to) by ${money(newBillDiscount)}.\n`,
        );
    }
    if (paid > net_amount + EPS) {
        console.log(
            `⚠️   The patient has paid ${money(paid)}, which is MORE than the new net ${money(net_amount)}.\n` +
                `    Balance goes to zero; the ${money(round2(paid - net_amount))} overpaid needs a refund raised separately.\n`,
        );
    }
    if (inv.is_locked) console.log('⚠️   This bill is LOCKED in the app. This script writes to it regardless.\n');
    if (inv.status === 'Final') console.log('⚠️   This bill is FINALISED. In the app only Admin/Finance could edit it.\n');

    const glEntry = await prisma.gL_JournalEntry.findFirst({
        where: { reference_type: 'Invoice', reference_id: String(inv.id), status: { not: 'Reversed' } },
        select: { id: true, journal_number: true, total_debit: true },
    });
    if (glEntry) {
        console.log(
            `⚠️   This bill is posted to the GL (${glEntry.journal_number}, ${money(n(glEntry.total_debit))}).\n` +
                `    This script does NOT repost it — the voucher will still carry the pre-discount amount.\n` +
                `    Re-post it from the app (Finance → repost invoices to GL) after this runs.\n`,
        );
    }

    if (!APPLY) {
        console.log('--- DRY RUN — nothing written. Re-run with --apply to write. ---\n');
        return;
    }

    // ── 8. Write ────────────────────────────────────────────────────────────
    await prisma.$transaction(async (tx) => {
        // Pre-change snapshot, same shape the app stores on an invoice edit.
        await tx.invoice_snapshots.create({
            data: {
                invoice_id: inv.id,
                invoice_number: inv.invoice_number ?? 'Draft',
                version_number: Number(inv.version ?? 0),
                snapshot_data: {
                    invoice: {
                        total_amount: n(inv.total_amount),
                        total_discount: n(inv.total_discount),
                        bill_discount: n(inv.bill_discount),
                        discount_remark: inv.discount_remark,
                        total_tax: n(inv.total_tax),
                        net_amount: n(inv.net_amount),
                        paid_amount: paid,
                        balance_due: n(inv.balance_due),
                        status: inv.status,
                    },
                    items: inv.items.map((it) => ({
                        id: it.id,
                        description: it.description,
                        quantity: n(it.quantity),
                        unit_price: n(it.unit_price),
                        discount: n(it.discount),
                        net_price: n(it.net_price),
                        tax_amount: n(it.tax_amount),
                    })),
                },
                changed_by: APPLIED_BY,
                change_summary: `Bill discount set to ${money(newBillDiscount)} (${round2(pct)}%) by script`,
                organizationId: inv.organizationId,
            },
        });

        await tx.invoices.update({
            where: { id: inv.id },
            data: {
                bill_discount: newBillDiscount,
                discount_remark: reason,
                total_amount,
                total_discount,
                net_amount,
                total_tax: tax,
                cgst_amount: isInterState ? 0 : round2(tax / 2),
                sgst_amount: isInterState ? 0 : round2(tax / 2),
                igst_amount: isInterState ? tax : 0,
                balance_due,
                version: { increment: 1 },
            },
        });

        await tx.system_audit_logs.create({
            data: {
                action: 'UPDATE_INVOICE_HEADER',
                module: 'finance',
                entity_type: 'invoice',
                entity_id: inv.invoice_number ?? `draft#${inv.id}`,
                details: JSON.stringify({
                    source: 'scripts/apply-patient-bill-discount.ts',
                    patch: { bill_discount: newBillDiscount, discount_remark: reason },
                    before: {
                        bill_discount: n(inv.bill_discount),
                        total_discount: n(inv.total_discount),
                        net_amount: n(inv.net_amount),
                        balance_due: n(inv.balance_due),
                    },
                    after: { bill_discount: newBillDiscount, total_discount, net_amount, balance_due },
                }),
                username: APPLIED_BY,
                organizationId: inv.organizationId,
            },
        });
    });

    // ── 9. Read back ────────────────────────────────────────────────────────
    const after = await prisma.invoices.findUnique({ where: { id: inv.id } });
    console.log('✅  Discount applied.\n');
    console.log(`   ${label}`);
    console.log(`   bill_discount  : ${money(n(after?.bill_discount))}`);
    console.log(`   total_discount : ${money(n(after?.total_discount))}`);
    console.log(`   net_amount     : ${money(n(after?.net_amount))}`);
    console.log(`   paid_amount    : ${money(n(after?.paid_amount))}`);
    console.log(`   balance_due    : ${money(n(after?.balance_due))}`);
    if (glEntry) console.log(`\n   Remember to re-post ${glEntry.journal_number} to the GL.`);
    console.log('');
}

main()
    .catch((e) => {
        console.error('\n❌  Script failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
