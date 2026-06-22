'use server';

/**
 * Insurance / TPA receivables aging, bill-wise sanction, desk dashboard and a
 * GL reconciliation check. Implements the benchmark "Ins. Outstanding" and
 * "Bill Wise Sanction" screens with configurable aging buckets.
 *
 * Outstanding basis per TPA invoice = invoice.tpa_payable (the live amount still
 * owed by the payer; it falls as receipts/disallowances/TDS are recorded).
 * Aging date basis = tpa_approved_at (dispatch/approval) when available, else the
 * bill date (created_at) — configurable via `agingBasis`.
 */

import { requireTenantContext } from '@/backend/tenant';

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    v !== null && typeof v === 'object' && v.constructor?.name === 'Decimal' ? Number(v) : v
  ));
}
function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTSTANDING & AGING  (benchmark "Ins. Outstanding")
// ─────────────────────────────────────────────────────────────────────────────
export async function getInsuranceOutstanding(opts?: {
  payer_type?: 'tpa_insurance' | 'corporate';
  agingDays?: number;             // bucket threshold (default 60 like the benchmark)
  asOnDate?: string;
  agingBasis?: 'approval' | 'bill';
}) {
  const { db, organizationId } = await requireTenantContext();
  const payerType = opts?.payer_type || 'tpa_insurance';
  const agingDays = opts?.agingDays ?? 60;
  const asOn = opts?.asOnDate ? new Date(opts.asOnDate) : new Date();
  const basis = opts?.agingBasis || 'approval';

  // All open payer invoices with a balance still due from the payer.
  const invoices = await db.invoices.findMany({
    where: {
      organizationId,
      billing_patient_type: payerType,
      tpa_payable: payerType === 'tpa_insurance' ? { gt: 0 } : undefined,
    },
    select: {
      id: true, invoice_number: true, created_at: true,
      tpa_provider_id: true, corporate_id: true,
      tpa_payable: true, corporate_payable: true, paid_amount: true,
      tpa_approved_at: true, finalized_at: true,
    },
    take: 5000,
  });

  // Resolve payer display names.
  const providers = await db.insurance_providers.findMany({ where: { organizationId }, select: { id: true, provider_name: true } });
  const provMap = new Map(providers.map((p: any) => [p.id, p.provider_name]));
  const corporates = await db.corporateMaster.findMany({ where: { organizationId }, select: { id: true, company_name: true } });
  const corpMap = new Map(corporates.map((c: any) => [c.id, c.company_name]));

  // Unmapped receipts per payer (money received, not yet allocated).
  const receipts = await db.insuranceReceipt.findMany({
    where: { organizationId, payer_type: payerType, status: { in: ['Open', 'PartiallyAllocated'] } },
    select: { provider_id: true, corporate_id: true, unmapped_amount: true },
  });

  const groups = new Map<string, any>();
  const keyOf = (inv: any) => payerType === 'tpa_insurance' ? `P:${inv.tpa_provider_id ?? 0}` : `C:${inv.corporate_id ?? 'none'}`;
  const nameOf = (inv: any) => payerType === 'tpa_insurance' ? (provMap.get(inv.tpa_provider_id) || 'Unmapped / Unknown') : (corpMap.get(inv.corporate_id) || 'Unmapped / Unknown');

  for (const inv of invoices) {
    let outstanding = payerType === 'tpa_insurance'
      ? Number(inv.tpa_payable || 0)
      : Number(inv.corporate_payable || 0); // corporate: billed payer portion (receipts reduce via splits)
    if (outstanding <= 0) continue;

    const basisDate = basis === 'approval' ? (inv.tpa_approved_at || inv.finalized_at || inv.created_at) : inv.created_at;
    const age = daysBetween(asOn, new Date(basisDate));
    const key = keyOf(inv);
    if (!groups.has(key)) {
      groups.set(key, { key, payer_name: nameOf(inv), opening: 0, below: 0, above: 0, unmapped_receipt: 0, balance: 0, bill_count: 0 });
    }
    const g = groups.get(key);
    if (age > agingDays) g.above = round2(g.above + outstanding);
    else g.below = round2(g.below + outstanding);
    g.balance = round2(g.balance + outstanding);
    g.bill_count += 1;
  }

  // Layer in unmapped receipts.
  for (const r of receipts) {
    const key = payerType === 'tpa_insurance' ? `P:${r.provider_id ?? 0}` : `C:${r.corporate_id ?? 'none'}`;
    if (!groups.has(key)) {
      const nm = payerType === 'tpa_insurance' ? (provMap.get(r.provider_id) || 'Unmapped / Unknown') : (corpMap.get(r.corporate_id) || 'Unmapped / Unknown');
      groups.set(key, { key, payer_name: nm, opening: 0, below: 0, above: 0, unmapped_receipt: 0, balance: 0, bill_count: 0 });
    }
    groups.get(key).unmapped_receipt = round2(groups.get(key).unmapped_receipt + Number(r.unmapped_amount || 0));
  }

  const rows = Array.from(groups.values()).sort((a, b) => b.balance - a.balance);
  const totals = rows.reduce((t, r) => ({
    opening: round2(t.opening + r.opening),
    below: round2(t.below + r.below),
    above: round2(t.above + r.above),
    unmapped_receipt: round2(t.unmapped_receipt + r.unmapped_receipt),
    balance: round2(t.balance + r.balance),
  }), { opening: 0, below: 0, above: 0, unmapped_receipt: 0, balance: 0 });

  return { success: true, data: serialize({ agingDays, asOn, payerType, rows, totals }) };
}

// ─────────────────────────────────────────────────────────────────────────────
// BILL-WISE SANCTION  (benchmark "Bill Wise Sanction")
// Per bill: Claim Amt -> Sanctioned -> Received -> Short-Pay -> Status.
// ─────────────────────────────────────────────────────────────────────────────
export async function getBillWiseSanction(filters?: {
  provider_id?: number; from?: string; to?: string; status?: string; search?: string;
}) {
  const { db, organizationId } = await requireTenantContext();

  const where: any = { organizationId, billing_patient_type: 'tpa_insurance' };
  if (filters?.provider_id) where.tpa_provider_id = filters.provider_id;
  if (filters?.status) where.tpa_claim_status = filters.status;
  if (filters?.from || filters?.to) {
    where.created_at = {};
    if (filters.from) where.created_at.gte = new Date(filters.from);
    if (filters.to) where.created_at.lte = new Date(filters.to);
  }
  if (filters?.search) {
    where.OR = [
      { invoice_number: { contains: filters.search, mode: 'insensitive' } },
      { tpa_claim_number: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const invoices = await db.invoices.findMany({
    where,
    select: {
      id: true, invoice_number: true, created_at: true, net_amount: true,
      tpa_provider_id: true, tpa_claim_number: true, tpa_claim_status: true,
      tpa_payable: true, tpa_approved_amount: true, tpa_settled_amount: true,
      tpa_disallowed_amount: true, tpa_tds_amount: true,
      patient: { select: { full_name: true, patient_id: true } },
    },
    orderBy: { created_at: 'desc' },
    take: 1000,
  });

  const providers = await db.insurance_providers.findMany({ where: { organizationId }, select: { id: true, provider_name: true } });
  const provMap = new Map(providers.map((p: any) => [p.id, p.provider_name]));

  const rows = invoices.map((inv: any) => {
    const claimAmt = Number(inv.tpa_payable || 0) + Number(inv.tpa_settled_amount || 0) + Number(inv.tpa_disallowed_amount || 0) + Number(inv.tpa_tds_amount || 0);
    return {
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      bill_date: inv.created_at,
      patient_name: inv.patient?.full_name || '',
      patient_id: inv.patient?.patient_id || '',
      provider_name: provMap.get(inv.tpa_provider_id) || '',
      claim_number: inv.tpa_claim_number || '',
      claim_amount: round2(claimAmt || Number(inv.net_amount || 0)),
      sanctioned: round2(Number(inv.tpa_approved_amount || 0)),
      received: round2(Number(inv.tpa_settled_amount || 0)),
      tds: round2(Number(inv.tpa_tds_amount || 0)),
      short_pay: round2(Number(inv.tpa_disallowed_amount || 0)),
      outstanding: round2(Number(inv.tpa_payable || 0)),
      status: inv.tpa_claim_status,
    };
  });

  const totals = rows.reduce((t, r) => ({
    claim_amount: round2(t.claim_amount + r.claim_amount),
    sanctioned: round2(t.sanctioned + r.sanctioned),
    received: round2(t.received + r.received),
    tds: round2(t.tds + r.tds),
    short_pay: round2(t.short_pay + r.short_pay),
    outstanding: round2(t.outstanding + r.outstanding),
  }), { claim_amount: 0, sanctioned: 0, received: 0, tds: 0, short_pay: 0, outstanding: 0 });

  return { success: true, data: serialize({ rows, totals }) };
}

// ─────────────────────────────────────────────────────────────────────────────
// DESK DASHBOARD  (KPIs for the cockpit landing)
// ─────────────────────────────────────────────────────────────────────────────
export async function getTpaDeskDashboard() {
  const { db, organizationId } = await requireTenantContext();

  const [outstandingAgg, pendingAdvices, denied, queries, unmappedAgg, shortPayPending] = await Promise.all([
    db.invoices.aggregate({
      where: { organizationId, billing_patient_type: 'tpa_insurance', tpa_payable: { gt: 0 } },
      _sum: { tpa_payable: true }, _count: true,
    }),
    db.invoices.count({
      where: { organizationId, billing_patient_type: 'tpa_insurance', tpa_claim_status: { in: ['approved', 'partially_settled'] }, tpa_payable: { gt: 0 } },
    }),
    db.invoices.count({ where: { organizationId, billing_patient_type: 'tpa_insurance', tpa_claim_status: 'rejected' } }),
    db.insurancePreAuth.count({ where: { organizationId, status: 'QueryRaised' } }),
    db.insuranceReceipt.aggregate({
      where: { organizationId, status: { in: ['Open', 'PartiallyAllocated'] } }, _sum: { unmapped_amount: true },
    }),
    db.claimShortPay.aggregate({ where: { organizationId, disposition: 'PendingReview' }, _sum: { amount: true }, _count: true }),
  ]);

  // Submission backlog: approved claims not yet dispatched (no ack).
  const submissionBacklog = await db.invoices.count({
    where: { organizationId, billing_patient_type: 'tpa_insurance', tpa_claim_status: 'submitted' },
  });

  return {
    success: true,
    data: serialize({
      total_outstanding: round2(Number(outstandingAgg._sum?.tpa_payable || 0)),
      outstanding_bills: outstandingAgg._count || 0,
      pending_advices: pendingAdvices,
      denied_to_action: denied,
      queries_pending: queries,
      unmapped_receipts: round2(Number(unmappedAgg._sum?.unmapped_amount || 0)),
      short_pay_pending_amount: round2(Number(shortPayPending._sum?.amount || 0)),
      short_pay_pending_count: shortPayPending._count || 0,
      submission_backlog: submissionBacklog,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GL RECONCILIATION — subledger (sum of tpa_payable) vs GL receivable 1150.
// ─────────────────────────────────────────────────────────────────────────────
export async function reconcileReceivablesToGL() {
  const { db, organizationId } = await requireTenantContext();

  const tpa = await db.invoices.aggregate({
    where: { organizationId, billing_patient_type: 'tpa_insurance', tpa_payable: { gt: 0 } },
    _sum: { tpa_payable: true },
  });
  const subledgerTpa = round2(Number(tpa._sum?.tpa_payable || 0));

  const acc = await db.gL_Account.findFirst({ where: { organizationId, account_code: '1150' }, select: { current_balance: true, account_name: true } });
  const glBalance = round2(Number(acc?.current_balance || 0));

  // Note: GL 1150 also carries the patient-copay portion of TPA bills (postInvoiceToGL
  // debits the full invoice total to the payer receivable), so an exact tie-out
  // requires netting copay. We surface both figures + the gap for the finance desk.
  return {
    success: true,
    data: serialize({
      subledger_tpa_payable: subledgerTpa,
      gl_1150_balance: glBalance,
      gl_account_name: acc?.account_name || 'Insurance Receivables',
      variance: round2(glBalance - subledgerTpa),
      note: 'GL 1150 includes patient-copay portion of TPA invoices; net of copay for an exact tie-out.',
    }),
  };
}
