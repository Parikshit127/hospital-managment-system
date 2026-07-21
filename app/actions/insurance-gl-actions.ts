// @ts-nocheck
'use server';

/**
 * GL posting for the TPA & Insurance receivables module.
 *
 * Follows the established post*ToGL pattern in gl-actions.ts: every money movement
 * creates a balanced double-entry journal through createJournalEntry, with
 * reference_type/reference_id for drill-down and bill_reference for Tally bill-wise.
 *
 * Posting rules (see PRD §7):
 *   Receipt allocation (payer pays a bill)  Dr Bank + Dr TDS Receivable
 *                                           Cr Insurance/Corporate Receivable
 *   Short-pay write-off                     Dr Insurance Disallowance Expense
 *                                           Cr Insurance/Corporate Receivable
 *   Unapplied receipt (money, not allocated) Dr Bank
 *                                           Cr Unapplied Insurance Receipts
 *
 * Receivable control accounts already exist (1130/1140/1150). New accounts
 * (1200 TDS Receivable, 3170 Unapplied Receipts, 8960 Disallowance Expense) are
 * created on demand by ensureTpaGlAccounts so existing orgs need no manual step.
 */

import { prisma } from '@/backend/db';
import { createJournalEntry } from './gl-actions';
import {
  receivableCode,
  BANK_CODE,
  TDS_RECEIVABLE_CODE, TDS_RECEIVABLE_FALLBACK,
  UNAPPLIED_RECEIPT_CODE, UNAPPLIED_RECEIPT_FALLBACK,
  DISALLOWANCE_EXPENSE_CODE, DISALLOWANCE_EXPENSE_FALLBACK,
} from '@/app/lib/gl-income-head-map';

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

async function getAccount(organizationId: string, code: string) {
  return prisma.gL_Account.findFirst({
    where: { organizationId, account_code: code, is_active: true },
  });
}

// Resolve an account, falling back to an alternate code so a post never fails
// solely because a sub-ledger is missing.
async function resolveAccount(organizationId: string, code: string, fallback: string) {
  let acc = await getAccount(organizationId, code);
  if (!acc && code !== fallback) acc = await getAccount(organizationId, fallback);
  return acc;
}

// The three TPA-specific ledgers, definitions used for on-demand creation.
const TPA_ACCOUNT_DEFS: Array<{
  code: string; name: string; type: string; group: string; parent: string; normal: string;
  tally_ledger: string; tally_group: string;
}> = [
  { code: '1200', name: 'TDS Receivable (Insurance/TPA)', type: 'Asset', group: 'Current Assets', parent: '1100', normal: 'Debit', tally_ledger: 'TDS Receivable', tally_group: 'Current Assets' },
  { code: '3170', name: 'Unapplied Insurance Receipts', type: 'Liability', group: 'Current Liabilities', parent: '3100', normal: 'Credit', tally_ledger: 'Unapplied Insurance Receipts', tally_group: 'Current Liabilities' },
  { code: '8960', name: 'Insurance Disallowance & Bad Debts', type: 'Expense', group: 'Operating Expenses', parent: '8000', normal: 'Debit', tally_ledger: 'Insurance Disallowance & Bad Debts', tally_group: 'Indirect Expenses' },
];

/**
 * Idempotently ensure the three new TPA GL accounts exist for an org. Safe to
 * call before any posting; creates only what's missing.
 */
export async function ensureTpaGlAccounts(organizationId: string) {
  const created: string[] = [];
  for (const def of TPA_ACCOUNT_DEFS) {
    const existing = await getAccount(organizationId, def.code);
    if (existing) continue;
    const parent = await getAccount(organizationId, def.parent);
    try {
      await prisma.gL_Account.create({
        data: {
          organizationId,
          account_code: def.code,
          account_name: def.name,
          account_type: def.type,
          account_group: def.group,
          parent_id: parent?.id ?? null,
          normal_balance: def.normal,
          opening_balance: 0,
          current_balance: 0,
          tally_ledger_name: def.tally_ledger,
          tally_group: def.tally_group,
          is_active: true,
        },
      });
      created.push(def.code);
    } catch {
      // Race / already exists — ignore.
    }
  }
  return { success: true, created };
}

/**
 * Post a single receipt allocation to the GL.
 *   Dr Bank (allocated cash) + Dr TDS Receivable (tds)
 *   Cr Receivable by payer type (allocated + tds), bill-wise against the invoice.
 * The disallowed portion is NOT expensed here — it stays in receivable until it
 * is dispositioned (recover vs write-off) via postShortPayWriteOffToGL.
 */
export async function postReceiptAllocationToGL(allocationId: number) {
  try {
    const alloc = await prisma.insuranceReceiptAllocation.findUnique({
      where: { id: allocationId },
      include: { receipt: true, invoice: { select: { invoice_number: true, billing_patient_type: true } } },
    });
    if (!alloc) return { success: false, error: 'Allocation not found' };

    // Already posted?
    const existing = await prisma.gL_JournalEntry.findFirst({
      where: { reference_type: 'InsuranceReceiptAllocation', reference_id: String(allocationId), status: { not: 'Reversed' } },
    });
    if (existing) return { success: true, message: 'Allocation already posted', journal: existing };

    const orgId = alloc.organizationId;
    await ensureTpaGlAccounts(orgId);

    const allocated = round2(Number(alloc.allocated_amount || 0));
    const tds = round2(Number(alloc.tds_amount || 0));
    const debitTotal = round2(allocated + tds);
    if (debitTotal <= 0) return { success: true, message: 'Nothing to post (zero cash + tds)' };

    const bank = await getAccount(orgId, BANK_CODE);
    const payerType = alloc.invoice?.billing_patient_type || 'tpa_insurance';
    const receivable = await resolveAccount(orgId, receivableCode(payerType), '1130');
    if (!bank || !receivable) return { success: false, error: 'Required GL accounts (bank/receivable) not found' };

    const billRef = alloc.invoice?.invoice_number;
    const lines: any[] = [
      { account_id: bank.id, debit_amount: allocated, credit_amount: 0, description: `Insurance receipt — ${billRef || ''}` },
    ];
    if (tds > 0) {
      const tdsAcc = await resolveAccount(orgId, TDS_RECEIVABLE_CODE, TDS_RECEIVABLE_FALLBACK);
      if (tdsAcc) lines.push({ account_id: tdsAcc.id, debit_amount: tds, credit_amount: 0, description: `TDS deducted — ${billRef || ''}` });
      else lines[0].debit_amount = round2(lines[0].debit_amount + tds); // fold into bank if no TDS ledger
    }
    lines.push({
      account_id: receivable.id,
      debit_amount: 0,
      credit_amount: debitTotal,
      description: billRef ? `Settlement against ${billRef}` : 'Insurance settlement',
      bill_reference: billRef,
      bill_alloc_type: billRef ? 'Agst Ref' : undefined,
    });

    const result = await createJournalEntry({
      organizationId: orgId,
      entry_date: alloc.receipt?.receipt_date || new Date(),
      entry_type: 'Payment',
      narration: `Insurance receipt allocation — ${billRef || ''} (${alloc.receipt?.receipt_number || ''})`,
      lines,
      reference_type: 'InsuranceReceiptAllocation',
      reference_id: String(allocationId),
      reference_number: alloc.receipt?.reference_number || undefined,
    });
    return result;
  } catch (error: any) {
    console.error('postReceiptAllocationToGL error:', error);
    return { success: false, error: 'Failed to post receipt allocation to GL' };
  }
}

/**
 * Post a short-pay write-off.
 *   Dr Insurance Disallowance Expense
 *   Cr Receivable by payer type, bill-wise.
 * Only call when the short-pay disposition is WriteOff.
 */
export async function postShortPayWriteOffToGL(shortPayId: number) {
  try {
    const sp = await prisma.claimShortPay.findUnique({
      where: { id: shortPayId },
      include: { invoice: { select: { invoice_number: true, billing_patient_type: true } } },
    });
    if (!sp) return { success: false, error: 'Short-pay not found' };
    if (sp.disposition !== 'WriteOff') return { success: false, error: 'Short-pay is not marked WriteOff' };

    const existing = await prisma.gL_JournalEntry.findFirst({
      where: { reference_type: 'ClaimShortPay', reference_id: String(shortPayId), status: { not: 'Reversed' } },
    });
    if (existing) return { success: true, message: 'Write-off already posted', journal: existing };

    const orgId = sp.organizationId;
    await ensureTpaGlAccounts(orgId);

    const amount = round2(Number(sp.amount || 0));
    if (amount <= 0) return { success: true, message: 'Nothing to write off' };

    const expense = await resolveAccount(orgId, DISALLOWANCE_EXPENSE_CODE, DISALLOWANCE_EXPENSE_FALLBACK);
    const payerType = sp.invoice?.billing_patient_type || 'tpa_insurance';
    const receivable = await resolveAccount(orgId, receivableCode(payerType), '1130');
    if (!expense || !receivable) return { success: false, error: 'Required GL accounts (expense/receivable) not found' };

    const billRef = sp.invoice?.invoice_number;
    const lines: any[] = [
      { account_id: expense.id, debit_amount: amount, credit_amount: 0, description: `Disallowance write-off — ${billRef || ''} (${sp.denial_reason_code || 'N/A'})` },
      { account_id: receivable.id, debit_amount: 0, credit_amount: amount, description: billRef ? `Write-off against ${billRef}` : 'Disallowance write-off', bill_reference: billRef, bill_alloc_type: billRef ? 'Agst Ref' : undefined },
    ];

    const result = await createJournalEntry({
      organizationId: orgId,
      entry_date: new Date(),
      entry_type: 'Adjustment',
      narration: `Insurance disallowance write-off — ${billRef || ''}`,
      lines,
      reference_type: 'ClaimShortPay',
      reference_id: String(shortPayId),
      reference_number: billRef || undefined,
    });

    if (result?.success) {
      await prisma.claimShortPay.update({ where: { id: shortPayId }, data: { gl_posted: true } });
    }
    return result;
  } catch (error: any) {
    console.error('postShortPayWriteOffToGL error:', error);
    return { success: false, error: 'Failed to post write-off to GL' };
  }
}

/**
 * Post a recoverable short-pay (disposition = ToRecover).
 *   Dr Patient Receivable
 *   Cr Insurance / TPA Receivable
 * Reclassifies a disallowed amount from the payer to the patient — no expense,
 * the debt simply moves to the patient's ledger. Call when the short-pay
 * disposition is ToRecover (Option B "recover the gap from the patient").
 */
export async function postShortPayRecoverToGL(shortPayId: number) {
  try {
    const sp = await prisma.claimShortPay.findUnique({
      where: { id: shortPayId },
      include: { invoice: { select: { invoice_number: true, billing_patient_type: true } } },
    });
    if (!sp) return { success: false, error: 'Short-pay not found' };
    if (sp.disposition !== 'ToRecover') return { success: false, error: 'Short-pay is not marked ToRecover' };

    const existing = await prisma.gL_JournalEntry.findFirst({
      where: { reference_type: 'ClaimShortPay', reference_id: String(shortPayId), status: { not: 'Reversed' } },
    });
    if (existing) return { success: true, message: 'Recovery already posted', journal: existing };

    const orgId = sp.organizationId;
    await ensureTpaGlAccounts(orgId);

    const amount = round2(Number(sp.amount || 0));
    if (amount <= 0) return { success: true, message: 'Nothing to recover' };

    const patientRec = await resolveAccount(orgId, receivableCode('cash'), '1130');
    const payerType = sp.invoice?.billing_patient_type || 'tpa_insurance';
    const payerRec = await resolveAccount(orgId, receivableCode(payerType), '1150');
    if (!patientRec || !payerRec) return { success: false, error: 'Required GL accounts (patient/payer receivable) not found' };

    const billRef = sp.invoice?.invoice_number;
    const lines: any[] = [
      { account_id: patientRec.id, debit_amount: amount, credit_amount: 0, description: `Disallowance recoverable from patient — ${billRef || ''}`, bill_reference: billRef, bill_alloc_type: billRef ? 'Agst Ref' : undefined },
      { account_id: payerRec.id, debit_amount: 0, credit_amount: amount, description: billRef ? `Reclassify to patient — ${billRef}` : 'Disallowance reclassified to patient', bill_reference: billRef, bill_alloc_type: billRef ? 'Agst Ref' : undefined },
    ];

    const result = await createJournalEntry({
      organizationId: orgId,
      entry_date: new Date(),
      entry_type: 'Adjustment',
      narration: `Insurance disallowance recoverable from patient — ${billRef || ''}`,
      lines,
      reference_type: 'ClaimShortPay',
      reference_id: String(shortPayId),
      reference_number: billRef || undefined,
    });

    if (result?.success) {
      await prisma.claimShortPay.update({ where: { id: shortPayId }, data: { gl_posted: true } });
    }
    return result;
  } catch (error: any) {
    console.error('postShortPayRecoverToGL error:', error);
    return { success: false, error: 'Failed to post recovery to GL' };
  }
}

/**
 * Optional: post an unapplied (received-but-not-yet-allocated) receipt amount.
 *   Dr Bank   Cr Unapplied Insurance Receipts (liability)
 * Use only when the org banks money ahead of allocation; the default flow posts
 * bank at allocation time, so call this only for explicit unapplied receipts.
 */
export async function postUnappliedReceiptToGL(receiptId: number, amount: number) {
  try {
    const receipt = await prisma.insuranceReceipt.findUnique({ where: { id: receiptId } });
    if (!receipt) return { success: false, error: 'Receipt not found' };

    const orgId = receipt.organizationId;
    await ensureTpaGlAccounts(orgId);

    const amt = round2(Number(amount || 0));
    if (amt <= 0) return { success: true, message: 'Nothing to post' };

    const bank = await getAccount(orgId, BANK_CODE);
    const unapplied = await resolveAccount(orgId, UNAPPLIED_RECEIPT_CODE, UNAPPLIED_RECEIPT_FALLBACK);
    if (!bank || !unapplied) return { success: false, error: 'Required GL accounts not found' };

    const lines: any[] = [
      { account_id: bank.id, debit_amount: amt, credit_amount: 0, description: `Unapplied insurance receipt — ${receipt.receipt_number}` },
      { account_id: unapplied.id, debit_amount: 0, credit_amount: amt, description: `Unapplied — ${receipt.reference_number}` },
    ];

    return await createJournalEntry({
      organizationId: orgId,
      entry_date: receipt.receipt_date || new Date(),
      entry_type: 'Payment',
      narration: `Unapplied insurance receipt — ${receipt.receipt_number}`,
      lines,
      reference_type: 'InsuranceReceiptUnapplied',
      reference_id: String(receiptId),
      reference_number: receipt.reference_number || undefined,
    });
  } catch (error: any) {
    console.error('postUnappliedReceiptToGL error:', error);
    return { success: false, error: 'Failed to post unapplied receipt to GL' };
  }
}
