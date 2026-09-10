/**
 * HospitalOS — hard-delete pharmacy counter-sale invoices
 *
 * A counter sale (app/actions/pharmacy-actions.ts) writes to eight places, not one:
 *   invoices, invoice_items, payments, gl_journal_entries (Invoice + Payment refs),
 *   gst_invoice_register, referral_commissions / doctor_commissions,
 *   pharmacy_inventory_movements (DISPENSE) and pharmacy_batch_inventory.current_stock.
 * Deleting only the invoice row leaves the ledger, the GST register and the stock
 * count referring to a bill that no longer exists — so this script unwinds all of it
 * in one transaction.
 *
 * Stock: the DISPENSE movement rows carry source_id 'COUNTER-<patient_id>' and no
 * invoice reference at all, so they cannot be matched back to a specific bill with
 * any confidence. Instead of guessing, this posts a compensating RETURN movement and
 * increments current_stock — the shelf count ends up right and the movement ledger
 * still reads as a true sequence of events.
 *
 * USAGE (run on the server that has the live DATABASE_URL in its env):
 *   npx tsx scripts/delete-pharmacy-invoices.ts                       # dry run, default targets
 *   npx tsx scripts/delete-pharmacy-invoices.ts --apply               # delete them
 *   npx tsx scripts/delete-pharmacy-invoices.ts AVS-PHM-26-27-213 --apply
 *   npx tsx scripts/delete-pharmacy-invoices.ts --apply --no-stock    # leave stock deducted
 *
 * WARNING — bill numbers are generated as count(prefix)+1 (app/lib/sequence-generator.ts:91),
 * not max+1. Deleting N pharmacy bills makes the next N counter sales re-issue those exact
 * numbers. Delete only the newest bills in the series, and only when that is acceptable.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const SKIP_STOCK = process.argv.includes('--no-stock');
const TARGETS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const INVOICE_NUMBERS = TARGETS.length
  ? TARGETS
  : ['AVS-PHM-26-27-213', 'AVS-PHM-26-27-212'];

const money = (n: any) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Tables this script knows how to unwind. Anything else that FKs to invoices/payments
 * and actually holds rows for these bills aborts the run rather than being deleted blind.
 * 'null' = the reference is cleared, the row itself is kept.
 */
const HANDLED: Record<string, 'delete' | 'null'> = {
  invoice_items: 'delete',
  invoice_snapshots: 'delete',
  payments: 'delete',
  payment_splits: 'delete',
  payment_order_intents: 'delete',
  insurance_receipt_allocations: 'delete',
  claim_short_pays: 'delete',
  insurance_claims: 'delete',
  credit_notes: 'delete',
  writeoffs: 'delete',
  pharmacy_orders: 'null',
  patient_deposits: 'null',
};

/** Ask Postgres which tables actually reference invoices(id) / payments(id) on THIS database. */
async function referencingTables(target: 'invoices' | 'payments') {
  return prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT src.relname AS table_name, att.attname AS column_name
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_class tgt ON tgt.oid = c.confrelid
    JOIN unnest(c.conkey) AS k(attnum) ON true
    JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = k.attnum
    WHERE c.contype = 'f' AND tgt.relname = ${target}
  `;
}

async function countRows(table: string, column: string, ids: number[]) {
  if (!ids.length) return 0;
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM "${table}" WHERE "${column}" = ANY($1::int[])`,
    ids,
  );
  return Number(rows[0]?.n ?? 0);
}

/** invoice_items.description is written as `${brand_name} (Batch: ${batch_no})`. */
function brandFromDescription(desc: string) {
  const m = desc.match(/^(.*?)\s*\(Batch:\s*.*\)$/i);
  return (m ? m[1] : desc).trim();
}

/**
 * Stock restoration hinges entirely on recovering the brand name from the line
 * description, so it gets a check. Run: npx tsx scripts/delete-pharmacy-invoices.ts --self-check
 */
function selfCheck() {
  const assert = require('assert') as typeof import('assert');
  const eq = (input: string, want: string) => assert.strictEqual(brandFromDescription(input), want, input);
  eq('AB-FLO SR TAB (Batch: B12345)', 'AB-FLO SR TAB');
  eq('ACIVIR -IV 250MG INJ (Batch: N/A)', 'ACIVIR -IV 250MG INJ'); // catalog-only line
  eq('AUGMENTIN 625 (DUO) TAB (Batch: X-9)', 'AUGMENTIN 625 (DUO) TAB'); // brand contains its own parens
  eq('PARACETAMOL 500 (Batch: A/1 (RE-LABELLED))', 'PARACETAMOL 500'); // parens inside the batch too
  eq('CROCIN ADVANCE', 'CROCIN ADVANCE'); // no batch suffix at all
  console.log('✓ brandFromDescription: 5/5 passed');
}

async function main() {
  if (process.argv.includes('--self-check')) return selfCheck();

  console.log('\n' + '='.repeat(78));
  console.log(' HOSPITALOS — DELETE PHARMACY INVOICES');
  console.log('='.repeat(78));
  console.log(` Mode    : ${APPLY ? '🔴 APPLY (writes to the database)' : '🟢 DRY RUN (no writes)'}`);
  console.log(` Targets : ${INVOICE_NUMBERS.join(', ')}`);
  console.log(` Stock   : ${SKIP_STOCK ? 'left deducted (--no-stock)' : 'restored to the shelf'}`);
  console.log('-'.repeat(78));

  const invoices = await prisma.invoices.findMany({
    where: {
      OR: [
        { invoice_number: { in: INVOICE_NUMBERS } },
        { final_bill_number: { in: INVOICE_NUMBERS } },
      ],
    },
    include: { items: true, payments: true, patient: true },
  });

  const found = invoices.map((i) => i.invoice_number || i.final_bill_number);
  const missing = INVOICE_NUMBERS.filter((n) => !found.includes(n));
  if (missing.length) {
    console.log(`\n❌ Not found on this database: ${missing.join(', ')}`);
    console.log('   Check DATABASE_URL points at the intended environment.');
    if (!invoices.length) return;
  }

  const invoiceIds = invoices.map((i) => i.id);
  const paymentIds = invoices.flatMap((i) => i.payments.map((p) => p.id));

  // ---------------------------------------------------------------- inspection
  for (const inv of invoices) {
    console.log(`\n▸ Invoice #${inv.id}  ${inv.invoice_number}`);
    console.log(`    Patient : ${inv.patient?.full_name || inv.patient_id} (${inv.patient_id})`);
    console.log(`    Doctor  : ${inv.doctor_name || '—'}`);
    console.log(`    Type    : ${inv.invoice_type} | Status: ${inv.status} | Created: ${inv.created_at.toISOString()}`);
    console.log(`    Amounts : net ${money(inv.net_amount)} | paid ${money(inv.paid_amount)} | balance ${money(inv.balance_due)}`);
    console.log(`    Notes   : ${inv.notes || '—'}`);
    console.log(`    Items (${inv.items.length}):`);
    for (const it of inv.items) {
      console.log(
        `      - ${it.description} × ${it.quantity} @ ${money(it.unit_price)} = ${money(it.net_price)}` +
          `${it.batch_no ? `  [batch ${it.batch_no}]` : ''}`,
      );
    }
    console.log(`    Payments (${inv.payments.length}):`);
    for (const p of inv.payments) {
      console.log(`      - ${p.receipt_number} ${money(p.amount)} ${p.payment_method} ${p.status}`);
    }
  }

  // ------------------------------------------------- unexpected FK dependants
  const deps = [
    ...(await referencingTables('invoices')).map((r) => ({ ...r, ids: invoiceIds })),
    ...(await referencingTables('payments')).map((r) => ({ ...r, ids: paymentIds })),
  ];
  const blockers: string[] = [];
  console.log('\n▸ Rows referencing these bills:');
  for (const d of deps) {
    const n = await countRows(d.table_name, d.column_name, d.ids);
    if (!n) continue;
    const plan = HANDLED[d.table_name];
    console.log(`    ${d.table_name}.${d.column_name}: ${n}  → ${plan ? (plan === 'null' ? 'unlink (row kept)' : 'delete') : '⚠️ UNHANDLED'}`);
    if (!plan) blockers.push(`${d.table_name}.${d.column_name} (${n} rows)`);
  }

  // -------------------------------------------------------- ledger / register
  const refIds = [
    ...invoiceIds.map((id) => ({ type: 'Invoice', id: String(id) })),
    ...paymentIds.map((id) => ({ type: 'Payment', id: String(id) })),
  ];
  const journals = await prisma.gL_JournalEntry.findMany({
    where: { OR: refIds.map((r) => ({ reference_type: r.type, reference_id: r.id })) },
    include: { period: { select: { period_name: true, status: true } }, _count: { select: { lines: true } } },
  });
  console.log(`\n▸ GL journal entries: ${journals.length}`);
  for (const j of journals) {
    const closed = j.period && j.period.status !== 'Open';
    console.log(
      `    ${j.journal_number} ${j.entry_type} ${money(j.total_debit)} (${j._count.lines} lines)` +
        ` period=${j.period?.period_name || '—'}/${j.period?.status || '—'}${closed ? '  ⚠️ CLOSED PERIOD' : ''}`,
    );
    if (closed) blockers.push(`${j.journal_number} sits in a closed financial period`);
  }

  const gstRows = await prisma.gST_Invoice_Register.findMany({
    where: { invoice_id: { in: invoiceIds.map(String) } },
    select: { id: true, invoice_number: true, filing_period: true, total_invoice_value: true },
  });
  console.log(`\n▸ GST outward register rows: ${gstRows.length}`);
  for (const g of gstRows) {
    console.log(`    ${g.invoice_number} ${money(g.total_invoice_value)} filing_period=${g.filing_period || 'not filed'}`);
    if (g.filing_period) blockers.push(`${g.invoice_number} is already in GST filing period ${g.filing_period}`);
  }

  const refComm = await prisma.referralCommission.findMany({ where: { invoice_id: { in: invoiceIds } } });
  const docComm = await prisma.doctorCommission.findMany({ where: { invoice_id: { in: invoiceIds } } });
  console.log(`\n▸ Commission rows: referral ${refComm.length}, doctor ${docComm.length}`);
  for (const c of [...refComm, ...docComm]) {
    console.log(`    ${money(c.commission_amount)} status=${c.status}${c.statement_id ? ` statement=${c.statement_id}` : ''}`);
    if (c.statement_id) blockers.push(`a commission row is already on payout statement ${c.statement_id}`);
  }

  // ---------------------------------------------------------------- stock plan
  type Restore = { batchId: number; qty: number; label: string; current: number };
  const restores: Restore[] = [];
  // The same batch can appear on more than one of the targeted bills, and the apply
  // step increments cumulatively. Track a running projection so the preview shows the
  // real end state rather than re-reporting the same starting stock for each bill.
  const projected = new Map<number, number>();
  if (!SKIP_STOCK) {
    console.log('\n▸ Stock to put back:');
    for (const inv of invoices) {
      for (const it of inv.items) {
        if (!it.batch_no || it.batch_no === 'N/A') {
          console.log(`    ${it.description}: catalog-only line, no stock was deducted — nothing to restore`);
          continue;
        }
        const brand = brandFromDescription(it.description);
        const med = await prisma.pharmacy_medicine_master.findUnique({
          where: { brand_name_organizationId: { brand_name: brand, organizationId: inv.organizationId } },
          select: { id: true },
        });
        if (!med) {
          console.log(`    ⚠️ ${brand}: no medicine master row — cannot restore`);
          blockers.push(`cannot resolve medicine "${brand}" for stock restore`);
          continue;
        }
        const batch = await prisma.pharmacy_batch_inventory.findUnique({
          where: { medicine_id_batch_no: { medicine_id: med.id, batch_no: it.batch_no } },
          select: { id: true, current_stock: true },
        });
        if (!batch) {
          console.log(`    ⚠️ ${brand} batch ${it.batch_no}: batch no longer exists — cannot restore`);
          blockers.push(`batch ${it.batch_no} of "${brand}" no longer exists`);
          continue;
        }
        const qty = Math.round(it.quantity);
        const before = projected.get(batch.id) ?? batch.current_stock;
        projected.set(batch.id, before + qty);
        restores.push({ batchId: batch.id, qty, label: `${brand} [${it.batch_no}]`, current: batch.current_stock });
        console.log(`    ${brand} [${it.batch_no}]: ${before} → ${before + qty}  (+${qty})`);
      }
    }
  }

  // ------------------------------------------------------------------- gateway
  if (blockers.length) {
    console.log('\n' + '='.repeat(78));
    console.log('🛑 REFUSING TO APPLY — resolve these first:');
    for (const b of [...new Set(blockers)]) console.log(`   • ${b}`);
    console.log('='.repeat(78) + '\n');
    return;
  }

  if (!APPLY) {
    console.log('\n' + '='.repeat(78));
    console.log('🟢 DRY RUN COMPLETE — nothing was modified.');
    console.log(`   To execute: npx tsx scripts/delete-pharmacy-invoices.ts ${INVOICE_NUMBERS.join(' ')} --apply`);
    console.log('='.repeat(78) + '\n');
    return;
  }

  // ------------------------------------------------------------------- execute
  console.log('\n🚀 EXECUTING IN A SINGLE TRANSACTION...\n');
  const org = invoices[0].organizationId;
  const summary = invoices.map((i) => ({
    invoice_number: i.invoice_number,
    patient_id: i.patient_id,
    net_amount: Number(i.net_amount),
    created_at: i.created_at.toISOString(),
    items: i.items.map((it) => `${it.description} × ${it.quantity}`),
    receipts: i.payments.map((p) => p.receipt_number),
  }));

  await prisma.$transaction(async (tx) => {
    // 1. Stock back on the shelf, with a compensating movement so the ledger reads true.
    for (const r of restores) {
      const updated = await tx.pharmacy_batch_inventory.update({
        where: { id: r.batchId },
        data: { current_stock: { increment: r.qty } },
        select: { current_stock: true, medicine_id: true },
      });
      await tx.pharmacyInventoryMovement.create({
        data: {
          organizationId: org,
          medicine_id: updated.medicine_id,
          batch_id: r.batchId,
          movement_type: 'RETURN',
          quantity_in: r.qty,
          balance_after: updated.current_stock,
          source_type: 'INVOICE',
          source_id: `VOID-${INVOICE_NUMBERS.join('/')}`,
          reason: `Stock restored — duplicate pharmacy bill(s) ${INVOICE_NUMBERS.join(', ')} deleted; goods were never dispensed`,
        },
      });
      console.log(`  ✓ stock ${r.label}: ${r.current} → ${updated.current_stock}`);
    }

    // 2. Ledger. Lines cascade with the entry; only the optional store-issue FK needs clearing.
    const journalIds = journals.map((j) => j.id);
    if (journalIds.length) {
      await tx.inventory_movements.updateMany({ where: { gl_journal_id: { in: journalIds } }, data: { gl_journal_id: null } });
      await tx.gL_JournalEntry.deleteMany({ where: { id: { in: journalIds } } });
      console.log(`  ✓ deleted ${journalIds.length} GL journal entries (lines cascade)`);
    }

    // 3. GST outward register + commissions.
    if (gstRows.length) {
      await tx.gST_Invoice_Register.deleteMany({ where: { id: { in: gstRows.map((g) => g.id) } } });
      console.log(`  ✓ deleted ${gstRows.length} GST register rows`);
    }
    await tx.referralCommission.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
    await tx.doctorCommission.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
    console.log(`  ✓ voided ${refComm.length + docComm.length} commission rows`);

    // 4. Unlink the rows that must survive the bill.
    await tx.pharmacy_orders.updateMany({ where: { invoice_id: { in: invoiceIds } }, data: { invoice_id: null } });
    await tx.patientDeposit.updateMany({
      where: { applied_to_invoice: { in: invoiceIds } },
      data: { applied_to_invoice: null, applied_amount: 0, status: 'Active' },
    });

    // 5. Children, then the bill itself.
    await tx.insuranceReceiptAllocation.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
    await tx.claimShortPay.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
    await tx.writeoff.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
    await tx.creditNote.deleteMany({ where: { original_invoice_id: { in: invoiceIds } } });
    await tx.insurance_claims.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
    await tx.paymentOrderIntent.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
    await tx.paymentSplit.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
    await tx.payments.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
    await tx.invoice_snapshots.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
    await tx.invoice_items.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
    await tx.invoices.deleteMany({ where: { id: { in: invoiceIds } } });
    console.log(`  ✓ deleted ${invoiceIds.length} invoices and their line items / payments`);

    // 6. The bill is gone, so the audit log is the only remaining record that it existed.
    await tx.system_audit_logs.create({
      data: {
        action: 'DELETE_PHARMACY_INVOICE',
        module: 'finance',
        entity_type: 'invoice',
        entity_id: INVOICE_NUMBERS.join(', '),
        details: JSON.stringify({
          summary: `Hard-deleted ${invoiceIds.length} duplicate pharmacy counter bill(s) via scripts/delete-pharmacy-invoices.ts`,
          deleted: summary,
          stock_restored: !SKIP_STOCK,
          gl_entries_deleted: journals.map((j) => j.journal_number),
          gst_rows_deleted: gstRows.length,
        }),
        username: 'script:delete-pharmacy-invoices',
        role: 'system',
        organizationId: org,
      },
    });
    console.log('  ✓ wrote system_audit_logs entry');
  });

  console.log('\n' + '='.repeat(78));
  console.log('✅ DONE');
  console.log(`⚠️  Bill AND receipt numbers are count-based — the next ${invoiceIds.length} counter sale(s) will re-issue`);
  console.log(`   ${INVOICE_NUMBERS.join(', ')} and receipts ${invoices.flatMap((i) => i.payments.map((p) => p.receipt_number)).join(', ')}.`);
  console.log(`   Confirm that is acceptable before taking new sales.`);
  console.log('='.repeat(78) + '\n');
}

main()
  .catch((err) => {
    console.error('\n❌ FAILED (transaction rolled back, nothing changed):', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
