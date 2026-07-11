# Pharmacy Inventory Table Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card-grid `/pharmacy/inventory` page with a filterable, sortable table that shows available stock clearly and lets staff add, adjust, and edit batch-level stock.

**Architecture:** Extend the existing `getInventoryPage` server action (flat one-row-per-batch, already paginated) with category/stock-status/expiry filters and a summary aggregate; add two new small server actions (`getInventoryCategories`, `updateBatchDetails`); rebuild the page component around a table with a filter row, summary stat cards, and load-more pagination; wire the already-existing `adjustStock` action into a new "Adjust Stock" modal; wire the new `updateBatchDetails` action into a new "Edit Batch" modal.

**Tech Stack:** Next.js 16 App Router (client component + server actions), Prisma 6, Tailwind CSS, lucide-react icons.

## Global Constraints

- No database migration — every field used already exists on `pharmacy_medicine_master` / `pharmacy_batch_inventory`.
- No rack/location filter (explicitly out of scope per spec).
- No automated test framework exists in this repo — verification is `npm run typecheck`, `npm run lint`, and manual exercise via `npm run dev`.
- All server actions live in `app/actions/pharmacy-actions.ts` (single file, matches existing repo convention of one actions file per module — do not split it out).
- Every action follows the existing `{ success, error? }` / `{ success, data }` return contract, `requireTenantContext()` for tenant scoping, and `logAudit` + `revalidatePath`/`invalidatePharmacyTags` on writes — copy the exact patterns already in this file (see Task 1/2 code below, lifted from `addInventoryBatch` at `app/actions/pharmacy-actions.ts:833` and `adjustStock` at `:3672`).

---

## Task 1: Extend `getInventoryPage` with filters and a summary block

**Files:**
- Modify: `app/actions/pharmacy-actions.ts:75-176` (the `getInventoryPage` function)

**Interfaces:**
- Consumes: nothing new — same `db`/`organizationId` from `requireTenantContext()` (`import { requireTenantContext } from '@/backend/tenant'`, already imported at line 3).
- Produces: `getInventoryPage(opts?: { search?: string; cursor?: number; limit?: number; inStockOnly?: boolean; category?: string; stockStatus?: 'in' | 'low' | 'out'; expiringWithinDays?: number; includeSummary?: boolean }) => Promise<{ success: boolean; data: any[]; nextCursor?: number; summary?: { totalValue: number; lowStockCount: number; expiringSoonCount: number; outOfStockCount: number } }>`. Each row in `data` gains `category`, `min_threshold`, `rack_location`, and `_lowStock` (boolean, true when the medicine's total stock ≤ its `min_threshold`) fields on top of the existing `id`, `batch_no`, `medicine_id`, `current_stock`, `expiry_date`, `cost_price`, `mrp`, `medicine` fields. Existing callers (`app/pharmacy/invoices/page.tsx:108`, `app/pharmacy/billing/page.tsx:136,194`) don't pass the new opts and don't read the new fields, so their behavior is unchanged. `summary` is only populated when `includeSummary: true` is passed — existing callers never pass it, so they get no extra query cost.

- [ ] **Step 1: Replace the function body**

Replace the entire current `getInventoryPage` function (lines 75-176 of `app/actions/pharmacy-actions.ts`) with:

```typescript
export async function getInventoryPage(opts?: {
    search?: string;
    cursor?: number;
    limit?: number;
    inStockOnly?: boolean;
    category?: string;
    stockStatus?: 'in' | 'low' | 'out';
    expiringWithinDays?: number;
    includeSummary?: boolean;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const search = (opts?.search ?? '').trim();
        const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
        const inStockOnly = opts?.inStockOnly ?? false;

        const medWhere: any = { is_active: true };
        if (search) {
            const words = search.split(/\s+/).filter(Boolean);
            if (words.length > 0) {
                medWhere.AND = words.map(word => ({
                    OR: [
                        { brand_name: { contains: word, mode: 'insensitive' } },
                        { generic_name: { contains: word, mode: 'insensitive' } },
                    ]
                }));
            }
        }
        if (opts?.category) medWhere.category = opts.category;
        if (opts?.cursor) medWhere.id = { gt: opts.cursor };

        const medicines = await db.pharmacy_medicine_master.findMany({
            where: medWhere,
            orderBy: { brand_name: 'asc' },
            take: limit,
            select: {
                id: true,
                brand_name: true,
                generic_name: true,
                category: true,
                min_threshold: true,
                selling_price: true,
                price_per_unit: true,
                mrp: true,
                gst_percent: true,
                tax_rate: true,
                hsn_sac_code: true,
                is_active: true,
                batches: {
                    where: { current_stock: { gt: 0 } },
                    orderBy: { expiry_date: 'asc' },
                    select: {
                        id: true,
                        batch_no: true,
                        current_stock: true,
                        expiry_date: true,
                        mrp: true,
                        cost_price: true,
                        rack_location: true,
                    },
                },
            },
        });

        const expiryCutoff = opts?.expiringWithinDays
            ? new Date(Date.now() + opts.expiringWithinDays * 24 * 60 * 60 * 1000)
            : null;

        const flat: any[] = [];
        for (const med of medicines as any[]) {
            const totalStock = med.batches.reduce((s: number, b: any) => s + b.current_stock, 0);
            const isLow = totalStock <= med.min_threshold;
            const isOut = totalStock === 0;

            if (opts?.stockStatus === 'out' && !isOut) continue;
            if (opts?.stockStatus === 'low' && !isLow) continue;
            if (opts?.stockStatus === 'in' && (isLow || isOut)) continue;

            const medicinePayload = {
                brand_name: med.brand_name,
                generic_name: med.generic_name,
                category: med.category,
                min_threshold: med.min_threshold,
                selling_price: med.selling_price,
                price_per_unit: med.price_per_unit,
                mrp: med.mrp,
                gst_percent: med.gst_percent,
                tax_rate: med.tax_rate,
                hsn_sac_code: med.hsn_sac_code,
                is_active: med.is_active,
            };

            let batchesToShow = med.batches;
            if (expiryCutoff) {
                batchesToShow = batchesToShow.filter((b: any) => new Date(b.expiry_date) <= expiryCutoff);
                if (batchesToShow.length === 0) continue;
            }

            if (batchesToShow.length > 0) {
                for (const b of batchesToShow) {
                    flat.push({
                        id: b.id,
                        batch_no: b.batch_no,
                        medicine_id: med.id,
                        current_stock: b.current_stock,
                        expiry_date: b.expiry_date,
                        cost_price: b.cost_price,
                        mrp: b.mrp ?? med.mrp,
                        rack_location: b.rack_location,
                        medicine: medicinePayload,
                        _lowStock: isLow,
                    });
                }
            } else if (!inStockOnly && !expiryCutoff) {
                flat.push({
                    id: null,
                    batch_no: `CATALOG-${med.id}`,
                    medicine_id: med.id,
                    current_stock: 0,
                    expiry_date: null,
                    rack_location: null,
                    medicine: medicinePayload,
                    _catalog: true,
                    _lowStock: true,
                });
            }
        }

        const nextCursor = medicines.length === limit ? (medicines[medicines.length - 1] as any).id : undefined;

        let summary: { totalValue: number; lowStockCount: number; expiringSoonCount: number; outOfStockCount: number } | undefined;
        if (opts?.includeSummary) {
            const summaryRows = await db.$queryRaw<Array<{
                total_value: number | null;
                low_stock_count: number;
                expiring_soon_count: number;
                out_of_stock_count: number;
            }>>`
                SELECT
                    COALESCE(SUM(b.current_stock * COALESCE(b.cost_price, 0)), 0)::float AS total_value,
                    COUNT(DISTINCT CASE WHEN agg.total_stock <= m.min_threshold AND agg.total_stock > 0 THEN m.id END)::int AS low_stock_count,
                    COUNT(DISTINCT CASE WHEN b.expiry_date <= NOW() + INTERVAL '30 days' AND b.current_stock > 0 THEN b.id END)::int AS expiring_soon_count,
                    COUNT(DISTINCT CASE WHEN agg.total_stock = 0 OR agg.total_stock IS NULL THEN m.id END)::int AS out_of_stock_count
                FROM "pharmacy_medicine_master" m
                LEFT JOIN "pharmacy_batch_inventory" b ON b.medicine_id = m.id
                LEFT JOIN (
                    SELECT medicine_id, COALESCE(SUM(current_stock), 0) AS total_stock
                    FROM "pharmacy_batch_inventory"
                    GROUP BY medicine_id
                ) agg ON agg.medicine_id = m.id
                WHERE m."organizationId" = ${organizationId}
                  AND m.is_active = true
            `;
            summary = {
                totalValue: Number(summaryRows[0]?.total_value || 0),
                lowStockCount: Number(summaryRows[0]?.low_stock_count || 0),
                expiringSoonCount: Number(summaryRows[0]?.expiring_soon_count || 0),
                outOfStockCount: Number(summaryRows[0]?.out_of_stock_count || 0),
            };
        }

        return { success: true, data: flat, nextCursor, summary };
    } catch (error) {
        console.error('Inventory Page Fetch Error:', error);
        return { success: false, data: [] };
    }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors referencing `pharmacy-actions.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/actions/pharmacy-actions.ts
git commit -m "feat: add category/stock-status/expiry filters and summary to getInventoryPage"
```

---

## Task 2: Add `getInventoryCategories` and `updateBatchDetails` actions

**Files:**
- Modify: `app/actions/pharmacy-actions.ts` — add two new exported functions directly after the `getInventoryPage` function from Task 1 (i.e. right before the `/** @deprecated ... */ export async function getInventory()` block that currently follows it).

**Interfaces:**
- Consumes: `requireTenantContext`, `logAudit` (`import { logAudit } from '@/app/lib/audit'`, already imported at line 17), `invalidatePharmacyTags` (local helper defined at line 14), `revalidatePath` (already imported at line 6).
- Produces: `getInventoryCategories() => Promise<{ success: boolean; data: string[] }>`. `updateBatchDetails(data: { batch_id: number; batch_no?: string; expiry_date?: Date; rack_location?: string; mrp?: number; cost_price?: number }) => Promise<{ success: boolean; error?: string; batch?: any }>`. Both are new — no existing callers to break.

- [ ] **Step 1: Add the two functions**

Insert this block immediately after the closing `}` of `getInventoryPage` (end of Task 1's replacement) and before the `/** @deprecated ... */` comment:

```typescript
export async function getInventoryCategories() {
    try {
        const { db } = await requireTenantContext();
        const rows = await db.pharmacy_medicine_master.findMany({
            where: { is_active: true, category: { not: null } },
            distinct: ['category'],
            select: { category: true },
            orderBy: { category: 'asc' },
        });
        return { success: true, data: rows.map((r: any) => r.category).filter(Boolean) as string[] };
    } catch (error) {
        console.error('Get Inventory Categories Error:', error);
        return { success: false, data: [] };
    }
}

export async function updateBatchDetails(data: {
    batch_id: number;
    batch_no?: string;
    expiry_date?: Date;
    rack_location?: string;
    mrp?: number;
    cost_price?: number;
}) {
    try {
        const { db } = await requireTenantContext();

        const batch = await db.pharmacy_batch_inventory.findUnique({ where: { id: data.batch_id } });
        if (!batch) return { success: false, error: 'Batch not found' };

        const updateData: any = {};
        if (data.batch_no !== undefined) updateData.batch_no = data.batch_no;
        if (data.expiry_date !== undefined) updateData.expiry_date = data.expiry_date;
        if (data.rack_location !== undefined) updateData.rack_location = data.rack_location;
        if (data.mrp !== undefined) updateData.mrp = data.mrp;
        if (data.cost_price !== undefined) updateData.cost_price = data.cost_price;

        const updated = await db.pharmacy_batch_inventory.update({
            where: { id: data.batch_id },
            data: updateData,
        });

        await logAudit({
            action: 'PHARMACY_BATCH_DETAILS_UPDATED',
            module: 'Pharmacy',
            entity_type: 'pharmacy_batch_inventory',
            entity_id: String(data.batch_id),
            details: JSON.stringify(updateData),
        });

        invalidatePharmacyTags(['stock', 'catalog']);
        revalidatePath('/pharmacy/inventory');
        return { success: true, batch: updated };
    } catch (error: any) {
        console.error('Update Batch Details Error:', error);
        return { success: false, error: error.message || 'Failed to update batch' };
    }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/actions/pharmacy-actions.ts
git commit -m "feat: add getInventoryCategories and updateBatchDetails pharmacy actions"
```

---

## Task 3: Rebuild the inventory page as a filterable table with summary cards

**Files:**
- Modify: `app/pharmacy/inventory/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `getInventoryPage`, `getInventoryCategories`, `addInventoryBatch` from `@/app/actions/pharmacy-actions` (signatures from Tasks 1-2 and the existing `addInventoryBatch` at `app/actions/pharmacy-actions.ts:833`); `useDebouncedValue` from `@/app/lib/hooks/useDebouncedValue`; `DateField` from `@/app/components/ui/DateField`; `AppShell` from `@/app/components/layout/AppShell`.
- Produces: the page's row shape (`{ id, batch_no, medicine_id, current_stock, expiry_date, cost_price, mrp, rack_location, medicine: { brand_name, generic_name, category, min_threshold, ... }, _catalog?, _lowStock? }`) and the `summary` state shape (`{ totalValue, lowStockCount, expiringSoonCount, outOfStockCount }`) that Tasks 4 and 5 build on. Row action buttons are added in Tasks 4-5 — this task renders the table without an Actions column.

- [ ] **Step 1: Replace the full file**

```typescript
'use client';

import React, { useEffect, useState } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import { AppShell } from '@/app/components/layout/AppShell';
import { Package, Search, Plus, X } from 'lucide-react';
import { getInventoryPage, getInventoryCategories, addInventoryBatch } from '@/app/actions/pharmacy-actions';
import { useDebouncedValue } from '@/app/lib/hooks/useDebouncedValue';

const EMPTY_SUMMARY = { totalValue: 0, lowStockCount: 0, expiringSoonCount: 0, outOfStockCount: 0 };

function formatCurrency(n: number) {
    return `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function expiryClass(expiryDate: string | null) {
    if (!expiryDate) return 'text-gray-400';
    const days = (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (days <= 30) return 'text-red-600 font-bold';
    if (days <= 60) return 'text-amber-600 font-semibold';
    return 'text-gray-600';
}

export default function PharmacyInventoryPage() {
    const [rows, setRows] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [cursor, setCursor] = useState<number | undefined>(undefined);
    const [summary, setSummary] = useState(EMPTY_SUMMARY);

    const [searchQuery, setSearchQuery] = useState('');
    const debouncedQuery = useDebouncedValue(searchQuery, 250);
    const [categories, setCategories] = useState<string[]>([]);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'in' | 'low' | 'out'>('all');
    const [expiringWithinFilter, setExpiringWithinFilter] = useState('');

    const hasFilters = !!(searchQuery || categoryFilter || stockStatusFilter !== 'all' || expiringWithinFilter);
    function clearFilters() {
        setSearchQuery(''); setCategoryFilter(''); setStockStatusFilter('all'); setExpiringWithinFilter('');
    }

    // Modal: Add Bulk Stock
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState({ brand_name: '', generic_name: '', batch_no: '', stock: '', price: '', expiry: '', rack: '' });

    const loadInventory = async (opts?: { append?: boolean }) => {
        const append = opts?.append ?? false;
        if (append) setLoadingMore(true); else setRefreshing(true);
        try {
            const res = await getInventoryPage({
                search: debouncedQuery,
                limit: 50,
                cursor: append ? cursor : undefined,
                category: categoryFilter || undefined,
                stockStatus: stockStatusFilter === 'all' ? undefined : stockStatusFilter,
                expiringWithinDays: expiringWithinFilter ? Number(expiringWithinFilter) : undefined,
                includeSummary: true,
            });
            if (res.success) {
                setRows(prev => append ? [...prev, ...(res.data as any[])] : (res.data as any[]));
                setCursor(res.nextCursor);
                if (res.summary) setSummary(res.summary);
            } else if (!append) {
                setRows([]);
            }
        } finally {
            if (append) setLoadingMore(false); else setRefreshing(false);
        }
    };

    useEffect(() => {
        getInventoryCategories().then(res => { if (res.success) setCategories(res.data as string[]); });
    }, []);

    useEffect(() => {
        setCursor(undefined);
        loadInventory();
        /* eslint-disable-next-line react-hooks/exhaustive-deps */
    }, [debouncedQuery, categoryFilter, stockStatusFilter, expiringWithinFilter]);

    const handleSaveBatch = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            brand_name: form.brand_name,
            generic_name: form.generic_name,
            batch_no: form.batch_no,
            stock: Number(form.stock),
            price: Number(form.price),
            expiry: new Date(form.expiry),
            rack: form.rack
        };
        const res = await addInventoryBatch(payload);
        if (res.success) {
            setModalOpen(false);
            loadInventory();
        } else alert(res.error || 'Failed');
    };

    return (
        <AppShell
            pageTitle="Pharmacy Inventory"
            pageIcon={<Package className="h-5 w-5" />}
            onRefresh={() => loadInventory()}
            refreshing={refreshing}
            headerActions={
                <button onClick={() => { setForm({ brand_name: '', generic_name: '', batch_no: '', stock: '', price: '', expiry: '', rack: '' }); setModalOpen(true); }} className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold py-2 px-4 rounded-xl shadow-sm transition-all text-sm">
                    <Plus className="h-4 w-4" /> Add Bulk Stock
                </button>
            }
        >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                    <p className="text-xs font-bold text-gray-400 uppercase">Total Stock Value</p>
                    <p className="text-xl font-black text-gray-900">{formatCurrency(summary.totalValue)}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                    <p className="text-xs font-bold text-gray-400 uppercase">Low Stock</p>
                    <p className="text-xl font-black text-amber-600">{summary.lowStockCount}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                    <p className="text-xs font-bold text-gray-400 uppercase">Expiring Soon (30d)</p>
                    <p className="text-xl font-black text-red-600">{summary.expiringSoonCount}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                    <p className="text-xs font-bold text-gray-400 uppercase">Out of Stock</p>
                    <p className="text-xl font-black text-gray-600">{summary.outOfStockCount}</p>
                </div>
            </div>

            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex flex-wrap gap-3 bg-gray-50/50">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text" placeholder="Search medicines..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                        />
                    </div>
                    <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600">
                        <option value="">All categories</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={stockStatusFilter} onChange={e => setStockStatusFilter(e.target.value as any)} className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600">
                        <option value="all">All stock</option>
                        <option value="in">In stock</option>
                        <option value="low">Low stock</option>
                        <option value="out">Out of stock</option>
                    </select>
                    <select value={expiringWithinFilter} onChange={e => setExpiringWithinFilter(e.target.value)} className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600">
                        <option value="">Any expiry</option>
                        <option value="30">Expiring in 30 days</option>
                        <option value="60">Expiring in 60 days</option>
                        <option value="90">Expiring in 90 days</option>
                    </select>
                    {hasFilters && (
                        <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-2 text-sm font-bold text-gray-500 hover:text-gray-700">
                            <X className="h-3.5 w-3.5" /> Clear filters
                        </button>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Medicine</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Batch No</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Stock</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Expiry</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">MRP</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Rack</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rows.length === 0 && !refreshing && (
                                <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-400">No medicines found.</td></tr>
                            )}
                            {rows.map((row: any) => (
                                <tr key={row.id ?? row.batch_no} className="hover:bg-gray-50/60">
                                    <td className="px-4 py-3">
                                        <p className="text-sm font-bold text-gray-900">{row.medicine.brand_name}</p>
                                        <p className="text-xs text-gray-500">{row.medicine.generic_name || 'Generic N/A'}</p>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{row.medicine.category || '—'}</td>
                                    <td className="px-4 py-3 text-sm font-mono text-gray-700">{row._catalog ? '—' : row.batch_no}</td>
                                    <td className={`px-4 py-3 text-sm text-right font-black ${row._catalog ? 'text-red-500' : row.current_stock < row.medicine.min_threshold ? 'text-red-500' : 'text-emerald-600'}`}>
                                        {row._catalog ? 'Out of Stock' : row.current_stock}
                                    </td>
                                    <td className={`px-4 py-3 text-sm ${expiryClass(row.expiry_date)}`}>
                                        {row.expiry_date ? new Date(row.expiry_date).toLocaleDateString('en-GB') : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.mrp ? formatCurrency(row.mrp) : '—'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{row.rack_location || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {cursor && (
                    <div className="p-4 border-t border-gray-100 flex justify-center">
                        <button onClick={() => loadInventory({ append: true })} disabled={loadingMore} className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-xl disabled:opacity-50">
                            {loadingMore ? 'Loading...' : 'Load more'}
                        </button>
                    </div>
                )}
            </div>

            {/* Quick Add Modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleSaveBatch} className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-4 border-b bg-gray-50 flex justify-between"><h3 className="font-bold">Add Generic Item & Batch</h3><button type="button" onClick={() => setModalOpen(false)}>&times;</button></div>
                        <div className="p-6 space-y-4">
                            <input required placeholder="Brand Name" className="w-full p-2 border rounded-lg text-sm" value={form.brand_name} onChange={e => setForm({ ...form, brand_name: e.target.value })} />
                            <input placeholder="Generic Name" className="w-full p-2 border rounded-lg text-sm" value={form.generic_name} onChange={e => setForm({ ...form, generic_name: e.target.value })} />
                            <div className="grid grid-cols-2 gap-4">
                                <input required placeholder="Batch No" className="w-full p-2 border rounded-lg text-sm" value={form.batch_no} onChange={e => setForm({ ...form, batch_no: e.target.value })} />
                                <input required type="number" placeholder="Qty" className="w-full p-2 border rounded-lg text-sm" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <input required type="number" placeholder="Unit Price" className="w-full p-2 border rounded-lg text-sm" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
                                <DateField required className="w-full p-2 border rounded-lg text-sm text-gray-500" value={form.expiry} onChange={e => setForm({ ...form, expiry: e.target.value })} />
                            </div>
                            <button type="submit" className="w-full bg-orange-600 text-white font-bold p-2 rounded-lg">Save Item</button>
                        </div>
                    </form>
                </div>
            )}
        </AppShell>
    );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors in `app/pharmacy/inventory/page.tsx`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors/warnings for this file.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `/pharmacy/inventory`. Confirm: table loads with rows, summary cards show non-zero numbers if stock exists, search filters rows, category/stock-status/expiry filters each narrow the table, "Clear filters" resets them, "Load more" appears when there are more than 50 rows and appends more, "Add Bulk Stock" still works.

- [ ] **Step 5: Commit**

```bash
git add app/pharmacy/inventory/page.tsx
git commit -m "feat: rebuild pharmacy inventory page as filterable table with summary cards"
```

---

## Task 4: Add "Adjust Stock" action (wired to existing `adjustStock`)

**Files:**
- Modify: `app/pharmacy/inventory/page.tsx`

**Interfaces:**
- Consumes: `adjustStock(data: { medicine_id: number; batch_id: number; adjustment_qty: number; reason: string }) => Promise<{ success: boolean; error?: string; new_stock?: number }>` from `@/app/actions/pharmacy-actions` (already exists at `app/actions/pharmacy-actions.ts:3672`, unmodified). Row shape from Task 3 (`row.id` is the batch id, `row.medicine_id`, `row._catalog`).
- Produces: an "Actions" column in the table (new, first use of it in this file) so Task 5 can append an Edit icon into the same cell.

- [ ] **Step 1: Add the import**

In `app/pharmacy/inventory/page.tsx`, change:

```typescript
import { Package, Search, Plus, X } from 'lucide-react';
import { getInventoryPage, getInventoryCategories, addInventoryBatch } from '@/app/actions/pharmacy-actions';
```

to:

```typescript
import { Package, Search, Plus, X, SlidersHorizontal } from 'lucide-react';
import { getInventoryPage, getInventoryCategories, addInventoryBatch, adjustStock } from '@/app/actions/pharmacy-actions';
```

- [ ] **Step 2: Add adjust-modal state**

After the `const [form, setForm] = useState(...)` line inside `// Modal: Add Bulk Stock`, add:

```typescript
    // Modal: Adjust Stock
    const [adjustRow, setAdjustRow] = useState<any>(null);
    const [adjustQty, setAdjustQty] = useState('');
    const [adjustReason, setAdjustReason] = useState('');
    const [adjusting, setAdjusting] = useState(false);

    const handleAdjustStock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adjustRow) return;
        const qty = Number(adjustQty);
        if (!qty || !adjustReason.trim()) return;
        setAdjusting(true);
        try {
            const res = await adjustStock({
                medicine_id: adjustRow.medicine_id,
                batch_id: adjustRow.id,
                adjustment_qty: qty,
                reason: adjustReason.trim(),
            });
            if (res.success) {
                setAdjustRow(null);
                setAdjustQty('');
                setAdjustReason('');
                loadInventory();
            } else alert(res.error || 'Failed to adjust stock');
        } finally {
            setAdjusting(false);
        }
    };
```

- [ ] **Step 3: Add the Actions column header**

Change:

```typescript
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Rack</th>
                            </tr>
```

to:

```typescript
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Rack</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                            </tr>
```

- [ ] **Step 4: Add the Actions cell**

Change:

```typescript
                                    <td className="px-4 py-3 text-sm text-gray-600">{row.rack_location || '—'}</td>
                                </tr>
```

to:

```typescript
                                    <td className="px-4 py-3 text-sm text-gray-600">{row.rack_location || '—'}</td>
                                    <td className="px-4 py-3 text-right">
                                        {!row._catalog && (
                                            <button
                                                onClick={() => { setAdjustRow(row); setAdjustQty(''); setAdjustReason(''); }}
                                                className="p-1.5 hover:bg-amber-50 rounded-lg"
                                                title="Adjust Stock"
                                            >
                                                <SlidersHorizontal className="h-3.5 w-3.5 text-amber-500" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
```

- [ ] **Step 5: Also update the empty-state `colSpan`**

Change:

```typescript
                                <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-400">No medicines found.</td></tr>
```

to:

```typescript
                                <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-400">No medicines found.</td></tr>
```

- [ ] **Step 6: Add the Adjust Stock modal**

Immediately before the closing `</AppShell>` tag (after the existing Quick Add Modal's closing `)}`), add:

```typescript
            {/* Adjust Stock Modal */}
            {adjustRow && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleAdjustStock} className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-4 border-b bg-gray-50 flex justify-between">
                            <h3 className="font-bold">Adjust Stock &mdash; {adjustRow.medicine.brand_name} ({adjustRow.batch_no})</h3>
                            <button type="button" onClick={() => setAdjustRow(null)}>&times;</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-xs text-gray-500">Current stock: <span className="font-bold text-gray-800">{adjustRow.current_stock}</span></p>
                            <input
                                required type="number" placeholder="Adjustment (+ to add, - to deduct)"
                                className="w-full p-2 border rounded-lg text-sm"
                                value={adjustQty} onChange={e => setAdjustQty(e.target.value)}
                            />
                            <textarea
                                required placeholder="Reason (e.g. damaged, expired, count correction)"
                                className="w-full p-2 border rounded-lg text-sm" rows={3}
                                value={adjustReason} onChange={e => setAdjustReason(e.target.value)}
                            />
                            <button type="submit" disabled={adjusting} className="w-full bg-amber-600 text-white font-bold p-2 rounded-lg disabled:opacity-50">
                                {adjusting ? 'Saving...' : 'Save Adjustment'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Manual verification**

Run: `npm run dev`, open `/pharmacy/inventory`. Click the amber adjust icon on a batch row, enter a positive quantity and a reason, submit, confirm the row's stock updates and the modal closes. Repeat with a negative quantity to confirm deduction works and that attempting to deduct more than available shows the "negative stock" error from the existing `adjustStock` action.

- [ ] **Step 9: Commit**

```bash
git add app/pharmacy/inventory/page.tsx
git commit -m "feat: add Adjust Stock action to pharmacy inventory table"
```

---

## Task 5: Add "Edit Batch" action (wired to new `updateBatchDetails`)

**Files:**
- Modify: `app/pharmacy/inventory/page.tsx`

**Interfaces:**
- Consumes: `updateBatchDetails(data: { batch_id: number; batch_no?: string; expiry_date?: Date; rack_location?: string; mrp?: number; cost_price?: number }) => Promise<{ success: boolean; error?: string; batch?: any }>` from `@/app/actions/pharmacy-actions` (added in Task 2).
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Add the import**

Change:

```typescript
import { getInventoryPage, getInventoryCategories, addInventoryBatch, adjustStock } from '@/app/actions/pharmacy-actions';
```

to:

```typescript
import { getInventoryPage, getInventoryCategories, addInventoryBatch, adjustStock, updateBatchDetails } from '@/app/actions/pharmacy-actions';
```

and change:

```typescript
import { Package, Search, Plus, X, SlidersHorizontal } from 'lucide-react';
```

to:

```typescript
import { Package, Search, Plus, X, SlidersHorizontal, Pencil } from 'lucide-react';
```

- [ ] **Step 2: Add edit-modal state**

After the Task 4 adjust-modal state block (right after `handleAdjustStock`'s closing `};`), add:

```typescript
    // Modal: Edit Batch
    const [editRow, setEditRow] = useState<any>(null);
    const [editForm, setEditForm] = useState({ batch_no: '', expiry: '', rack: '', mrp: '', cost_price: '' });
    const [editing, setEditing] = useState(false);

    function openEditModal(row: any) {
        setEditRow(row);
        setEditForm({
            batch_no: row.batch_no,
            expiry: row.expiry_date ? new Date(row.expiry_date).toISOString().slice(0, 10) : '',
            rack: row.rack_location || '',
            mrp: row.mrp != null ? String(row.mrp) : '',
            cost_price: row.cost_price != null ? String(row.cost_price) : '',
        });
    }

    const handleEditBatch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editRow) return;
        setEditing(true);
        try {
            const res = await updateBatchDetails({
                batch_id: editRow.id,
                batch_no: editForm.batch_no,
                expiry_date: editForm.expiry ? new Date(editForm.expiry) : undefined,
                rack_location: editForm.rack,
                mrp: editForm.mrp ? Number(editForm.mrp) : undefined,
                cost_price: editForm.cost_price ? Number(editForm.cost_price) : undefined,
            });
            if (res.success) {
                setEditRow(null);
                loadInventory();
            } else alert(res.error || 'Failed to update batch');
        } finally {
            setEditing(false);
        }
    };
```

- [ ] **Step 3: Add the Edit icon button next to Adjust**

Change:

```typescript
                                        {!row._catalog && (
                                            <button
                                                onClick={() => { setAdjustRow(row); setAdjustQty(''); setAdjustReason(''); }}
                                                className="p-1.5 hover:bg-amber-50 rounded-lg"
                                                title="Adjust Stock"
                                            >
                                                <SlidersHorizontal className="h-3.5 w-3.5 text-amber-500" />
                                            </button>
                                        )}
```

to:

```typescript
                                        {!row._catalog && (
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => { setAdjustRow(row); setAdjustQty(''); setAdjustReason(''); }}
                                                    className="p-1.5 hover:bg-amber-50 rounded-lg"
                                                    title="Adjust Stock"
                                                >
                                                    <SlidersHorizontal className="h-3.5 w-3.5 text-amber-500" />
                                                </button>
                                                <button
                                                    onClick={() => openEditModal(row)}
                                                    className="p-1.5 hover:bg-blue-50 rounded-lg"
                                                    title="Edit Batch"
                                                >
                                                    <Pencil className="h-3.5 w-3.5 text-blue-500" />
                                                </button>
                                            </div>
                                        )}
```

- [ ] **Step 4: Add the Edit Batch modal**

Immediately before the closing `</AppShell>` tag (after the Task 4 Adjust Stock modal's closing `)}`), add:

```typescript
            {/* Edit Batch Modal */}
            {editRow && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleEditBatch} className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-4 border-b bg-gray-50 flex justify-between">
                            <h3 className="font-bold">Edit Batch &mdash; {editRow.medicine.brand_name}</h3>
                            <button type="button" onClick={() => setEditRow(null)}>&times;</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <input required placeholder="Batch No" className="w-full p-2 border rounded-lg text-sm" value={editForm.batch_no} onChange={e => setEditForm({ ...editForm, batch_no: e.target.value })} />
                            <DateField required className="w-full p-2 border rounded-lg text-sm text-gray-500" value={editForm.expiry} onChange={e => setEditForm({ ...editForm, expiry: e.target.value })} />
                            <input placeholder="Rack Location" className="w-full p-2 border rounded-lg text-sm" value={editForm.rack} onChange={e => setEditForm({ ...editForm, rack: e.target.value })} />
                            <div className="grid grid-cols-2 gap-4">
                                <input type="number" placeholder="MRP" className="w-full p-2 border rounded-lg text-sm" value={editForm.mrp} onChange={e => setEditForm({ ...editForm, mrp: e.target.value })} />
                                <input type="number" placeholder="Cost Price" className="w-full p-2 border rounded-lg text-sm" value={editForm.cost_price} onChange={e => setEditForm({ ...editForm, cost_price: e.target.value })} />
                            </div>
                            <button type="submit" disabled={editing} className="w-full bg-blue-600 text-white font-bold p-2 rounded-lg disabled:opacity-50">
                                {editing ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no new errors/warnings.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, open `/pharmacy/inventory`. Click the blue pencil icon on a batch row, change the rack location and MRP, submit, confirm the table row reflects the new values after reload. Confirm the Adjust Stock icon from Task 4 still works alongside it.

- [ ] **Step 8: Commit**

```bash
git add app/pharmacy/inventory/page.tsx
git commit -m "feat: add Edit Batch action to pharmacy inventory table"
```
