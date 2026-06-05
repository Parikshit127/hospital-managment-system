# Finance Portal Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clickable KPI drill-downs, department/doctor revenue drill-downs, IPD vs OPD revenue split, and a payment-method filter to the collections report.

**Architecture:** A single shared `DrillDownModal` component handles all slide-over drill-downs. A new `getDrillDownData` server action branches by type and returns normalized rows. The dashboard and reports page receive minimal additions — click handlers, new state, and new UI sections.

**Tech Stack:** Next.js 14 App Router, React, Tailwind CSS, Prisma, TypeScript

---

## File Map

| File | Action |
|---|---|
| `app/components/finance/DrillDownModal.tsx` | **Create** — shared slide-over modal |
| `app/actions/finance-actions.ts` | **Modify** — add `getDrillDownData()` at end of file |
| `app/actions/report-actions.ts` | **Modify** — add 'others' support to `getCollectionsReport` |
| `app/finance/dashboard/page.tsx` | **Modify** — drillDown state, click handlers, IPD/OPD cards + chart |
| `app/finance/reports/page.tsx` | **Modify** — method filter chips + dropdown in `CollectionsReport` |

---

## Task 1: Add `getDrillDownData` server action

**Files:**
- Modify: `app/actions/finance-actions.ts` (append after line 1184)

- [ ] **Step 1: Append the server action to finance-actions.ts**

Add this block at the very end of `app/actions/finance-actions.ts`:

```typescript
export type DrillDownType =
    | 'today-revenue' | 'total-revenue' | 'expenses' | 'outstanding' | 'drafts' | 'deposits'
    | 'department' | 'doctor' | 'ipd' | 'opd';

export async function getDrillDownData(type: DrillDownType, filters: Record<string, any>) {
    try {
        const { db } = await requireTenantContext();
        const INR = '₹';
        const fmt = (n: number) => `${INR}${Number(n).toLocaleString('en-IN')}`;

        if (type === 'today-revenue') {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const payments = await db.payments.findMany({
                where: { status: 'Completed', created_at: { gte: today } },
                include: { invoice: { select: { invoice_number: true, patient: { select: { full_name: true } } } } },
                orderBy: { created_at: 'desc' },
            });
            return {
                success: true, data: {
                    title: "Today's Payments",
                    columns: ['Receipt #', 'Patient', 'Method', 'Amount', 'Time'],
                    rows: serialize(payments).map((p: any) => ({
                        receipt: p.receipt_number,
                        patient: p.invoice?.patient?.full_name || '-',
                        method: p.payment_method,
                        amount: fmt(Number(p.amount)),
                        time: new Date(p.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                    })),
                },
            };
        }

        if (type === 'total-revenue') {
            const invoices = await db.invoices.findMany({
                where: { status: { not: 'Cancelled' } },
                include: { patient: { select: { full_name: true } } },
                orderBy: { created_at: 'desc' },
                take: 100,
            });
            return {
                success: true, data: {
                    title: 'All Revenue — Invoices',
                    columns: ['Invoice #', 'Patient', 'Type', 'Net Amount', 'Status'],
                    rows: serialize(invoices).map((inv: any) => ({
                        invoice: inv.invoice_number,
                        patient: inv.patient?.full_name || inv.patient_id,
                        type: inv.invoice_type,
                        amount: fmt(Number(inv.net_amount)),
                        status: inv.status,
                        invoiceId: inv.id,
                    })),
                },
            };
        }

        if (type === 'outstanding') {
            const now = new Date();
            const invoices = await db.invoices.findMany({
                where: { status: { in: ['Final', 'Partial'] }, balance_due: { gt: 0 } },
                include: { patient: { select: { full_name: true } } },
                orderBy: { created_at: 'asc' },
            });
            return {
                success: true, data: {
                    title: 'Pending / Outstanding Invoices',
                    columns: ['Invoice #', 'Patient', 'Net Amount', 'Balance Due', 'Days Overdue'],
                    rows: serialize(invoices).map((inv: any) => ({
                        invoice: inv.invoice_number,
                        patient: inv.patient?.full_name || inv.patient_id,
                        amount: fmt(Number(inv.net_amount)),
                        balance: fmt(Number(inv.balance_due)),
                        days: Math.floor((now.getTime() - new Date(inv.created_at).getTime()) / (1000 * 60 * 60 * 24)) + 'd',
                        invoiceId: inv.id,
                    })),
                },
            };
        }

        if (type === 'drafts') {
            const invoices = await db.invoices.findMany({
                where: { status: 'Draft' },
                include: { patient: { select: { full_name: true } } },
                orderBy: { created_at: 'desc' },
            });
            return {
                success: true, data: {
                    title: 'Draft Bills — Awaiting Finalization',
                    columns: ['Invoice #', 'Patient', 'Type', 'Amount', 'Created'],
                    rows: serialize(invoices).map((inv: any) => ({
                        invoice: inv.invoice_number,
                        patient: inv.patient?.full_name || inv.patient_id,
                        type: inv.invoice_type,
                        amount: fmt(Number(inv.net_amount)),
                        created: new Date(inv.created_at).toLocaleDateString('en-IN'),
                        invoiceId: inv.id,
                    })),
                },
            };
        }

        if (type === 'expenses') {
            const firstOfMonth = new Date(); firstOfMonth.setDate(1); firstOfMonth.setHours(0, 0, 0, 0);
            const expenses = await db.expense.findMany({
                where: { created_at: { gte: firstOfMonth } },
                include: { category: { select: { name: true } }, vendor: { select: { vendor_name: true } } },
                orderBy: { created_at: 'desc' },
            });
            return {
                success: true, data: {
                    title: "This Month's Expenses",
                    columns: ['Expense #', 'Category', 'Description', 'Amount', 'Status', 'Date'],
                    rows: serialize(expenses).map((e: any) => ({
                        expense: e.expense_number,
                        category: e.category?.name || '-',
                        description: e.description,
                        amount: fmt(Number(e.total_amount)),
                        status: e.status,
                        date: new Date(e.created_at).toLocaleDateString('en-IN'),
                    })),
                },
            };
        }

        if (type === 'deposits') {
            const deposits = await db.patientDeposit.findMany({
                where: { status: 'Active' },
                include: { patient: { select: { full_name: true } } },
                orderBy: { created_at: 'desc' },
            });
            return {
                success: true, data: {
                    title: 'Active Patient Deposits',
                    columns: ['Patient', 'Collected', 'Applied', 'Balance', 'Date'],
                    rows: serialize(deposits).map((d: any) => ({
                        patient: d.patient?.full_name || d.patient_id,
                        collected: fmt(Number(d.amount)),
                        applied: fmt(Number(d.applied_amount || 0)),
                        balance: fmt(Number(d.amount) - Number(d.applied_amount || 0)),
                        date: new Date(d.created_at).toLocaleDateString('en-IN'),
                    })),
                },
            };
        }

        if (type === 'department') {
            const dept = filters.department as string;
            const invoices = await db.invoices.findMany({
                where: {
                    status: { not: 'Cancelled' },
                    items: { some: { department: dept } },
                },
                include: {
                    patient: { select: { full_name: true } },
                    items: { where: { department: dept }, select: { net_price: true, description: true } },
                },
                orderBy: { created_at: 'desc' },
                take: 100,
            });
            return {
                success: true, data: {
                    title: `Revenue — ${dept}`,
                    columns: ['Invoice #', 'Patient', 'Type', 'Dept Revenue', 'Status', 'Date'],
                    rows: serialize(invoices).map((inv: any) => ({
                        invoice: inv.invoice_number,
                        patient: inv.patient?.full_name || inv.patient_id,
                        type: inv.invoice_type,
                        amount: fmt(inv.items.reduce((s: number, it: any) => s + Number(it.net_price), 0)),
                        status: inv.status,
                        date: new Date(inv.created_at).toLocaleDateString('en-IN'),
                        invoiceId: inv.id,
                    })),
                },
            };
        }

        if (type === 'doctor') {
            const doctorId = filters.doctorId as string;
            const doctorName = filters.doctorName as string;
            const invoices = await db.invoices.findMany({
                where: {
                    status: { not: 'Cancelled' },
                    items: { some: { ref_id: doctorId, service_category: 'Consultation' } },
                },
                include: {
                    patient: { select: { full_name: true } },
                    items: { where: { ref_id: doctorId, service_category: 'Consultation' }, select: { net_price: true } },
                },
                orderBy: { created_at: 'desc' },
                take: 100,
            });
            return {
                success: true, data: {
                    title: `Consultation Revenue — ${doctorName}`,
                    columns: ['Invoice #', 'Patient', 'Type', 'Consultation Fee', 'Status', 'Date'],
                    rows: serialize(invoices).map((inv: any) => ({
                        invoice: inv.invoice_number,
                        patient: inv.patient?.full_name || inv.patient_id,
                        type: inv.invoice_type,
                        amount: fmt(inv.items.reduce((s: number, it: any) => s + Number(it.net_price), 0)),
                        status: inv.status,
                        date: new Date(inv.created_at).toLocaleDateString('en-IN'),
                        invoiceId: inv.id,
                    })),
                },
            };
        }

        if (type === 'ipd' || type === 'opd') {
            const invoiceType = type.toUpperCase();
            const invoices = await db.invoices.findMany({
                where: { invoice_type: invoiceType, status: { not: 'Cancelled' } },
                include: { patient: { select: { full_name: true } } },
                orderBy: { created_at: 'desc' },
                take: 100,
            });
            return {
                success: true, data: {
                    title: `${invoiceType} Invoices`,
                    columns: ['Invoice #', 'Patient', 'Net Amount', 'Paid', 'Balance', 'Status', 'Date'],
                    rows: serialize(invoices).map((inv: any) => ({
                        invoice: inv.invoice_number,
                        patient: inv.patient?.full_name || inv.patient_id,
                        amount: fmt(Number(inv.net_amount)),
                        paid: fmt(Number(inv.paid_amount)),
                        balance: fmt(Number(inv.balance_due)),
                        status: inv.status,
                        date: new Date(inv.created_at).toLocaleDateString('en-IN'),
                        invoiceId: inv.id,
                    })),
                },
            };
        }

        return { success: false, error: 'Unknown drill-down type' };
    } catch (error: any) {
        console.error('getDrillDownData error:', error);
        return { success: false, error: error.message };
    }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "finance-actions"
```
Expected: no output (no errors in that file).

---

## Task 2: Create `DrillDownModal` component

**Files:**
- Create: `app/components/finance/DrillDownModal.tsx`

- [ ] **Step 1: Create the component file**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, ExternalLink } from 'lucide-react';
import { getDrillDownData, DrillDownType } from '@/app/actions/finance-actions';
import Link from 'next/link';

interface DrillDownModalProps {
    type: DrillDownType;
    filters: Record<string, any>;
    onClose: () => void;
}

export function DrillDownModal({ type, filters, onClose }: DrillDownModalProps) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{ title: string; columns: string[]; rows: Record<string, any>[] } | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        setLoading(true);
        setError('');
        getDrillDownData(type, filters).then(res => {
            if (res.success) setData((res as any).data);
            else setError((res as any).error || 'Failed to load');
            setLoading(false);
        });
    }, [type, JSON.stringify(filters)]);

    // Close on backdrop click
    const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    const exportCsv = () => {
        if (!data) return;
        const headers = data.columns.join(',');
        const rowKeys = data.rows[0] ? Object.keys(data.rows[0]).filter(k => k !== 'invoiceId') : [];
        const rows = data.rows.map(r => rowKeys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','));
        const csv = [headers, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${type}-drilldown.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={handleBackdrop}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

            {/* Slide-over panel */}
            <div className="relative z-10 w-full max-w-3xl bg-white shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
                    <h2 className="text-base font-black text-gray-900">{data?.title || 'Loading...'}</h2>
                    <div className="flex items-center gap-2">
                        {data && data.rows.length > 0 && (
                            <button onClick={exportCsv}
                                className="px-3 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">
                                Export CSV
                            </button>
                        )}
                        <button onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-24 gap-4">
                            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                            <p className="text-xs font-bold text-gray-400">Loading detail...</p>
                        </div>
                    )}
                    {!loading && error && (
                        <div className="p-6 text-center text-rose-500 text-sm font-medium">{error}</div>
                    )}
                    {!loading && data && data.rows.length === 0 && (
                        <div className="p-12 text-center text-gray-400 text-sm">No data found.</div>
                    )}
                    {!loading && data && data.rows.length > 0 && (
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                                <tr>
                                    {data.columns.map(col => (
                                        <th key={col} className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider whitespace-nowrap">
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data.rows.map((row, i) => {
                                    const rowKeys = Object.keys(row).filter(k => k !== 'invoiceId');
                                    return (
                                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                                            {rowKeys.map((key, j) => (
                                                <td key={key} className="px-4 py-3 text-gray-700 whitespace-nowrap">
                                                    {/* First column with invoiceId gets a link */}
                                                    {j === 0 && row.invoiceId ? (
                                                        <Link href={`/finance/invoices/${row.invoiceId}`}
                                                            className="font-mono text-emerald-600 hover:text-emerald-800 hover:underline flex items-center gap-1">
                                                            {row[key]} <ExternalLink className="h-3 w-3" />
                                                        </Link>
                                                    ) : (
                                                        <span className={key === 'status' ? getStatusClass(String(row[key])) : key === 'type' ? getTypeClass(String(row[key])) : ''}>
                                                            {row[key]}
                                                        </span>
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer count */}
                {data && (
                    <div className="px-6 py-3 border-t border-gray-100 flex-shrink-0">
                        <p className="text-[10px] font-bold text-gray-400">{data.rows.length} record{data.rows.length !== 1 ? 's' : ''}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function getStatusClass(status: string): string {
    const map: Record<string, string> = {
        Draft: 'px-2 py-0.5 rounded text-[10px] font-black text-slate-500 bg-slate-100',
        Final: 'px-2 py-0.5 rounded text-[10px] font-black text-amber-600 bg-amber-50',
        Paid: 'px-2 py-0.5 rounded text-[10px] font-black text-emerald-600 bg-emerald-50',
        Partial: 'px-2 py-0.5 rounded text-[10px] font-black text-orange-600 bg-orange-50',
        Cancelled: 'px-2 py-0.5 rounded text-[10px] font-black text-rose-600 bg-rose-50',
        Active: 'px-2 py-0.5 rounded text-[10px] font-black text-emerald-600 bg-emerald-50',
    };
    return map[status] || '';
}

function getTypeClass(type: string): string {
    return type === 'IPD'
        ? 'px-2 py-0.5 rounded text-[10px] font-black text-violet-600 bg-violet-50'
        : 'px-2 py-0.5 rounded text-[10px] font-black text-teal-600 bg-teal-50';
}
```

- [ ] **Step 2: Verify no TypeScript errors in the new file**

```bash
npx tsc --noEmit 2>&1 | grep "DrillDownModal"
```
Expected: no output.

---

## Task 3: Wire KPI card click handlers on the dashboard

**Files:**
- Modify: `app/finance/dashboard/page.tsx`

- [ ] **Step 1: Add `DrillDownModal` import and `DrillDownType` import to the dashboard**

In `app/finance/dashboard/page.tsx`, find the existing imports block (lines 1–19) and add:

```typescript
import { DrillDownModal } from '@/app/components/finance/DrillDownModal';
import type { DrillDownType } from '@/app/actions/finance-actions';
```

Place these after the existing imports (after line 19). Note: only the *type* is imported here — `getDrillDownData` is called inside `DrillDownModal`, not the dashboard.

- [ ] **Step 2: Add drillDown state after the existing state declarations**

After line 42 (`const [detailModal, setDetailModal] = useState<any>(null);`), add:

```typescript
const [drillDown, setDrillDown] = useState<{ type: DrillDownType; filters: Record<string, any> } | null>(null);
```

- [ ] **Step 3: Map KPI card types**

The `kpiCards` array (lines 134–141) needs a `drillType` field. Replace the entire `kpiCards` array with:

```typescript
const kpiCards = [
    { label: "Today's Revenue", value: `${INR}${((stats?.todayRevenue || 0) / 1000).toFixed(1)}K`, sub: `${stats?.totalPaymentsToday || 0} transactions`, icon: <DollarSign className="h-3.5 w-3.5 text-emerald-400" />, color: 'emerald', subIcon: <ArrowUpRight className="h-3 w-3" />, drillType: 'today-revenue' as DrillDownType },
    { label: 'Total Revenue', value: `${INR}${((stats?.totalRevenue || 0) / 1000).toFixed(1)}K`, sub: `${stats?.totalInvoices || 0} invoices`, icon: <Wallet className="h-3.5 w-3.5 text-teal-400" />, color: 'teal', subIcon: <TrendingUp className="h-3 w-3" />, drillType: 'total-revenue' as DrillDownType },
    { label: 'Expenses (Month)', value: `${INR}${((expenseStats?.thisMonthTotal || 0) / 1000).toFixed(1)}K`, sub: `${expenseStats?.pendingApproval || 0} pending approval`, icon: <TrendingDown className="h-3.5 w-3.5 text-red-400" />, color: 'red', subIcon: <Clock className="h-3 w-3" />, drillType: 'expenses' as DrillDownType },
    { label: 'Outstanding', value: `${INR}${((stats?.pendingBalance || 0) / 1000).toFixed(1)}K`, sub: `${stats?.outstandingInvoices || 0} pending`, icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />, color: 'amber', subIcon: <Clock className="h-3 w-3" />, drillType: 'outstanding' as DrillDownType },
    { label: 'Draft Bills', value: String(stats?.draftInvoices || 0), sub: 'Awaiting finalization', icon: <FileText className="h-3.5 w-3.5 text-violet-400" />, color: 'violet', subIcon: <FileText className="h-3 w-3" />, drillType: 'drafts' as DrillDownType },
    { label: 'Active Deposits', value: `${INR}${((depositStats?.activeBalance || 0) / 1000).toFixed(1)}K`, sub: `${depositStats?.activeDeposits || 0} active`, icon: <Wallet className="h-3.5 w-3.5 text-cyan-400" />, color: 'cyan', subIcon: <Receipt className="h-3 w-3" />, drillType: 'deposits' as DrillDownType },
];
```

- [ ] **Step 4: Make KPI cards clickable**

Find the KPI card div (line 176):
```typescript
<div key={i} className={`group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-${c.color}-500/30 transition-all overflow-hidden`}>
```

Replace with:
```typescript
<div key={i}
    onClick={() => c.drillType && setDrillDown({ type: c.drillType, filters: {} })}
    className={`group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-${c.color}-500/30 transition-all overflow-hidden ${c.drillType ? 'cursor-pointer hover:shadow-md hover:scale-[1.01]' : ''}`}>
```

- [ ] **Step 5: Add `DrillDownModal` instance before the closing `</AppShell>` tag**

Find the line `{detailModal && <InvoiceDetailModal invoice={detailModal} onClose={() => setDetailModal(null)} />}` (line 416) and add below it:

```typescript
{drillDown && (
    <DrillDownModal
        type={drillDown.type}
        filters={drillDown.filters}
        onClose={() => setDrillDown(null)}
    />
)}
```

---

## Task 4: Wire Department and Doctor chart bar click handlers

**Files:**
- Modify: `app/finance/dashboard/page.tsx`

- [ ] **Step 1: Make each department bar row clickable**

Find the department bar item (line 236):
```typescript
<div key={i} className="flex items-center gap-3">
```

Replace with:
```typescript
<div key={i}
    className="flex items-center gap-3 cursor-pointer rounded-lg hover:bg-emerald-50/50 px-1 -mx-1 py-0.5 transition-colors group/dept"
    onClick={() => setDrillDown({ type: 'department', filters: { department: dept.department } })}>
```

- [ ] **Step 2: Make each doctor bar row clickable**

Find the doctor bar item (line 268):
```typescript
<div key={i} className="flex items-center gap-3">
```

Replace with:
```typescript
<div key={i}
    className="flex items-center gap-3 cursor-pointer rounded-lg hover:bg-violet-50/50 px-1 -mx-1 py-0.5 transition-colors group/doc"
    onClick={() => setDrillDown({ type: 'doctor', filters: { doctorId: doc.doctorId, doctorName: doc.doctorName } })}>
```

---

## Task 5: Add IPD/OPD KPI cards and chart to dashboard

**Files:**
- Modify: `app/finance/dashboard/page.tsx`

- [ ] **Step 1: Extract IPD/OPD data from existing stats**

The dashboard already receives `stats?.revenueByType` — but this comes from `getFinanceDashboardStats` which currently does NOT include `byType`. We need to add a parallel query.

In `finance-actions.ts`, inside `getFinanceDashboardStats` (around line 1055), add two items to the `Promise.all` destructure and query list.

Find this line:
```typescript
const [
    totalInvoices,
    draftInvoices,
    ...
    aging60plus,
] = await Promise.all([
    db.invoices.count({ where: { status: { not: 'Cancelled' } } }),
    ...
    db.invoices.aggregate({ ... lt: sixtyDaysAgo ... }),
]);
```

Add two more items at the END of the destructure array and the Promise.all array:

At the end of the destructure list (after `aging60plus,`), add:
```
ipdRevenue,
opdRevenue,
```

At the end of the Promise.all array (after the `aging60plus` aggregate), add:
```typescript
db.invoices.aggregate({
    _sum: { net_amount: true },
    _count: { _all: true },
    where: { invoice_type: 'IPD', status: { not: 'Cancelled' } },
}),
db.invoices.aggregate({
    _sum: { net_amount: true },
    _count: { _all: true },
    where: { invoice_type: 'OPD', status: { not: 'Cancelled' } },
}),
```

Then in the return `data` object (after `aging: { ... }`), add:
```typescript
ipdRevenue: Number(ipdRevenue._sum.net_amount || 0),
ipdCount: ipdRevenue._count._all,
opdRevenue: Number(opdRevenue._sum.net_amount || 0),
opdCount: opdRevenue._count._all,
```

- [ ] **Step 2: Add two new IPD/OPD KPI cards**

In the dashboard page, find the `kpiCards` array you edited in Task 3. The array currently has 6 items. Add two more items at the end:

```typescript
{ label: 'IPD Revenue', value: `${INR}${((stats?.ipdRevenue || 0) / 1000).toFixed(1)}K`, sub: `${stats?.ipdCount || 0} admissions billed`, icon: <Wallet className="h-3.5 w-3.5 text-blue-400" />, color: 'blue', subIcon: <TrendingUp className="h-3 w-3" />, drillType: 'ipd' as DrillDownType },
{ label: 'OPD Revenue', value: `${INR}${((stats?.opdRevenue || 0) / 1000).toFixed(1)}K`, sub: `${stats?.opdCount || 0} visits billed`, icon: <Wallet className="h-3.5 w-3.5 text-indigo-400" />, color: 'indigo', subIcon: <TrendingUp className="h-3 w-3" />, drillType: 'opd' as DrillDownType },
```

Also change the grid class from `grid-cols-6` to `grid-cols-4` (it currently is `lg:grid-cols-6`):

Find:
```typescript
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
```
Replace with:
```typescript
<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
```

- [ ] **Step 3: Add IPD vs OPD chart section**

In `app/finance/dashboard/page.tsx`, find the Outstanding Aging Report section (line 292). Add a new section BEFORE it:

```tsx
{/* IPD vs OPD Split */}
{(stats?.ipdRevenue || stats?.opdRevenue) ? (
    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-gray-200">
            <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4 text-blue-400" /> IPD vs OPD Revenue
            </h3>
        </div>
        <div className="p-5">
            {(() => {
                const total = (stats?.ipdRevenue || 0) + (stats?.opdRevenue || 0);
                const ipdPct = total > 0 ? Math.round(((stats?.ipdRevenue || 0) / total) * 100) : 0;
                const opdPct = total > 0 ? 100 - ipdPct : 0;
                return (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-gray-500 w-12">IPD</span>
                            <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-700 flex items-center justify-end pr-2"
                                    style={{ width: `${ipdPct}%` }}>
                                    {ipdPct > 8 && <span className="text-[10px] font-black text-white">{ipdPct}%</span>}
                                </div>
                            </div>
                            <span className="text-xs font-black text-gray-700 w-24 text-right">{INR}{((stats?.ipdRevenue || 0) / 1000).toFixed(1)}K</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-gray-500 w-12">OPD</span>
                            <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-700 flex items-center justify-end pr-2"
                                    style={{ width: `${opdPct}%` }}>
                                    {opdPct > 8 && <span className="text-[10px] font-black text-white">{opdPct}%</span>}
                                </div>
                            </div>
                            <span className="text-xs font-black text-gray-700 w-24 text-right">{INR}{((stats?.opdRevenue || 0) / 1000).toFixed(1)}K</span>
                        </div>
                        <div className="flex gap-4 pt-2 border-t border-gray-100">
                            <button onClick={() => setDrillDown({ type: 'ipd', filters: {} })}
                                className="text-[10px] font-bold text-blue-500 hover:text-blue-700 hover:underline">
                                View IPD invoices →
                            </button>
                            <button onClick={() => setDrillDown({ type: 'opd', filters: {} })}
                                className="text-[10px] font-bold text-teal-500 hover:text-teal-700 hover:underline">
                                View OPD invoices →
                            </button>
                        </div>
                    </div>
                );
            })()}
        </div>
    </div>
) : null}
```

---

## Task 6: Add 'others' payment method support to `getCollectionsReport`

**Files:**
- Modify: `app/actions/report-actions.ts` (lines 13–39)

- [ ] **Step 1: Update the where-clause logic**

Find (lines 16–20):
```typescript
const where: any = {
    status: 'Completed',
    created_at: { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') },
};
if (filters.method) where.payment_method = filters.method;
```

Replace with:
```typescript
const where: any = {
    status: 'Completed',
    created_at: { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') },
};
if (filters.method && filters.method !== 'others') {
    where.payment_method = filters.method;
} else if (filters.method === 'others') {
    where.payment_method = { notIn: ['Cash', 'UPI'] };
}
```

---

## Task 7: Add payment method filter UI to the Collections tab

**Files:**
- Modify: `app/finance/reports/page.tsx`

- [ ] **Step 1: Add `methodFilter` and `quickFilter` state to the parent page component**

In `FinancialReportsPage` function, find the existing state declarations (lines 35–39) and add two new ones:

```typescript
const [quickFilter, setQuickFilter] = useState<'all' | 'cash' | 'upi' | 'others'>('all');
const [methodFilter, setMethodFilter] = useState<string>('all');
```

- [ ] **Step 2: Thread the active filter into the `loadReport` call for collections**

Find the `loadReport` function's collections case (line 48):
```typescript
case 'collections': res = await getCollectionsReport({ from, to }); break;
```

Replace with:
```typescript
case 'collections': {
    const activeMethod = methodFilter !== 'all' ? methodFilter : quickFilter !== 'all' ? quickFilter : undefined;
    res = await getCollectionsReport({ from, to, method: activeMethod });
    break;
}
```

- [ ] **Step 3: Add `methodFilter` and `quickFilter` to the `useEffect` dependency array**

Find:
```typescript
useEffect(() => { loadReport(); }, [activeReport, from, to]);
```

Replace with:
```typescript
useEffect(() => { loadReport(); }, [activeReport, from, to, quickFilter, methodFilter]);
```

- [ ] **Step 4: Reset filters when switching away from collections tab**

Find where `setActiveReport` is called (line 71):
```typescript
onClick={() => setActiveReport(tab.key)}
```

Replace with:
```typescript
onClick={() => { setActiveReport(tab.key); setQuickFilter('all'); setMethodFilter('all'); }}
```

- [ ] **Step 5: Pass filter state down to `CollectionsReport` component**

Find line 100:
```typescript
{activeReport === 'collections' && <CollectionsReport data={data} fmt={fmt} from={from} to={to} />}
```

Replace with:
```typescript
{activeReport === 'collections' && (
    <CollectionsReport
        data={data} fmt={fmt} from={from} to={to}
        quickFilter={quickFilter} setQuickFilter={setQuickFilter}
        methodFilter={methodFilter} setMethodFilter={setMethodFilter}
    />
)}
```

- [ ] **Step 6: Update the `CollectionsReport` function signature and add filter UI**

Find the function signature (line 113):
```typescript
function CollectionsReport({ data, fmt, from, to }: { data: any; fmt: (n: number) => string; from: string; to: string }) {
```

Replace with:
```typescript
function CollectionsReport({ data, fmt, from, to, quickFilter, setQuickFilter, methodFilter, setMethodFilter }: {
    data: any; fmt: (n: number) => string; from: string; to: string;
    quickFilter: string; setQuickFilter: (v: any) => void;
    methodFilter: string; setMethodFilter: (v: string) => void;
}) {
```

Then add the filter UI. Find the opening `<>` of `CollectionsReport` return (after the function signature), and add the filter bar as the first element before the summary cards grid:

```tsx
return (
    <>
        {/* Payment Method Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3">
            <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Filter by method</span>
            <div className="flex gap-1.5">
                {(['all', 'cash', 'upi', 'others'] as const).map(f => (
                    <button key={f}
                        onClick={() => { setQuickFilter(f); setMethodFilter('all'); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${
                            quickFilter === f && methodFilter === 'all'
                                ? 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/30'
                                : 'bg-gray-100 text-gray-500 border border-gray-200 hover:text-gray-800'
                        }`}>
                        {f === 'all' ? 'All' : f === 'others' ? 'All Others' : f.toUpperCase()}
                    </button>
                ))}
            </div>
            <select
                value={methodFilter}
                onChange={e => { setMethodFilter(e.target.value); setQuickFilter('all'); }}
                className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-500 focus:outline-none focus:border-emerald-500/50 ml-1">
                <option value="all">Any Method</option>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="BankTransfer">Bank Transfer</option>
                <option value="Razorpay">Razorpay</option>
            </select>
        </div>

        {/* rest of existing JSX unchanged */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
```

> **Important:** The original `CollectionsReport` returns `<>` wrapping a grid, chart, and table. Keep those intact — only insert the filter bar div BEFORE the existing `<div className="grid ...">` inside the fragment.

---

## Task 8: Run build and verify

**Files:** None modified — verification only.

- [ ] **Step 1: Run type check**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 2: Run Next.js build**

```bash
npm run build 2>&1 | tail -20
```
Expected: `Route (app)` table with no red errors, ends with `✓ Compiled successfully`.

- [ ] **Step 3: Manual verification checklist**

Start dev server (`npm run dev`) and verify:

1. Finance dashboard loads — 8 KPI cards visible (6 original + IPD + OPD)
2. Click "Today's Revenue" → slide-over opens with payment rows
3. Click "Outstanding" → slide-over shows invoices with balance
4. Click "Draft Bills" → slide-over shows draft invoices, rows link to `/finance/invoices/[id]`
5. Click "Active Deposits" → slide-over shows deposits
6. Click a department bar → slide-over shows invoices for that department
7. Click a doctor bar → slide-over shows consultation invoices for that doctor
8. IPD/OPD horizontal bars visible below the dept/doctor charts with percentage labels
9. "View IPD invoices →" link opens drill-down modal
10. Navigate to `http://localhost:3000/finance/reports` → Collections tab
11. Click "Cash" chip → table/chart updates to cash-only rows
12. Click "UPI" chip → updates to UPI rows
13. Click "All Others" chip → updates to Card+BankTransfer+Razorpay rows
14. Select "Card" from dropdown → narrows to card-only
15. Click Export CSV on any drill-down → CSV file downloads with correct rows
