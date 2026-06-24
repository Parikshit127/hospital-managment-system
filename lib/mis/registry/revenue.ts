import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/backend/db';
import { ReportDefinition, ReportCategory, ValidatedFilters } from '../types';

// ── Timezone-safe date boundary helpers ─────────────────────────────────
const toStartOfDay = (d: string | Date): Date =>
  typeof d === 'string' && !d.includes('T') ? new Date(d + 'T00:00:00.000Z') : new Date(d as string);
const toEndOfDay = (d: string | Date): Date =>
  typeof d === 'string' && !d.includes('T') ? new Date(d + 'T23:59:59.999Z') : new Date(d as string);

export const revenueDepartmentWiseReport: ReportDefinition = {
  id: 'revenue-department-wise',
  category: ReportCategory.Revenue,
  name: 'Revenue - Department Wise',
  description: 'Aggregate net revenue grouped strictly by hospital department.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'department_name', label: 'Department Name', type: 'string' },
    { key: 'total_services_billed', label: 'Total Services Billed', type: 'number', total: 'sum' },
    { key: 'total_revenue', label: 'Total Revenue', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'total_revenue', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.revenue.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(ii.department, 'Other') as "department_name",
        COUNT(ii.id) as "total_services_billed",
        SUM(ii.total_price) as "total_revenue"
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i."organizationId" = ${orgId}
        AND i.status != 'cancelled'
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
      GROUP BY COALESCE(ii.department, 'Other')
      ORDER BY SUM(ii.total_price) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.total_services_billed += Number(row.total_services_billed || 0);
      acc.total_revenue += Number(row.total_revenue || 0);
      return acc;
    }, { total_services_billed: 0, total_revenue: 0 });
    return { 
      rows: rows.map(r => ({ 
        ...r, 
        total_services_billed: Number(r.total_services_billed),
        total_revenue: Number(r.total_revenue)
      })), 
      totals 
    };
  },
};

export const revenuePayerTypeWiseReport: ReportDefinition = {
  id: 'revenue-payer-type-wise',
  category: ReportCategory.Revenue,
  name: 'Revenue - Payer Type Wise',
  description: 'Aggregate revenue grouped by Payer Type (e.g., Cash, Corporate, TPA).',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'payer_type', label: 'Payer Type', type: 'string' },
    { key: 'total_invoices', label: 'Total Invoices', type: 'number', total: 'sum' },
    { key: 'total_billed', label: 'Total Billed', type: 'currency', total: 'sum' },
    { key: 'total_collected', label: 'Total Collected', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'total_billed', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.revenue.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        UPPER(i.billing_patient_type) as "payer_type",
        COUNT(i.id) as "total_invoices",
        SUM(i.total_amount) as "total_billed",
        SUM(i.paid_amount) as "total_collected"
      FROM invoices i
      WHERE i."organizationId" = ${orgId}
        AND i.status != 'cancelled'
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
      GROUP BY UPPER(i.billing_patient_type)
      ORDER BY SUM(i.total_amount) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.total_invoices += Number(row.total_invoices || 0);
      acc.total_billed += Number(row.total_billed || 0);
      acc.total_collected += Number(row.total_collected || 0);
      return acc;
    }, { total_invoices: 0, total_billed: 0, total_collected: 0 });
    return { 
      rows: rows.map(r => ({ 
        ...r, 
        total_invoices: Number(r.total_invoices),
        total_billed: Number(r.total_billed),
        total_collected: Number(r.total_collected)
      })), 
      totals 
    };
  },
};

export const revenuePayerNameWiseReport: ReportDefinition = {
  id: 'revenue-payer-name-wise',
  category: ReportCategory.Revenue,
  name: 'Revenue - Payer Name Wise',
  description: 'Aggregate revenue grouped by the specific Payer/Corporate Company name.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    payer_type: z.string().optional(),
  }),
  columns: [
    { key: 'payer_name', label: 'Payer Name', type: 'string' },
    { key: 'total_patients', label: 'Total Patients', type: 'number', total: 'sum' },
    { key: 'total_billed', label: 'Total Billed', type: 'currency', total: 'sum' },
    { key: 'outstanding', label: 'Outstanding', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'total_billed', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.revenue.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, payer_type } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(cm.company_name, ip.provider_name, 'Self-Pay / Cash') as "payer_name",
        COUNT(DISTINCT i.patient_id) as "total_patients",
        SUM(i.total_amount) as "total_billed",
        SUM(i.balance_due) as "outstanding"
      FROM invoices i
      LEFT JOIN corporate_masters cm ON i.corporate_id = cm.id
      LEFT JOIN insurance_providers ip ON i.tpa_provider_id = ip.id
      WHERE i."organizationId" = ${orgId}
        AND i.status != 'cancelled'
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
        ${payer_type ? Prisma.sql`AND i.billing_patient_type = ${payer_type}` : Prisma.empty}
      GROUP BY COALESCE(cm.company_name, ip.provider_name, 'Self-Pay / Cash')
      ORDER BY SUM(i.total_amount) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.total_patients += Number(row.total_patients || 0);
      acc.total_billed += Number(row.total_billed || 0);
      acc.outstanding += Number(row.outstanding || 0);
      return acc;
    }, { total_patients: 0, total_billed: 0, outstanding: 0 });
    return { 
      rows: rows.map(r => ({ 
        ...r, 
        total_patients: Number(r.total_patients),
        total_billed: Number(r.total_billed),
        outstanding: Number(r.outstanding)
      })), 
      totals 
    };
  },
};

export const revenueServiceTypeWiseReport: ReportDefinition = {
  id: 'revenue-service-type-wise',
  category: ReportCategory.Revenue,
  name: 'Revenue - Service Type Wise',
  description: 'Detailed revenue breakdown by specific service names/types within billing categories.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    // Bug 3A fix: was `department_id` mapped to clinical departments master—
    // this report groups by invoice_items.service_category (billing category)
    // NOT by the clinical Department entity. Use service_category instead.
    service_category: z.string().optional(),
  }),
  columns: [
    { key: 'service_name', label: 'Service Name', type: 'string' },
    { key: 'service_category', label: 'Service Category', type: 'string' },
    { key: 'frequency', label: 'Frequency', type: 'number', total: 'sum' },
    { key: 'gross_revenue', label: 'Gross Revenue', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'gross_revenue', direction: 'desc' },
  rowLimitSync: 5000,
  // Bug 3A fix: use showServiceCategory (billing categories: Package/Inventory/Pharmacy)
  // NOT showDepartment (clinical departments fetched from /api/departments)
  filterSpec: {
    showServiceCategory: true,
  },
  requiredPermission: 'mis_reports.revenue.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, service_category } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(ii.description, ii.service_category, 'Unknown') as "service_name",
        COALESCE(ii.service_category, 'Other') as "service_category",
        COUNT(ii.id) as "frequency",
        SUM(ii.total_price) as "gross_revenue"
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i."organizationId" = ${orgId}
        AND i.status != 'cancelled'
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
        ${service_category ? Prisma.sql`AND ii.service_category = ${service_category}` : Prisma.empty}
      GROUP BY COALESCE(ii.description, ii.service_category, 'Unknown'), COALESCE(ii.service_category, 'Other')
      ORDER BY SUM(ii.total_price) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.frequency += Number(row.frequency || 0);
      acc.gross_revenue += Number(row.gross_revenue || 0);
      return acc;
    }, { frequency: 0, gross_revenue: 0 });
    return { 
      rows: rows.map(r => ({ 
        ...r, 
        frequency: Number(r.frequency),
        gross_revenue: Number(r.gross_revenue)
      })), 
      totals 
    };
  },
};


export const revenueBillingCategoryWiseReport: ReportDefinition = {
  id: 'revenue-billing-category-wise',
  category: ReportCategory.Revenue,
  name: 'Revenue - Billing Category Wise',
  description: 'Aggregate revenue based on patient billing category (e.g., General, VIP, Staff).',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'patient_category', label: 'Patient Category', type: 'string' },
    { key: 'invoice_count', label: 'Invoice Count', type: 'number', total: 'sum' },
    { key: 'total_revenue', label: 'Total Revenue', type: 'currency', total: 'sum' },
    { key: 'avg_revenue', label: 'Avg Revenue per Patient', type: 'currency' },
  ],
  defaultSort: { column: 'total_revenue', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.revenue.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // We fall back to using invoice_type (OPD, IPD, ER) as category since there isn't a direct category flag
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        UPPER(i.invoice_type) as "patient_category",
        COUNT(i.id) as "invoice_count",
        SUM(i.total_amount) as "total_revenue",
        SUM(i.total_amount) / NULLIF(COUNT(DISTINCT i.patient_id), 0) as "avg_revenue"
      FROM invoices i
      WHERE i."organizationId" = ${orgId}
        AND i.status != 'cancelled'
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
      GROUP BY UPPER(i.invoice_type)
      ORDER BY SUM(i.total_amount) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.invoice_count += Number(row.invoice_count || 0);
      acc.total_revenue += Number(row.total_revenue || 0);
      return acc;
    }, { invoice_count: 0, total_revenue: 0 });
    return { 
      rows: rows.map(r => ({ 
        ...r, 
        invoice_count: Number(r.invoice_count),
        total_revenue: Number(r.total_revenue),
        avg_revenue: Number(r.avg_revenue)
      })), 
      totals 
    };
  },
};

export const revenueWardWiseReport: ReportDefinition = {
  id: 'revenue-ward-wise',
  category: ReportCategory.Revenue,
  name: 'Revenue - Ward Wise',
  description: 'Aggregate IPD revenue grouped by the Ward/Bed Category the patient was admitted to.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'ward_name', label: 'Ward Name', type: 'string' },
    { key: 'total_admissions', label: 'Total Admissions', type: 'number', total: 'sum' },
    { key: 'bed_charges_billed', label: 'Bed Charges Billed', type: 'currency', total: 'sum' },
    { key: 'total_ward_revenue', label: 'Total Ward Revenue', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'total_ward_revenue', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.revenue.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(w.ward_name, 'Unknown Ward') as "ward_name",
        COUNT(DISTINCT a.admission_id) as "total_admissions",
        SUM(CASE WHEN ii.department ILIKE '%bed%' OR ii.department ILIKE '%ward%' THEN ii.total_price ELSE 0 END) as "bed_charges_billed",
        SUM(ii.total_price) as "total_ward_revenue"
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN admissions a ON i.admission_id = a.admission_id
      LEFT JOIN wards w ON a.ward_id = w.ward_id
      WHERE i."organizationId" = ${orgId}
        AND i.status != 'cancelled'
        AND i.invoice_type = 'IPD'
        AND i.created_at >= ${toStartOfDay(date_start)}
        AND i.created_at <= ${toEndOfDay(date_end)}
      GROUP BY COALESCE(w.ward_name, 'Unknown Ward')
      ORDER BY SUM(ii.total_price) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.total_admissions += Number(row.total_admissions || 0);
      acc.bed_charges_billed += Number(row.bed_charges_billed || 0);
      acc.total_ward_revenue += Number(row.total_ward_revenue || 0);
      return acc;
    }, { total_admissions: 0, bed_charges_billed: 0, total_ward_revenue: 0 });
    return { 
      rows: rows.map(r => ({ 
        ...r, 
        total_admissions: Number(r.total_admissions),
        bed_charges_billed: Number(r.bed_charges_billed),
        total_ward_revenue: Number(r.total_ward_revenue)
      })), 
      totals 
    };
  },
};
