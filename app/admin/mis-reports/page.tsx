import type { Metadata } from 'next';
import { LayoutGrid } from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { listCatalogue } from '@/app/actions/mis-report-actions';
import { CatalogueShell, type CatalogueEntry } from '@/components/mis/CatalogueShell';

export const dynamic = 'force-dynamic';

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
    title: 'MIS Reports — HospitalOS',
    description:
        'Management Information System report catalogue. Browse and run operational, financial, and clinical reports.',
};

// ─── Type narrowing ───────────────────────────────────────────────────────────

/**
 * `listCatalogue()` returns `Record<string, any[]>` from the Server Action.
 * Each entry still contains a `filters` key that holds a live `z.ZodSchema`
 * instance — a class object that Next.js **cannot serialise** across the
 * Server→Client boundary.
 *
 * This function strips every non-serialisable field before we pass the data
 * to the `CatalogueShell` Client Component, producing a clean `CatalogueEntry`
 * that contains only JSON-safe primitives.
 *
 * Fields stripped:
 *   - `filters`     (z.ZodSchema  — class instance, non-serialisable)
 *   - `columns`     (ColumnSpec[] — not needed by the catalogue UI)
 *   - `defaultSort` (object       — not needed by the catalogue UI)
 *
 * This is the ONLY place in the codebase where this narrowing occurs,
 * keeping the trust boundary explicit and auditable.
 */
function toSafeCatalogueEntry(raw: Record<string, unknown>): CatalogueEntry {
    return {
        id: raw.id as string,
        category: raw.category as string,
        name: raw.name as string,
        description: raw.description as string,
        requiredPermission: raw.requiredPermission as string,
        rowLimitSync: raw.rowLimitSync as number,
        moduleFlag: raw.moduleFlag as string | undefined,
    };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * MIS Report Catalogue — Server Component
 * ----------------------------------------
 * Responsibilities:
 *   1. Call `listCatalogue()` in the Node.js context (safe for Prisma + ZodSchema).
 *   2. Strip non-serialisable fields via `toSafeCatalogueEntry()`.
 *   3. Exclude categories with zero reports (per Q1 decision: hide empty cats).
 *   4. Compute `totalCount` for the stats strip.
 *   5. Pass the clean, serialised payload to the Client Component `CatalogueShell`.
 *
 * No `Suspense` boundary needed here: this is a pure async Server Component —
 * `useSearchParams` is NOT called anywhere in this subtree. CatalogueShell's
 * search state is `useState`-only, not tied to URL params.
 */
export default async function MISCataloguePage() {
    // 1. Fetch — runs in Node.js; Zod instances are fine here in memory.
    const rawCatalogue = await listCatalogue();

    // 2. Narrow + strip every category's entries.
    const safeCatalogue: Record<string, CatalogueEntry[]> = {};
    let totalCount = 0;

    for (const [category, rawEntries] of Object.entries(rawCatalogue)) {
        if (!rawEntries) continue;

        safeCatalogue[category] = rawEntries.map((r: Record<string, unknown>) =>
            toSafeCatalogueEntry(r)
        );
        totalCount += rawEntries.length;
    }

    return (
        <AdminPage
            pageTitle="MIS Report Catalogue"
            pageIcon={<LayoutGrid className="h-5 w-5" />}
        >
            <CatalogueShell
                catalogue={safeCatalogue}
                totalCount={totalCount}
            />
        </AdminPage>
    );
}
