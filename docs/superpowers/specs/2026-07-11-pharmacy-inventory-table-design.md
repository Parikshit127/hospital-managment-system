# Pharmacy Inventory Page Redesign

## Problem

`/pharmacy/inventory` (`app/pharmacy/inventory/page.tsx`) is a card grid: one card per medicine, batches listed inside. It only supports a search box and a low-stock toggle. There's no way to filter by category, expiry window, or stock status; no way to see total inventory value; no way to edit or adjust an existing batch (only add new stock); and results are capped at whatever the current fetch returns with no pagination.

Two server actions already exist but are unused by this page:
- `adjustStock` (`app/actions/pharmacy-actions.ts:3672`) — quantity correction with reason + audit log + narcotic register entry. No UI calls it.
- `getInventoryPage` (`app/actions/pharmacy-actions.ts:75`) — flat per-batch, paginated, search + `inStockOnly`. Used by billing/invoices pages, not by the inventory page itself (which uses `searchMedicine` + `getLowStockAlerts` instead).

## Goals

- See available stock clearly, with category, expiry, and low/out-of-stock status all visible without extra clicks.
- Filter by category, stock status (in/low/out), and expiring-within-N-days.
- Add new stock (existing flow, kept), adjust existing batch quantity (new UI on existing backend action), and edit batch details — rack location, expiry date, MRP/cost, batch no (new action + UI).
- Paginate instead of silently capping results.

## Non-goals

- No change to how dispensing, purchase orders, or purchase invoices affect stock — those flows are untouched.
- No rack/location filter (explicitly excluded — hospital doesn't need it yet).
- No new database migration — everything needed already exists on `pharmacy_medicine_master` and `pharmacy_batch_inventory`.

## Design

### Layout: table, not cards

One row per batch. Medicines with zero batches still get one synthetic "Out of Stock" row (same as today's `_catalog` rows in `getInventoryPage`), so they remain visible/filterable.

Columns: Medicine (brand + generic subtext), Category, Batch No, Stock (red if ≤ `min_threshold`, green otherwise), Expiry (red if ≤30 days, amber if ≤60, else default), MRP, Rack, Actions.

Summary stat cards above the table: Total Stock Value (Σ current_stock × cost_price), Low Stock count, Expiring Soon (≤30d) count, Out of Stock count.

Filter row: search box (existing debounced input, kept), Category dropdown, Stock Status dropdown (All/In Stock/Low/Out), Expiring Within dropdown (Any/30/60/90 days), Clear Filters button.

Pagination: "Load more" button using the existing `cursor`/`nextCursor` contract on `getInventoryPage` — replaces today's fixed single-page fetch.

### Data layer changes (`app/actions/pharmacy-actions.ts`)

1. **Extend `getInventoryPage`** with new optional params: `category?: string`, `stockStatus?: 'in' | 'low' | 'out'`, `expiringWithinDays?: number`. Applied as additional Prisma `where` clauses on `pharmacy_medicine_master` (category) and post-filtering the flattened batch rows for stock status / expiry (stock status needs the aggregate per medicine, computed from the batches already fetched — no extra query). Also return a `summary` object in the same response: `{ totalValue, lowStockCount, expiringSoonCount, outOfStockCount }`, computed via one raw aggregate query scoped to the tenant (same pattern as `getLowStockAlerts`).

2. **New `getInventoryCategories()`** — `db.pharmacy_medicine_master.findMany({ where: { is_active: true, category: { not: null } }, distinct: ['category'], select: { category: true } })`, returns sorted string list. Used to populate the category filter dropdown.

3. **New `updateBatchDetails(data: { batch_id: number; batch_no?: string; expiry_date?: Date; rack_location?: string; mrp?: number; cost_price?: number })`** — `db.pharmacy_batch_inventory.update(...)` on the provided fields only, wrapped in the same try/catch + `logAudit` + `revalidatePath('/pharmacy/inventory')` pattern as `adjustStock`. Does not touch `current_stock` — quantity changes only go through `adjustStock` so the movement/audit/narcotic trail stays intact.

### UI changes (`app/pharmacy/inventory/page.tsx`)

- Replace the card grid with a table (Tailwind, matching the existing app's table styling — e.g. Finance Reports' Payment Details table).
- Add the filter row and summary stat cards described above.
- Keep the existing "Add Bulk Stock" modal/button as-is.
- Add "Adjust Stock" modal: qty delta (+/-) + reason (required) + submit → `adjustStock`.
- Add "Edit Batch" modal: batch no, expiry, rack, MRP, cost → `updateBatchDetails`.
- Row actions rendered as small icon buttons (adjust / edit), consistent with icon-button patterns already used elsewhere in the pharmacy module (e.g. Purchase Invoices row actions).

### Error handling

Same `{ success, error }` return contract as every other action in this file; UI shows `alert(res.error || 'Failed')` on failure, matching existing `handleSaveBatch` behavior. No new error classes or retry logic — consistent with the rest of the codebase.

### Testing

No automated test suite covers this page today. Verification is manual: start the dev server, exercise add/adjust/edit flows and every filter combination, confirm `npm run build` type-checks clean.
