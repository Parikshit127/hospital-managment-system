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

type InsuranceOutstandingRow = {
  key: string;
  payer_name: string;
  opening: number;
  below: number;
  above: number;
  unmapped_receipt: number;
  balance: number;
  bill_count: number;
};

type BillWiseSanctionTotals = {
  claim_amount: number;
  sanctioned: number;
  received: number;
  tds: number;
  short_pay: number;
  outstanding: number;
};

type BillWiseSanctionRow = BillWiseSanctionTotals & {
  invoice_id: number;
  invoice_number: string | null;
  bill_date: Date;
  patient_name: string;
  patient_id: string;
  provider_name: string;
  claim_number: string;
  status: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// OUTSTANDING & AGING  (benchmark "Ins. Outstanding")
// ─────────────────────────────────────────────────────────────────────────────
export async function getInsuranceOutstanding(opts?: {
  payer_type?: 'tpa_insurance' | 'corporate';
  agingDays?: number;             // bucket threshold (default 60 like the benchmark)
  asOnDate?: string;
  agingBasis?: 'approval' | 'bill';
  provider_id?: number;           // scope to a single TPA/insurance provider
  from?: string;                  // custom bill-date range — overrides the aging bucket view
  to?: string;
}) {
  const { db, organizationId } = await requireTenantContext();
  const payerType = opts?.payer_type || 'tpa_insurance';
  const agingDays = opts?.agingDays ?? 60;
  const asOn = opts?.asOnDate ? new Date(opts.asOnDate) : new Date();
  const basis = opts?.agingBasis || 'approval';

  // All open payer invoices with a balance still due from the payer.
  // TPA bills: match on billing_patient_type OR an active claim status — the
  // flag frequently drifts (bill created 'cash', later approved for a TPA
  // claim without the flag being corrected), which would otherwise silently
  // drop real receivables out of this view. See reception-actions.ts for the
  // same drift pattern already handled on the patient-search side.
  const invoices = await db.invoices.findMany({
    where: {
      organizationId,
      ...(payerType === 'tpa_insurance'
        ? { OR: [{ billing_patient_type: 'tpa_insurance' }, { tpa_claim_status: { not: 'not_submitted' } }] }
        : { billing_patient_type: payerType }),
      tpa_payable: payerType === 'tpa_insurance' ? { gt: 0 } : undefined,
      ...(opts?.provider_id ? { tpa_provider_id: opts.provider_id } : {}),
      // Custom date range — scoped to the bill date (created_at), same basis
      // used elsewhere in this file for a "from/to" filter.
      ...(opts?.from || opts?.to ? {
        created_at: {
          ...(opts?.from ? { gte: new Date(opts.from) } : {}),
          ...(opts?.to ? { lte: new Date(opts.to) } : {}),
        },
      } : {}),
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
  const provMap = new Map<number, string>(providers.map((p: any) => [p.id, p.provider_name]));
  const corporates = await db.corporateMaster.findMany({ where: { organizationId }, select: { id: true, company_name: true } });
  const corpMap = new Map<string, string>(corporates.map((c: any) => [c.id, c.company_name]));

  // Unmapped receipts per payer (money received, not yet allocated).
  const receipts = await db.insuranceReceipt.findMany({
    where: {
      organizationId, payer_type: payerType, status: { in: ['Open', 'PartiallyAllocated'] },
      ...(opts?.provider_id ? { provider_id: opts.provider_id } : {}),
    },
    select: { provider_id: true, corporate_id: true, unmapped_amount: true },
  });

  const groups = new Map<string, InsuranceOutstandingRow>();
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
    const g = groups.get(key)!;
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
    const group = groups.get(key)!;
    group.unmapped_receipt = round2(group.unmapped_receipt + Number(r.unmapped_amount || 0));
  }

  const rows = Array.from(groups.values()).sort((a, b) => b.balance - a.balance);
  const totals = rows.reduce((t: any, r: any) => ({
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

  // Same drift fix as getInsuranceOutstanding — "is this a TPA bill" is an
  // OR-membership check, kept in `where.AND` so it doesn't collide with the
  // separate `where.OR` used below for the free-text search filter.
  const where: any = {
    organizationId,
    AND: [{ OR: [{ billing_patient_type: 'tpa_insurance' }, { tpa_claim_status: { not: 'not_submitted' } }] }],
  };
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
  const provMap = new Map<number, string>(providers.map((p: any) => [p.id, p.provider_name]));

  const rows: BillWiseSanctionRow[] = invoices.map((inv: any) => {
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

  const totals = rows.reduce((t: any, r: any) => ({
    claim_amount: round2(t.claim_amount + r.claim_amount),
    sanctioned: round2(t.sanctioned + r.sanctioned),
    received: round2(t.received + r.received),
    tds: round2(t.tds + r.tds),
    short_pay: round2(t.short_pay + r.short_pay),
    outstanding: round2(t.outstanding + r.outstanding),
  }), { claim_amount: 0, sanctioned: 0, received: 0, tds: 0, short_pay: 0, outstanding: 0 });

  return { success: true, data: serialize({ rows, totals }) };
}

type PatientWiseOutstandingTotals = {
  bill_amount: number;
  discount: number;
  net_bill_amount: number;
  received: number;
  outstanding: number;
};

type PatientWiseOutstandingRow = PatientWiseOutstandingTotals & {
  invoice_id: number;
  invoice_number: string | null;
  patient_name: string;
  patient_id: string;
  provider_name: string;
  bill_date: Date;
  admission_date: Date | null;
  discharge_date: Date | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT-WISE OUTSTANDING  (same bills as Ins. Outstanding, one row per bill
// instead of rolled up per payer — carries the TPA/insurance name on each row
// so a biller can see who owes what for which patient, not just the payer total)
// ─────────────────────────────────────────────────────────────────────────────
export async function getPatientWiseOutstanding(opts?: {
  provider_id?: number; from?: string; to?: string;
}) {
  const { db, organizationId } = await requireTenantContext();

  // Same drift-tolerant "is this a TPA bill" check as getInsuranceOutstanding/
  // getBillWiseSanction. Filters on balance_due (the bill's TOTAL remaining
  // balance) rather than tpa_payable (the TPA's remaining share) on purpose —
  // this view answers "what's still open on this patient's bill", regardless
  // of whether the open amount is owed by the TPA or the patient. That means
  // its population differs from the payer-wise Ins. Outstanding view (e.g. a
  // bill with tpa_payable > 0 but balance_due = 0 — patient portion already
  // settled — won't appear here).
  const where: any = {
    organizationId,
    OR: [{ billing_patient_type: 'tpa_insurance' }, { tpa_claim_status: { not: 'not_submitted' } }],
    balance_due: { gt: 0 },
  };
  if (opts?.provider_id) where.tpa_provider_id = opts.provider_id;
  if (opts?.from || opts?.to) {
    where.created_at = {};
    if (opts.from) where.created_at.gte = new Date(opts.from);
    if (opts.to) where.created_at.lte = new Date(opts.to);
  }

  const invoices = await db.invoices.findMany({
    where,
    select: {
      id: true, invoice_number: true, created_at: true,
      total_amount: true, total_discount: true, bill_discount: true, concession_amount: true,
      net_amount: true, paid_amount: true, balance_due: true,
      tpa_provider_id: true, patient_id: true,
      patient: { select: { full_name: true, patient_id: true } },
      admission: { select: { admission_date: true, discharge_date: true } },
    },
    orderBy: { created_at: 'desc' },
    take: 2000,
  });

  const providers = await db.insurance_providers.findMany({ where: { organizationId }, select: { id: true, provider_name: true } });
  const provMap = new Map<number, string>(providers.map((p: any) => [p.id, p.provider_name]));

  const rows: PatientWiseOutstandingRow[] = invoices.map((inv: any) => ({
    invoice_id: inv.id,
    invoice_number: inv.invoice_number,
    patient_name: inv.patient?.full_name || '',
    patient_id: inv.patient?.patient_id || inv.patient_id,
    provider_name: provMap.get(inv.tpa_provider_id) || '',
    bill_date: inv.created_at,
    admission_date: inv.admission?.admission_date || null,
    discharge_date: inv.admission?.discharge_date || null,
    bill_amount: round2(Number(inv.total_amount || 0)),
    // total_discount already folds in bill_discount (see finance-actions.ts:
    // total_discount = lineDiscount + billDiscount) — don't add it again here.
    discount: round2(Number(inv.total_discount || 0) + Number(inv.concession_amount || 0)),
    net_bill_amount: round2(Number(inv.net_amount || 0)),
    received: round2(Number(inv.paid_amount || 0)),
    outstanding: round2(Number(inv.balance_due || 0)),
  }));

  const totals = rows.reduce((t: PatientWiseOutstandingTotals, r) => ({
    bill_amount: round2(t.bill_amount + r.bill_amount),
    discount: round2(t.discount + r.discount),
    net_bill_amount: round2(t.net_bill_amount + r.net_bill_amount),
    received: round2(t.received + r.received),
    outstanding: round2(t.outstanding + r.outstanding),
  }), { bill_amount: 0, discount: 0, net_bill_amount: 0, received: 0, outstanding: 0 });

  return { success: true, data: serialize({ rows, totals }) };
}

// ─────────────────────────────────────────────────────────────────────────────
// DESK DASHBOARD  (KPIs for the cockpit landing)
// ─────────────────────────────────────────────────────────────────────────────
export async function getTpaDeskDashboard(filters?: { provider_id?: number }) {
  const { db, organizationId } = await requireTenantContext();

  // Same billing_patient_type drift fix as getInsuranceOutstanding / getBillWiseSanction.
  const isTpa = { OR: [{ billing_patient_type: 'tpa_insurance' }, { tpa_claim_status: { not: 'not_submitted' } }] };
  const providerFilter = filters?.provider_id ? { tpa_provider_id: filters.provider_id } : {};

  const [outstandingAgg, pendingAdvices, denied, queries, unmappedAgg, shortPayPending] = await Promise.all([
    db.invoices.aggregate({
      where: { organizationId, ...isTpa, ...providerFilter, tpa_payable: { gt: 0 } },
      _sum: { tpa_payable: true }, _count: true,
    }),
    db.invoices.count({
      where: { organizationId, ...isTpa, ...providerFilter, tpa_claim_status: { in: ['approved', 'partially_settled'] }, tpa_payable: { gt: 0 } },
    }),
    db.invoices.count({ where: { organizationId, ...isTpa, ...providerFilter, tpa_claim_status: 'rejected' } }),
    db.insurancePreAuth.count({ where: { organizationId, status: 'QueryRaised', ...(filters?.provider_id ? { provider_id: filters.provider_id } : {}) } }),
    db.insuranceReceipt.aggregate({
      where: { organizationId, status: { in: ['Open', 'PartiallyAllocated'] }, ...(filters?.provider_id ? { provider_id: filters.provider_id } : {}) },
      _sum: { unmapped_amount: true },
    }),
    db.claimShortPay.aggregate({
      where: { organizationId, disposition: 'PendingReview', ...(filters?.provider_id ? { invoice: { tpa_provider_id: filters.provider_id } } : {}) },
      _sum: { amount: true }, _count: true,
    }),
  ]);

  // Submission backlog: approved claims not yet dispatched (no ack).
  const submissionBacklog = await db.invoices.count({
    where: { organizationId, ...isTpa, ...providerFilter, tpa_claim_status: 'submitted' },
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
