# Finance Portal Upgrades — Design Spec
**Date:** 2026-06-05  
**Status:** Approved

## Context

The finance dashboard currently shows KPI cards and revenue charts as read-only displays. Finance staff need to drill into the numbers — clicking "Outstanding ₹4.2K" should show which invoices are outstanding, clicking "Cardiology" should show which invoices make up that revenue. The reports page collections tab exists but has no payment-method filter, making it hard to reconcile cash vs UPI vs card. And the dashboard has no IPD/OPD revenue split, which is critical for hospital billing oversight.

---

## Features

### 1. Clickable KPI Cards (Dashboard)

**Files:** `app/finance/dashboard/page.tsx`, new `app/components/finance/DrillDownModal.tsx`

Each of the 6 KPI cards becomes clickable (cursor-pointer, hover ring). Clicking opens a `DrillDownModal` slide-over with the relevant data.

| Card | Modal Title | Data |
|---|---|---|
| Today's Revenue | Today's Payments | Receipt#, Patient, Method, Amount, Time |
| Total Revenue | All Revenue (period) | Invoice#, Patient, OPD/IPD, Net Amount, Status |
| Expenses (Month) | This Month's Expenses | Category, Description, Amount, Date, Approved by |
| Outstanding | Pending Invoices | Invoice#, Patient, Net Amount, Balance, Days Overdue |
| Draft Bills | Draft Invoices | Invoice#, Patient, Type, Amount, Created — rows link to `/finance/invoices/[id]` |
| Active Deposits | Active Deposits | Patient, Collected, Applied, Balance, Date |

### 2. Revenue by Department Drill-Down

**Files:** `app/finance/dashboard/page.tsx` (lines 223–253), `app/components/finance/DrillDownModal.tsx`

Each department bar in the horizontal bar chart becomes clickable. Clicking opens the DrillDownModal with:
- Header: department name + total amount
- Table: Invoice#, Patient, OPD/IPD, Items in dept, Dept Revenue, Status, Date
- Sorted by date desc, 50 rows max
- Export CSV button (reuses `ExportButton`)

### 3. Revenue by Doctor Drill-Down

**Files:** `app/finance/dashboard/page.tsx` (lines 255–288), `app/components/finance/DrillDownModal.tsx`

Each doctor bar becomes clickable. DrillDownModal shows:
- Header: doctor name + specialty + total consultation revenue
- Table: Invoice#, Patient, OPD/IPD, Consultation Fee, Status, Date
- Export CSV button

### 4. Collections Filter on Reports Page

**File:** `app/finance/reports/page.tsx`

Two new UI controls added above the Collections results table:

**Quick-filter chips:**
```
[All]  [Cash]  [UPI]  [All Others]
```
"All Others" = Card + BankTransfer + Razorpay grouped together.

**Method dropdown:** Select showing all individual methods (Cash, UPI, Card, Bank Transfer, Razorpay, All). Overrides chip selection for precise filtering.

Selecting any filter re-runs `getCollectionsReport({ from, to, method })`. For "All Others", passes `method: 'others'` — server action queries `NOT IN ['Cash', 'UPI']`. Doughnut chart and summary cards re-render. Export CSV reflects filtered rows.

No schema changes — `payments.payment_method` already stores method strings.

### 5. IPD vs OPD Revenue on Dashboard

**File:** `app/finance/dashboard/page.tsx`, `app/actions/finance-actions.ts`

**Two new KPI cards** (added to existing row, grid reflows to 4-per-row):

| Card | Color | Clickable |
|---|---|---|
| IPD Revenue `₹{ipdRevenue}K` · `{ipdCount} admissions billed` | blue | Yes → DrillDownModal type `'ipd'` |
| OPD Revenue `₹{opdRevenue}K` · `{opdCount} visits billed` | indigo | Yes → DrillDownModal type `'opd'` |

**New IPD vs OPD chart section** — side-by-side bars below the Department/Doctor charts row, using existing `ReportChart` with `type="bar"`. Shows amount + percentage label per bar.

**Data source:** `getFinanceDashboardStats()` already returns `byType: [{ type, amount, count }]` from `getRevenueByDepartment()`. No new DB query needed — just consume the existing field.

---

## Architecture

### Shared `DrillDownModal` Component

**Location:** `app/components/finance/DrillDownModal.tsx`

**Props:**
```typescript
type DrillDownType = 
  'today-revenue' | 'total-revenue' | 'expenses' | 
  'outstanding' | 'drafts' | 'deposits' |
  'department' | 'doctor' | 'ipd' | 'opd'

interface DrillDownModalProps {
  type: DrillDownType | null
  filters: Record<string, any>
  onClose: () => void
}
```

**Behavior:** On open, fires `getDrillDownData(type, filters)`. Shows skeleton loader, then renders title + table + optional export button. Closes on backdrop click or X button.

### New Server Action

**Location:** `app/actions/finance-actions.ts` — add `getDrillDownData(type, filters)`

Branches by type, returns `{ title: string, columns: string[], rows: Record<string, any>[] }`. Reuses existing Prisma queries already in the file (`getInvoices`, payments findMany, expenses findMany, deposits findMany).

For `'department'` type: `invoices.findMany` with nested `items` filter on `department`.  
For `'doctor'` type: `invoices.findMany` with nested `items` filter on `ref_id + service_category = 'Consultation'`.  
For `'ipd'` / `'opd'` types: `invoices.findMany` where `invoice_type = 'IPD'` or `'OPD'`.

### Dashboard State

```typescript
const [drillDown, setDrillDown] = useState<{ type: DrillDownType; filters: Record<string, any> } | null>(null)
```

One `<DrillDownModal>` instance at the bottom of the dashboard JSX, controlled by this state.

### Collections Filter State

```typescript
const [quickFilter, setQuickFilter] = useState<'all' | 'cash' | 'upi' | 'others'>('all')
const [methodFilter, setMethodFilter] = useState<string>('all')
```

`methodFilter` takes precedence when set to a specific value. Triggers re-fetch of `getCollectionsReport`.

---

## Files to Modify

| File | Change |
|---|---|
| `app/components/finance/DrillDownModal.tsx` | **New file** — shared modal component |
| `app/actions/finance-actions.ts` | Add `getDrillDownData()` action |
| `app/actions/report-actions.ts` | Add `'others'` method handling to `getCollectionsReport()` |
| `app/finance/dashboard/page.tsx` | Add drillDown state, onClick handlers on KPI cards + chart bars, IPD/OPD cards + chart, DrillDownModal instance |
| `app/finance/reports/page.tsx` | Add quick-filter chips + method dropdown to Collections tab |

**Reused without modification:**
- `app/components/finance/ExportButton.tsx` — used inside DrillDownModal
- `app/components/finance/ReportChart.tsx` — used for IPD/OPD chart

---

## Verification

1. **KPI cards:** Click each of 6 cards → modal opens with correct title and non-empty data rows
2. **Department bars:** Click a department bar → modal shows only invoices containing items from that department
3. **Doctor bars:** Click a doctor bar → modal shows only consultation invoices for that doctor
4. **Collections filter:** Select "Cash" chip → table and chart update to cash-only; select "Card" from dropdown → narrows further; export CSV matches visible rows
5. **IPD/OPD cards:** Two new cards visible on dashboard with correct amounts matching revenue page doughnut data
6. **IPD/OPD chart:** New bar chart renders below department/doctor charts with IPD vs OPD bars
7. **Build:** `npm run build` passes with no TypeScript errors
