/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/backend/db';
import { ReportDefinition, ReportCategory, ValidatedFilters } from '../types';
import { canonicalTender } from '@/app/lib/payment-tender';

// ── Timezone-safe date boundary helpers ─────────────────────────────────
const toStartOfDay = (d: string | Date): Date =>
  typeof d === 'string' && !d.includes('T') ? new Date(d + 'T00:00:00.000Z') : new Date(d as string);
const toEndOfDay = (d: string | Date): Date =>
  typeof d === 'string' && !d.includes('T') ? new Date(d + 'T23:59:59.999Z') : new Date(d as string);

export const dailyRevenueReport: ReportDefinition = {
  id: 'billing-revenue-daily',
  category: ReportCategory.Revenue,
  name: 'Daily Revenue by Doctor & Department',
  description: 'Shows daily billed and collected amounts grouped by doctor and department.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    branch_id: z.string().optional(),
    department_id: z.string().optional(),
  }),
  columns: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'department', label: 'Department', type: 'string' },
    { key: 'doctor_name', label: 'Doctor Name', type: 'string' },
    { key: 'payer_type', label: 'Payer Type', type: 'string' },
    { key: 'billed_amount', label: 'Billed Amount', type: 'currency', total: 'sum' },
    { key: 'collected_amount', label: 'Collected Amount', type: 'currency', total: 'sum' },
    { key: 'invoice_count', label: 'Invoice Count', type: 'number', total: 'sum' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  filterSpec: {
    "showDepartment": true
  },
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, branch_id, department_id } = filters;

    const start = toStartOfDay(date_start);
    const end = toEndOfDay(date_end);
    const rangeDays = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);

    // ── Phase E3 Optimisation ─────────────────────────────────────────────────
    // Decision boundary: > 7 days → read from pre-aggregated rollup table.
    //                    ≤ 7 days → read from live transactional tables (real-time).
    //
    // The rollup table (mis_daily_billing_rollups) is keyed on:
    //   (organizationId, report_date, department, payer_type)
    // It does NOT store per-doctor granularity — only per-department.
    // For long-range summary views this is the correct trade-off (the UI shows
    // department-level trends; individual doctor drill-down uses billingDetailReport).
    if (rangeDays > 7) {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT
          r.report_date                        AS "date",
          r.department                         AS "department",
          '—'                                  AS "doctor_name",
          r.payer_type                         AS "payer_type",
          r.total_billed                       AS "billed_amount",
          r.total_collected                    AS "collected_amount",
          r.invoice_count                      AS "invoice_count"
        FROM "mis_daily_billing_rollups" r
        WHERE r."organizationId" = ${orgId}
          AND r.report_date >= ${start}
          AND r.report_date <= ${end}
          ${department_id ? Prisma.sql`AND r.department = ${department_id}` : Prisma.empty}
        ORDER BY r.report_date DESC, r.department, r.payer_type
      `;

      if (rows.length > 0) {
        const totals = rows.reduce(
          (acc, row) => {
            acc.billed_amount += Number(row.billed_amount || 0);
            acc.collected_amount += Number(row.collected_amount || 0);
            acc.invoice_count += Number(row.invoice_count || 0);
            return acc;
          },
          { billed_amount: 0, collected_amount: 0, invoice_count: 0 }
        );

        return {
          rows: rows.map(row => ({
            ...row,
            billed_amount: Number(row.billed_amount),
            collected_amount: Number(row.collected_amount),
            invoice_count: Number(row.invoice_count),
          })),
          totals,
        };
      }
    }

    // ── Live path (≤ 7 days) — real-time accuracy from transactional tables ───
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(i.created_at) as "date",
        COALESCE(u.department, u.specialty, 'Unknown') as "department",
        COALESCE(u.name, 'Unknown') as "doctor_name",
        COALESCE(i.billing_patient_type, 'cash') as "payer_type",
        SUM(i.total_amount) as "billed_amount",
        SUM(p.amount) as "collected_amount",
        COUNT(DISTINCT i.id) as "invoice_count"
      FROM invoices i
      LEFT JOIN "users" u ON i.doctor_id = u.id
      LEFT JOIN payments p ON p.invoice_id = i.id
      WHERE i."organizationId" = ${orgId}
        AND LOWER(i.status) = 'final'
        AND i.created_at >= ${start}
        AND i.created_at <= ${end}
        ${department_id ? Prisma.sql`AND (u.department = ${department_id} OR u.specialty = ${department_id})` : Prisma.empty}
      GROUP BY 
        DATE(i.created_at),
        COALESCE(u.department, u.specialty, 'Unknown'),
        u.name,
        i.billing_patient_type
      ORDER BY DATE(i.created_at) DESC
    `;

    const totals = rows.reduce(
      (acc, row) => {
        acc.billed_amount += Number(row.billed_amount || 0);
        acc.collected_amount += Number(row.collected_amount || 0);
        acc.invoice_count += Number(row.invoice_count || 0);
        return acc;
      },
      { billed_amount: 0, collected_amount: 0, invoice_count: 0 }
    );

    // Cast BigInt fields to Number for safe Server Action serialization
    const serializedRows = rows.map(row => ({
      ...row,
      billed_amount: Number(row.billed_amount),
      collected_amount: Number(row.collected_amount),
      invoice_count: Number(row.invoice_count),
    }));

    return { rows: serializedRows, totals };
  },
};


export const billingDetailReport: ReportDefinition = {
  id: 'billing-detail',
  category: ReportCategory.Billing,
  name: 'Billing - Billing Detail',
  description: 'Granular list of individual invoice items.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    department_id: z.string().optional(),
    bill_type: z.string().optional(),
  }),
  columns: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'invoice_number', label: 'Invoice No', type: 'string' },
    { key: 'department', label: 'Department', type: 'string' },
    { key: 'item_name', label: 'Item Name', type: 'string' },
    { key: 'quantity', label: 'Quantity', type: 'number', total: 'sum' },
    { key: 'amount', label: 'Amount', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  filterSpec: {
    showDepartment: true,
    showBillType: true,
  },
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, department_id, bill_type } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(i.created_at) as "date",
        COALESCE(i.final_bill_number, i.invoice_number) as "invoice_number",
        ii.department as "department",
        ii.description as "item_name",
        ii.quantity as "quantity",
        ii.total_price as "amount"
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i."organizationId" = ${orgId}
        AND LOWER(i.status) = 'final'
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
        ${department_id ? Prisma.sql`AND ii.department = ${department_id}` : Prisma.empty}
        ${bill_type ? Prisma.sql`AND i.billing_patient_type = ${bill_type}` : Prisma.empty}
      ORDER BY DATE(i.created_at) DESC, i.invoice_number ASC
    `;

    const totals = rows.reduce(
      (acc, row) => {
        acc.quantity += Number(row.quantity || 0);
        acc.amount += Number(row.amount || 0);
        return acc;
      },
      { quantity: 0, amount: 0 }
    );

    const serializedRows = rows.map(row => ({
      ...row,
      quantity: Number(row.quantity),
      amount: Number(row.amount),
    }));

    return { rows: serializedRows, totals };
  },
  // Fast COUNT(*) pre-check — mirrors the queryFn WHERE clause exactly,
  // without SELECT columns, GROUP BY, or ORDER BY overhead.
  // invoice_items is a large table; for a wide date range this can easily
  // exceed rowLimitSync (5000), which is why this report defines countFn.
  countFn: async (filters: ValidatedFilters, orgId: string): Promise<number> => {
    const { date_start, date_end, department_id, bill_type } = filters;
    const result = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as "count"
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i."organizationId" = ${orgId}
        AND LOWER(i.status) = 'final'
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
        ${department_id ? Prisma.sql`AND ii.department = ${department_id}` : Prisma.empty}
        ${bill_type ? Prisma.sql`AND i.billing_patient_type = ${bill_type}` : Prisma.empty}
    `;
    // $queryRaw returns BigInt for COUNT — convert to Number for the runner.
    return Number(result[0]?.count ?? 0);
  },
};

export const billingItemDetailReport: ReportDefinition = {
  id: 'billing-item-detail',

  category: ReportCategory.Billing,
  name: 'Billing - Billing Item Detail',
  description: 'Item-level breakdown of quantities and amounts billed.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    item_name: z.string().optional(),
  }),
  columns: [
    { key: 'item_name', label: 'Item Name', type: 'string' },
    { key: 'department', label: 'Department', type: 'string' },
    { key: 'quantity', label: 'Total Quantity', type: 'number', total: 'sum' },
    { key: 'amount', label: 'Total Amount', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'amount', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, item_name } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        ii.description as "item_name",
        ii.department as "department",
        SUM(ii.quantity) as "quantity",
        SUM(ii.total_price) as "amount"
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i."organizationId" = ${orgId}
        AND LOWER(i.status) = 'final'
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
        ${item_name ? Prisma.sql`AND ii.description ILIKE ${'%' + item_name + '%'}` : Prisma.empty}
      GROUP BY ii.description, ii.department
      ORDER BY SUM(ii.total_price) DESC
    `;

    const totals = rows.reduce(
      (acc, row) => {
        acc.quantity += Number(row.quantity || 0);
        acc.amount += Number(row.amount || 0);
        return acc;
      },
      { quantity: 0, amount: 0 }
    );

    const serializedRows = rows.map(row => ({
      ...row,
      quantity: Number(row.quantity),
      amount: Number(row.amount),
    }));

    return { rows: serializedRows, totals };
  },
};

export const billingSummaryReport: ReportDefinition = {
  id: 'billing-summary',
  category: ReportCategory.Billing,
  name: 'Billing - Billing Summary',
  description: 'High-level aggregation of total billed, discounts, and net amounts per day.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    branch_id: z.string().optional(),
  }),
  columns: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'total_billed', label: 'Total Billed', type: 'currency', total: 'sum' },
    { key: 'total_discount', label: 'Total Discount', type: 'currency', total: 'sum' },
    { key: 'net_amount', label: 'Net Amount', type: 'currency', total: 'sum' },
    { key: 'invoice_count', label: 'Invoice Count', type: 'number', total: 'sum' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  // Drill-down: clicking a date row opens billing-detail filtered to that date.
  drillDownTo: 'billing-detail',
  drillDownKey: 'date',
  // Bug 3B fix: expose branch filter in UI — schema already had branch_id but
  // filterSpec was absent, so MISFilterEngine never rendered the Branch dropdown.
  filterSpec: { showBranch: true },
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, branch_id } = filters;

    // Bug 2 fix: append end-of-day time so IST invoices created on date_end
    // are included. new Date('2026-06-15') = 2026-06-15T00:00:00Z (midnight UTC)
    // = 05:30 IST — invoices from 05:31 IST onward on that day were excluded.
    // Appending 'T23:59:59.999Z' covers the full UTC calendar day.
    const startBoundary = new Date(
      typeof date_start === 'string' && !date_start.includes('T')
        ? date_start + 'T00:00:00.000Z'
        : date_start
    );
    const endBoundary = new Date(
      typeof date_end === 'string' && !date_end.includes('T')
        ? date_end + 'T23:59:59.999Z'
        : date_end
    );

    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(i.created_at) as "date",
        SUM(i.total_amount) as "total_billed",
        SUM(i.total_discount) as "total_discount",
        SUM(i.net_amount) as "net_amount",
        COUNT(i.id) as "invoice_count"
      FROM invoices i
      WHERE i."organizationId" = ${orgId}
        AND LOWER(i.status) = 'final'
        AND i.created_at >= ${startBoundary}
        AND i.created_at <= ${endBoundary}
        ${branch_id ? Prisma.sql`AND i.branch_id = ${branch_id}` : Prisma.empty}
      GROUP BY DATE(i.created_at)
      ORDER BY DATE(i.created_at) DESC
    `;

    const totals = rows.reduce(
      (acc, row) => {
        acc.total_billed += Number(row.total_billed || 0);
        acc.total_discount += Number(row.total_discount || 0);
        acc.net_amount += Number(row.net_amount || 0);
        acc.invoice_count += Number(row.invoice_count || 0);
        return acc;
      },
      { total_billed: 0, total_discount: 0, net_amount: 0, invoice_count: 0 }
    );

    const serializedRows = rows.map(row => ({
      ...row,
      total_billed: Number(row.total_billed),
      total_discount: Number(row.total_discount),
      net_amount: Number(row.net_amount),
      invoice_count: Number(row.invoice_count),
    }));

    return { rows: serializedRows, totals };
  },
};


export const billingSummaryDetailReport: ReportDefinition = {
  id: 'billing-summary-detail',
  category: ReportCategory.Billing,
  name: 'Billing - Billing Summary Detail',
  description: 'Patient-level summary of all invoices generated within the period.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    patient_uhid: z.string().optional(),
  }),
  columns: [
    { key: 'patient_id', label: 'Patient UHID', type: 'string' },
    { key: 'invoice_number', label: 'Invoice No', type: 'string' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'total_amount', label: 'Total Amount', type: 'currency', total: 'sum' },
    { key: 'net_amount', label: 'Net Amount', type: 'currency', total: 'sum' },
    { key: 'paid_amount', label: 'Paid Amount', type: 'currency', total: 'sum' },
    { key: 'balance_due', label: 'Balance Due', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, patient_uhid } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        i.patient_id as "patient_id",
        COALESCE(i.final_bill_number, i.invoice_number) as "invoice_number",
        DATE(i.created_at) as "date",
        i.total_amount as "total_amount",
        i.net_amount as "net_amount",
        i.paid_amount as "paid_amount",
        i.balance_due as "balance_due"
      FROM invoices i
      WHERE i."organizationId" = ${orgId}
        AND LOWER(i.status) = 'final'
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
        ${patient_uhid ? Prisma.sql`AND i.patient_id = ${patient_uhid}` : Prisma.empty}
      ORDER BY DATE(i.created_at) DESC, i.invoice_number ASC
    `;

    const totals = rows.reduce(
      (acc, row) => {
        acc.total_amount += Number(row.total_amount || 0);
        acc.net_amount += Number(row.net_amount || 0);
        acc.paid_amount += Number(row.paid_amount || 0);
        acc.balance_due += Number(row.balance_due || 0);
        return acc;
      },
      { total_amount: 0, net_amount: 0, paid_amount: 0, balance_due: 0 }
    );

    const serializedRows = rows.map(row => ({
      ...row,
      total_amount: Number(row.total_amount),
      net_amount: Number(row.net_amount),
      paid_amount: Number(row.paid_amount),
      balance_due: Number(row.balance_due),
    }));

    return { rows: serializedRows, totals };
  },
};

export const billingPaymentModeReport: ReportDefinition = {
  id: 'billing-payment-mode',
  category: ReportCategory.Billing,
  name: 'Billing - Payment Mode Breakup',
  description: 'Breakup of collected amounts by payment mode.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'payment_mode', label: 'Payment Mode', type: 'string' },
    { key: 'transaction_count', label: 'Transaction Count', type: 'number', total: 'sum' },
    { key: 'collected_amount', label: 'Collected Amount', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'collected_amount', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // Collections come from two sources that must both appear in the mode breakup:
    //   1. Invoice payments (payments table) — excluding the synthetic 'Deposit'
    //      method, which is an internal transfer of an already-collected advance
    //      onto a bill (the cash was counted when the deposit was taken).
    //   2. Deposits collected (patient_deposits) — recorded under their real
    //      tender, so a cash deposit lands in the Cash bucket, a UPI deposit in UPI.
    const rows = await prisma.$queryRaw<any[]>`
      SELECT payment_mode, SUM(transaction_count) as "transaction_count", SUM(collected_amount) as "collected_amount"
      FROM (
        SELECT
          p.payment_method as payment_mode,
          COUNT(p.id) as transaction_count,
          SUM(p.amount) as collected_amount
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        WHERE i."organizationId" = ${orgId}
          AND LOWER(i.status) = 'final'
          AND i.created_at >= ${toStartOfDay(date_start)}
          AND i.created_at <= ${toEndOfDay(date_end)}
          AND p.status = 'Completed'
          AND p.payment_method != 'Deposit'
        GROUP BY p.payment_method
        UNION ALL
        SELECT
          pd.payment_method as payment_mode,
          COUNT(pd.id) as transaction_count,
          SUM(pd.amount) as collected_amount
        FROM patient_deposits pd
        WHERE pd."organizationId" = ${orgId}
          AND pd.created_at >= ${toStartOfDay(date_start)}
          AND pd.created_at <= ${toEndOfDay(date_end)}
        GROUP BY pd.payment_method
      ) combined
      GROUP BY payment_mode
    `;

    // Normalize tender spellings (e.g. "cash"/"Cash") so a deposit and a payment
    // of the same tender merge into one row instead of splitting the bucket.
    const byMode = new Map<string, { payment_mode: string; transaction_count: number; collected_amount: number }>();
    for (const row of rows) {
      const mode = canonicalTender(row.payment_mode);
      const cur = byMode.get(mode) || { payment_mode: mode, transaction_count: 0, collected_amount: 0 };
      cur.transaction_count += Number(row.transaction_count || 0);
      cur.collected_amount += Number(row.collected_amount || 0);
      byMode.set(mode, cur);
    }

    const serializedRows = [...byMode.values()].sort((a, b) => b.collected_amount - a.collected_amount);

    const totals = serializedRows.reduce(
      (acc, row) => {
        acc.transaction_count += row.transaction_count;
        acc.collected_amount += row.collected_amount;
        return acc;
      },
      { transaction_count: 0, collected_amount: 0 }
    );

    return { rows: serializedRows, totals };
  },
};

// ==========================================
// BATCH 2: NEW BILLING REPORTS (SN 14 - 18)
// ==========================================

export const billingUhidAdvanceReport: ReportDefinition = {
  id: 'billing-uhid-advance',
  category: ReportCategory.Billing,
  name: 'Billing - UHID Advance Deposit',
  description: 'Fetch advance payments made directly against a patient UHID (unlinked to a specific admission).',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'uhid', label: 'UHID', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'advance_amount', label: 'Advance Amount', type: 'currency', total: 'sum' },
    { key: 'payment_mode', label: 'Payment Mode', type: 'string' },
    { key: 'collected_by', label: 'Collected By', type: 'string' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(pd.created_at) as "date",
        pd.patient_id as "uhid",
        COALESCE(opd.full_name, 'Unknown') as "patient_name",
        pd.amount as "advance_amount",
        pd.payment_method as "payment_mode",
        COALESCE(pd.collected_by, 'System') as "collected_by"
      FROM patient_deposits pd
      LEFT JOIN "OPD_REG" opd ON pd.patient_id = opd.patient_id
      WHERE pd."organizationId" = ${orgId}
        AND pd.admission_id IS NULL
        AND pd.created_at >= ${toStartOfDay(date_start)}
        AND pd.created_at <= ${toEndOfDay(date_end)}
      ORDER BY DATE(pd.created_at) DESC
    `;

    const totals = rows.reduce(
      (acc, row) => {
        acc.advance_amount += Number(row.advance_amount || 0);
        return acc;
      },
      { advance_amount: 0 }
    );

    const serializedRows = rows.map(row => ({
      ...row,
      advance_amount: Number(row.advance_amount),
    }));

    return { rows: serializedRows, totals };
  },
};

export const billingAdmissionAdvanceReport: ReportDefinition = {
  id: 'billing-admission-advance',
  category: ReportCategory.Billing,
  name: 'Billing - Admission Advance Deposit',
  description: 'Fetch advance payments made against specific IPD admissions.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    department_id: z.string().optional(),
  }),
  columns: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'uhid', label: 'UHID', type: 'string' },
    { key: 'ip_number', label: 'IP Number', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'advance_amount', label: 'Advance Amount', type: 'currency', total: 'sum' },
    { key: 'payment_mode', label: 'Payment Mode', type: 'string' },
    { key: 'collected_by', label: 'Collected By', type: 'string' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  filterSpec: {
    "showDepartment": true
  },
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, department_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(pd.created_at) as "date",
        pd.patient_id as "uhid",
        pd.admission_id as "ip_number",
        COALESCE(opd.full_name, 'Unknown') as "patient_name",
        pd.amount as "advance_amount",
        pd.payment_method as "payment_mode",
        COALESCE(pd.collected_by, 'System') as "collected_by"
      FROM patient_deposits pd
      LEFT JOIN "OPD_REG" opd ON pd.patient_id = opd.patient_id
      LEFT JOIN admissions adm ON pd.admission_id = adm.admission_id
      LEFT JOIN wards w ON adm.ward_id = w.ward_id
      WHERE pd."organizationId" = ${orgId}
        AND pd.admission_id IS NOT NULL
        AND pd.created_at >= ${toStartOfDay(date_start)}
        AND pd.created_at <= ${toEndOfDay(date_end)}
        ${department_id ? Prisma.sql`AND w.department_id = ${department_id}` : Prisma.empty}
      ORDER BY DATE(pd.created_at) DESC
    `;

    const totals = rows.reduce(
      (acc, row) => {
        acc.advance_amount += Number(row.advance_amount || 0);
        return acc;
      },
      { advance_amount: 0 }
    );

    const serializedRows = rows.map(row => ({
      ...row,
      advance_amount: Number(row.advance_amount),
    }));

    return { rows: serializedRows, totals };
  },
};

export const billingDiscountSummaryReport: ReportDefinition = {
  id: 'billing-discount-summary',
  category: ReportCategory.Billing,
  name: 'Billing - Discount Summary',
  description: 'Aggregate discounts given on invoices.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    branch_id: z.string().optional(),
  }),
  columns: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'invoice_number', label: 'Invoice No', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'invoice_total', label: 'Invoice Total', type: 'currency', total: 'sum' },
    { key: 'discount_amount', label: 'Discount Amount', type: 'currency', total: 'sum' },
    { key: 'discount_reason', label: 'Discount Reason', type: 'string' },
    { key: 'authorized_by', label: 'Authorized By', type: 'string' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.admin',  // Discount authorisations — finance/admin only
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, branch_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(i.created_at) as "date",
        COALESCE(i.final_bill_number, i.invoice_number) as "invoice_number",
        COALESCE(opd.full_name, 'Unknown') as "patient_name",
        i.total_amount as "invoice_total",
        i.total_discount as "discount_amount",
        COALESCE(i.notes, 'N/A') as "discount_reason",
        COALESCE(i.approved_by, 'System') as "authorized_by"
      FROM invoices i
      LEFT JOIN "OPD_REG" opd ON i.patient_id = opd.patient_id
      WHERE i."organizationId" = ${orgId}
        AND LOWER(i.status) = 'final'
        AND i.total_discount > 0
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
        ${branch_id ? Prisma.sql`AND i.branch_id = ${branch_id}` : Prisma.empty}
      ORDER BY DATE(i.created_at) DESC
    `;

    const totals = rows.reduce(
      (acc, row) => {
        acc.invoice_total += Number(row.invoice_total || 0);
        acc.discount_amount += Number(row.discount_amount || 0);
        return acc;
      },
      { invoice_total: 0, discount_amount: 0 }
    );

    const serializedRows = rows.map(row => ({
      ...row,
      invoice_total: Number(row.invoice_total),
      discount_amount: Number(row.discount_amount),
    }));

    return { rows: serializedRows, totals };
  },
};

export const billingDueSettledReport: ReportDefinition = {
  id: 'billing-due-settled',
  category: ReportCategory.Billing,
  name: 'Billing - Due Settled',
  description: 'Fetch payments made to settle previously pending or credit bills.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'settlement_date', label: 'Settlement Date', type: 'date' },
    { key: 'invoice_number', label: 'Invoice No', type: 'string' },
    { key: 'original_bill_date', label: 'Original Bill Date', type: 'date' },
    { key: 'billed_amount', label: 'Billed Amount', type: 'currency', total: 'sum' },
    { key: 'settled_amount', label: 'Settled Amount', type: 'currency', total: 'sum' },
    { key: 'payment_mode', label: 'Payment Mode', type: 'string' },
  ],
  defaultSort: { column: 'settlement_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(p.created_at) as "settlement_date",
        COALESCE(i.final_bill_number, i.invoice_number) as "invoice_number",
        DATE(i.created_at) as "original_bill_date",
        i.net_amount as "billed_amount",
        p.amount as "settled_amount",
        p.payment_method as "payment_mode"
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      WHERE i."organizationId" = ${orgId}
        AND p.status = 'Completed'
        AND p.payment_type = 'Settlement'
        AND p.created_at >= ${toStartOfDay(date_start)}
        AND p.created_at <= ${toEndOfDay(date_end)}
      ORDER BY DATE(p.created_at) DESC
    `;

    const totals = rows.reduce(
      (acc, row) => {
        acc.billed_amount += Number(row.billed_amount || 0);
        acc.settled_amount += Number(row.settled_amount || 0);
        return acc;
      },
      { billed_amount: 0, settled_amount: 0 }
    );

    const serializedRows = rows.map(row => ({
      ...row,
      billed_amount: Number(row.billed_amount),
      settled_amount: Number(row.settled_amount),
    }));

    return { rows: serializedRows, totals };
  },
};

export const billingRefundReport: ReportDefinition = {
  id: 'billing-refund',
  category: ReportCategory.Billing,
  name: 'Billing - Refund',
  description: 'Fetch refund transactions and reasons.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'uhid', label: 'UHID', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'original_invoice_number', label: 'Original Invoice No', type: 'string' },
    { key: 'refund_amount', label: 'Refund Amount', type: 'currency', total: 'sum' },
    { key: 'refund_mode', label: 'Refund Mode', type: 'string' },
    { key: 'reason', label: 'Reason', type: 'string' },
    { key: 'processed_by', label: 'Processed By', type: 'string' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(r.created_at) as "date",
        i.patient_id as "uhid",
        COALESCE(opd.full_name, 'Unknown') as "patient_name",
        r.invoice_id as "original_invoice_number",
        r.amount as "refund_amount",
        COALESCE(p.payment_method, 'Refund') as "refund_mode",
        r.reason as "reason",
        COALESCE(r.processed_by, 'System') as "processed_by"
      FROM refunds r
      LEFT JOIN invoices i ON i.id::text = r.invoice_id AND i."organizationId" = ${orgId}
      LEFT JOIN "OPD_REG" opd ON i.patient_id = opd.patient_id
      LEFT JOIN payments p ON p.id::text = r.payment_id
      WHERE r."organizationId" = ${orgId}
        AND r.status = 'Processed'
        AND r.created_at >= ${toStartOfDay(date_start)}
        AND r.created_at <= ${toEndOfDay(date_end)}
      ORDER BY DATE(r.created_at) DESC
    `;

    const totals = rows.reduce(
      (acc, row) => {
        acc.refund_amount += Number(row.refund_amount || 0);
        return acc;
      },
      { refund_amount: 0 }
    );

    const serializedRows = rows.map(row => ({
      ...row,
      refund_amount: Number(row.refund_amount),
    }));

    return { rows: serializedRows, totals };
  },
};

export const billingOpRefundReport: ReportDefinition = {
  id: 'billing-op-refund',
  category: ReportCategory.Billing,
  name: 'Billing - OP Refund',
  description: 'Fetch refunds specifically for Outpatient (OPD) invoices.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    department_id: z.string().optional(),
  }),
  columns: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'uhid', label: 'UHID', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'op_invoice_number', label: 'OP Invoice No', type: 'string' },
    { key: 'refund_amount', label: 'Refund Amount', type: 'currency', total: 'sum' },
    { key: 'processed_by', label: 'Processed By', type: 'string' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  filterSpec: {
    "showDepartment": true
  },
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, department_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(r.created_at) as "date",
        i.patient_id as "uhid",
        COALESCE(opd.full_name, 'Unknown') as "patient_name",
        COALESCE(i.final_bill_number, i.invoice_number) as "op_invoice_number",
        r.amount as "refund_amount",
        COALESCE(r.processed_by, 'System') as "processed_by"
      FROM refunds r
      JOIN invoices i ON r.invoice_id = i.id::text AND i."organizationId" = ${orgId}
      LEFT JOIN "OPD_REG" opd ON i.patient_id = opd.patient_id
      LEFT JOIN "users" u ON i.doctor_id = u.id
      WHERE r."organizationId" = ${orgId}
        AND r.status = 'Processed'
        AND (i.invoice_type = 'OPD' OR i.admission_id IS NULL)
        AND r.created_at >= ${toStartOfDay(date_start)}
        AND r.created_at <= ${toEndOfDay(date_end)}
        ${department_id ? Prisma.sql`AND (u.department = ${department_id} OR u.specialty = ${department_id})` : Prisma.empty}
      ORDER BY DATE(r.created_at) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.refund_amount += Number(row.refund_amount || 0);
      return acc;
    }, { refund_amount: 0 });
    return {
      rows: rows.map(r => ({ ...r, refund_amount: Number(r.refund_amount) })),
      totals
    };
  },
};

export const billingDateWiseCashReport: ReportDefinition = {
  id: 'billing-date-wise-cash',
  category: ReportCategory.Billing,
  name: 'Billing - Date Wise Cash Collection',
  description: 'Aggregate physical cash collected per day.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    cashier_id: z.string().optional(),
  }),
  columns: [
    { key: 'collection_date', label: 'Collection Date', type: 'date' },
    { key: 'cashier_name', label: 'Cashier Name', type: 'string' },
    { key: 'total_cash_collected', label: 'Total Cash Collected', type: 'currency', total: 'sum' },
    { key: 'total_cash_refunded', label: 'Total Cash Refunded', type: 'currency', total: 'sum' },
    { key: 'net_cash_in_drawer', label: 'Net Cash in Drawer', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'collection_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, cashier_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      WITH cash_payments AS (
        -- Physical cash in the drawer comes from invoice payments AND from cash
        -- deposits collected (patient_deposits). Both are unioned then aggregated
        -- per (date, cashier) so the refund join below matches a single row.
        SELECT cdate, cashier_id, SUM(amt) as collected
        FROM (
          SELECT
            DATE(ps.payment_date) as cdate,
            COALESCE(ps.received_by, 'System') as cashier_id,
            ps.amount as amt
          FROM payment_splits ps
          JOIN invoices i ON ps.invoice_id = i.id
          WHERE i."organizationId" = ${orgId}
            AND ps.status = 'received'
            AND ps.payment_method ILIKE '%cash%'
            AND ps.payment_date >= ${toStartOfDay(date_start)}
            AND ps.payment_date <= ${toEndOfDay(date_end)}
          UNION ALL
          SELECT
            DATE(pd.created_at) as cdate,
            COALESCE(pd.collected_by, 'System') as cashier_id,
            pd.amount as amt
          FROM patient_deposits pd
          WHERE pd."organizationId" = ${orgId}
            AND pd.payment_method ILIKE '%cash%'
            AND pd.created_at >= ${toStartOfDay(date_start)}
            AND pd.created_at <= ${toEndOfDay(date_end)}
        ) cash_sources
        GROUP BY cdate, cashier_id
      ),
      cash_refunds AS (
        SELECT 
          DATE(r.created_at) as cdate,
          COALESCE(r.processed_by, 'System') as cashier_id,
          SUM(r.amount) as refunded
        FROM refunds r
        LEFT JOIN payments p ON p.id::text = r.payment_id
        WHERE r."organizationId" = ${orgId}
          AND r.status = 'Processed'
          AND p.payment_method ILIKE '%cash%'
          AND r.created_at >= ${toStartOfDay(date_start)}
          AND r.created_at <= ${toEndOfDay(date_end)}
        GROUP BY DATE(r.created_at), r.processed_by
      )
      SELECT 
        COALESCE(p.cdate, r.cdate) as "collection_date",
        COALESCE(p.cashier_id, r.cashier_id) as "cashier_name",
        COALESCE(p.collected, 0) as "total_cash_collected",
        COALESCE(r.refunded, 0) as "total_cash_refunded",
        (COALESCE(p.collected, 0) - COALESCE(r.refunded, 0)) as "net_cash_in_drawer"
      FROM cash_payments p
      FULL OUTER JOIN cash_refunds r ON p.cdate = r.cdate AND p.cashier_id = r.cashier_id
      WHERE 1=1
        ${cashier_id ? Prisma.sql`AND COALESCE(p.cashier_id, r.cashier_id) = ${cashier_id}` : Prisma.empty}
      ORDER BY "collection_date" DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.total_cash_collected += Number(row.total_cash_collected || 0);
      acc.total_cash_refunded += Number(row.total_cash_refunded || 0);
      acc.net_cash_in_drawer += Number(row.net_cash_in_drawer || 0);
      return acc;
    }, { total_cash_collected: 0, total_cash_refunded: 0, net_cash_in_drawer: 0 });

    return {
      rows: rows.map(r => ({
        ...r,
        total_cash_collected: Number(r.total_cash_collected),
        total_cash_refunded: Number(r.total_cash_refunded),
        net_cash_in_drawer: Number(r.net_cash_in_drawer),
      })),
      totals
    };
  },
};

export const billingDoctorPayoutReport: ReportDefinition = {
  id: 'billing-doctor-payout',
  category: ReportCategory.Billing,
  name: 'Billing - Doctor Payout',
  description: 'Calculate revenue share owed to doctors for services performed.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    doctor_id: z.string().optional(),
  }),
  columns: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'doctor_name', label: 'Doctor Name', type: 'string' },
    { key: 'service_name', label: 'Service Name', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'billed_amount', label: 'Billed Amount', type: 'currency', total: 'sum' },
    { key: 'doctor_share_percent', label: 'Share %', type: 'string' },
    { key: 'payout_amount', label: 'Payout Amount', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  filterSpec: {
    "showDoctor": true
  },
  requiredPermission: 'mis_reports.billing.admin',  // Doctor payroll data — finance/admin only
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, doctor_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(i.created_at) as "date",
        COALESCE(u.name, 'Unknown') as "doctor_name",
        ii.description as "service_name",
        COALESCE(opd.full_name, 'Unknown') as "patient_name",
        ii.total_price as "billed_amount",
        -- Use the per-doctor consultation_fee as the contracted payout rate.
        -- consultation_fee is stored on users and represents the doctor's share
        -- per unit billed. We express it as a percentage of the line-item price.
        -- If consultation_fee is 0 or the doctor record is missing we fall back to 0.
        CASE
          WHEN COALESCE(u.consultation_fee, 0) = 0 OR COALESCE(ii.total_price, 0) = 0
            THEN '0%'
          ELSE CONCAT(
            ROUND(
              (COALESCE(u.consultation_fee, 0) / NULLIF(ii.total_price, 0)) * 100
            )::text,
            '%'
          )
        END as "doctor_share_percent",
        LEAST(COALESCE(u.consultation_fee, 0), COALESCE(ii.total_price, 0)) as "payout_amount"
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      LEFT JOIN "users" u ON i.doctor_id = u.id
      LEFT JOIN "OPD_REG" opd ON i.patient_id = opd.patient_id
      WHERE i."organizationId" = ${orgId}
        AND LOWER(i.status) = 'final'
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
        ${doctor_id ? Prisma.sql`AND u.id = ${doctor_id}` : Prisma.empty}
      ORDER BY DATE(i.created_at) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.billed_amount += Number(row.billed_amount || 0);
      acc.payout_amount += Number(row.payout_amount || 0);
      return acc;
    }, { billed_amount: 0, payout_amount: 0 });

    return {
      rows: rows.map(r => ({
        ...r,
        billed_amount: Number(r.billed_amount),
        payout_amount: Number(r.payout_amount),
      })),
      totals
    };
  },
};

export const billingDoctorAccountPayableReport: ReportDefinition = {
  id: 'billing-doctor-account-payable',
  category: ReportCategory.Billing,
  name: 'Billing - Doctor Account Payable',
  description: 'Aggregate total outstanding payouts owed to doctors up to a certain date.',
  filters: z.object({
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'doctor_id', label: 'Doctor ID', type: 'string' },
    { key: 'doctor_name', label: 'Doctor Name', type: 'string' },
    { key: 'department', label: 'Department', type: 'string' },
    { key: 'total_earned', label: 'Total Earned', type: 'currency', total: 'sum' },
    { key: 'total_paid', label: 'Total Paid', type: 'currency', total: 'sum' },
    { key: 'balance_payable', label: 'Balance Payable', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'balance_payable', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.admin',  // Accounts payable — finance/admin only
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        u.id as "doctor_id",
        COALESCE(u.name, 'Unknown') as "doctor_name",
        COALESCE(u.department, u.specialty, 'Unknown') as "department",
        -- total_earned: sum of per-doctor contracted consultation_fee across all
        -- non-cancelled line items up to date_end. consultation_fee on the users
        -- record is the actual per-visit payout rate agreed with the doctor.
        -- We cap payout per line at min(consultation_fee, line_item_price) to
        -- avoid overpaying when a line item is cheaper than the base fee.
        SUM(LEAST(COALESCE(u.consultation_fee, 0), COALESCE(ii.total_price, 0))) as "total_earned",
        0 as "total_paid",
        SUM(LEAST(COALESCE(u.consultation_fee, 0), COALESCE(ii.total_price, 0))) as "balance_payable"
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN "users" u ON i.doctor_id = u.id
      WHERE i."organizationId" = ${orgId}
        AND LOWER(i.status) = 'final'
        AND i.created_at <= ${toEndOfDay(date_end)}
        AND (u.role = 'doctor' OR u.role = 'surgeon')
      GROUP BY u.id, u.name, u.department, u.specialty, u.consultation_fee
      ORDER BY SUM(LEAST(COALESCE(u.consultation_fee, 0), COALESCE(ii.total_price, 0))) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.total_earned += Number(row.total_earned || 0);
      acc.total_paid += Number(row.total_paid || 0);
      acc.balance_payable += Number(row.balance_payable || 0);
      return acc;
    }, { total_earned: 0, total_paid: 0, balance_payable: 0 });

    return {
      rows: rows.map(r => ({
        ...r,
        total_earned: Number(r.total_earned),
        total_paid: Number(r.total_paid),
        balance_payable: Number(r.balance_payable),
      })),
      totals
    };
  },
};

export const billingIpPackageReport: ReportDefinition = {
  id: 'billing-ip-package',
  category: ReportCategory.Billing,
  name: 'Billing - IP Package',
  description: 'Fetch Inpatient (IPD) admissions billed under fixed packages.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    package_id: z.string().optional(),
  }),
  columns: [
    { key: 'admission_date', label: 'Admission Date', type: 'date' },
    { key: 'ip_number', label: 'IP Number', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'package_name', label: 'Package Name', type: 'string' },
    { key: 'package_amount', label: 'Package Amount', type: 'currency', total: 'sum' },
    { key: 'additional_billed', label: 'Additional Billed', type: 'currency', total: 'sum' },
    { key: 'total_invoice', label: 'Total Invoice', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'admission_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, package_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      WITH package_items AS (
        SELECT 
          ii.invoice_id,
          MAX(ii.description) as package_name,
          SUM(ii.total_price) as package_amount
        FROM invoice_items ii
        WHERE (ii.department ILIKE '%package%' OR ii.service_category ILIKE '%package%' OR ii.description ILIKE '%package%')
          ${package_id ? Prisma.sql`AND (ii.ref_id = ${package_id} OR ii.description ILIKE ${'%' + package_id + '%'})` : Prisma.empty}
        GROUP BY ii.invoice_id
      )
      SELECT 
        DATE(adm.admission_date) as "admission_date",
        i.admission_id as "ip_number",
        COALESCE(opd.full_name, 'Unknown') as "patient_name",
        pi.package_name as "package_name",
        pi.package_amount as "package_amount",
        (i.total_amount - pi.package_amount) as "additional_billed",
        i.total_amount as "total_invoice"
      FROM invoices i
      JOIN package_items pi ON i.id = pi.invoice_id
      LEFT JOIN admissions adm ON i.admission_id = adm.admission_id
      LEFT JOIN "OPD_REG" opd ON i.patient_id = opd.patient_id
      WHERE i."organizationId" = ${orgId}
        AND LOWER(i.status) = 'final'
        AND i.invoice_type = 'IPD'
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
      ORDER BY DATE(adm.admission_date) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.package_amount += Number(row.package_amount || 0);
      acc.additional_billed += Number(row.additional_billed || 0);
      acc.total_invoice += Number(row.total_invoice || 0);
      return acc;
    }, { package_amount: 0, additional_billed: 0, total_invoice: 0 });

    return {
      rows: rows.map(r => ({
        ...r,
        package_amount: Number(r.package_amount),
        additional_billed: Number(r.additional_billed),
        total_invoice: Number(r.total_invoice),
      })),
      totals
    };
  },
};

export const billingHealthCheckupCountReport: ReportDefinition = {
  id: 'billing-health-checkup-count',
  category: ReportCategory.Billing,
  name: 'Billing - Health Check Up Count Summary',
  description: 'Aggregate the count of specific Health Checkup packages billed within the period.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    package_id: z.string().optional(),
  }),
  columns: [
    { key: 'package_id', label: 'Package ID', type: 'string' },
    { key: 'package_name', label: 'Package Name', type: 'string' },
    { key: 'total_sold', label: 'Total Sold', type: 'number', total: 'sum' },
    { key: 'total_revenue', label: 'Total Revenue', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'total_sold', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, package_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        ii.ref_id as "package_id",
        ii.description as "package_name",
        COUNT(ii.id) as "total_sold",
        SUM(ii.total_price) as "total_revenue"
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i."organizationId" = ${orgId}
        AND LOWER(i.status) = 'final'
        AND (ii.department ILIKE '%checkup%' OR ii.service_category ILIKE '%checkup%' OR ii.description ILIKE '%checkup%')
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
        ${package_id ? Prisma.sql`AND ii.ref_id = ${package_id}` : Prisma.empty}
      GROUP BY ii.ref_id, ii.description
      ORDER BY COUNT(ii.id) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.total_sold += Number(row.total_sold || 0);
      acc.total_revenue += Number(row.total_revenue || 0);
      return acc;
    }, { total_sold: 0, total_revenue: 0 });
    return {
      rows: rows.map(r => ({ ...r, total_sold: Number(r.total_sold), total_revenue: Number(r.total_revenue) })),
      totals
    };
  },
};

export const billingPayerAgreementExpiryReport: ReportDefinition = {
  id: 'billing-payer-agreement-expiry',
  category: ReportCategory.Billing,
  name: 'Billing - Payer Agreement Expiry',
  description: 'Fetch corporate/TPA payers whose contracts are expiring soon or have expired.',
  filters: z.object({
    date_start: z.string().or(z.date()).optional(),
    date_end: z.string().or(z.date()).optional(),
    expiry_days_threshold: z.number().or(z.string().transform(Number)).optional().default(30),
  }),
  columns: [
    { key: 'payer_name', label: 'Payer Name', type: 'string' },
    { key: 'contract_start', label: 'Agreement Start Date', type: 'date' },
    { key: 'contract_end', label: 'Agreement End Date', type: 'date' },
    { key: 'days_to_expiry', label: 'Days to Expiry', type: 'number' },
    { key: 'status', label: 'Status', type: 'string' },
  ],
  defaultSort: { column: 'days_to_expiry', direction: 'asc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { expiry_days_threshold } = filters;
    const threshold = Number(expiry_days_threshold) || 30;

    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        company_name as "payer_name",
        DATE(contract_start) as "contract_start",
        DATE(contract_end) as "contract_end",
        DATE_PART('day', contract_end - CURRENT_DATE) as "days_to_expiry",
        CASE 
          WHEN contract_end < CURRENT_DATE THEN 'Expired'
          WHEN DATE_PART('day', contract_end - CURRENT_DATE) <= ${threshold} THEN 'Expiring Soon'
          ELSE 'Active'
        END as "status"
      FROM corporate_masters
      WHERE "organizationId" = ${orgId}
        AND contract_end IS NOT NULL
        AND DATE_PART('day', contract_end - CURRENT_DATE) <= ${threshold}
      ORDER BY "days_to_expiry" ASC
    `;
    return {
      rows: rows.map(r => ({ ...r, days_to_expiry: Number(r.days_to_expiry) })),
      totals: {}
    };
  },
};

export const billingDepositRefundReport: ReportDefinition = {
  id: 'billing-deposit-refund',
  category: ReportCategory.Billing,
  name: 'Billing - Deposit Refund',
  description: 'Fetch refunds specifically related to IPD security deposits.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'refund_date', label: 'Refund Date', type: 'date' },
    { key: 'ip_number', label: 'IP Number', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'original_deposit_amount', label: 'Original Deposit Amount', type: 'currency', total: 'sum' },
    { key: 'refund_amount', label: 'Refund Amount', type: 'currency', total: 'sum' },
    { key: 'processed_by', label: 'Processed By', type: 'string' },
  ],
  defaultSort: { column: 'refund_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(r.created_at) as "refund_date",
        i.admission_id as "ip_number",
        COALESCE(opd.full_name, 'Unknown') as "patient_name",
        COALESCE(p.amount, 0) as "original_deposit_amount",
        r.amount as "refund_amount",
        COALESCE(r.processed_by, 'System') as "processed_by"
      FROM refunds r
      JOIN invoices i ON r.invoice_id = i.id::text AND i."organizationId" = ${orgId}
      LEFT JOIN payments p ON p.id::text = r.payment_id
      LEFT JOIN "OPD_REG" opd ON i.patient_id = opd.patient_id
      WHERE r."organizationId" = ${orgId}
        AND r.status = 'Processed'
        AND i.invoice_type = 'IPD'
        AND r.reason ILIKE '%deposit%'
        AND r.created_at >= ${toStartOfDay(date_start)}
        AND r.created_at <= ${toEndOfDay(date_end)}
      ORDER BY DATE(r.created_at) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.original_deposit_amount += Number(row.original_deposit_amount || 0);
      acc.refund_amount += Number(row.refund_amount || 0);
      return acc;
    }, { original_deposit_amount: 0, refund_amount: 0 });
    return {
      rows: rows.map(r => ({
        ...r,
        original_deposit_amount: Number(r.original_deposit_amount),
        refund_amount: Number(r.refund_amount)
      })),
      totals
    };
  },
};

export const billingPendingBillsReport: ReportDefinition = {
  id: 'billing-pending-bills',
  category: ReportCategory.Billing,
  name: 'Billing - Pending Bills',
  description: 'Fetch all invoices where the balanced owed is greater than zero.',
  filters: z.object({
    date_start: z.string().or(z.date()).optional(),
    date_end: z.string().or(z.date()),
    patient_type: z.string().optional(),
  }),
  columns: [
    { key: 'invoice_date', label: 'Invoice Date', type: 'date' },
    { key: 'invoice_number', label: 'Invoice Number', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'billed_amount', label: 'Billed Amount', type: 'currency', total: 'sum' },
    { key: 'paid_amount', label: 'Paid Amount', type: 'currency', total: 'sum' },
    { key: 'balance_due', label: 'Balance Due', type: 'currency', total: 'sum' },
    { key: 'aging_days', label: 'Aging Days', type: 'number' },
  ],
  defaultSort: { column: 'aging_days', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_end, patient_type } = filters;
    const as_of_date = date_end;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(i.created_at) as "invoice_date",
        COALESCE(i.final_bill_number, i.invoice_number) as "invoice_number",
        COALESCE(opd.full_name, 'Unknown') as "patient_name",
        i.total_amount as "billed_amount",
        i.paid_amount as "paid_amount",
        i.balance_due as "balance_due",
        DATE_PART('day', ${new Date(as_of_date)} - DATE(i.created_at)) as "aging_days"
      FROM invoices i
      LEFT JOIN "OPD_REG" opd ON i.patient_id = opd.patient_id
      WHERE i."organizationId" = ${orgId}
        AND LOWER(i.status) = 'final'
        AND i.balance_due > 0
        AND i.created_at <= ${new Date(as_of_date)}
        ${patient_type ? Prisma.sql`AND i.invoice_type = ${patient_type}` : Prisma.empty}
      ORDER BY "aging_days" DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.billed_amount += Number(row.billed_amount || 0);
      acc.paid_amount += Number(row.paid_amount || 0);
      acc.balance_due += Number(row.balance_due || 0);
      return acc;
    }, { billed_amount: 0, paid_amount: 0, balance_due: 0 });
    return {
      rows: rows.map(r => ({
        ...r,
        billed_amount: Number(r.billed_amount),
        paid_amount: Number(r.paid_amount),
        balance_due: Number(r.balance_due),
        aging_days: Number(r.aging_days)
      })),
      totals
    };
  },
};

export const billingPaymentServiceTypeReport: ReportDefinition = {
  id: 'billing-payment-service-type',
  category: ReportCategory.Billing,
  name: 'Billing - Payment Service Type Summary',
  description: 'Aggregate payments based on the underlying service type (e.g., Consultation, Pharmacy, Lab, Radiology).',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'service_category', label: 'Service Category', type: 'string' },
    { key: 'total_billed', label: 'Total Billed', type: 'currency', total: 'sum' },
    { key: 'total_collected', label: 'Total Collected', type: 'currency', total: 'sum' },
    { key: 'outstanding', label: 'Outstanding', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'total_billed', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(ii.service_category, ii.department, 'Unknown') as "service_category",
        SUM(ii.total_price) as "total_billed",
        SUM(CASE WHEN i.paid_amount >= i.total_amount THEN ii.total_price ELSE (ii.total_price * (i.paid_amount / NULLIF(i.total_amount, 0))) END) as "total_collected",
        SUM(ii.total_price - CASE WHEN i.paid_amount >= i.total_amount THEN ii.total_price ELSE (ii.total_price * (i.paid_amount / NULLIF(i.total_amount, 0))) END) as "outstanding"
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i."organizationId" = ${orgId}
        AND LOWER(i.status) = 'final'
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
      GROUP BY COALESCE(ii.service_category, ii.department, 'Unknown')
      ORDER BY SUM(ii.total_price) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.total_billed += Number(row.total_billed || 0);
      acc.total_collected += Number(row.total_collected || 0);
      acc.outstanding += Number(row.outstanding || 0);
      return acc;
    }, { total_billed: 0, total_collected: 0, outstanding: 0 });
    return {
      rows: rows.map(r => ({
        ...r,
        total_billed: Number(r.total_billed),
        total_collected: Number(r.total_collected),
        outstanding: Number(r.outstanding)
      })),
      totals
    };
  },
};

export const billingPaymentSummaryReport: ReportDefinition = {
  id: 'billing-payment-summary',
  category: ReportCategory.Billing,
  name: 'Billing - Payment Summary',
  description: 'High-level summary of total payments received, grouped by day and payment mode.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'total_cash', label: 'Total Cash', type: 'currency', total: 'sum' },
    { key: 'total_card', label: 'Total Card', type: 'currency', total: 'sum' },
    { key: 'total_upi', label: 'Total UPI', type: 'currency', total: 'sum' },
    { key: 'total_collected', label: 'Total Collected', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // Daily collection = invoice payment splits (excluding the 'Deposit' transfer
    // method) UNION the deposits collected that day, each under its real tender so
    // a cash deposit adds to total_cash, a UPI deposit to total_upi, etc.
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        DATE(txn_date) as "date",
        SUM(CASE WHEN method ILIKE '%cash%' THEN amt ELSE 0 END) as "total_cash",
        SUM(CASE WHEN method ILIKE '%card%' THEN amt ELSE 0 END) as "total_card",
        SUM(CASE WHEN method ILIKE '%upi%' THEN amt ELSE 0 END) as "total_upi",
        SUM(amt) as "total_collected"
      FROM (
        SELECT ps.payment_date as txn_date, ps.payment_method as method, ps.amount as amt
        FROM payment_splits ps
        JOIN invoices i ON ps.invoice_id = i.id
        WHERE i."organizationId" = ${orgId}
          AND ps.status = 'received'
          AND ps.payment_method NOT ILIKE '%deposit%'
          AND ps.payment_date >= ${toStartOfDay(date_start)}
          AND ps.payment_date <= ${toEndOfDay(date_end)}
        UNION ALL
        SELECT pd.created_at as txn_date, pd.payment_method as method, pd.amount as amt
        FROM patient_deposits pd
        WHERE pd."organizationId" = ${orgId}
          AND pd.created_at >= ${toStartOfDay(date_start)}
          AND pd.created_at <= ${toEndOfDay(date_end)}
      ) combined
      GROUP BY DATE(txn_date)
      ORDER BY DATE(txn_date) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.total_cash += Number(row.total_cash || 0);
      acc.total_card += Number(row.total_card || 0);
      acc.total_upi += Number(row.total_upi || 0);
      acc.total_collected += Number(row.total_collected || 0);
      return acc;
    }, { total_cash: 0, total_card: 0, total_upi: 0, total_collected: 0 });
    return {
      rows: rows.map(r => ({
        ...r,
        total_cash: Number(r.total_cash),
        total_card: Number(r.total_card),
        total_upi: Number(r.total_upi),
        total_collected: Number(r.total_collected)
      })),
      totals
    };
  },
};

export const billingRevenueSummaryReport: ReportDefinition = {
  id: 'billing-revenue-summary',
  category: ReportCategory.Billing,
  name: 'Billing - Billing Revenue',
  description: 'Aggregate total billed revenue vs actual collected revenue.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'total_billed', label: 'Total Billed', type: 'currency', total: 'sum' },
    { key: 'total_collected', label: 'Total Collected', type: 'currency', total: 'sum' },
    { key: 'total_discount', label: 'Total Discount', type: 'currency', total: 'sum' },
    { key: 'outstanding_balance', label: 'Outstanding Balance', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(i.created_at) as "date",
        SUM(i.total_amount) as "total_billed",
        SUM(i.paid_amount) as "total_collected",
        SUM(i.total_discount) as "total_discount",
        SUM(i.balance_due) as "outstanding_balance"
      FROM invoices i
      WHERE i."organizationId" = ${orgId}
        AND LOWER(i.status) = 'final'
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
      GROUP BY DATE(i.created_at)
      ORDER BY DATE(i.created_at) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.total_billed += Number(row.total_billed || 0);
      acc.total_collected += Number(row.total_collected || 0);
      acc.total_discount += Number(row.total_discount || 0);
      acc.outstanding_balance += Number(row.outstanding_balance || 0);
      return acc;
    }, { total_billed: 0, total_collected: 0, total_discount: 0, outstanding_balance: 0 });
    return {
      rows: rows.map(r => ({
        ...r,
        total_billed: Number(r.total_billed),
        total_collected: Number(r.total_collected),
        total_discount: Number(r.total_discount),
        outstanding_balance: Number(r.outstanding_balance)
      })),
      totals
    };
  },
};

export const billingCancelBillReport: ReportDefinition = {
  id: 'billing-cancel-bill',
  category: ReportCategory.Billing,
  name: 'Billing - Cancel Bill Report',
  description: 'Fetch all invoices where status is "cancelled".',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'cancel_date', label: 'Cancel Date', type: 'date' },
    { key: 'invoice_number', label: 'Invoice Number', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'original_amount', label: 'Original Amount', type: 'currency', total: 'sum' },
    { key: 'cancellation_reason', label: 'Cancellation Reason', type: 'string' },
    { key: 'cancelled_by', label: 'Cancelled By', type: 'string' },
  ],
  defaultSort: { column: 'cancel_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(i.updated_at) as "cancel_date",
        COALESCE(i.final_bill_number, i.invoice_number) as "invoice_number",
        COALESCE(opd.full_name, 'Unknown') as "patient_name",
        i.total_amount as "original_amount",
        COALESCE(i.notes, 'Cancelled') as "cancellation_reason",
        'System' as "cancelled_by"
      FROM invoices i
      LEFT JOIN "OPD_REG" opd ON i.patient_id = opd.patient_id
      WHERE i."organizationId" = ${orgId}
        AND i.status ILIKE 'cancelled'
        AND i.updated_at >= ${toStartOfDay(date_start)}
        AND i.updated_at <= ${toEndOfDay(date_end)}
      ORDER BY DATE(i.updated_at) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.original_amount += Number(row.original_amount || 0);
      return acc;
    }, { original_amount: 0 });
    return {
      rows: rows.map(r => ({
        ...r,
        original_amount: Number(r.original_amount)
      })),
      totals
    };
  },
};

export const billingServiceTypeSummaryReport: ReportDefinition = {
  id: 'billing-service-type-summary',
  category: ReportCategory.Billing,
  name: 'Billing - Service Type Summary',
  description: 'Aggregate billed amounts grouped by broad service categories.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'service_category', label: 'Service Category', type: 'string' },
    { key: 'invoice_count', label: 'Invoice Count', type: 'number', total: 'sum' },
    { key: 'total_billed', label: 'Total Billed Amount', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'total_billed', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.billing.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(ii.service_category, ii.department, 'Other') as "service_category",
        COUNT(DISTINCT ii.invoice_id) as "invoice_count",
        SUM(ii.total_price) as "total_billed"
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i."organizationId" = ${orgId}
        AND LOWER(i.status) = 'final'
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
      GROUP BY COALESCE(ii.service_category, ii.department, 'Other')
      ORDER BY SUM(ii.total_price) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.invoice_count += Number(row.invoice_count || 0);
      acc.total_billed += Number(row.total_billed || 0);
      return acc;
    }, { invoice_count: 0, total_billed: 0 });
    return {
      rows: rows.map(r => ({
        ...r,
        invoice_count: Number(r.invoice_count),
        total_billed: Number(r.total_billed)
      })),
      totals
    };
  },
};
