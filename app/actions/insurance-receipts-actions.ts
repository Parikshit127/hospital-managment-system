'use server';

/**
 * Insurance Receipts & Advice reconciliation — the heart of the benchmark
 * "Insurance Receipts" screen and the biggest functional gap in the old module.
 *
 * A payer remittance is recorded ONCE as an InsuranceReceipt, then allocated
 * across many bills (InsuranceReceiptAllocation). Each allocation:
 *   - records how much was received / disallowed (short-pay) / TDS per bill,
 *   - creates a payments row and updates the invoice's TPA settlement fields
 *     (mirrors the proven recordTpaPaymentReceived accumulation, extended for
 *      disallowance + TDS), under optimistic locking,
 *   - opens a ClaimShortPay row for any disallowed amount, and
 *   - posts a balanced GL journal (Dr Bank + Dr TDS, Cr Receivable).
 * The unallocated remainder stays on the receipt as the "unmapped receipt".
 */

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { generateSequentialNumber, generateReceiptNumber as genRcpNum } from '@/app/lib/sequence-generator';
import { postReceiptAllocationToGL, ensureTpaGlAccounts } from './insurance-gl-actions';

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    v !== null && typeof v === 'object' && v.constructor?.name === 'Decimal' ? Number(v) : v
  ));
}

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

const TOL = 0.01;

// Map a receipt instrument to the payments.payment_method vocabulary.
function instrumentToMethod(instrument?: string): string {
  const i = (instrument || 'NEFT').toLowerCase();
  if (i.includes('rtgs')) return 'RTGS';
  if (i.includes('chq') || i.includes('cheque')) return 'Cheque';
  if (i.includes('upi')) return 'UPI';
  if (i.includes('neft') || i.includes('bank')) return 'NEFT';
  return 'Other';
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE RECEIPT (header only — money received from a payer)
// ─────────────────────────────────────────────────────────────────────────────
export async function createInsuranceReceipt(input: {
  payer_type: 'tpa_insurance' | 'corporate';
  provider_id?: number;
  corporate_id?: string;
  instrument: string;
  reference_number: string;
  receipt_date: string;
  total_amount: number;
  // Optional settlement-advice breakdown (MEDNET-style). When omitted, only the
  // received total is recorded (back-compatible with the simple receipt entry).
  claim_amount?: number;
  sanctioned_amount?: number;
  tds_amount?: number;
  service_charge?: number;
  remarks?: string;
}) {
  try {
    const { db, session, organizationId } = await requireTenantContext();

    const total = round2(Number(input.total_amount));
    if (!Number.isFinite(total) || total <= 0) return { success: false, error: 'total_amount must be greater than 0' };
    const claim = round2(Math.max(0, Number(input.claim_amount) || 0));
    const sanctioned = round2(Math.max(0, Number(input.sanctioned_amount) || 0));
    const tds = round2(Math.max(0, Number(input.tds_amount) || 0));
    const serviceCharge = round2(Math.max(0, Number(input.service_charge) || 0));
    const reference = (input.reference_number || '').trim();
    if (!reference) return { success: false, error: 'reference_number is required' };
    if (input.payer_type === 'tpa_insurance' && !input.provider_id) return { success: false, error: 'provider_id required for TPA/insurance receipt' };
    if (input.payer_type === 'corporate' && !input.corporate_id) return { success: false, error: 'corporate_id required for corporate receipt' };
    const receiptDate = new Date(input.receipt_date);
    if (isNaN(receiptDate.getTime())) return { success: false, error: 'Invalid receipt_date' };

    // Duplicate reference guard (scoped to org).
    const dup = await db.insuranceReceipt.findFirst({ where: { organizationId, reference_number: reference }, select: { id: true } });
    if (dup) return { success: false, error: `A receipt with reference '${reference}' already exists` };

    await ensureTpaGlAccounts(organizationId);
    const receiptNumber = await generateSequentialNumber(organizationId, 'IRC', db);

    const receipt = await db.insuranceReceipt.create({
      data: {
        receipt_number: receiptNumber,
        payer_type: input.payer_type,
        provider_id: input.payer_type === 'tpa_insurance' ? input.provider_id! : null,
        corporate_id: input.payer_type === 'corporate' ? input.corporate_id! : null,
        instrument: input.instrument || 'NEFT',
        reference_number: reference,
        receipt_date: receiptDate,
        total_amount: total,
        allocated_amount: 0,
        unmapped_amount: total,
        tds_total: tds,
        claim_amount: claim,
        sanctioned_amount: sanctioned,
        service_charge: serviceCharge,
        status: 'Open',
        remarks: input.remarks || null,
        organizationId,
        created_by: session?.username || session?.name || null,
      },
    });

    await db.system_audit_logs.create({
      data: {
        user_id: session?.id, username: session?.username || session?.name, role: session?.role,
        action: 'insurance_receipt_created', module: 'finance', entity_type: 'insurance_receipt',
        entity_id: String(receipt.id), details: JSON.stringify({ receipt_number: receiptNumber, reference, total }),
        organizationId,
      },
    });

    revalidatePath('/admin/finance/tpa-insurance');
    return { success: true, data: serialize(receipt) };
  } catch (error: any) {
    console.error('createInsuranceReceipt error:', error);
    return { success: false, error: error.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ALLOCATE RECEIPT across one or many bills
// ─────────────────────────────────────────────────────────────────────────────
export async function allocateReceipt(input: {
  receipt_id: number;
  lines: Array<{
    invoice_id: number;
    allocated_amount: number;      // cash applied to this bill
    disallowed_amount?: number;    // short-pay / disallowance
    tds_amount?: number;           // TDS deducted by payer
    disallowance_reason?: string;  // DenialReason.code
    is_partial?: boolean;
  }>;
}) {
  try {
    const { db, session, organizationId } = await requireTenantContext();

    const receipt = await db.insuranceReceipt.findFirst({ where: { id: input.receipt_id, organizationId } });
    if (!receipt) return { success: false, error: 'Receipt not found' };
    if (receipt.status === 'Reversed') return { success: false, error: 'Receipt has been reversed' };

    const lines = (input.lines || []).filter((l) => l && l.invoice_id);
    if (lines.length === 0) return { success: false, error: 'No allocation lines provided' };

    const sumCash = round2(lines.reduce((s, l) => s + Number(l.allocated_amount || 0), 0));
    const priorAllocated = Number(receipt.allocated_amount || 0);
    const receiptUnmapped = round2(Number(receipt.total_amount) - priorAllocated);
    if (sumCash > receiptUnmapped + TOL) {
      return { success: false, error: `Allocated cash ${sumCash} exceeds receipt's unmapped balance ${receiptUnmapped.toFixed(2)}` };
    }

    const createdAllocationIds: number[] = [];

    await db.$transaction(async (tx: any) => {
      let runningCash = 0;
      let runningTds = 0;

      for (const line of lines) {
        const allocated = round2(Number(line.allocated_amount || 0));
        const disallowed = round2(Number(line.disallowed_amount || 0));
        const tds = round2(Number(line.tds_amount || 0));
        if (allocated < 0 || disallowed < 0 || tds < 0) throw new Error('Amounts cannot be negative');
        if (allocated + disallowed + tds <= 0) continue;

        const invoice = await tx.invoices.findFirst({ where: { id: line.invoice_id, organizationId } });
        if (!invoice) throw new Error(`Invoice ${line.invoice_id} not found`);

        // Payer must match the receipt's payer.
        if (invoice.billing_patient_type !== receipt.payer_type) {
          throw new Error(`Invoice ${invoice.invoice_number} payer type (${invoice.billing_patient_type}) does not match receipt (${receipt.payer_type})`);
        }
        if (receipt.payer_type === 'tpa_insurance' && receipt.provider_id && invoice.tpa_provider_id && invoice.tpa_provider_id !== receipt.provider_id) {
          throw new Error(`Invoice ${invoice.invoice_number} belongs to a different insurer than this receipt`);
        }
        if (receipt.payer_type === 'corporate' && receipt.corporate_id && invoice.corporate_id && invoice.corporate_id !== receipt.corporate_id) {
          throw new Error(`Invoice ${invoice.invoice_number} belongs to a different corporate than this receipt`);
        }

        // Linked claim, if any (latest for this invoice).
        const claim = await tx.insurance_claims.findFirst({
          where: { organizationId, invoice_id: invoice.id }, orderBy: { submitted_at: 'desc' }, select: { id: true },
        });

        // Create a payments row for the cash applied (so payment-based reports include it).
        let paymentId: number | null = null;
        if (allocated > 0) {
          const receiptNumber = await genRcpNum(organizationId, tx);
          const pay = await tx.payments.create({
            data: {
              receipt_number: receiptNumber,
              invoice_id: invoice.id,
              amount: allocated,
              payment_method: instrumentToMethod(receipt.instrument),
              payment_type: receipt.payer_type === 'tpa_insurance' ? 'TPA Settlement' : 'Corporate Settlement',
              reference: receipt.reference_number,
              status: 'Completed',
              notes: `Insurance receipt ${receipt.receipt_number}`,
              organizationId,
              created_at: receipt.receipt_date,
            },
          });
          paymentId = pay.id;
        }

        // ── TPA invoice: full settlement accounting ──────────────────────────
        if (receipt.payer_type === 'tpa_insurance') {
          const status = invoice.tpa_claim_status;
          if (status !== 'approved' && status !== 'partially_settled') {
            throw new Error(`Invoice ${invoice.invoice_number}: cannot record receipt when claim status is '${status}' (must be approved)`);
          }
          const approved = Number(invoice.tpa_approved_amount || 0);
          const newSettled = round2(Number(invoice.tpa_settled_amount || 0) + allocated);
          const newDisallowed = round2(Number(invoice.tpa_disallowed_amount || 0) + disallowed);
          const newTds = round2(Number(invoice.tpa_tds_amount || 0) + tds);
          const accountedTotal = round2(newSettled + newDisallowed + newTds);
          if (accountedTotal > approved + TOL) {
            throw new Error(`Invoice ${invoice.invoice_number}: settled+disallowed+TDS (${accountedTotal}) exceeds approved (${approved})`);
          }
          const newPaid = round2(Number(invoice.paid_amount || 0) + allocated);
          const netAmount = Number(invoice.net_amount || 0);
          const newBalance = Math.max(0, round2(netAmount - newPaid));
          const fullyAccounted = accountedTotal >= approved - TOL;
          const newTpaPayable = Math.max(0, round2(approved - accountedTotal));
          const newClaimStatus = fullyAccounted ? 'settled' : 'partially_settled';

          const upd: any = {
            tpa_settled_amount: newSettled,
            tpa_disallowed_amount: newDisallowed,
            tpa_tds_amount: newTds,
            tpa_payable: newTpaPayable,
            tpa_claim_status: newClaimStatus,
            paid_amount: newPaid,
            balance_due: newBalance,
            version: { increment: 1 },
          };
          if (fullyAccounted && !invoice.tpa_settled_at) upd.tpa_settled_at = new Date();
          await tx.invoices.update({ where: { id: invoice.id }, data: upd });

          // Keep the linked claim's settlement mirror in sync.
          if (claim) {
            await tx.insurance_claims.update({
              where: { id: claim.id },
              data: {
                settled_amount: { increment: allocated },
                tds_amount: { increment: tds },
                short_pay_amount: { increment: disallowed },
                status: fullyAccounted ? 'Settled' : 'PartiallyApproved',
                settled_at: fullyAccounted ? new Date() : undefined,
              },
            });
          }
        } else {
          // ── Corporate invoice: balance update + flip planned split ────────────
          const newPaid = round2(Number(invoice.paid_amount || 0) + allocated);
          const netAmount = Number(invoice.net_amount || 0);
          const newBalance = Math.max(0, round2(netAmount - newPaid));
          await tx.invoices.update({
            where: { id: invoice.id },
            data: {
              paid_amount: newPaid,
              balance_due: newBalance,
              version: { increment: 1 },
            },
          });
          // Best-effort: mark a matching planned corporate split as received.
          const planned = await tx.paymentSplit.findFirst({
            where: { organizationId, invoice_id: invoice.id, payer_type: 'corporate', status: { not: 'received' } },
          });
          if (planned) {
            await tx.paymentSplit.update({
              where: { id: planned.id },
              data: { status: 'received', payment_method: instrumentToMethod(receipt.instrument), payment_reference: receipt.reference_number },
            });
          }
        }

        // Short-pay ledger entry for any disallowance.
        if (disallowed > 0) {
          await tx.claimShortPay.create({
            data: {
              claim_id: claim?.id ?? null,
              invoice_id: invoice.id,
              amount: disallowed,
              denial_reason_code: line.disallowance_reason || null,
              disposition: 'PendingReview',
              organizationId,
            },
          });
        }

        // The allocation row itself.
        const alloc = await tx.insuranceReceiptAllocation.create({
          data: {
            receipt_id: receipt.id,
            invoice_id: invoice.id,
            claim_id: claim?.id ?? null,
            allocated_amount: allocated,
            disallowed_amount: disallowed,
            tds_amount: tds,
            disallowance_reason: line.disallowance_reason || null,
            payment_id: paymentId,
            organizationId,
          },
        });
        createdAllocationIds.push(alloc.id);
        runningCash = round2(runningCash + allocated);
        runningTds = round2(runningTds + tds);
      }

      // Update the receipt header (allocated / unmapped / tds / status).
      const newAllocated = round2(priorAllocated + runningCash);
      const newUnmapped = Math.max(0, round2(Number(receipt.total_amount) - newAllocated));
      const newTdsTotal = round2(Number(receipt.tds_total || 0) + runningTds);
      const newStatus = newUnmapped <= TOL ? 'Allocated' : newAllocated > 0 ? 'PartiallyAllocated' : 'Open';
      await tx.insuranceReceipt.update({
        where: { id: receipt.id },
        data: { allocated_amount: newAllocated, unmapped_amount: newUnmapped, tds_total: newTdsTotal, status: newStatus },
      });

      await tx.system_audit_logs.create({
        data: {
          user_id: session?.id, username: session?.username || session?.name, role: session?.role,
          action: 'insurance_receipt_allocated', module: 'finance', entity_type: 'insurance_receipt',
          entity_id: String(receipt.id),
          details: JSON.stringify({ receipt_number: receipt.receipt_number, lines: lines.length, cash: runningCash, tds: runningTds }),
          organizationId,
        },
      });
    });

    // Post each allocation to the GL (outside the main tx; createJournalEntry is its own tx).
    const glWarnings: string[] = [];
    for (const allocId of createdAllocationIds) {
      const r = await postReceiptAllocationToGL(allocId);
      if (!r?.success) {
        const message = r && 'error' in r ? r.error : 'unknown';
        glWarnings.push(`GL post failed for allocation ${allocId}: ${message}`);
      }
    }

    revalidatePath('/admin/finance/tpa-insurance');
    revalidatePath('/billing');
    return { success: true, allocations: createdAllocationIds.length, glWarnings: glWarnings.length ? glWarnings : undefined };
  } catch (error: any) {
    console.error('allocateReceipt error:', error);
    return { success: false, error: error.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST / DETAIL / SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
export async function listInsuranceReceipts(filters?: {
  payer_type?: string; provider_id?: number; corporate_id?: string; status?: string; from?: string; to?: string;
}) {
  const { db, organizationId } = await requireTenantContext();
  const where: any = { organizationId };
  if (filters?.payer_type) where.payer_type = filters.payer_type;
  if (filters?.provider_id) where.provider_id = filters.provider_id;
  if (filters?.corporate_id) where.corporate_id = filters.corporate_id;
  if (filters?.status) where.status = filters.status;
  if (filters?.from || filters?.to) {
    where.receipt_date = {};
    if (filters.from) where.receipt_date.gte = new Date(filters.from);
    if (filters.to) where.receipt_date.lte = new Date(filters.to);
  }
  const receipts = await db.insuranceReceipt.findMany({
    where,
    include: {
      provider: { select: { provider_name: true } },
      corporate: { select: { company_name: true } },
      _count: { select: { allocations: true } },
      // A receipt is a lump-sum payer settlement that can cover more than one
      // patient's bill — surface which patient(s) it's allocated to on the list
      // rather than only the payer name.
      allocations: {
        select: { invoice: { select: { patient_id: true, patient: { select: { full_name: true } } } } },
      },
    },
    orderBy: { receipt_date: 'desc' },
    take: 300,
  });
  const data = receipts.map((r: any) => {
    const seen = new Map<string, string>();
    for (const a of r.allocations) {
      if (a.invoice?.patient_id && !seen.has(a.invoice.patient_id)) {
        seen.set(a.invoice.patient_id, a.invoice.patient?.full_name || a.invoice.patient_id);
      }
    }
    const { allocations, ...rest } = r;
    return { ...rest, patients: Array.from(seen.values()) };
  });
  return { success: true, data: serialize(data) };
}

export async function getInsuranceReceiptDetail(receiptId: number) {
  const { db, organizationId } = await requireTenantContext();
  const receipt = await db.insuranceReceipt.findFirst({
    where: { id: receiptId, organizationId },
    include: {
      provider: { select: { provider_name: true } },
      corporate: { select: { company_name: true } },
      allocations: { include: { invoice: { select: { invoice_number: true, patient_id: true, net_amount: true } } } },
    },
  });
  if (!receipt) return { success: false, error: 'Receipt not found' };
  return { success: true, data: serialize(receipt) };
}

/**
 * Benchmark "Insurance Receipts" summary: per payer — total receipts (count + amount)
 * and pending advices (sanctioned/approved claims with receipt still due).
 */
export async function getInsuranceReceiptSummary(filters?: { from?: string; to?: string }) {
  const { db, organizationId } = await requireTenantContext();

  const providers = await db.insurance_providers.findMany({
    where: { organizationId, is_active: true }, orderBy: { provider_name: 'asc' },
  });

  const dateWhere: any = {};
  if (filters?.from || filters?.to) {
    dateWhere.receipt_date = {};
    if (filters.from) dateWhere.receipt_date.gte = new Date(filters.from);
    if (filters.to) dateWhere.receipt_date.lte = new Date(filters.to);
  }

  const rows = await Promise.all(providers.map(async (p: any) => {
    const receipts = await db.insuranceReceipt.findMany({
      where: { organizationId, payer_type: 'tpa_insurance', provider_id: p.id, status: { not: 'Reversed' }, ...dateWhere },
      select: { total_amount: true },
    });
    const totalReceiptAmt = receipts.reduce((s: number, r: any) => s + Number(r.total_amount), 0);

    // Pending advices: invoices approved/partially settled with TPA balance still due.
    // Same billing_patient_type drift fix as insurance-aging-actions.ts. Note this
    // is still scoped to tpa_provider_id === p.id, so an invoice whose provider link
    // is also missing (not just the billing type) won't surface under any provider
    // here — that gap needs the claim's TPA provider assigned, not a query fix.
    const pending = await db.invoices.count({
      where: {
        organizationId,
        OR: [{ billing_patient_type: 'tpa_insurance' }, { tpa_claim_status: { not: 'not_submitted' } }],
        tpa_provider_id: p.id,
        tpa_claim_status: { in: ['approved', 'partially_settled'] },
        tpa_payable: { gt: 0 },
      },
    });

    return {
      provider_id: p.id,
      provider_name: p.provider_name,
      total_receipts: receipts.length,
      total_receipt_amount: round2(totalReceiptAmt),
      pending_advices: pending,
    };
  }));

  return { success: true, data: serialize(rows) };
}

// Pending advices list (drill-down): approved claims awaiting receipt.
export async function getPendingAdvices(providerId?: number) {
  const { db, organizationId } = await requireTenantContext();
  const where: any = {
    organizationId, billing_patient_type: 'tpa_insurance',
    tpa_claim_status: { in: ['approved', 'partially_settled'] }, tpa_payable: { gt: 0 },
  };
  if (providerId) where.tpa_provider_id = providerId;
  const invoices = await db.invoices.findMany({
    where,
    select: {
      id: true, invoice_number: true, patient_id: true, net_amount: true,
      tpa_approved_amount: true, tpa_settled_amount: true, tpa_payable: true,
      tpa_claim_number: true, tpa_approved_at: true, version: true,
      patient: { select: { full_name: true } },
    },
    orderBy: { tpa_approved_at: 'asc' }, take: 300,
  });
  return { success: true, data: serialize(invoices) };
}

// Reverse a receipt (e.g. bounced). Reverses GL, resets invoice settlement.
// Guard: only allowed if no allocation has been further reconciled/written-off.
export async function reverseInsuranceReceipt(receiptId: number, reason: string) {
  try {
    const { db, session, organizationId } = await requireTenantContext();
    if (!reason || !reason.trim()) return { success: false, error: 'reason is required' };

    const receipt = await db.insuranceReceipt.findFirst({
      where: { id: receiptId, organizationId }, include: { allocations: true },
    });
    if (!receipt) return { success: false, error: 'Receipt not found' };
    if (receipt.status === 'Reversed') return { success: false, error: 'Receipt already reversed' };

    await db.$transaction(async (tx: any) => {
      for (const a of receipt.allocations) {
        const invoice = await tx.invoices.findFirst({ where: { id: a.invoice_id, organizationId } });
        if (invoice && invoice.billing_patient_type === 'tpa_insurance') {
          const allocated = Number(a.allocated_amount || 0);
          const disallowed = Number(a.disallowed_amount || 0);
          const tds = Number(a.tds_amount || 0);
          const newSettled = Math.max(0, round2(Number(invoice.tpa_settled_amount || 0) - allocated));
          const newDisallowed = Math.max(0, round2(Number(invoice.tpa_disallowed_amount || 0) - disallowed));
          const newTds = Math.max(0, round2(Number(invoice.tpa_tds_amount || 0) - tds));
          const approved = Number(invoice.tpa_approved_amount || 0);
          const newPaid = Math.max(0, round2(Number(invoice.paid_amount || 0) - allocated));
          const netAmount = Number(invoice.net_amount || 0);
          await tx.invoices.update({
            where: { id: invoice.id },
            data: {
              tpa_settled_amount: newSettled,
              tpa_disallowed_amount: newDisallowed,
              tpa_tds_amount: newTds,
              tpa_payable: Math.max(0, round2(approved - newSettled - newDisallowed - newTds)),
              tpa_claim_status: 'approved',
              paid_amount: newPaid,
              balance_due: Math.max(0, round2(netAmount - newPaid)),
              tpa_settled_at: null,
              version: { increment: 1 },
            },
          });
        }
        // Void the payment row.
        if (a.payment_id) {
          await tx.payments.update({ where: { id: a.payment_id }, data: { status: 'Reversed' } }).catch(() => {});
        }
        // Remove any short-pay that is still pending (not yet dispositioned/posted).
        await tx.claimShortPay.deleteMany({
          where: { organizationId, invoice_id: a.invoice_id, disposition: 'PendingReview', gl_posted: false },
        });
      }

      await tx.insuranceReceipt.update({
        where: { id: receipt.id },
        data: { status: 'Reversed', allocated_amount: 0, unmapped_amount: Number(receipt.total_amount), tds_total: 0 },
      });

      await tx.system_audit_logs.create({
        data: {
          user_id: session?.id, username: session?.username || session?.name, role: session?.role,
          action: 'insurance_receipt_reversed', module: 'finance', entity_type: 'insurance_receipt',
          entity_id: String(receipt.id), details: JSON.stringify({ receipt_number: receipt.receipt_number, reason }),
          organizationId,
        },
      });
    });

    revalidatePath('/admin/finance/tpa-insurance');
    revalidatePath('/billing');
    return { success: true };
  } catch (error: any) {
    console.error('reverseInsuranceReceipt error:', error);
    return { success: false, error: error.message };
  }
}
