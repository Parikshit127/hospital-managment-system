import { z } from 'zod';

export enum ReportCategory {
  Registration = 'Registration',
  Appointment = 'Appointment',
  Billing = 'Billing',
  Diagnostic = 'Diagnostic',
  Pharmacy = 'Pharmacy',
  Admission = 'Admission',
  OT = 'OT',
  Inventory = 'Inventory',
  Ambulance = 'Ambulance',
  Optical = 'Optical',
  Revenue = 'Revenue',
  Daily_Revenue = 'Daily Revenue',
}

export interface FilterSpec {
  showDepartment?:      boolean;
  showDoctor?:          boolean;
  showBillType?:        boolean;  // Cash | TPA | Corporate | All
  showStatus?:          boolean;
  showStore?:           boolean;
  showWard?:            boolean;  // renders Ward dropdown (fetches from /api/wards) — used by IPD/admission reports
  showBranch?:          boolean;  // renders Branch dropdown (fetches from /api/admin/branches) — used by Billing Summary etc.
  showServiceCategory?: boolean;  // renders static billing-category dropdown (Package/Inventory/Pharmacy/Consultation)
                                  // DISTINCT from showDepartment which fetches clinical departments
  statusOptions?:       string[]; // e.g. ['Pending', 'Completed', 'Cancelled']
}

export interface ColumnSpec {
  key: string;
  label: string;
  type: 'string' | 'number' | 'currency' | 'date' | 'percent';
  align?: 'left' | 'center' | 'right';
  total?: 'sum' | 'avg';
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'doughnut';
  xAxisKey: string;
  yAxisKeys: string[];
  colors?: string[];
}

export type ValidatedFilters = Record<string, any>;

export interface ReportDefinition {
  id: string;                          // e.g. "billing-revenue-daily"
  category: ReportCategory;            // enum: Registration/Appointment/Billing...
  name: string;
  description: string;
  filters: z.ZodSchema;                // ZodSchema for validation
  columns: ColumnSpec[];               // e.g. { key, label, type, align, total }
  defaultSort: { column: string; direction: 'asc' | 'desc' };
  rowLimitSync: number;                // default 5000 — above this triggers async job
  queryFn: (filters: ValidatedFilters, orgId: string) => Promise<{ rows: Record<string, unknown>[]; totals: Record<string, number> }>;
  /**
   * Optional fast COUNT(*) query for the async threshold check in runner.ts.
   *
   * ## Why this exists
   *   `runner.ts` must decide sync vs async BEFORE running the full query.
   *   Running the full query just to count rows defeats the purpose — for a
   *   50,000-row report, that is an OOM-risk DB round-trip.
   *
   * ## When to define it
   *   Define `countFn` only on reports whose underlying query can return
   *   O(tens-of-thousands) rows — i.e., row-level detail reports backed by
   *   large tables (invoice_items, pharmacy_order_items, etc.).
   *
   *   Aggregated/grouped reports (billing-summary, pharmacy-ip-issue, etc.)
   *   return O(hundreds) of grouped rows at most — the runner's fallback
   *   path (run queryFn, check rows.length) is safe and correct for these.
   *
   * ## When to omit it
   *   If omitted, runner.ts executes queryFn synchronously and falls back to
   *   checking `rows.length` against `rowLimitSync` — identical to the
   *   previous mock-100 behaviour but now using real row counts.
   *
   * ## Implementation pattern
   *   Mirror the queryFn WHERE clause exactly, but replace the SELECT with
   *   `SELECT COUNT(*) as "count"` and remove GROUP BY / ORDER BY.
   *   Keep all filter predicates so the count reflects the actual result set.
   *
   * @param filters  Validated filters (same shape as queryFn receives).
   * @param orgId    Organisation ID for multi-tenant isolation.
   * @returns        Estimated row count (number, not BigInt).
   */
  countFn?: (filters: ValidatedFilters, orgId: string) => Promise<number>;
  filterSpec?: FilterSpec;             // dynamic filter options
  chartSpec?: ChartSpec;               // optional Chart.js spec for visual reports
  drillDownTo?:  string;               // report_id of the detail report for drill-down
  drillDownKey?: string;               // row field whose value is forwarded as filter param to drillDownTo
  requiredPermission: string;          // e.g. "mis_reports.billing.view"
  moduleFlag?: string;                 // e.g. "optical" — hides report if module disabled
}

