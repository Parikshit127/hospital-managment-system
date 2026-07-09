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

    for (const [category, rawEntries] of Object.entries(rawCatalogue)) {
        if (!rawEntries) continue;

        safeCatalogue[category] = rawEntries.map((r: Record<string, unknown>) =>
            toSafeCatalogueEntry(r)
        );
        totalCount += rawEntries.length;
    }

    return (
        <AppShell
            pageTitle="MIS Report Catalogue"
            pageIcon={<LayoutGrid className="h-5 w-5" />}
        >
            <div className="p-6 max-w-7xl mx-auto space-y-6">
                {/* ── Breadcrumb ────────────────────────────────────────────── */}
                <Link
                    href={backHref}
                    className={`${hideIntro ? 'hidden' : 'inline-flex'} items-center gap-1.5 text-sm text-gray-500 hover:text-orange-600 transition-colors font-bold`}
                >
                    <ArrowLeft className="h-4 w-4" />
                    {backLabel}
                </Link>

                {/* ── Page header ───────────────────────────────────────────── */}
                <div className={`${hideIntro ? 'hidden' : 'flex'} items-center gap-3`}>
                    <div className="p-2.5 bg-orange-100 rounded-xl">
                        <LayoutGrid className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black text-stone-900">
                            MIS Report Catalogue
                        </h1>
                        <p className="text-sm text-gray-500 font-medium">
                            {portalName} Portal — Browse and run management reports
                        </p>
                    </div>
                </div>

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
