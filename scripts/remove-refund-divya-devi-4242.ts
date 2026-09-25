/**
 * One-off correction: remove refund R-17 (Divya Devi / AVS-2026-01257, invoice
 * 4242, ₹10,000, processed by Admin.Gauttam) and reverse everything it touched
 * — GL postings, invoice paid_amount/balance_due, payment status, commission.
 *
 * Usage on the live server:
 *   npx tsx scripts/remove-refund-divya-devi-4242.ts            # dry run — prints match, changes nothing
 *   npx tsx scripts/remove-refund-divya-devi-4242.ts --confirm  # applies the reversal
 *
 * Delete this file once run — it is a one-off, not a reusable admin tool.
 */
import { PrismaClient } from '@prisma/client';
import { recomputeInvoiceCommission } from '../app/lib/referral-commission';
import { recomputeInvoiceDoctorCommission } from '../app/lib/doctor-commission';

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes('--confirm');

async function main() {
  // "Invoice 4242" on the patient billing page's Refunds tab renders raw
  // refund.invoice_id (the invoices.id primary key), NOT invoice_number — so
  // match on invoice_id directly rather than invoice_number.
  const refund = await prisma.refund.findFirst({
    where: {
      invoice_id: '4242',
      amount: 10000,
      processed_by: { contains: 'Gauttam', mode: 'insensitive' },
    },
  });
  if (!refund) throw new Error('No ₹10,000 refund by Admin.Gauttam found with invoice_id 4242.');

  const invoice = await prisma.invoices.findUnique({ where: { id: Number(refund.invoice_id) } });
  if (!invoice) throw new Error(`Refund ${refund.id} points at invoice_id ${refund.invoice_id}, which doesn't exist.`);

  const patient = await prisma.oPD_REG.findUnique({ where: { patient_id: invoice.patient_id } });
  if (!patient || !/divya devi/i.test(patient.full_name)) {
    throw new Error(
      `Invoice ${invoice.id} belongs to patient "${patient?.full_name}" (${invoice.patient_id}), not Divya Devi. Aborting — details don't line up.`
    );
  }

  const payment = refund.payment_id
    ? await prisma.payments.findUnique({ where: { id: Number(refund.payment_id) } })
    : null;

  const journals = await prisma.gL_JournalEntry.findMany({
    where: { reference_type: 'Refund', reference_id: String(refund.id) },
    include: { lines: true },
  });

  console.log('=== MATCH FOUND ===');
  console.log('Patient:', patient.patient_id, patient.full_name, patient.phone);
  console.log('Invoice:', invoice.id, invoice.invoice_number, 'paid_amount=', invoice.paid_amount.toString(), 'balance_due=', invoice.balance_due.toString());
  console.log('Refund:', refund);
  console.log('Payment:', payment ? { id: payment.id, receipt_number: payment.receipt_number, amount: payment.amount.toString(), status: payment.status } : null);
  console.log('GL journal entries referencing this refund:', journals.map(j => ({ id: j.id, journal_number: j.journal_number, status: j.status })));

  if (!CONFIRM) {
    console.log('\nDRY RUN — nothing changed. Re-run with --confirm to apply the removal.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    // 1. Reverse (not delete) any GL journal entries this refund posted, to keep the ledger trail intact.
    for (const j of journals) {
      if (j.status === 'Reversed') continue;
      const year = new Date(j.entry_date).getFullYear();
      const last = await tx.gL_JournalEntry.findFirst({
        where: { organizationId: j.organizationId, journal_number: { startsWith: `JV-${year}-` } },
        orderBy: { journal_number: 'desc' },
      });
      let n = 1;
      if (last) {
        const m = last.journal_number.match(/JV-\d{4}-(\d+)/);
        if (m) n = parseInt(m[1], 10) + 1;
      }
      const journal_number = `JV-${year}-${String(n).padStart(4, '0')}`;
      const totalDebit = j.lines.reduce((s, l) => s + Number(l.credit_amount), 0);

      const reversal = await tx.gL_JournalEntry.create({
        data: {
          organizationId: j.organizationId,
          journal_number,
          entry_date: new Date(),
          entry_type: 'Adjustment',
          reference_type: 'Journal',
          reference_id: j.id,
          reference_number: j.journal_number,
          narration: `Reversal of ${j.journal_number}: refund R-${refund.id} removed as data-entry correction (wrong bill, adjusted against IPD instead)`,
          total_debit: totalDebit,
          total_credit: totalDebit,
          status: 'Posted',
        },
      });

      for (let i = 0; i < j.lines.length; i++) {
        const l = j.lines[i];
        await tx.gL_JournalLine.create({
          data: {
            organizationId: j.organizationId,
            journal_id: reversal.id,
            line_number: i + 1,
            account_id: l.account_id,
            debit_amount: l.credit_amount,
            credit_amount: l.debit_amount,
            description: `Reversal: ${l.description || ''}`,
          },
        });

        const account = await tx.gL_Account.findUnique({ where: { id: l.account_id } });
        if (account) {
          const debit = Number(l.credit_amount);
          const credit = Number(l.debit_amount);
          const balanceChange = account.normal_balance === 'Debit' ? debit - credit : credit - debit;
          await tx.gL_Account.update({
            where: { id: l.account_id },
            data: { current_balance: { increment: balanceChange } },
          });
        }
      }

      await tx.gL_JournalEntry.update({
        where: { id: j.id },
        data: { status: 'Reversed', reversal_entry_id: reversal.id },
      });
    }

    // 2. Remove the refund row itself.
    await tx.refund.delete({ where: { id: refund.id } });

    // 3. Recompute invoice paid_amount / balance_due (same formula processRefund uses).
    const activePayments = await tx.payments.findMany({
      where: { invoice_id: invoice.id, status: 'Completed' },
      select: { amount: true },
    });
    const remainingRefunds = await tx.refund.aggregate({
      where: { invoice_id: String(invoice.id), status: { in: ['Processed', 'Approved'] } },
      _sum: { amount: true },
    });
    const grossPaid = activePayments.reduce((s, p) => s + Number(p.amount), 0);
    const totalRefunded = Number(remainingRefunds._sum.amount || 0);
    const netPaid = Math.max(0, grossPaid - totalRefunded);
    const netAmount = Number(invoice.net_amount);
    const balance = Math.max(0, netAmount - netPaid);

    await tx.invoices.update({
      where: { id: invoice.id },
      data: { paid_amount: netPaid, balance_due: balance, version: { increment: 1 } },
    });

    // 4. Revert payment status Refunded -> Completed if this refund was covering it and no other refund does now.
    if (payment && payment.status === 'Refunded') {
      const stillRefunded = await tx.refund.aggregate({
        where: { payment_id: String(payment.id), status: { in: ['Processed', 'Approved'] } },
        _sum: { amount: true },
      });
      if (Number(stillRefunded._sum.amount || 0) + 0.01 < Number(payment.amount)) {
        await tx.payments.update({ where: { id: payment.id }, data: { status: 'Completed' } });
      }
    }

    // 5. Audit trail.
    await tx.system_audit_logs.create({
      data: {
        action: 'REMOVE_REFUND',
        module: 'finance',
        entity_type: 'refund',
        entity_id: String(refund.id),
        details: JSON.stringify({
          summary: `Refund R-${refund.id} (₹${refund.amount}) removed as data-entry correction — invoice ${invoice.invoice_number}, patient ${patient.full_name}`,
          removed_refund: refund,
        }),
        organizationId: refund.organizationId,
      },
    });
  });

  try {
    await recomputeInvoiceCommission(prisma, refund.organizationId, invoice.id);
    await recomputeInvoiceDoctorCommission(prisma, refund.organizationId, invoice.id);
  } catch (e) {
    console.error('Commission recompute failed (non-fatal):', e);
  }

  const finalInvoice = await prisma.invoices.findUnique({ where: { id: invoice.id } });
  console.log('\nDONE. Invoice now:', {
    paid_amount: finalInvoice?.paid_amount.toString(),
    balance_due: finalInvoice?.balance_due.toString(),
  });
}

main()
  .catch((e) => {
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
