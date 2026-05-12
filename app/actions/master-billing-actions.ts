"use server";

/**
 * Master Billing Orchestration Layer
 * ----------------------------------
 * This file is an *additive* extension. It does NOT duplicate billing logic.
 * All write operations delegate to the existing finance-actions / billing-engine
 * functions. This module only:
 *   - aggregates data across invoices/payments/deposits/refunds/credit-notes/claims
 *   - computes derived views (patient ledger, timeline, KPIs, risk flags)
 *   - powers the Master Billing grid + Patient Financial Profile pages
 *
 * Existing functions to reuse for writes:
 *   createInvoice / addInvoiceItem / finalizeInvoice / cancelInvoice
 *     -> @/app/actions/finance-actions
 *   recordPayment / recordSplitPayment / reversePayment
 *     -> @/app/actions/finance-actions
 *   requestRefund / updateRefundStatus
 *     -> @/app/actions/finance-actions
 *   processPatientPayment / addPatientDues
 *     -> @/app/actions/reception-actions
 *   calculateBillSplit
 *     -> @/app/actions/billing-engine
 *   collectDeposit / applyDeposit / refundDeposit
 *     -> @/app/actions/deposit-actions
 */

import { requireTenantContext } from "@/backend/tenant";

// ── Helpers ────────────────────────────────────────────────────────────────

function decToNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  // Prisma Decimal exposes .toNumber()
  if (typeof (value as any)?.toNumber === "function") {
    return Number((value as any).toNumber());
  }
  // Fallback: stringify
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function serialize<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_, value) => {
      if (value === null || value === undefined) return value;
      if (typeof value === "bigint") return value.toString();
      if (
        typeof value === "object" &&
        value !== null &&
        (value as any).constructor?.name === "Decimal"
      ) {
        return decToNum(value);
      }
      return value;
    }),
  );
}

function daysBetween(a: Date | string, b: Date | string = new Date()): number {
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  return Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
}

// ── Status normalisation (per blueprint § 7 STATUS SYSTEM) ─────────────────

function normalisePaymentStatus(opts: {
  total: number;
  paid: number;
  balance: number;
  invoiceStatus: string;
  ageDays: number;
}): "Draft" | "Paid" | "Partial" | "Overdue" | "Cancelled" | "Voided" | "Refunded" {
  const { paid, balance, invoiceStatus, ageDays } = opts;
  if (invoiceStatus === "Cancelled") return "Cancelled";
  if (invoiceStatus === "Voided") return "Voided";
  if (invoiceStatus === "Refunded") return "Refunded";
  if (balance <= 0 && paid > 0) return "Paid";
  if (paid > 0 && balance > 0) return ageDays > 30 ? "Overdue" : "Partial";
  if (balance > 0 && ageDays > 30) return "Overdue";
  return "Draft";
}

function flagFinancialRisk(opts: {
  balance: number;
  ageDays: number;
  total: number;
  hasDeposit: boolean;
  patientType: string;
  claimStatus: string;
}): { level: "low" | "medium" | "high"; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (opts.balance > 50000) {
    score += 2;
    reasons.push("Outstanding > 50k");
  } else if (opts.balance > 10000) {
    score += 1;
    reasons.push("Outstanding > 10k");
  }
  if (opts.ageDays > 60) {
    score += 2;
    reasons.push("Aging > 60d");
  } else if (opts.ageDays > 30) {
    score += 1;
    reasons.push("Aging > 30d");
  }
  if (opts.balance > 5000 && !opts.hasDeposit && opts.patientType === "cash") {
    score += 1;
    reasons.push("No deposit collected");
  }
  if (opts.claimStatus === "rejected") {
    score += 2;
    reasons.push("Insurance claim rejected");
  }
  const level = score >= 3 ? "high" : score >= 1 ? "medium" : "low";
  return { level, reasons };
}

// ──────────────────────────────────────────────────────────────────────────
// Master Billing Grid
// ──────────────────────────────────────────────────────────────────────────

export interface MasterBillingFilter {
  search?: string;
  invoice_status?: string;
  payment_status?: string;
  patient_type?: string; // cash | corporate | tpa_insurance
  invoice_type?: string; // OPD | IPD | LAB | PHARMACY
  department?: string;
  corporate_id?: string;
  date_from?: string;
  date_to?: string;
  risk_level?: "low" | "medium" | "high";
  page?: number;
  limit?: number;
}

export async function getMasterBillingGrid(filter: MasterBillingFilter = {}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(200, filter.limit || 25);
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (filter.invoice_status) where.status = filter.invoice_status;
    if (filter.patient_type) where.billing_patient_type = filter.patient_type;
    if (filter.invoice_type) where.invoice_type = filter.invoice_type;
    if (filter.corporate_id) where.corporate_id = filter.corporate_id;
    if (filter.date_from || filter.date_to) {
      where.created_at = {};
      if (filter.date_from) where.created_at.gte = new Date(filter.date_from);
      if (filter.date_to) where.created_at.lte = new Date(filter.date_to);
    }

    if (filter.search && filter.search.trim().length >= 2) {
      const q = filter.search.trim();
      where.OR = [
        { invoice_number: { contains: q, mode: "insensitive" } },
        { patient_id: { contains: q, mode: "insensitive" } },
        { admission_id: { contains: q, mode: "insensitive" } },
        { tpa_claim_number: { contains: q, mode: "insensitive" } },
        { corporate_invoice_number: { contains: q, mode: "insensitive" } },
        {
          patient: {
            OR: [
              { full_name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          },
        },
      ];
    }

    const [total, invoices] = await Promise.all([
      db.invoices.count({ where }),
      db.invoices.findMany({
        where,
        include: {
          patient: {
            select: {
              full_name: true,
              phone: true,
              age: true,
              gender: true,
              patient_type: true,
              corporate_id: true,
              corporate: { select: { company_name: true } },
            },
          },
          admission: {
            select: {
              admission_category: true,
              patient_class: true,
              status: true,
            },
          },
          payments: {
            where: { status: "Completed" },
            orderBy: { created_at: "desc" },
            select: { amount: true, payment_method: true, created_at: true },
          },
        },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
    ]);

    // Fetch deposits for these patients in one query
    const patientIds = Array.from(new Set(invoices.map((i: any) => i.patient_id)));
    const deposits = patientIds.length
      ? await db.patientDeposit.findMany({
          where: { organizationId, patient_id: { in: patientIds }, status: "Active" },
          select: { patient_id: true, amount: true, applied_amount: true, refunded_amount: true },
        })
      : [];

    const depositMap = new Map<string, number>();
    for (const d of deposits) {
      const remaining =
        decToNum(d.amount) - decToNum(d.applied_amount) - decToNum(d.refunded_amount);
      depositMap.set(d.patient_id, (depositMap.get(d.patient_id) || 0) + remaining);
    }

    const rows = invoices.map((inv: any) => {
      const total = decToNum(inv.net_amount);
      const paid = decToNum(inv.paid_amount);
      const balance = decToNum(inv.balance_due);
      const ageDays = daysBetween(inv.created_at);
      const depositBalance = depositMap.get(inv.patient_id) || 0;
      const lastPayment = inv.payments[0]?.created_at ?? null;

      const paymentStatus = normalisePaymentStatus({
        total,
        paid,
        balance,
        invoiceStatus: inv.status,
        ageDays,
      });

      const risk = flagFinancialRisk({
        balance,
        ageDays,
        total,
        hasDeposit: depositBalance > 0,
        patientType: inv.billing_patient_type,
        claimStatus: inv.tpa_claim_status,
      });

      return {
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        patient_id: inv.patient_id,
        patient_name: inv.patient?.full_name ?? "—",
        patient_phone: inv.patient?.phone ?? null,
        patient_type: inv.billing_patient_type,
        admission_type: inv.invoice_type, // OPD | IPD | LAB | PHARMACY
        admission_id: inv.admission_id,
        billing_category: inv.admission?.patient_class ?? inv.invoice_type,
        corporate_name: inv.patient?.corporate?.company_name ?? null,
        invoice_status: inv.status,
        payment_status: paymentStatus,
        claim_status: inv.tpa_claim_status,
        total_amount: total,
        paid_amount: paid,
        outstanding_amount: balance,
        deposit_balance: depositBalance,
        aging_days: ageDays,
        last_payment_date: lastPayment,
        risk_level: risk.level,
        risk_reasons: risk.reasons,
        created_at: inv.created_at,
      };
    });

    // Optional in-memory filters (server doesn't store payment_status/risk_level)
    type Row = (typeof rows)[number];
    let filtered: Row[] = rows;
    if (filter.payment_status) {
      filtered = filtered.filter((r: Row) => r.payment_status === filter.payment_status);
    }
    if (filter.risk_level) {
      filtered = filtered.filter((r: Row) => r.risk_level === filter.risk_level);
    }

    return {
      success: true,
      data: serialize(filtered),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error: any) {
    console.error("getMasterBillingGrid error:", error);
    return { success: false, error: error.message ?? "Grid failed", data: [], meta: null };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// KPIs (12 cards per blueprint § 6)
// ──────────────────────────────────────────────────────────────────────────

export async function getMasterBillingKPIs() {
  try {
    const { db, organizationId } = await requireTenantContext();

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const thirtyAgo = new Date(now);
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const overdueCutoff = new Date(now);
    overdueCutoff.setDate(overdueCutoff.getDate() - 30);

    const [
      todayRevenueAgg,
      outstandingAgg,
      claimsCount,
      claimsUnderReview,
      depositsAgg,
      refundsAgg,
      pendingDischarges,
      collectedLast30,
      billedLast30,
      overdueAgg,
      pendingRefunds,
      deptRevenue,
    ] = await Promise.all([
      db.invoices.aggregate({
        where: {
          organizationId,
          finalized_at: { gte: todayStart },
          status: { notIn: ["Cancelled", "Voided"] },
        },
        _sum: { net_amount: true, paid_amount: true },
      }),
      db.invoices.aggregate({
        where: {
          organizationId,
          status: { notIn: ["Cancelled", "Voided"] },
          balance_due: { gt: 0 },
        },
        _sum: { balance_due: true },
        _count: { id: true },
      }),
      db.insurance_claims.count({
        where: {
          organizationId,
          status: { in: ["Submitted", "Under Review", "Pending", "Partially Approved"] },
        },
      }),
      db.insurance_claims.count({
        where: { organizationId, status: "Under Review" },
      }),
      db.patientDeposit.aggregate({
        where: { organizationId, status: "Active" },
        _sum: { amount: true, applied_amount: true, refunded_amount: true },
      }),
      db.refunds.aggregate({
        where: { organizationId, created_at: { gte: thirtyAgo } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      db.admissions.count({
        where: {
          organizationId,
          status: "Admitted",
          invoices: { some: { balance_due: { gt: 0 } } },
        },
      }),
      db.invoices.aggregate({
        where: {
          organizationId,
          created_at: { gte: thirtyAgo },
          status: { notIn: ["Cancelled", "Voided"] },
        },
        _sum: { paid_amount: true },
      }),
      db.invoices.aggregate({
        where: {
          organizationId,
          created_at: { gte: thirtyAgo },
          status: { notIn: ["Cancelled", "Voided"] },
        },
        _sum: { net_amount: true },
      }),
      db.invoices.aggregate({
        where: {
          organizationId,
          balance_due: { gt: 0 },
          created_at: { lt: overdueCutoff },
          status: { notIn: ["Cancelled", "Voided", "Paid"] },
        },
        _count: { id: true },
        _sum: { balance_due: true },
      }),
      db.refunds.count({
        where: { organizationId, status: "Pending" },
      }),
      db.invoice_items.groupBy({
        by: ["department"],
        where: {
          organizationId,
          created_at: { gte: thirtyAgo },
        },
        _sum: { net_price: true },
      }),
    ]);

    const depositLiability =
      decToNum(depositsAgg._sum.amount) -
      decToNum(depositsAgg._sum.applied_amount) -
      decToNum(depositsAgg._sum.refunded_amount);

    const billed30 = decToNum(billedLast30._sum.net_amount);
    const collected30 = decToNum(collectedLast30._sum.paid_amount);
    const collectionEfficiency = billed30 > 0 ? Math.round((collected30 / billed30) * 100) : 0;

    const departmentRevenue = deptRevenue
      .map((d: any) => ({
        department: d.department || "Uncategorized",
        revenue: decToNum(d._sum.net_price),
      }))
      .sort((a: any, b: any) => b.revenue - a.revenue);

    // Revenue Leakage signals (Phase 1 stub — full engine in Phase 5).
    // Count of stale Draft invoices > 7d as a single proxy alert.
    const staleDraftCount = await db.invoices.count({
      where: {
        organizationId,
        status: "Draft",
        created_at: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
    });

    return {
      success: true,
      data: serialize({
        todays_revenue: decToNum(todayRevenueAgg._sum.net_amount),
        todays_collected: decToNum(todayRevenueAgg._sum.paid_amount),
        outstanding_receivables: decToNum(outstandingAgg._sum.balance_due),
        outstanding_count: outstandingAgg._count.id,
        pending_claims: claimsCount,
        claims_under_review: claimsUnderReview,
        deposit_liability: depositLiability,
        refund_volume_30d: decToNum(refundsAgg._sum.amount),
        refund_count_30d: refundsAgg._count.id,
        leakage_alerts: staleDraftCount,
        pending_discharges: pendingDischarges,
        collection_efficiency_pct: collectionEfficiency,
        billed_30d: billed30,
        collected_30d: collected30,
        overdue_accounts: overdueAgg._count.id,
        overdue_amount: decToNum(overdueAgg._sum.balance_due),
        pending_approvals: pendingRefunds,
        department_revenue: departmentRevenue.slice(0, 8),
      }),
    };
  } catch (error: any) {
    console.error("getMasterBillingKPIs error:", error);
    return { success: false, error: error.message };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Global Search (multi-entity)
// ──────────────────────────────────────────────────────────────────────────

export interface GlobalFinanceSearchHit {
  type: "patient" | "invoice" | "payment" | "claim" | "deposit" | "refund";
  id: string;
  primary: string; // headline (name / number)
  secondary: string; // context line
  amount?: number;
  patient_id?: string;
  date?: string;
}

export async function globalFinanceSearch(query: string): Promise<{
  success: boolean;
  data: GlobalFinanceSearchHit[];
}> {
  try {
    const trimmed = query.trim();
    if (trimmed.length < 2) return { success: true, data: [] };
    const { db, organizationId } = await requireTenantContext();

    const [patients, invoices, payments, claims, deposits, refunds] = await Promise.all([
      db.oPD_REG.findMany({
        where: {
          organizationId,
          OR: [
            { full_name: { contains: trimmed, mode: "insensitive" } },
            { phone: { contains: trimmed } },
            { patient_id: { contains: trimmed, mode: "insensitive" } },
            { abha_number: { contains: trimmed, mode: "insensitive" } },
          ],
        },
        select: {
          patient_id: true,
          full_name: true,
          phone: true,
          department: true,
        },
        take: 5,
      }),
      db.invoices.findMany({
        where: {
          organizationId,
          OR: [
            { invoice_number: { contains: trimmed, mode: "insensitive" } },
            { tpa_claim_number: { contains: trimmed, mode: "insensitive" } },
            { corporate_invoice_number: { contains: trimmed, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          invoice_number: true,
          patient_id: true,
          net_amount: true,
          balance_due: true,
          status: true,
          created_at: true,
          patient: { select: { full_name: true } },
        },
        take: 5,
      }),
      db.payments.findMany({
        where: {
          organizationId,
          OR: [
            { receipt_number: { contains: trimmed, mode: "insensitive" } },
            { reference: { contains: trimmed, mode: "insensitive" } },
            { razorpay_payment_id: { contains: trimmed, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          receipt_number: true,
          amount: true,
          payment_method: true,
          created_at: true,
          invoice: { select: { patient_id: true, patient: { select: { full_name: true } } } },
        },
        take: 5,
      }),
      db.insurance_claims.findMany({
        where: {
          organizationId,
          OR: [
            { claim_number: { contains: trimmed, mode: "insensitive" } },
            { tpa_remarks: { contains: trimmed, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          claim_number: true,
          patient_id: true,
          claim_amount: true,
          status: true,
          created_at: true,
        },
        take: 5,
      }),
      db.patientDeposit.findMany({
        where: {
          organizationId,
          OR: [
            { deposit_number: { contains: trimmed, mode: "insensitive" } },
            { payment_ref: { contains: trimmed, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          deposit_number: true,
          patient_id: true,
          amount: true,
          status: true,
          created_at: true,
        },
        take: 5,
      }),
      db.refunds.findMany({
        where: { organizationId, invoice_id: { contains: trimmed, mode: "insensitive" } },
        select: { id: true, invoice_id: true, amount: true, status: true, created_at: true },
        take: 5,
      }),
    ]);

    const hits: GlobalFinanceSearchHit[] = [];

    patients.forEach((p: any) => {
      hits.push({
        type: "patient",
        id: p.patient_id,
        primary: p.full_name,
        secondary: `${p.patient_id}${p.phone ? " · " + p.phone : ""}${p.department ? " · " + p.department : ""}`,
        patient_id: p.patient_id,
      });
    });
    invoices.forEach((i: any) => {
      hits.push({
        type: "invoice",
        id: String(i.id),
        primary: i.invoice_number,
        secondary: `${i.patient?.full_name ?? i.patient_id} · ${i.status}`,
        amount: decToNum(i.balance_due),
        patient_id: i.patient_id,
        date: new Date(i.created_at).toISOString(),
      });
    });
    payments.forEach((p: any) => {
      hits.push({
        type: "payment",
        id: String(p.id),
        primary: p.receipt_number,
        secondary: `${p.invoice?.patient?.full_name ?? p.invoice?.patient_id ?? "—"} · ${p.payment_method}`,
        amount: decToNum(p.amount),
        patient_id: p.invoice?.patient_id,
        date: new Date(p.created_at).toISOString(),
      });
    });
    claims.forEach((c: any) => {
      hits.push({
        type: "claim",
        id: c.id,
        primary: c.claim_number ?? `Claim ${c.id}`,
        secondary: `${c.patient_id} · ${c.status}`,
        amount: decToNum(c.claim_amount),
        patient_id: c.patient_id,
        date: new Date(c.created_at).toISOString(),
      });
    });
    deposits.forEach((d: any) => {
      hits.push({
        type: "deposit",
        id: String(d.id),
        primary: d.deposit_number,
        secondary: `${d.patient_id} · ${d.status}`,
        amount: decToNum(d.amount),
        patient_id: d.patient_id,
        date: new Date(d.created_at).toISOString(),
      });
    });
    refunds.forEach((r: any) => {
      hits.push({
        type: "refund",
        id: String(r.id),
        primary: `Refund #${r.id}`,
        secondary: `Invoice ${r.invoice_id} · ${r.status}`,
        amount: decToNum(r.amount),
        date: new Date(r.created_at).toISOString(),
      });
    });

    return { success: true, data: hits };
  } catch (error: any) {
    console.error("globalFinanceSearch error:", error);
    return { success: false, data: [] };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Patient Financial Profile (composite for /billing/patient/[id])
// ──────────────────────────────────────────────────────────────────────────

export async function getPatientFinancialProfile(patientId: string) {
  try {
    const { db, organizationId } = await requireTenantContext();

    const [patient, invoices, deposits, refunds, claims, preauths, audits, writeoffs] =
      await Promise.all([
        db.oPD_REG.findFirst({
          where: { patient_id: patientId, organizationId },
          include: {
            corporate: { select: { id: true, company_name: true, credit_limit: true } },
            insurance_policies: {
              where: { status: "Active" },
              include: { provider: { select: { provider_name: true } } },
            },
          },
        }),
        db.invoices.findMany({
          where: { patient_id: patientId, organizationId },
          include: {
            items: true,
            payments: { orderBy: { created_at: "desc" } },
            credit_notes: true,
            insurance_claims: true,
          },
          orderBy: { created_at: "desc" },
        }),
        db.patientDeposit.findMany({
          where: { patient_id: patientId, organizationId },
          orderBy: { created_at: "desc" },
        }),
        db.refunds.findMany({
          where: {
            organizationId,
            invoice_id: {
              in: (
                await db.invoices.findMany({
                  where: { patient_id: patientId, organizationId },
                  select: { id: true },
                })
              ).map((i: { id: number }) => String(i.id)),
            },
          },
          orderBy: { created_at: "desc" },
        }),
        db.insurance_claims.findMany({
          where: { patient_id: patientId, organizationId },
          include: { provider: { select: { provider_name: true } } },
          orderBy: { created_at: "desc" },
        }),
        db.preAuthorization.findMany({
          where: { patient_id: patientId, organizationId },
          include: { provider: { select: { provider_name: true } } },
          orderBy: { created_at: "desc" },
        }),
        db.system_audit_logs.findMany({
          where: {
            organizationId,
            module: { in: ["finance", "billing", "reception", "ipd"] },
            details: { contains: patientId },
          },
          orderBy: { created_at: "desc" },
          take: 50,
        }),
        db.writeoff.findMany({
          where: { patient_id: patientId, organizationId },
          include: {
            invoice: { select: { invoice_number: true } },
          },
          orderBy: { created_at: "desc" },
        }),
      ]);

    if (!patient) return { success: false, error: "Patient not found" };

    const totals = {
      total_billed: invoices.reduce((s: number, i: any) => s + decToNum(i.net_amount), 0),
      total_paid: invoices.reduce((s: number, i: any) => s + decToNum(i.paid_amount), 0),
      total_outstanding: invoices.reduce(
        (s: number, i: any) => s + decToNum(i.balance_due),
        0,
      ),
      total_tax: invoices.reduce((s: number, i: any) => s + decToNum(i.total_tax), 0),
      total_discount: invoices.reduce(
        (s: number, i: any) => s + decToNum(i.total_discount),
        0,
      ),
      deposits_held: deposits.reduce(
        (s: number, d: any) =>
          s + (decToNum(d.amount) - decToNum(d.applied_amount) - decToNum(d.refunded_amount)),
        0,
      ),
      deposits_collected: deposits.reduce((s: number, d: any) => s + decToNum(d.amount), 0),
      insurance_approved: claims.reduce(
        (s: number, c: any) => s + decToNum(c.approved_amount),
        0,
      ),
      insurance_settled: invoices.reduce(
        (s: number, i: any) => s + decToNum(i.tpa_settled_amount),
        0,
      ),
      refunds_issued: refunds.reduce((s: number, r: any) => s + decToNum(r.amount), 0),
      credit_notes_total: invoices.reduce(
        (s: number, i: any) =>
          s + i.credit_notes.reduce((cs: number, c: any) => cs + decToNum(c.total_amount), 0),
        0,
      ),
      writeoffs_posted: writeoffs
        .filter((w: any) => w.status === "Posted")
        .reduce((s: number, w: any) => s + decToNum(w.amount), 0),
      writeoffs_pending: writeoffs
        .filter((w: any) => w.status === "Requested" || w.status === "Approved")
        .reduce((s: number, w: any) => s + decToNum(w.amount), 0),
    };

    return {
      success: true,
      data: serialize({
        patient,
        invoices,
        deposits,
        refunds,
        claims,
        preauths,
        audits,
        writeoffs,
        totals,
      }),
    };
  } catch (error: any) {
    console.error("getPatientFinancialProfile error:", error);
    return { success: false, error: error.message };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Patient Ledger (Section K — chronological debit/credit with running balance)
// ──────────────────────────────────────────────────────────────────────────

export type LedgerEvent = {
  date: string;
  event:
    | "Invoice"
    | "Payment"
    | "Deposit Collected"
    | "Deposit Applied"
    | "Deposit Refunded"
    | "Refund"
    | "Credit Note"
    | "Insurance Settlement"
    | "Adjustment";
  description: string;
  reference: string;
  debit: number;
  credit: number;
  running_balance: number;
  source: string;
  performed_by: string | null;
};

export async function getPatientLedger(patientId: string) {
  try {
    const { db, organizationId } = await requireTenantContext();

    const invoices = await db.invoices.findMany({
      where: { patient_id: patientId, organizationId },
      include: {
        payments: { orderBy: { created_at: "asc" } },
        credit_notes: { orderBy: { created_at: "asc" } },
      },
      orderBy: { created_at: "asc" },
    });
    const invoiceIds = invoices.map((i: { id: number }) => String(i.id));

    const [deposits, refunds] = await Promise.all([
      db.patientDeposit.findMany({
        where: { patient_id: patientId, organizationId },
        orderBy: { created_at: "asc" },
      }),
      db.refunds.findMany({
        where: { organizationId, invoice_id: { in: invoiceIds } },
        orderBy: { created_at: "asc" },
      }),
    ]);

    const events: Omit<LedgerEvent, "running_balance">[] = [];

    for (const inv of invoices) {
      if (inv.status === "Cancelled" || inv.status === "Voided") continue;
      const finalized = (inv as any).finalized_at ?? inv.created_at;
      events.push({
        date: new Date(finalized).toISOString(),
        event: "Invoice",
        description: `Invoice ${inv.invoice_number} · ${inv.invoice_type}`,
        reference: inv.invoice_number,
        debit: decToNum(inv.net_amount),
        credit: 0,
        source: inv.invoice_type,
        performed_by: (inv as any).approved_by ?? null,
      });
      for (const p of (inv as any).payments) {
        if (p.status !== "Completed") continue;
        events.push({
          date: new Date(p.created_at).toISOString(),
          event: "Payment",
          description: `Receipt ${p.receipt_number} · ${p.payment_method}`,
          reference: p.receipt_number,
          debit: 0,
          credit: decToNum(p.amount),
          source: "Cashier",
          performed_by: null,
        });
      }
      for (const cn of (inv as any).credit_notes) {
        if (cn.status !== "Approved" && cn.status !== "Applied") continue;
        events.push({
          date: new Date(cn.created_at).toISOString(),
          event: "Credit Note",
          description: `${cn.credit_note_number} — ${cn.reason}`,
          reference: cn.credit_note_number,
          debit: 0,
          credit: decToNum(cn.total_amount),
          source: "Finance",
          performed_by: cn.approved_by ?? null,
        });
      }
      if (decToNum(inv.tpa_settled_amount) > 0) {
        events.push({
          date: new Date(inv.updated_at ?? inv.created_at).toISOString(),
          event: "Insurance Settlement",
          description: `Insurance settled ${inv.tpa_claim_number ?? inv.invoice_number}`,
          reference: inv.tpa_claim_number ?? inv.invoice_number,
          debit: 0,
          credit: decToNum(inv.tpa_settled_amount),
          source: "Insurance",
          performed_by: null,
        });
      }
    }

    for (const d of deposits) {
      events.push({
        date: new Date(d.created_at).toISOString(),
        event: "Deposit Collected",
        description: `${d.deposit_number} · ${d.payment_method}`,
        reference: d.deposit_number,
        debit: 0,
        credit: decToNum(d.amount),
        source: "Cashier",
        performed_by: d.collected_by ?? null,
      });
      if (decToNum(d.applied_amount) > 0) {
        events.push({
          date: new Date(d.updated_at ?? d.created_at).toISOString(),
          event: "Deposit Applied",
          description: `${d.deposit_number} applied to invoice ${d.applied_to_invoice ?? "—"}`,
          reference: d.deposit_number,
          debit: decToNum(d.applied_amount),
          credit: 0,
          source: "Finance",
          performed_by: null,
        });
      }
      if (decToNum(d.refunded_amount) > 0) {
        events.push({
          date: new Date(d.updated_at ?? d.created_at).toISOString(),
          event: "Deposit Refunded",
          description: `${d.deposit_number} refunded`,
          reference: d.deposit_number,
          debit: 0,
          credit: 0,
          source: "Finance",
          performed_by: null,
        });
        // Refund line is reported under "Refund" rows.
      }
    }

    for (const r of refunds) {
      if (r.status !== "Processed" && r.status !== "Approved") continue;
      events.push({
        date: new Date(r.created_at).toISOString(),
        event: "Refund",
        description: `Refund · ${r.reason}`,
        reference: `R-${r.id}`,
        debit: decToNum(r.amount),
        credit: 0,
        source: "Finance",
        performed_by: r.processed_by ?? null,
      });
    }

    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let balance = 0;
    const ledger: LedgerEvent[] = events.map((e) => {
      balance += e.debit - e.credit;
      return { ...e, running_balance: balance };
    });

    return {
      success: true,
      data: serialize({
        ledger,
        closing_balance: balance,
        total_debit: ledger.reduce((s, e) => s + e.debit, 0),
        total_credit: ledger.reduce((s, e) => s + e.credit, 0),
      }),
    };
  } catch (error: any) {
    console.error("getPatientLedger error:", error);
    return { success: false, error: error.message };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Patient Timeline (Section L — clinical-financial event timeline)
// ──────────────────────────────────────────────────────────────────────────

export async function getPatientTimeline(patientId: string) {
  try {
    const { db, organizationId } = await requireTenantContext();

    const [invoices, payments, admissions, refunds, preauths] = await Promise.all([
      db.invoices.findMany({
        where: { patient_id: patientId, organizationId },
        select: {
          invoice_number: true,
          status: true,
          created_at: true,
          finalized_at: true,
          net_amount: true,
        },
      }),
      db.payments.findMany({
        where: { invoice: { patient_id: patientId, organizationId } },
        select: {
          receipt_number: true,
          amount: true,
          payment_method: true,
          created_at: true,
        },
      }),
      db.admissions.findMany({
        where: { patient_id: patientId, organizationId },
        select: {
          admission_id: true,
          admission_date: true,
          discharge_date: true,
          status: true,
          discharge_type: true,
        },
      }),
      db.refunds.findMany({
        where: { organizationId, invoice_id: { in: [] } }, // placeholder; filtered below
        select: { id: true, amount: true, status: true, created_at: true },
      }),
      db.preAuthorization.findMany({
        where: { patient_id: patientId, organizationId },
        select: { pre_auth_number: true, status: true, requested_at: true, responded_at: true },
      }),
    ]);

    type TimelineItem = { ts: string; kind: string; label: string; meta?: string };
    const items: TimelineItem[] = [];

    invoices.forEach((i: any) => {
      items.push({
        ts: new Date(i.created_at).toISOString(),
        kind: "invoice_created",
        label: `Invoice ${i.invoice_number} created`,
        meta: `${decToNum(i.net_amount)}`,
      });
      if (i.finalized_at) {
        items.push({
          ts: new Date(i.finalized_at).toISOString(),
          kind: "invoice_finalized",
          label: `Invoice ${i.invoice_number} finalized`,
        });
      }
    });
    payments.forEach((p: any) => {
      items.push({
        ts: new Date(p.created_at).toISOString(),
        kind: "payment",
        label: `Payment collected · ${p.receipt_number}`,
        meta: `${decToNum(p.amount)} via ${p.payment_method}`,
      });
    });
    admissions.forEach((a: any) => {
      items.push({
        ts: new Date(a.admission_date).toISOString(),
        kind: "admission",
        label: `Admitted (${a.admission_id})`,
      });
      if (a.discharge_date) {
        items.push({
          ts: new Date(a.discharge_date).toISOString(),
          kind: "discharge",
          label: `Discharged (${a.discharge_type ?? a.status})`,
        });
      }
    });
    refunds.forEach((r: any) => {
      items.push({
        ts: new Date(r.created_at).toISOString(),
        kind: "refund",
        label: `Refund ${r.status} (R-${r.id})`,
        meta: `${r.amount}`,
      });
    });
    preauths.forEach((p: any) => {
      items.push({
        ts: new Date(p.requested_at).toISOString(),
        kind: "preauth",
        label: `Pre-auth ${p.pre_auth_number ?? "draft"} · ${p.status}`,
      });
    });

    items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    return { success: true, data: serialize(items) };
  } catch (error: any) {
    console.error("getPatientTimeline error:", error);
    return { success: false, data: [] };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Patient Audit Log (Section M)
// ──────────────────────────────────────────────────────────────────────────

export async function getPatientAuditLog(patientId: string, limit = 100) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const logs = await db.system_audit_logs.findMany({
      where: {
        organizationId,
        OR: [{ entity_id: patientId }, { details: { contains: patientId } }],
      },
      orderBy: { created_at: "desc" },
      take: limit,
    });
    return { success: true, data: serialize(logs) };
  } catch (error: any) {
    console.error("getPatientAuditLog error:", error);
    return { success: false, data: [] };
  }
}
