import { z } from 'zod';
import { prisma } from '@/backend/db';
import { ReportDefinition, ReportCategory, ValidatedFilters } from '../types';

// ── Timezone-safe date boundary helpers ─────────────────────────────────
const toStartOfDay = (d: string | Date): Date =>
  typeof d === 'string' && !d.includes('T') ? new Date(d + 'T00:00:00.000Z') : new Date(d as string);
const toEndOfDay = (d: string | Date): Date =>
  typeof d === 'string' && !d.includes('T') ? new Date(d + 'T23:59:59.999Z') : new Date(d as string);

const defaultFilters = z.object({
  date_start: z.string().or(z.date()),
  date_end: z.string().or(z.date()),
});

// ─── Batch 21: OT & Ambulance (SN 80–82, 99–101) ────────

export const otBookingDetailsReport: ReportDefinition = {
  id: 'ot-booking-details',
  category: ReportCategory.OT,
  name: 'OT & Cathlab - OT Booking Details',
  description: 'Details of all scheduled surgeries in the OT & Cathlab.',
  filters: defaultFilters,
  columns: [
    { key: 'scheduled_date', label: 'Scheduled Date', type: 'date' },
    { key: 'request_number', label: 'Request Number', type: 'string' },
    { key: 'surgery_name', label: 'Surgery Name', type: 'string' },
    { key: 'urgency', label: 'Urgency', type: 'string' },
    { key: 'status', label: 'Status', type: 'string' },
    { key: 'start_time', label: 'Scheduled Start', type: 'string' },
    { key: 'end_time', label: 'Scheduled End', type: 'string' },
  ],
  defaultSort: { column: 'scheduled_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.ot.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(s.scheduled_date) as "scheduled_date",
        r.request_number as "request_number",
        r.surgery_name as "surgery_name",
        r.urgency as "urgency",
        r.status as "status",
        s.start_time as "start_time",
        s.end_time as "end_time"
      FROM "ot_schedules" s
      JOIN "surgery_requests" r ON s.surgery_request_id = r.id
      WHERE r."organizationId" = ${orgId}
        AND s.scheduled_date >= ${toStartOfDay(date_start)}
        AND s.scheduled_date <= ${toEndOfDay(date_end)}
      ORDER BY s.scheduled_date DESC
    `;
    return { rows, totals: {} };
  },
};

export const otSurgeryDetailsReport: ReportDefinition = {
  id: 'ot-surgery-details',
  category: ReportCategory.OT,
  name: 'OT & Cathlab - OT Surgery Details',
  description: 'Detailed view of completed surgeries, complications, and durations.',
  filters: defaultFilters,
  columns: [
    { key: 'request_date', label: 'Date', type: 'date' },
    { key: 'request_number', label: 'Request No', type: 'string' },
    { key: 'surgery_name', label: 'Surgery Name', type: 'string' },
    { key: 'note_type', label: 'Note Type', type: 'string' },
    { key: 'duration_mins', label: 'Duration (mins)', type: 'number', total: 'sum' },
    { key: 'blood_loss_ml', label: 'Blood Loss (ml)', type: 'number', total: 'sum' },
    { key: 'complications', label: 'Complications', type: 'string' },
  ],
  defaultSort: { column: 'request_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.ot.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(r.created_at) as "request_date",
        r.request_number as "request_number",
        r.surgery_name as "surgery_name",
        n.note_type as "note_type",
        n.duration_mins as "duration_mins",
        n.blood_loss_ml as "blood_loss_ml",
        n.complications as "complications"
      FROM "surgery_requests" r
      LEFT JOIN "surgery_notes" n ON r.id = n.surgery_request_id
      WHERE r."organizationId" = ${orgId}
        AND r.created_at >= ${toStartOfDay(date_start)}
        AND r.created_at <= ${toEndOfDay(date_end)}
      ORDER BY r.created_at DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.duration_mins += Number(row.duration_mins || 0);
      acc.blood_loss_ml += Number(row.blood_loss_ml || 0);
      return acc;
    }, { duration_mins: 0, blood_loss_ml: 0 });
    return { rows, totals };
  },
};

export const otSurgeryTatReport: ReportDefinition = {
  id: 'ot-surgery-tat',
  category: ReportCategory.OT,
  name: 'OT & Cathlab - OT Surgery TAT Reports',
  description: 'Turnaround time tracking from wheel-in to wheel-out.',
  filters: defaultFilters,
  columns: [
    { key: 'request_number', label: 'Request No', type: 'string' },
    { key: 'surgery_name', label: 'Surgery Name', type: 'string' },
    { key: 'scheduled_date', label: 'Scheduled Date', type: 'date' },
    { key: 'wheel_in_time', label: 'Wheel In', type: 'string' },
    { key: 'wheel_out_time', label: 'Wheel Out', type: 'string' },
    { key: 'total_tat_mins', label: 'Total TAT (mins)', type: 'number', total: 'avg' },
  ],
  defaultSort: { column: 'scheduled_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.ot.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        r.request_number as "request_number",
        r.surgery_name as "surgery_name",
        s.scheduled_date as "scheduled_date",
        CAST(s.wheel_in_time AS TEXT) as "wheel_in_time",
        CAST(s.wheel_out_time AS TEXT) as "wheel_out_time",
        EXTRACT(EPOCH FROM (s.wheel_out_time - s.wheel_in_time))/60 as "total_tat_mins"
      FROM "ot_schedules" s
      JOIN "surgery_requests" r ON s.surgery_request_id = r.id
      WHERE r."organizationId" = ${orgId}
        AND s.actual_end IS NOT NULL
        AND s.scheduled_date >= ${toStartOfDay(date_start)}
        AND s.scheduled_date <= ${toEndOfDay(date_end)}
      ORDER BY s.scheduled_date DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.total_tat_mins += Number(row.total_tat_mins || 0);
      return acc;
    }, { total_tat_mins: 0 });
    if (rows.length) totals.total_tat_mins = Math.round(totals.total_tat_mins / rows.length);
    return { rows, totals };
  },
};

// ─── Phase C1: Ambulance Reports — Rewritten against ambulance_requests ──────
//
// BEFORE (Phase C audit finding §1.5):
//   All 3 reports queried system_audit_logs WHERE action = 'AMBULANCE_REQUEST'
//   and extracted JSON fields via ::jsonb->>'key'. This was fragile (JSON shape
//   changes silently break everything), duplicated data from the actual source,
//   and ambulanceTatReport hardcoded a fixed 15-minute TAT for every row.
//
// AFTER:
//   All 3 reports query the purpose-built ambulance_requests table whose
//   dispatch_tat_mins and total_tat_mins are written atomically by the app
//   on each status transition — no runtime computation needed.

export const ambulanceOrdersReport: ReportDefinition = {
  id: 'ambulance-orders',
  category: ReportCategory.Ambulance,
  name: 'Ambulance - Ambulance Orders',
  description: 'All ambulance orders with dispatch status, vehicle, and billing amount.',
  filters: defaultFilters,
  columns: [
    { key: 'date',           label: 'Date',             type: 'date' },
    { key: 'order_id',       label: 'Request No',        type: 'string' },
    { key: 'request_type',   label: 'Request Type',      type: 'string' },
    { key: 'status',         label: 'Status',            type: 'string' },
    { key: 'patient_name',   label: 'Patient Name',      type: 'string' },
    { key: 'vehicle_number', label: 'Vehicle No',        type: 'string' },
    { key: 'driver_name',    label: 'Driver',            type: 'string' },
    { key: 'pickup_address', label: 'Pickup Address',    type: 'string' },
    { key: 'destination',    label: 'Destination',       type: 'string' },
    { key: 'billing_amount', label: 'Billing Amount',    type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.ambulance.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        DATE(ar.requested_at)                                  AS "date",
        ar.request_number                                      AS "order_id",
        ar.request_type                                        AS "request_type",
        ar.status                                              AS "status",
        COALESCE(ar.patient_name, 'Unknown')                   AS "patient_name",
        COALESCE(ar.vehicle_number, '—')                       AS "vehicle_number",
        COALESCE(ar.driver_name,   '—')                        AS "driver_name",
        COALESCE(ar.pickup_address, '—')                       AS "pickup_address",
        COALESCE(ar.destination,   '—')                        AS "destination",
        COALESCE(ar.billing_amount, 0)                         AS "billing_amount"
      FROM "ambulance_requests" ar
      WHERE ar."organizationId" = ${orgId}
        AND ar.requested_at >= ${toStartOfDay(date_start)}
        AND ar.requested_at <= ${toEndOfDay(date_end)}
      ORDER BY ar.requested_at DESC
    `;

    const totals = rows.reduce((acc, row) => {
      acc.billing_amount += Number(row.billing_amount || 0);
      return acc;
    }, { billing_amount: 0 });

    return {
      rows: rows.map(r => ({ ...r, billing_amount: Number(r.billing_amount || 0) })),
      totals,
    };
  },
};

export const ambulanceRequestReport: ReportDefinition = {
  id: 'ambulance-request',
  category: ReportCategory.Ambulance,
  name: 'Ambulance - Ambulance Request',
  description: 'All incoming ambulance dispatch requests with contact and location details.',
  filters: defaultFilters,
  columns: [
    { key: 'request_date',  label: 'Request Date', type: 'date' },
    { key: 'request_id',    label: 'Request No',   type: 'string' },
    { key: 'type',          label: 'Type',          type: 'string' },
    { key: 'contact_phone', label: 'Contact Phone', type: 'string' },
    { key: 'location',      label: 'Pickup Address', type: 'string' },
    { key: 'destination',   label: 'Destination',   type: 'string' },
    { key: 'status',        label: 'Status',        type: 'string' },
  ],
  defaultSort: { column: 'request_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.ambulance.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // This report shows ALL requests (any status), not just 'Requested' —
    // the ambulanceOrdersReport already covers the all-status view.
    // Here we expose the request intake perspective with contact details
    // so the control room can see who called and from where.
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        DATE(ar.requested_at)                   AS "request_date",
        ar.request_number                        AS "request_id",
        ar.request_type                          AS "type",
        COALESCE(ar.contact_phone, '—')          AS "contact_phone",
        COALESCE(ar.pickup_address, '—')         AS "location",
        COALESCE(ar.destination,   '—')          AS "destination",
        ar.status                                AS "status"
      FROM "ambulance_requests" ar
      WHERE ar."organizationId" = ${orgId}
        AND ar.requested_at >= ${toStartOfDay(date_start)}
        AND ar.requested_at <= ${toEndOfDay(date_end)}
      ORDER BY ar.requested_at DESC
    `;
    return { rows, totals: {} };
  },
};

export const ambulanceTatReport: ReportDefinition = {
  id: 'ambulance-tat',
  category: ReportCategory.Ambulance,
  name: 'Ambulance - Ambulance TAT',
  description: 'Accurate dispatch and total turnaround times for all completed ambulance runs.',
  filters: defaultFilters,
  columns: [
    { key: 'date',               label: 'Date',                   type: 'date' },
    { key: 'request_id',         label: 'Request No',              type: 'string' },
    { key: 'patient_name',       label: 'Patient',                 type: 'string' },
    { key: 'status',             label: 'Status',                  type: 'string' },
    { key: 'requested_at',       label: 'Requested At',            type: 'string' },
    { key: 'dispatched_at',      label: 'Dispatched At',           type: 'string' },
    { key: 'completed_at',       label: 'Completed At',            type: 'string' },
    { key: 'dispatch_tat_mins',  label: 'Dispatch TAT (mins)',     type: 'number', total: 'avg' },
    { key: 'tat_mins',           label: 'Total TAT (mins)',        type: 'number', total: 'avg' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.ambulance.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // Only completed requests have meaningful TAT data — Cancelled and still-open
    // requests are excluded so averages are not polluted by NULL or zero values.
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        DATE(ar.requested_at)                                          AS "date",
        ar.request_number                                              AS "request_id",
        COALESCE(ar.patient_name, 'Unknown')                           AS "patient_name",
        ar.status                                                      AS "status",
        TO_CHAR(ar.requested_at  AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS "requested_at",
        TO_CHAR(ar.dispatched_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS "dispatched_at",
        TO_CHAR(ar.completed_at  AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS "completed_at",
        ar.dispatch_tat_mins                                           AS "dispatch_tat_mins",
        ar.total_tat_mins                                              AS "tat_mins"
      FROM "ambulance_requests" ar
      WHERE ar."organizationId" = ${orgId}
        AND ar.status = 'Completed'
        AND ar.requested_at >= ${toStartOfDay(date_start)}
        AND ar.requested_at <= ${toEndOfDay(date_end)}
      ORDER BY ar.requested_at DESC
    `;

    // Compute averages for the footer; skip NULLs so partial dispatches don't drag
    // down the dispatch_tat average if they were never actually dispatched.
    const dispatchRows = rows.filter(r => r.dispatch_tat_mins != null);
    const totalRows    = rows.filter(r => r.tat_mins != null);

    const avgDispatch = dispatchRows.length
      ? Math.round(dispatchRows.reduce((s, r) => s + Number(r.dispatch_tat_mins), 0) / dispatchRows.length)
      : 0;
    const avgTotal = totalRows.length
      ? Math.round(totalRows.reduce((s, r) => s + Number(r.tat_mins), 0) / totalRows.length)
      : 0;

    return {
      rows: rows.map(r => ({
        ...r,
        dispatch_tat_mins: r.dispatch_tat_mins != null ? Number(r.dispatch_tat_mins) : null,
        tat_mins:          r.tat_mins          != null ? Number(r.tat_mins)          : null,
      })),
      totals: { dispatch_tat_mins: avgDispatch, tat_mins: avgTotal },
    };
  },
};

// ─── Phase C2: Optical Reports — Rewritten against optical_orders ──────────
//
// BEFORE (Phase C audit finding §1.6):
//   All 5 reports used `ii.department ILIKE '%Optical%'` on invoice_items.
//   This silently misses data whenever a department is named "Vision Care",
//   "Optometry", or "optical services". It also had no structural link to
//   lens/frame/accessory granularity — it just read generic invoice line items.
//
// AFTER:
//   Optical item-level reports query optical_order_items (exact item_type
//   discrimination). Settlement/payment reports join optical_orders to the
//   invoices table via the invoice_id FK written at order creation time.
//   This makes optical data structurally isolated and schema-enforced.

export const opticalItemBillingReport: ReportDefinition = {
  id: 'optical-item-billing',
  category: ReportCategory.Optical,
  name: 'Optical - Optical Item Billing Details',
  description: 'Granular line-item breakdown of every optical order item billed.',
  filters: defaultFilters,
  columns: [
    { key: 'date',         label: 'Date',          type: 'date' },
    { key: 'invoice_number', label: 'Invoice No',  type: 'string' },
    { key: 'order_number', label: 'Order No',       type: 'string' },
    { key: 'item_type',    label: 'Item Type',      type: 'string' },
    { key: 'item_name',    label: 'Item Name',      type: 'string' },
    { key: 'quantity',     label: 'Quantity',       type: 'number', total: 'sum' },
    { key: 'unit_price',   label: 'Unit Price',     type: 'currency' },
    { key: 'total_amount', label: 'Total Amount',   type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.optical.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        DATE(oo.order_date)                                AS "date",
        COALESCE(i.invoice_number, '—')                    AS "invoice_number",
        oo.order_number                                    AS "order_number",
        oi.item_type                                       AS "item_type",
        oi.item_name                                       AS "item_name",
        oi.quantity                                        AS "quantity",
        oi.unit_price                                      AS "unit_price",
        oi.total_price                                     AS "total_amount"
      FROM "optical_order_items" oi
      JOIN "optical_orders"      oo ON oi.order_id = oo.id
      LEFT JOIN "invoices"        i  ON oo.invoice_id = i.id::text
      WHERE oo."organizationId" = ${orgId}
        AND oo.order_date >= ${toStartOfDay(date_start)}
        AND oo.order_date <= ${toEndOfDay(date_end)}
      ORDER BY oo.order_date DESC, oo.order_number, oi.id
    `;

    const totals = rows.reduce((acc, row) => {
      acc.quantity     += Number(row.quantity     || 0);
      acc.total_amount += Number(row.total_amount || 0);
      return acc;
    }, { quantity: 0, total_amount: 0 });

    return {
      rows: rows.map(r => ({
        ...r,
        quantity:     Number(r.quantity     || 0),
        unit_price:   Number(r.unit_price   || 0),
        total_amount: Number(r.total_amount || 0),
      })),
      totals,
    };
  },
};

export const opticalProductBillingReport: ReportDefinition = {
  id: 'optical-product-billing',
  category: ReportCategory.Optical,
  name: 'Optical - Optical Product Billing Details',
  description: 'Aggregated product-level breakdown of optical sales by item name and type.',
  filters: defaultFilters,
  columns: [
    { key: 'item_type',            label: 'Item Type',       type: 'string' },
    { key: 'product_name',         label: 'Product Name',    type: 'string' },
    { key: 'total_quantity_sold',  label: 'Qty Sold',        type: 'number', total: 'sum' },
    { key: 'total_revenue',        label: 'Total Revenue',   type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'total_revenue', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.optical.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // Grouped by item_type + item_name to give type-level subtotals
    // (e.g. all "Crizal Forte" lenses sold across all orders in the period).
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        oi.item_type                                       AS "item_type",
        oi.item_name                                       AS "product_name",
        SUM(oi.quantity)                                   AS "total_quantity_sold",
        SUM(oi.total_price)                                AS "total_revenue"
      FROM "optical_order_items" oi
      JOIN "optical_orders" oo ON oi.order_id = oo.id
      WHERE oo."organizationId" = ${orgId}
        AND oo.order_date >= ${toStartOfDay(date_start)}
        AND oo.order_date <= ${toEndOfDay(date_end)}
      GROUP BY oi.item_type, oi.item_name
      ORDER BY SUM(oi.total_price) DESC
    `;

    const totals = rows.reduce((acc, row) => {
      acc.total_quantity_sold += Number(row.total_quantity_sold || 0);
      acc.total_revenue       += Number(row.total_revenue       || 0);
      return acc;
    }, { total_quantity_sold: 0, total_revenue: 0 });

    return {
      rows: rows.map(r => ({
        ...r,
        total_quantity_sold: Number(r.total_quantity_sold || 0),
        total_revenue:       Number(r.total_revenue       || 0),
      })),
      totals,
    };
  },
};

export const opticalDailySettlementReport: ReportDefinition = {
  id: 'optical-daily-settlement',
  category: ReportCategory.Optical,
  name: 'Optical - Optical Daily Settlement Report',
  description: 'Individual payment transactions received against optical orders.',
  filters: defaultFilters,
  columns: [
    { key: 'date',           label: 'Date',            type: 'date' },
    { key: 'order_number',   label: 'Order No',         type: 'string' },
    { key: 'invoice_number', label: 'Invoice No',       type: 'string' },
    { key: 'patient_id',     label: 'Patient ID',       type: 'string' },
    { key: 'payment_method', label: 'Payment Method',   type: 'string' },
    { key: 'settled_amount', label: 'Settled Amount',   type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.optical.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // Join path: optical_orders → invoices → payments
    // Only optical orders that have a linked invoice can have payments.
    // Orders without an invoice_id (advance-only or unbilled) show no settlement rows.
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        DATE(p.created_at)                                 AS "date",
        oo.order_number                                    AS "order_number",
        i.invoice_number                                   AS "invoice_number",
        oo.patient_id                                      AS "patient_id",
        p.payment_method                                   AS "payment_method",
        p.amount                                           AS "settled_amount"
      FROM "optical_orders" oo
      JOIN "invoices"  i  ON oo.invoice_id = i.id::text
      JOIN "payments"  p  ON p.invoice_id  = i.id
      WHERE oo."organizationId" = ${orgId}
        AND p.status = 'Completed'
        AND p.created_at >= ${toStartOfDay(date_start)}
        AND p.created_at <= ${toEndOfDay(date_end)}
      ORDER BY p.created_at DESC
    `;

    const totals = rows.reduce((acc, row) => {
      acc.settled_amount += Number(row.settled_amount || 0);
      return acc;
    }, { settled_amount: 0 });

    return {
      rows: rows.map(r => ({ ...r, settled_amount: Number(r.settled_amount || 0) })),
      totals,
    };
  },
};

export const opticalDailySettlementSumReport: ReportDefinition = {
  id: 'optical-daily-settlement-sum',
  category: ReportCategory.Optical,
  name: 'Optical - Optical Daily Settlement Sum Report',
  description: 'Aggregate daily collections for optical department, grouped by payment mode.',
  filters: defaultFilters,
  columns: [
    { key: 'date',           label: 'Date',            type: 'date' },
    { key: 'payment_method', label: 'Payment Method',  type: 'string' },
    { key: 'order_count',    label: 'Orders',          type: 'number', total: 'sum' },
    { key: 'total_settled',  label: 'Total Settled',   type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.optical.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        DATE(p.created_at)                                 AS "date",
        p.payment_method                                   AS "payment_method",
        COUNT(DISTINCT oo.id)                              AS "order_count",
        SUM(p.amount)                                      AS "total_settled"
      FROM "optical_orders" oo
      JOIN "invoices"  i  ON oo.invoice_id = i.id::text
      JOIN "payments"  p  ON p.invoice_id  = i.id
      WHERE oo."organizationId" = ${orgId}
        AND p.status = 'Completed'
        AND p.created_at >= ${toStartOfDay(date_start)}
        AND p.created_at <= ${toEndOfDay(date_end)}
      GROUP BY DATE(p.created_at), p.payment_method
      ORDER BY DATE(p.created_at) DESC, SUM(p.amount) DESC
    `;

    const totals = rows.reduce((acc, row) => {
      acc.order_count   += Number(row.order_count   || 0);
      acc.total_settled += Number(row.total_settled || 0);
      return acc;
    }, { order_count: 0, total_settled: 0 });

    return {
      rows: rows.map(r => ({
        ...r,
        order_count:   Number(r.order_count   || 0),
        total_settled: Number(r.total_settled || 0),
      })),
      totals,
    };
  },
};

export const opticalPaymentReport: ReportDefinition = {
  id: 'optical-payment',
  category: ReportCategory.Optical,
  name: 'Optical - Optical Payment Report',
  description: 'Order-level payment status showing billed amount, collections, and balance due.',
  filters: defaultFilters,
  columns: [
    { key: 'order_date',          label: 'Order Date',      type: 'date' },
    { key: 'order_number',        label: 'Order No',         type: 'string' },
    { key: 'patient_id',          label: 'Patient ID',       type: 'string' },
    { key: 'status',              label: 'Order Status',     type: 'string' },
    { key: 'billed_amount',       label: 'Billed Amount',    type: 'currency', total: 'sum' },
    { key: 'advance_paid',        label: 'Advance Paid',     type: 'currency', total: 'sum' },
    { key: 'balance_due',         label: 'Balance Due',      type: 'currency', total: 'sum' },
    { key: 'last_payment_method', label: 'Payment Mode',     type: 'string' },
  ],
  defaultSort: { column: 'order_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.optical.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // The source of truth for billing figures is OpticalOrder itself
    // (total_amount, advance_paid, balance_due are maintained by the app).
    // The last payment method is derived from the linked invoice → payments.
    // We use MAX(p.payment_method) as a stable aggregate to pick the most
    // recent non-null payment method without a subquery.
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        DATE(oo.order_date)                                AS "order_date",
        oo.order_number                                    AS "order_number",
        oo.patient_id                                      AS "patient_id",
        oo.status                                          AS "status",
        oo.total_amount                                    AS "billed_amount",
        oo.advance_paid                                    AS "advance_paid",
        oo.balance_due                                     AS "balance_due",
        COALESCE(
          (
            SELECT p2.payment_method
            FROM   "payments" p2
            WHERE  p2.invoice_id::text = oo.invoice_id
              AND  p2.status = 'Completed'
            ORDER  BY p2.created_at DESC
            LIMIT  1
          ),
          '—'
        )                                                  AS "last_payment_method"
      FROM "optical_orders" oo
      WHERE oo."organizationId" = ${orgId}
        AND oo.order_date >= ${toStartOfDay(date_start)}
        AND oo.order_date <= ${toEndOfDay(date_end)}
      ORDER BY oo.order_date DESC
    `;

    const totals = rows.reduce((acc, row) => {
      acc.billed_amount += Number(row.billed_amount || 0);
      acc.advance_paid  += Number(row.advance_paid  || 0);
      acc.balance_due   += Number(row.balance_due   || 0);
      return acc;
    }, { billed_amount: 0, advance_paid: 0, balance_due: 0 });

    return {
      rows: rows.map(r => ({
        ...r,
        billed_amount: Number(r.billed_amount || 0),
        advance_paid:  Number(r.advance_paid  || 0),
        balance_due:   Number(r.balance_due   || 0),
      })),
      totals,
    };
  },
};
