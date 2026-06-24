import { z } from 'zod';
import { Prisma } from '@prisma/client';
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

const defaultFiltersWithStore = z.object({
  date_start: z.string().or(z.date()),
  date_end: z.string().or(z.date()),
  store_id: z.string().optional(),
});

// ─── Batch 17: Inventory — Stock & GRN Core (SN 83–86) ────────

export const inventoryStockReport: ReportDefinition = {
  id: 'inventory-stock',
  category: ReportCategory.Inventory,
  name: 'Inventory - Inventory Stock',
  description: 'Aggregated stock valuation and items count across all stores.',
  filters: z.object({
    store_id: z.string().optional(),
  }),
  // D3 Directive: showStore added — user needs store dropdown to filter aggregate per-store.
  filterSpec: { showStore: true },
  columns: [
    { key: 'store_name', label: 'Store Name', type: 'string' },
    { key: 'total_items', label: 'Total Unique Items', type: 'number' },
    { key: 'total_stock', label: 'Total Quantity on Hand', type: 'number' },
    { key: 'total_value', label: 'Total Stock Value', type: 'currency' },
  ],
  defaultSort: { column: 'store_name', direction: 'asc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.inventory.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { store_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        s.name as "store_name",
        COUNT(DISTINCT ss.item_id) as "total_items",
        SUM(ss.quantity_on_hand) as "total_stock",
        SUM(ss.quantity_on_hand * ss.avg_unit_cost) as "total_value"
      FROM "store_stocks" ss
      JOIN "stores" s ON ss.store_id = s.id
      WHERE ss."organizationId" = ${orgId}
        ${store_id ? Prisma.sql`AND ss.store_id = ${parseInt(store_id)}` : Prisma.empty}
      GROUP BY s.id, s.name
      ORDER BY s.name ASC
    `;
    return { 
      rows: rows.map(r => ({
        ...r,
        total_items: Number(r.total_items || 0),
        total_stock: Number(r.total_stock || 0),
        total_value: Number(r.total_value || 0),
      })), 
      totals: {} 
    };
  },
};

export const inventoryItemWiseStockReport: ReportDefinition = {
  id: 'inventory-item-wise-stock',
  category: ReportCategory.Inventory,
  name: 'Inventory - Item Wise Stock',
  description: 'Total aggregate stock and value across the organization grouped by item.',
  filters: z.object({
    store_id: z.string().optional(),
  }),
  // D3 Directive: showStore added — item-wise stock is most useful when filtered to a single store.
  filterSpec: { showStore: true },
  columns: [
    { key: 'item_code', label: 'Item Code', type: 'string' },
    { key: 'item_name', label: 'Item Name', type: 'string' },
    { key: 'item_type', label: 'Item Type', type: 'string' },
    { key: 'store_name', label: 'Store', type: 'string' },
    { key: 'total_stock', label: 'Total Quantity on Hand', type: 'number' },
    { key: 'total_value', label: 'Total Stock Value', type: 'currency' },
  ],
  defaultSort: { column: 'item_name', direction: 'asc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.inventory.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { store_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        i.name as "item_name",
        i.item_code as "item_code",
        i.item_type as "item_type",
        s.name as "store_name",
        SUM(ss.quantity_on_hand) as "total_stock",
        SUM(ss.quantity_on_hand * ss.avg_unit_cost) as "total_value"
      FROM "store_stocks" ss
      JOIN "item_master" i ON ss.item_id = i.id
      JOIN "stores" s ON ss.store_id = s.id
      WHERE ss."organizationId" = ${orgId}
        ${store_id ? Prisma.sql`AND ss.store_id = ${parseInt(store_id)}` : Prisma.empty}
      GROUP BY i.name, i.item_code, i.item_type, s.name
      ORDER BY i.name ASC
    `;
    return { 
      rows: rows.map(r => ({
        ...r,
        total_stock: Number(r.total_stock || 0),
        total_value: Number(r.total_value || 0),
      })), 
      totals: {} 
    };
  },
};

export const inventoryGrnSummaryReport: ReportDefinition = {
  id: 'inventory-grn-summary',
  category: ReportCategory.Inventory,
  name: 'Inventory - GRN Summary',
  description: 'Daily aggregate summary of Goods Receipt Notes.',
  filters: defaultFilters,
  columns: [
    { key: 'grn_date', label: 'GRN Date', type: 'date' },
    { key: 'vendor_name', label: 'Vendor Name', type: 'string' },
    { key: 'total_grns', label: 'Total GRNs', type: 'number' },
    { key: 'total_amount', label: 'Total Amount', type: 'currency' },
    { key: 'total_rejected', label: 'Total Rejected Qty', type: 'number' },
  ],
  defaultSort: { column: 'grn_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.inventory.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // total_rejected aggregated from item level (goods_receipt_note_items.quantity_rejected)
    // for accuracy — the GRN header's rejected_quantity field is a denormalised summary only.
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(g.received_at) as "grn_date",
        v.vendor_name as "vendor_name",
        COUNT(DISTINCT g.id) as "total_grns",
        SUM(g.total_amount) as "total_amount",
        SUM(gi.quantity_rejected) as "total_rejected"
      FROM "goods_receipt_notes" g
      LEFT JOIN "vendors" v ON g.vendor_id = v.id
      LEFT JOIN "goods_receipt_note_items" gi ON gi.grn_id = g.id
      WHERE g."organizationId" = ${orgId}
        AND g.received_at >= ${toStartOfDay(date_start)}
        AND g.received_at <= ${toEndOfDay(date_end)}
      GROUP BY DATE(g.received_at), v.vendor_name
      ORDER BY DATE(g.received_at) DESC
    `;
    return { 
      rows: rows.map(r => ({
        ...r,
        total_grns: Number(r.total_grns || 0),
        total_amount: Number(r.total_amount || 0),
        total_rejected: Number(r.total_rejected || 0),
      })), 
      totals: {} 
    };
  },
};

export const inventoryGrnReturnSummaryReport: ReportDefinition = {
  id: 'inventory-grn-return-summary',
  category: ReportCategory.Inventory,
  name: 'Inventory - GRN Return Summary',
  description: 'Daily aggregate summary of rejected or returned items during GRN processing.',
  filters: defaultFilters,
  columns: [
    { key: 'return_date', label: 'Return Date', type: 'date' },
    { key: 'vendor_name', label: 'Vendor Name', type: 'string' },
    { key: 'total_returns', label: 'Total Return Events', type: 'number' },
    { key: 'total_rejected_qty', label: 'Total Rejected Qty', type: 'number' },
  ],
  defaultSort: { column: 'return_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.inventory.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // Schema truth: rejection data lives on goods_receipt_note_items (schema L5563-5564).
    // "Return events" = count of distinct GRN-item lines that had any rejection.
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(g.received_at) as "return_date",
        v.vendor_name as "vendor_name",
        COUNT(gi.id) as "total_returns",
        SUM(gi.quantity_rejected) as "total_rejected_qty"
      FROM "goods_receipt_note_items" gi
      JOIN "goods_receipt_notes" g ON gi.grn_id = g.id
      LEFT JOIN "vendors" v ON g.vendor_id = v.id
      WHERE g."organizationId" = ${orgId}
        AND gi.quantity_rejected > 0
        AND g.received_at >= ${toStartOfDay(date_start)}
        AND g.received_at <= ${toEndOfDay(date_end)}
      GROUP BY DATE(g.received_at), v.vendor_name
      ORDER BY DATE(g.received_at) DESC
    `;
    return { 
      rows: rows.map(r => ({
        ...r,
        total_returns: Number(r.total_returns || 0),
        total_rejected_qty: Number(r.total_rejected_qty || 0),
      })), 
      totals: {} 
    };
  },
};

// ─── Batch 18: Inventory — Masters & GRN Details (SN 87–90) ──────────────

export const inventoryItemMasterReport: ReportDefinition = {
  id: 'inventory-item-master',
  category: ReportCategory.Inventory,
  name: 'Inventory - Item Master',
  description: 'Master list of all registered inventory items and their properties.',
  filters: z.object({}), // Master list — no date range required
  columns: [
    { key: 'item_code', label: 'Item Code', type: 'string' },
    { key: 'item_name', label: 'Item Name', type: 'string' },
    { key: 'item_type', label: 'Item Type', type: 'string' },
    { key: 'base_uom', label: 'Base UOM', type: 'string' },
    { key: 'std_purchase_price', label: 'Std Purchase Price', type: 'currency' },
    { key: 'mrp', label: 'MRP', type: 'currency' },
    { key: 'is_batch_tracked', label: 'Batch Tracked', type: 'string' },
    { key: 'is_expiry_tracked', label: 'Expiry Tracked', type: 'string' },
    { key: 'reorder_point', label: 'Reorder Point', type: 'number' },
    { key: 'status', label: 'Status', type: 'string' },
  ],
  defaultSort: { column: 'item_name', direction: 'asc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.inventory.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        i.item_code as "item_code",
        i.name as "item_name",
        i.item_type as "item_type",
        i.base_uom as "base_uom",
        i.std_purchase_price as "std_purchase_price",
        i.mrp as "mrp",
        CASE WHEN i.is_batch_tracked THEN 'Yes' ELSE 'No' END as "is_batch_tracked",
        CASE WHEN i.is_expiry_tracked THEN 'Yes' ELSE 'No' END as "is_expiry_tracked",
        i.reorder_point as "reorder_point",
        i.status as "status"
      FROM "item_master" i
      WHERE i."organizationId" = ${orgId}
      ORDER BY i.name ASC
    `;
    return { 
      rows: rows.map(r => ({
        ...r,
        std_purchase_price: Number(r.std_purchase_price || 0),
        mrp: Number(r.mrp || 0),
        reorder_point: Number(r.reorder_point || 0),
      })), 
      totals: {} 
    };
  },
};

export const inventoryGrnDetailReport: ReportDefinition = {
  id: 'inventory-grn-detail',
  category: ReportCategory.Inventory,
  name: 'Inventory - GRN Detail',
  description: 'Detailed log of Goods Receipt Notes and items received.',
  filters: defaultFilters,
  columns: [
    { key: 'grn_date', label: 'GRN Date', type: 'date' },
    { key: 'grn_number', label: 'GRN Number', type: 'string' },
    { key: 'vendor_name', label: 'Vendor Name', type: 'string' },
    { key: 'store_name', label: 'Store Name', type: 'string' },
    { key: 'item_name', label: 'Item Name', type: 'string' },
    { key: 'quantity', label: 'Quantity Accepted', type: 'number' },
    { key: 'unit_price', label: 'Unit Price', type: 'currency' },
    { key: 'total_amount', label: 'Total Amount', type: 'currency' },
  ],
  defaultSort: { column: 'grn_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.inventory.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(g.received_at) as "grn_date",
        g.grn_number as "grn_number",
        v.vendor_name as "vendor_name",
        s.name as "store_name",
        i.name as "item_name",
        gi.quantity_accepted as "quantity",
        gi.unit_price as "unit_price",
        (gi.quantity_accepted * gi.unit_price) as "total_amount"
      FROM "goods_receipt_note_items" gi
      JOIN "goods_receipt_notes" g ON gi.grn_id = g.id
      JOIN "item_master" i ON gi.item_id = i.id
      LEFT JOIN "vendors" v ON g.vendor_id = v.id
      LEFT JOIN "stores" s ON g.store_id = s.id
      WHERE g."organizationId" = ${orgId}
        AND g.received_at >= ${toStartOfDay(date_start)}
        AND g.received_at <= ${toEndOfDay(date_end)}
      ORDER BY g.received_at DESC
    `;
    return { 
      rows: rows.map(r => ({
        ...r,
        quantity: Number(r.quantity || 0),
        unit_price: Number(r.unit_price || 0),
        total_amount: Number(r.total_amount || 0),
      })), 
      totals: {} 
    };
  },
};

export const inventoryGrnReturnDetailReport: ReportDefinition = {
  id: 'inventory-grn-return-detail',
  category: ReportCategory.Inventory,
  name: 'Inventory - GRN Return Detail',
  description: 'Detailed log of items rejected during the GRN process.',
  filters: defaultFilters,
  columns: [
    { key: 'return_date', label: 'Return Date', type: 'date' },
    { key: 'grn_number', label: 'GRN Number', type: 'string' },
    { key: 'vendor_name', label: 'Vendor Name', type: 'string' },
    { key: 'item_name', label: 'Item Name', type: 'string' },
    { key: 'quantity_rejected', label: 'Quantity Rejected', type: 'number' },
    { key: 'reason', label: 'Rejection Reason', type: 'string' },
  ],
  defaultSort: { column: 'return_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.inventory.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // Schema truth: rejection data lives on goods_receipt_note_items (schema L5563-5564).
    // The GRN header also has a denormalised rejection_reason (schema L1918) but it is not
    // per-item granular. Always query at the item level for accurate detail reports.
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(g.received_at) as "return_date",
        g.grn_number as "grn_number",
        v.vendor_name as "vendor_name",
        i.name as "item_name",
        gi.quantity_rejected as "quantity_rejected",
        COALESCE(gi.rejection_reason, 'N/A') as "reason"
      FROM "goods_receipt_note_items" gi
      JOIN "goods_receipt_notes" g ON gi.grn_id = g.id
      JOIN "item_master" i ON gi.item_id = i.id
      LEFT JOIN "vendors" v ON g.vendor_id = v.id
      WHERE g."organizationId" = ${orgId}
        AND gi.quantity_rejected > 0
        AND g.received_at >= ${toStartOfDay(date_start)}
        AND g.received_at <= ${toEndOfDay(date_end)}
      ORDER BY g.received_at DESC
    `;
    return { 
      rows: rows.map(r => ({
        ...r,
        quantity_rejected: Number(r.quantity_rejected || 0),
      })), 
      totals: {} 
    };
  },
};

export const inventoryStoreToStoreIssueReport: ReportDefinition = {
  id: 'inventory-store-to-store-issue',
  category: ReportCategory.Inventory,
  name: 'Inventory - Store to Store Item Issue',
  description: 'Log of inventory stock transfers between internal stores.',
  filters: defaultFiltersWithStore,
  // D3 Directive: showStore confirmed — filtering by from/to store is core to this report.
  filterSpec: { showStore: true },
  columns: [
    { key: 'transfer_date', label: 'Transfer Date', type: 'date' },
    { key: 'transfer_number', label: 'Transfer Number', type: 'string' },
    { key: 'from_store', label: 'From Store', type: 'string' },
    { key: 'to_store', label: 'To Store', type: 'string' },
    { key: 'item_name', label: 'Item Name', type: 'string' },
    { key: 'quantity', label: 'Quantity Transferred', type: 'number' },
    { key: 'status', label: 'Status', type: 'string' },
  ],
  defaultSort: { column: 'transfer_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.inventory.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, store_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(st.created_at) as "transfer_date",
        st.transfer_number as "transfer_number",
        sf.name as "from_store",
        stt.name as "to_store",
        i.name as "item_name",
        sti.quantity as "quantity",
        st.status as "status"
      FROM "stock_transfer_items" sti
      JOIN "stock_transfers" st ON sti.transfer_id = st.id
      JOIN "stores" sf ON st.from_store_id = sf.id
      JOIN "stores" stt ON st.to_store_id = stt.id
      JOIN "item_master" i ON sti.item_id = i.id
      WHERE st."organizationId" = ${orgId}
        AND st.created_at >= ${toStartOfDay(date_start)}
        AND st.created_at <= ${toEndOfDay(date_end)}
        ${store_id ? Prisma.sql`AND (st.from_store_id = ${parseInt(store_id)} OR st.to_store_id = ${parseInt(store_id)})` : Prisma.empty}
      ORDER BY st.created_at DESC
    `;
    return { 
      rows: rows.map(r => ({
        ...r,
        quantity: Number(r.quantity || 0),
      })), 
      totals: {} 
    };
  },
};

// ─── Batch 19: Inventory — Batches & Taxes (SN 91–94) ────────

export const inventoryBatchInflowOutflowReport: ReportDefinition = {
  id: 'inventory-batch-inflow-outflow',
  category: ReportCategory.Inventory,
  name: 'Inventory - Batch wise stock inflow outflow',
  description: 'Track quantity coming in and going out of specific item batches.',
  filters: defaultFiltersWithStore,
  // D3 Directive: showStore confirmed — batch movements are per-store.
  filterSpec: { showStore: true },
  columns: [
    { key: 'batch_no', label: 'Batch No', type: 'string' },
    { key: 'item_name', label: 'Item Name', type: 'string' },
    { key: 'store_name', label: 'Store Name', type: 'string' },
    { key: 'total_inflow', label: 'Total Inflow', type: 'number', total: 'sum' },
    { key: 'total_outflow', label: 'Total Outflow', type: 'number', total: 'sum' },
  ],
  defaultSort: { column: 'item_name', direction: 'asc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.inventory.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, store_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(b.batch_no, 'NO BATCH') as "batch_no",
        i.name as "item_name",
        s.name as "store_name",
        SUM(im.quantity_in) as "total_inflow",
        SUM(im.quantity_out) as "total_outflow"
      FROM "inventory_movements" im
      JOIN "item_master" i ON im.item_id = i.id
      LEFT JOIN "item_batches" b ON im.batch_id = b.id
      JOIN "stores" s ON im.store_id = s.id
      WHERE im."organizationId" = ${orgId}
        AND im.created_at >= ${toStartOfDay(date_start)}
        AND im.created_at <= ${toEndOfDay(date_end)}
        ${store_id ? Prisma.sql`AND im.store_id = ${parseInt(store_id)}` : Prisma.empty}
      GROUP BY b.batch_no, i.name, s.name
      ORDER BY i.name ASC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.total_inflow += Number(row.total_inflow || 0);
      acc.total_outflow += Number(row.total_outflow || 0);
      return acc;
    }, { total_inflow: 0, total_outflow: 0 });

    return { 
      rows: rows.map(r => ({ ...r, total_inflow: Number(r.total_inflow), total_outflow: Number(r.total_outflow) })), 
      totals 
    };
  },
};

export const inventoryAsOnDateStockReport: ReportDefinition = {
  id: 'inventory-as-on-date-stock',
  category: ReportCategory.Inventory,
  name: 'Inventory - As on Date Stock',
  description: 'Point-in-time stock balance: uses the balance_after of the last movement record up to the chosen date per store/item combination.',
  filters: z.object({
    date_end: z.string().or(z.date()),
    store_id: z.string().optional(),
  }),
  // D3 Directive: showStore confirmed — "as on date" per-store is the standard use-case.
  filterSpec: { showStore: true },
  columns: [
    { key: 'store_name', label: 'Store', type: 'string' },
    { key: 'item_name', label: 'Item Name', type: 'string' },
    { key: 'stock_as_on_date', label: 'Stock Balance', type: 'number', total: 'sum' },
  ],
  defaultSort: { column: 'store_name', direction: 'asc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.inventory.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_end, store_id } = filters;
    // Uses CTE + ROW_NUMBER() to get the latest movement record (by created_at) per
    // store+item combination up to date_end. balance_after on that record equals the
    // cumulative stock balance at that point in time — this is the correct "as-on-date"
    // semantic. Reading current store_stocks would be WRONG here.
    const rows = await prisma.$queryRaw<any[]>`
      WITH RankedMovements AS (
        SELECT 
          im.store_id,
          im.item_id,
          im.balance_after,
          ROW_NUMBER() OVER(PARTITION BY im.store_id, im.item_id ORDER BY im.created_at DESC) as rn
        FROM "inventory_movements" im
        WHERE im."organizationId" = ${orgId}
          AND im.created_at <= ${toEndOfDay(date_end)}
          ${store_id ? Prisma.sql`AND im.store_id = ${parseInt(store_id)}` : Prisma.empty}
      )
      SELECT 
        s.name as "store_name",
        i.name as "item_name",
        rm.balance_after as "stock_as_on_date"
      FROM RankedMovements rm
      JOIN "stores" s ON rm.store_id = s.id
      JOIN "item_master" i ON rm.item_id = i.id
      WHERE rm.rn = 1
      ORDER BY s.name ASC, i.name ASC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.stock_as_on_date += Number(row.stock_as_on_date || 0);
      return acc;
    }, { stock_as_on_date: 0 });

    return { 
      rows: rows.map(r => ({ ...r, stock_as_on_date: Number(r.stock_as_on_date) })), 
      totals 
    };
  },
};

export const inventoryHsnTaxSummaryReport: ReportDefinition = {
  id: 'inventory-hsn-tax-summary',
  category: ReportCategory.Inventory,
  name: 'Inventory - HSN Tax Summary',
  description: 'Grouped tax values and total taxable amounts from received goods by HSN code.',
  filters: defaultFilters,
  columns: [
    { key: 'hsn_code', label: 'HSN/SAC Code', type: 'string' },
    { key: 'gst_rate', label: 'GST Rate %', type: 'number' },
    { key: 'taxable_amount', label: 'Taxable Amount', type: 'currency', total: 'sum' },
    { key: 'tax_amount', label: 'Tax Amount', type: 'currency', total: 'sum' },
    { key: 'total_amount', label: 'Total Value', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'taxable_amount', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.inventory.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(i.hsn_sac_code, 'UNASSIGNED') as "hsn_code",
        gi.gst_rate as "gst_rate",
        SUM(gi.quantity_accepted * gi.unit_price) as "taxable_amount",
        SUM((gi.quantity_accepted * gi.unit_price) * (gi.gst_rate / 100)) as "tax_amount",
        SUM((gi.quantity_accepted * gi.unit_price) * (1 + (gi.gst_rate / 100))) as "total_amount"
      FROM "goods_receipt_note_items" gi
      JOIN "goods_receipt_notes" g ON gi.grn_id = g.id
      JOIN "item_master" i ON gi.item_id = i.id
      WHERE g."organizationId" = ${orgId}
        AND g.received_at >= ${toStartOfDay(date_start)}
        AND g.received_at <= ${toEndOfDay(date_end)}
      GROUP BY i.hsn_sac_code, gi.gst_rate
      ORDER BY SUM(gi.quantity_accepted * gi.unit_price) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.taxable_amount += Number(row.taxable_amount || 0);
      acc.tax_amount += Number(row.tax_amount || 0);
      acc.total_amount += Number(row.total_amount || 0);
      return acc;
    }, { taxable_amount: 0, tax_amount: 0, total_amount: 0 });

    return { 
      rows: rows.map(r => ({ ...r, taxable_amount: Number(r.taxable_amount), tax_amount: Number(r.tax_amount), total_amount: Number(r.total_amount), gst_rate: Number(r.gst_rate) })), 
      totals 
    };
  },
};

export const inventoryBinCardBatchReport: ReportDefinition = {
  id: 'inventory-bin-card-batch',
  category: ReportCategory.Inventory,
  name: 'Inventory - Bin Card - Batch wise',
  description: 'Ledger of all stock movements broken down into batch-specific details.',
  filters: defaultFiltersWithStore,
  // D3 Directive: showStore confirmed — bin card is per-store by definition.
  filterSpec: { showStore: true },
  columns: [
    { key: 'movement_date', label: 'Date', type: 'date' },
    { key: 'store_name', label: 'Store Name', type: 'string' },
    { key: 'item_name', label: 'Item Name', type: 'string' },
    { key: 'batch_no', label: 'Batch No', type: 'string' },
    { key: 'movement_type', label: 'Movement Type', type: 'string' },
    { key: 'quantity_in', label: 'Qty In', type: 'number', total: 'sum' },
    { key: 'quantity_out', label: 'Qty Out', type: 'number', total: 'sum' },
    { key: 'balance', label: 'Balance After', type: 'number' },
  ],
  defaultSort: { column: 'movement_date', direction: 'asc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.inventory.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, store_id } = filters;
    // movement_type values per schema L5305: OPENING, GRN_RECEIPT, ISSUE, INDENT_ISSUE,
    // INDENT_RECEIPT, TRANSFER_OUT, TRANSFER_IN, CONSUMPTION, PATIENT_CHARGE,
    // RETURN_TO_STORE, SUPPLIER_RETURN, EXPIRY_WRITEOFF, DAMAGE_WRITEOFF,
    // ADJUSTMENT_PLUS, ADJUSTMENT_MINUS
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(im.created_at) as "movement_date",
        s.name as "store_name",
        i.name as "item_name",
        COALESCE(b.batch_no, 'NO BATCH') as "batch_no",
        im.movement_type as "movement_type",
        im.quantity_in as "quantity_in",
        im.quantity_out as "quantity_out",
        im.balance_after as "balance"
      FROM "inventory_movements" im
      JOIN "stores" s ON im.store_id = s.id
      JOIN "item_master" i ON im.item_id = i.id
      LEFT JOIN "item_batches" b ON im.batch_id = b.id
      WHERE im."organizationId" = ${orgId}
        AND im.created_at >= ${toStartOfDay(date_start)}
        AND im.created_at <= ${toEndOfDay(date_end)}
        ${store_id ? Prisma.sql`AND im.store_id = ${parseInt(store_id)}` : Prisma.empty}
      ORDER BY im.created_at ASC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.quantity_in += Number(row.quantity_in || 0);
      acc.quantity_out += Number(row.quantity_out || 0);
      return acc;
    }, { quantity_in: 0, quantity_out: 0 });

    return { 
      rows: rows.map(r => ({ ...r, quantity_in: Number(r.quantity_in), quantity_out: Number(r.quantity_out), balance: Number(r.balance) })), 
      totals 
    };
  },
};

// ─── Batch 20: Inventory — Bin Cards & Consumption (SN 95–98) ────────

export const inventoryBinCardItemReport: ReportDefinition = {
  id: 'inventory-bin-card-item',
  category: ReportCategory.Inventory,
  name: 'Inventory - Bin Card - Item wise',
  description: 'Ledger of stock movements aggregated at the parent item level (regardless of batch).',
  filters: defaultFiltersWithStore,
  // D3 Directive: showStore confirmed — bin card is per-store by definition.
  filterSpec: { showStore: true },
  columns: [
    { key: 'movement_date', label: 'Date', type: 'date' },
    { key: 'store_name', label: 'Store Name', type: 'string' },
    { key: 'item_name', label: 'Item Name', type: 'string' },
    { key: 'movement_type', label: 'Movement Type', type: 'string' },
    { key: 'quantity_in', label: 'Qty In', type: 'number', total: 'sum' },
    { key: 'quantity_out', label: 'Qty Out', type: 'number', total: 'sum' },
    { key: 'balance', label: 'Balance After', type: 'number' },
  ],
  defaultSort: { column: 'movement_date', direction: 'asc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.inventory.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, store_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(im.created_at) as "movement_date",
        s.name as "store_name",
        i.name as "item_name",
        im.movement_type as "movement_type",
        im.quantity_in as "quantity_in",
        im.quantity_out as "quantity_out",
        im.balance_after as "balance"
      FROM "inventory_movements" im
      JOIN "stores" s ON im.store_id = s.id
      JOIN "item_master" i ON im.item_id = i.id
      WHERE im."organizationId" = ${orgId}
        AND im.created_at >= ${toStartOfDay(date_start)}
        AND im.created_at <= ${toEndOfDay(date_end)}
        ${store_id ? Prisma.sql`AND im.store_id = ${parseInt(store_id)}` : Prisma.empty}
      ORDER BY im.created_at ASC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.quantity_in += Number(row.quantity_in || 0);
      acc.quantity_out += Number(row.quantity_out || 0);
      return acc;
    }, { quantity_in: 0, quantity_out: 0 });

    return { 
      rows: rows.map(r => ({ ...r, quantity_in: Number(r.quantity_in), quantity_out: Number(r.quantity_out), balance: Number(r.balance) })), 
      totals 
    };
  },
};

export const inventoryMovingItemsReport: ReportDefinition = {
  id: 'inventory-moving-items',
  category: ReportCategory.Inventory,
  name: 'Inventory - Slow & Fast Moving item',
  description: 'Ranking of items by total issued/consumed quantities to classify fast and slow moving stock.',
  filters: defaultFilters,
  columns: [
    { key: 'item_code', label: 'Item Code', type: 'string' },
    { key: 'item_name', label: 'Item Name', type: 'string' },
    { key: 'item_type', label: 'Item Type', type: 'string' },
    { key: 'total_issued', label: 'Total Outward Qty', type: 'number' },
    { key: 'total_value', label: 'Outward Value', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'total_issued', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.inventory.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // Outward movement_type values per schema L5305:
    // ISSUE, INDENT_ISSUE, CONSUMPTION, PATIENT_CHARGE, TRANSFER_OUT,
    // SUPPLIER_RETURN, EXPIRY_WRITEOFF, DAMAGE_WRITEOFF
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        i.item_code as "item_code",
        i.name as "item_name",
        i.item_type as "item_type",
        SUM(im.quantity_out) as "total_issued",
        SUM(im.quantity_out * im.unit_cost) as "total_value"
      FROM "inventory_movements" im
      JOIN "item_master" i ON im.item_id = i.id
      WHERE im."organizationId" = ${orgId}
        AND im.movement_type IN ('ISSUE', 'INDENT_ISSUE', 'CONSUMPTION', 'PATIENT_CHARGE', 'TRANSFER_OUT', 'SUPPLIER_RETURN', 'EXPIRY_WRITEOFF', 'DAMAGE_WRITEOFF')
        AND im.created_at >= ${toStartOfDay(date_start)}
        AND im.created_at <= ${toEndOfDay(date_end)}
      GROUP BY i.item_code, i.name, i.item_type
      ORDER BY SUM(im.quantity_out) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.total_value += Number(row.total_value || 0);
      return acc;
    }, { total_value: 0 });

    return { 
      rows: rows.map(r => ({ ...r, total_issued: Number(r.total_issued), total_value: Number(r.total_value) })), 
      totals 
    };
  },
};

export const inventoryGrnPendingCnReport: ReportDefinition = {
  id: 'inventory-grn-pending-cn',
  category: ReportCategory.Inventory,
  name: 'Inventory - GRN - Pending CN Number Update',
  description: 'List of GRN items that were rejected, awaiting a Credit Note from the supplier.',
  filters: defaultFilters,
  columns: [
    { key: 'grn_date', label: 'GRN Date', type: 'date' },
    { key: 'grn_number', label: 'GRN Number', type: 'string' },
    { key: 'vendor_name', label: 'Vendor Name', type: 'string' },
    { key: 'item_name', label: 'Item Name', type: 'string' },
    { key: 'rejected_quantity', label: 'Rejected Quantity', type: 'number', total: 'sum' },
    { key: 'reason', label: 'Rejection Reason', type: 'string' },
  ],
  defaultSort: { column: 'grn_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.inventory.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // BUG AUDIT (D3 Directive): The previous suspected bug was that rejection data was
    // read from the GRN *header* instead of item level. This is CONFIRMED and FIXED.
    //
    // Schema truth:
    //   - goods_receipt_notes (header): rejected_quantity (Int, L1917), rejection_reason (String?, L1918)
    //     → These are DENORMALISED totals on the header, NOT item-level detail.
    //   - goods_receipt_note_items: quantity_rejected (Int, L5563), rejection_reason (String?, L5564)
    //     → These are the TRUE per-item rejection records.
    //
    // This report shows pending CN per rejected item line, so we MUST join to
    // goods_receipt_note_items for item-level granularity. The header fields are NOT used.
    //
    // Note: The schema has no dedicated `cn_number` column on either GRN table — "Pending CN"
    // means no credit note has been issued yet. We identify this by: quantity_rejected > 0.
    // A future enhancement could filter out rows where a matching CreditNote record exists.
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(g.received_at) as "grn_date",
        g.grn_number as "grn_number",
        v.vendor_name as "vendor_name",
        i.name as "item_name",
        gi.quantity_rejected as "rejected_quantity",
        COALESCE(gi.rejection_reason, 'Pending CN') as "reason"
      FROM "goods_receipt_note_items" gi
      JOIN "goods_receipt_notes" g ON gi.grn_id = g.id
      JOIN "item_master" i ON gi.item_id = i.id
      LEFT JOIN "vendors" v ON g.vendor_id = v.id
      WHERE g."organizationId" = ${orgId}
        AND gi.quantity_rejected > 0
        AND g.received_at >= ${toStartOfDay(date_start)}
        AND g.received_at <= ${toEndOfDay(date_end)}
      ORDER BY g.received_at DESC, g.grn_number
    `;
    const totals = rows.reduce((acc, row) => {
      acc.rejected_quantity += Number(row.rejected_quantity || 0);
      return acc;
    }, { rejected_quantity: 0 });

    return { 
      rows: rows.map(r => ({ ...r, rejected_quantity: Number(r.rejected_quantity) })), 
      totals 
    };
  },
};

export const inventoryStoreConsumptionReport: ReportDefinition = {
  id: 'inventory-store-consumption',
  category: ReportCategory.Inventory,
  name: 'Inventory - Store Consumption Report',
  description: 'Internal consumption of items within different stores.',
  filters: defaultFiltersWithStore,
  // D3 Directive: showStore confirmed — consumption is per-store.
  filterSpec: { showStore: true },
  columns: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'store_name', label: 'Store Name', type: 'string' },
    { key: 'item_name', label: 'Item Name', type: 'string' },
    { key: 'quantity_consumed', label: 'Quantity Consumed', type: 'number', total: 'sum' },
    { key: 'total_value', label: 'Total Value', type: 'currency', total: 'sum' },
  ],
  defaultSort: { column: 'date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.inventory.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, store_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(im.created_at) as "date",
        s.name as "store_name",
        i.name as "item_name",
        SUM(im.quantity_out) as "quantity_consumed",
        SUM(im.quantity_out * im.unit_cost) as "total_value"
      FROM "inventory_movements" im
      JOIN "stores" s ON im.store_id = s.id
      JOIN "item_master" i ON im.item_id = i.id
      WHERE im."organizationId" = ${orgId}
        AND im.movement_type = 'CONSUMPTION'
        AND im.created_at >= ${toStartOfDay(date_start)}
        AND im.created_at <= ${toEndOfDay(date_end)}
        ${store_id ? Prisma.sql`AND im.store_id = ${parseInt(store_id)}` : Prisma.empty}
      GROUP BY DATE(im.created_at), s.name, i.name
      ORDER BY DATE(im.created_at) DESC
    `;
    const totals = rows.reduce((acc, row) => {
      acc.quantity_consumed += Number(row.quantity_consumed || 0);
      acc.total_value += Number(row.total_value || 0);
      return acc;
    }, { quantity_consumed: 0, total_value: 0 });

    return { 
      rows: rows.map(r => ({ ...r, quantity_consumed: Number(r.quantity_consumed), total_value: Number(r.total_value) })), 
      totals 
    };
  },
};
