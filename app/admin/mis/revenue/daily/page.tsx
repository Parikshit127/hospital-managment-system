import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { TrendingUp } from 'lucide-react';
import { DailyRevenueShell } from '@/components/mis/DailyRevenueShell';
import type { RevenuePayload, RevenueRow, RevenueTotals } from '@/components/mis/RevenueTable';
import { generateReport } from '@/app/actions/mis-report-actions';

export const metadata: Metadata = {
    title: 'Daily Revenue Report — MIS | HospitalOS',
    description: 'Management Information System — granular daily revenue breakdown by doctor, department, and payer.',
};

// ─── Next.js 14: searchParams is a Promise ────────────────────────────────────
// With strict:true the prop type MUST be Promise<...> and must be awaited before
// reading individual keys. Passing it unsettled to a child is a type error.
type RawSearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// ─── URL param → Zod filter key mapping ──────────────────────────────────────
// MISFilterEngine writes to the URL with the keys:  startDate | endDate | doctor
// The Zod schema in lib/mis/registry/billing.ts expects: date_start | date_end
// This function is the single translation layer between the two namespaces.
// `doctor` is intentionally excluded — it is not a Prisma-level filter key and
// is handled client-side inside DailyRevenueShell.
function buildFilters(sp: Awaited<RawSearchParams>): {
    date_start: string;
    date_end: string;
    branch_id?: string;
    department_id?: string;
} {
    // Coerce string | string[] | undefined → string | undefined
    const raw = (key: string): string | undefined => {
        const v = sp[key];
        return Array.isArray(v) ? v[0] : v;
    };

    // Default window: last 30 days — matches the existing Reports Hub behaviour.
    const today = new Date();
    const thirtyAgo = new Date(today);
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const iso = (d: Date) => d.toISOString().split('T')[0];

    return {
        date_start: raw('startDate') ?? iso(thirtyAgo),
        date_end: raw('endDate') ?? iso(today),
        branch_id: raw('branch_id'),     // reserved — multi-branch filter
        department_id: raw('department_id'), // reserved — department-level filter
    };
}

// ─── Type narrowing: GenerateReportResponse → RevenuePayload ─────────────────
// generateReport() returns GenerateReportResponse from lib/mis/action-types.ts.
// Its `rows` field is the intentionally generic `Record<string, unknown>[]` and
// its `totals` is `Record<string, number>` — the backend doesn't know about our
// frontend-specific interfaces.
//
// We perform a single explicit cast at this boundary (the only place in the app
// that bridges backend generics to frontend types). The cast is safe because the
// SQL column aliases in lib/mis/registry/billing.ts queryFn are guaranteed to
// produce exactly the keys defined in RevenueRow:
//   date, department, doctor_name, payer_type,
//   billed_amount, collected_amount, invoice_count
function toRevenuePayload(
    response: Awaited<ReturnType<typeof generateReport>>
): RevenuePayload {
    return {
        async: response.async,
        jobId: response.jobId,
        // Cast from Record<string, unknown>[] → RevenueRow[]
        // Safe: queryFn column aliases in billing.ts match RevenueRow exactly.
        rows: response.rows as RevenueRow[] | undefined,
        // Cast from Record<string, number> → RevenueTotals
        // Safe: queryFn reduce() produces exactly { billed_amount, collected_amount, invoice_count }.
        totals: response.totals as RevenueTotals | undefined,
    };
}

// ─── Page ────────────────────────────────────────────────────────────────────

interface DailyRevenuePageProps {
    searchParams: RawSearchParams;
}

export default async function DailyRevenuePage({ searchParams }: DailyRevenuePageProps) {
    // 1. Settle the Next.js 14 searchParams Promise
    const resolvedParams = await searchParams;

    // 2. Map URL param keys → Zod-validated filter keys
    const filters = buildFilters(resolvedParams);

    // 3. Invoke the Server Action
    //    generateReport validates filters internally via the Zod schema in
    //    lib/mis/registry/billing.ts and returns GenerateReportResponse.
    const response = await generateReport('billing-revenue-daily', filters);

    // 4. Narrow the generic backend response to the typed frontend payload.
    //    This is the only cast in the module — isolated here so every downstream
    //    component (DailyRevenueShell, RevenueTable) works with strict types.
    const payload = toRevenuePayload(response);

    return (
        <AdminPage
            pageTitle="MIS — Daily Revenue Report"
            pageIcon={<TrendingUp className="h-5 w-5" />}
        >
            {/*
             * Suspense boundary is mandatory: DailyRevenueShell calls
             * useSearchParams() in a Client Component subtree, which
             * suspends during SSR without this boundary.
             */}
            <Suspense fallback={<RevenuePageSkeleton />}>
                <DailyRevenueShell payload={payload} />
            </Suspense>
        </AdminPage>
    );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function RevenuePageSkeleton() {
    return (
        <div className="space-y-4 animate-pulse">
            <div className="h-16 bg-gray-100 rounded-2xl" />
            <div className="grid grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-20 bg-gray-100 rounded-2xl" />
                ))}
            </div>
            <div className="h-[420px] bg-gray-100 rounded-2xl" />
        </div>
    );
}
