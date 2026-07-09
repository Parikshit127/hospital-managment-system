/**
 * PortalMISCataloguePage
 * ----------------------
 * Shared Server Component that renders the MIS Report Catalogue for any
 * operational portal (finance, doctor, lab, pharmacy, reception, ipd).
 *
 * This avoids duplicating the catalogue-fetching + type-narrowing logic
 * across 6+ portal page.tsx files. Each portal's page.tsx simply re-exports
 * this component with the appropriate `basePath` and `portalName`.
 *
 * ## Architecture
 *   - Calls `listCatalogue()` Server Action in Node.js context.
 *   - Strips non-serialisable fields (ZodSchema, columns, defaultSort)
 *     via `toSafeCatalogueEntry()` — same logic as the admin page.
 *   - Passes the clean payload to `CatalogueShell` with a portal-specific
 *     `basePath` so report links point to the correct portal viewer route.
 */

import { LayoutGrid, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { listCatalogue } from '@/app/actions/mis-report-actions';
import { CatalogueShell, type CatalogueEntry } from '@/components/mis/CatalogueShell';
import { AppShell } from '@/app/components/layout/AppShell';

// ─── Type narrowing (mirrors admin/mis-reports/page.tsx) ──────────────────────

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

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PortalMISCataloguePageProps {
    /** Human-readable portal name — shown in the page header (e.g. "Finance"). */
    portalName: string;
    /** Base path for report links (e.g. "/finance/mis"). */
    basePath: string;
    /** Link target for the "Back" breadcrumb (e.g. "/finance/dashboard"). */
    backHref: string;
    /** Label for the back breadcrumb (e.g. "Finance Dashboard"). */
    backLabel: string;
    /** Hide the in-page breadcrumb and catalogue intro block. */
    hideIntro?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export async function PortalMISCataloguePage({
    portalName,
    basePath,
    backHref,
    backLabel,
    hideIntro = false,
}: PortalMISCataloguePageProps) {
    // 1. Fetch — runs in Node.js; Zod instances are fine here in memory.
    const rawCatalogue = await listCatalogue();

    // 2. Narrow + strip every category's entries.
    const safeCatalogue: Record<string, CatalogueEntry[]> = {};
    let totalCount = 0;
    let categoryCount = 0;

    for (const [category, rawEntries] of Object.entries(rawCatalogue)) {
        if (!rawEntries) continue;

        safeCatalogue[category] = rawEntries.map((r: Record<string, unknown>) =>
            toSafeCatalogueEntry(r)
        );
        totalCount += rawEntries.length;
        categoryCount += 1;
    }

    return (
        <AppShell
            pageTitle="MIS Report Catalogue"
            pageIcon={<LayoutGrid className="h-5 w-5" />}
        >
            <div className="p-3 max-w-7xl mx-auto space-y-6">
                {/* ── Breadcrumb ────────────────────────────────────────────── */}
                <Link
                    href={backHref}
                    className={`${hideIntro ? 'hidden' : 'inline-flex'} items-center gap-1.5 text-sm text-gray-500 hover:text-orange-600 transition-colors font-bold`}
                >
                    <ArrowLeft className="h-4 w-4" />
                    {backLabel}
                </Link>

                {!hideIntro && (
                    <>
                        <div className="rounded-3xl border border-orange-200/70 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-3 shadow-sm">
                            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                                <div className="flex items-start gap-3.5">
                                    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-orange-100">
                                        <LayoutGrid className="h-5 w-5 text-orange-600" />
                                    </div>
                                    <div>
                                        <div className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-orange-700">
                                            Portal Reports
                                        </div>
                                        <h1 className="mt-2 text-xl font-black text-stone-900">
                                            MIS Report Catalogue
                                        </h1>
                                        <p className="mt-1 text-sm text-gray-600">
                                            {portalName} Portal — browse and run management reports for finance, operations, and daily decision-making.
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2 shadow-sm">
                                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gray-500">
                                        Available now
                                    </p>
                                    <p className="mt-1 text-2xl font-black text-stone-900">
                                        {totalCount}
                                    </p>
                                    <p className="text-sm text-gray-500">
                                        reports in {categoryCount} categories
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gray-500">Fast access</p>
                                <p className="mt-1 text-sm font-semibold text-stone-700">Use the search bar to jump straight to a report by name or topic.</p>
                            </div>
                            <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gray-500">Grouped clearly</p>
                                <p className="mt-1 text-sm font-semibold text-stone-700">Reports are organized by module so teams can find what they need quickly.</p>
                            </div>
                            <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gray-500">Ready to use</p>
                                <p className="mt-1 text-sm font-semibold text-stone-700">Open any report and export it directly from the results screen.</p>
                            </div>
                        </div>
                    </>
                )}

                {/* ── Catalogue grid ────────────────────────────────────────── */}
                <CatalogueShell
                    catalogue={safeCatalogue}
                    totalCount={totalCount}
                    basePath={basePath}
                />
            </div>
        </AppShell>
    );
}
