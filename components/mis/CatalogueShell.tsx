'use client';

/**
 * CatalogueShell
 * --------------
 * Client Component that renders the MIS Report Catalogue grid.
 *
 * Receives pre-fetched, safe (non-ZodSchema) report definitions from the
 * Server Component parent. All search filtering is done in-memory with
 * `useState` — no round-trips to the server on keystroke.
 *
 * Route strategy (per Phase 1 approval):
 *   Every report links to `/admin/mis/[reportId]` (the dynamic viewer).
 *
 * Category display rules:
 *   - Categories with 0 reports are hidden (both initially and during search).
 *   - Search matches against `name` and `description` (case-insensitive).
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
    Search, X,
    TrendingUp, Receipt, Pill, Package, FlaskConical,
    BedDouble, Stethoscope, UserPlus, CalendarDays, Truck,
    Glasses, ArrowRight, FileBarChart2, LayoutGrid,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Safe, serialisable subset of ReportDefinition — no ZodSchema, no functions. */
export interface CatalogueEntry {
    id:                 string;
    category:           string;
    name:               string;
    description:        string;
    requiredPermission: string;
    rowLimitSync:       number;
    moduleFlag?:        string;
}

/** Props: pre-grouped by category key. */
export interface CatalogueShellProps {
    /** { [ReportCategory]: CatalogueEntry[] } — only categories with ≥1 report */
    catalogue: Record<string, CatalogueEntry[]>;
    /** Total number of reports across all categories. */
    totalCount: number;
    /**
     * Base path prefix for report links.
     * Defaults to '/admin/mis' — override for operational portals
     * (e.g. '/finance/mis', '/doctor/mis').
     */
    basePath?: string;
}

// ─── Category metadata ────────────────────────────────────────────────────────

type AccentKey =
    | 'emerald' | 'indigo' | 'violet' | 'amber' | 'sky'
    | 'teal'    | 'rose'   | 'blue'   | 'orange' | 'red' | 'pink';

interface CategoryMeta {
    icon:        React.ElementType;
    accent:      AccentKey;
    tagline:     string;
}

const CATEGORY_META: Record<string, CategoryMeta> = {
    Revenue:      { icon: TrendingUp,    accent: 'emerald', tagline: 'Revenue & collection summaries'     },
    Billing:      { icon: Receipt,       accent: 'indigo',  tagline: 'Invoice and billing analytics'      },
    Pharmacy:     { icon: Pill,          accent: 'violet',  tagline: 'Pharmacy dispensing & sales'        },
    Inventory:    { icon: Package,       accent: 'amber',   tagline: 'Stock levels and movement'          },
    Diagnostic:   { icon: FlaskConical,  accent: 'sky',     tagline: 'Lab and diagnostic reports'         },
    Admission:    { icon: BedDouble,     accent: 'teal',    tagline: 'IPD admission & discharge'          },
    OT:           { icon: Stethoscope,   accent: 'rose',    tagline: 'Operation theatre utilisation'      },
    Registration: { icon: UserPlus,      accent: 'blue',    tagline: 'Patient registration trends'        },
    Appointment:  { icon: CalendarDays,  accent: 'orange',  tagline: 'OPD appointment analytics'          },
    Ambulance:    { icon: Truck,         accent: 'red',     tagline: 'Ambulance dispatch & billing'       },
    Optical:      { icon: Glasses,       accent: 'pink',    tagline: 'Optical module reports'             },
};

const FALLBACK_META: CategoryMeta = {
    icon:    FileBarChart2,
    accent:  'indigo',
    tagline: 'Management information reports',
};

// ─── Accent palette ───────────────────────────────────────────────────────────
// All Tailwind class strings are written as complete literals so the JIT scanner
// can detect them statically. Do NOT construct them via template concatenation.

const ACCENT_STYLES: Record<AccentKey, {
    iconWrap: string;
    iconText: string;
    badge:    string;
    hover:    string;
    ring:     string;
    rowHover: string;
    rowArrow: string;
}> = {
    emerald: {
        iconWrap: 'bg-emerald-100',
        iconText: 'text-emerald-600',
        badge:    'bg-emerald-100 text-emerald-700',
        hover:    'hover:border-emerald-300 hover:shadow-emerald-100',
        ring:     'focus-visible:ring-emerald-400',
        rowHover: 'hover:bg-emerald-50/60',
        rowArrow: 'text-emerald-500',
    },
    indigo: {
        iconWrap: 'bg-indigo-100',
        iconText: 'text-indigo-600',
        badge:    'bg-indigo-100 text-indigo-700',
        hover:    'hover:border-indigo-300 hover:shadow-indigo-100',
        ring:     'focus-visible:ring-indigo-400',
        rowHover: 'hover:bg-indigo-50/60',
        rowArrow: 'text-indigo-500',
    },
    violet: {
        iconWrap: 'bg-violet-100',
        iconText: 'text-violet-600',
        badge:    'bg-violet-100 text-violet-700',
        hover:    'hover:border-violet-300 hover:shadow-violet-100',
        ring:     'focus-visible:ring-violet-400',
        rowHover: 'hover:bg-violet-50/60',
        rowArrow: 'text-violet-500',
    },
    amber: {
        iconWrap: 'bg-amber-100',
        iconText: 'text-amber-600',
        badge:    'bg-amber-100 text-amber-700',
        hover:    'hover:border-amber-300 hover:shadow-amber-100',
        ring:     'focus-visible:ring-amber-400',
        rowHover: 'hover:bg-amber-50/60',
        rowArrow: 'text-amber-500',
    },
    sky: {
        iconWrap: 'bg-sky-100',
        iconText: 'text-sky-600',
        badge:    'bg-sky-100 text-sky-700',
        hover:    'hover:border-sky-300 hover:shadow-sky-100',
        ring:     'focus-visible:ring-sky-400',
        rowHover: 'hover:bg-sky-50/60',
        rowArrow: 'text-sky-500',
    },
    teal: {
        iconWrap: 'bg-teal-100',
        iconText: 'text-teal-600',
        badge:    'bg-teal-100 text-teal-700',
        hover:    'hover:border-teal-300 hover:shadow-teal-100',
        ring:     'focus-visible:ring-teal-400',
        rowHover: 'hover:bg-teal-50/60',
        rowArrow: 'text-teal-500',
    },
    rose: {
        iconWrap: 'bg-rose-100',
        iconText: 'text-rose-600',
        badge:    'bg-rose-100 text-rose-700',
        hover:    'hover:border-rose-300 hover:shadow-rose-100',
        ring:     'focus-visible:ring-rose-400',
        rowHover: 'hover:bg-rose-50/60',
        rowArrow: 'text-rose-500',
    },
    blue: {
        iconWrap: 'bg-blue-100',
        iconText: 'text-blue-600',
        badge:    'bg-blue-100 text-blue-700',
        hover:    'hover:border-blue-300 hover:shadow-blue-100',
        ring:     'focus-visible:ring-blue-400',
        rowHover: 'hover:bg-blue-50/60',
        rowArrow: 'text-blue-500',
    },
    orange: {
        iconWrap: 'bg-orange-100',
        iconText: 'text-orange-600',
        badge:    'bg-orange-100 text-orange-700',
        hover:    'hover:border-orange-300 hover:shadow-orange-100',
        ring:     'focus-visible:ring-orange-400',
        rowHover: 'hover:bg-orange-50/60',
        rowArrow: 'text-orange-500',
    },
    red: {
        iconWrap: 'bg-red-100',
        iconText: 'text-red-600',
        badge:    'bg-red-100 text-red-700',
        hover:    'hover:border-red-300 hover:shadow-red-100',
        ring:     'focus-visible:ring-red-400',
        rowHover: 'hover:bg-red-50/60',
        rowArrow: 'text-red-500',
    },
    pink: {
        iconWrap: 'bg-pink-100',
        iconText: 'text-pink-600',
        badge:    'bg-pink-100 text-pink-700',
        hover:    'hover:border-pink-300 hover:shadow-pink-100',
        ring:     'focus-visible:ring-pink-400',
        rowHover: 'hover:bg-pink-50/60',
        rowArrow: 'text-pink-500',
    },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CatalogueShell({ catalogue, totalCount, basePath = '/admin/mis' }: CatalogueShellProps) {
    const [query, setQuery] = useState('');

    /**
     * Filter catalogue in-memory.
     * - Matches against `name` and `description` (case-insensitive, trimmed).
     * - Categories that have 0 matching reports are excluded from the output.
     */
    const filtered = useMemo<Record<string, CatalogueEntry[]>>(() => {
        const q = query.trim().toLowerCase();
        if (!q) return catalogue;

        const result: Record<string, CatalogueEntry[]> = {};
        for (const [category, reports] of Object.entries(catalogue)) {
            const matched = reports.filter(
                (r) =>
                    r.name.toLowerCase().includes(q) ||
                    r.description.toLowerCase().includes(q)
            );
            if (matched.length > 0) result[category] = matched;
        }
        return result;
    }, [catalogue, query]);

    const filteredCategories = Object.entries(filtered);
    const hasResults         = filteredCategories.length > 0;
    const isSearching        = query.trim().length > 0;

    return (
        <div className="space-y-6 rounded-3xl border border-gray-200 bg-white/90 p-3 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-orange-500">
                        Browse reports
                    </p>
                    <h2 className="mt-1 text-lg font-black text-stone-900">
                        Find the report you need
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                        Search by name, description, or module to open a report instantly.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <StatPill icon={<LayoutGrid className="h-3.5 w-3.5" />} label="Categories" value={Object.keys(catalogue).length} />
                    <StatPill icon={<FileBarChart2 className="h-3.5 w-3.5" />} label="Total Reports" value={totalCount} />
                </div>
            </div>

            <div className="relative max-w-2xl">
                <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
                    aria-hidden="true"
                />
                <input
                    id="mis-catalogue-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search reports by name or description…"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Search MIS reports"
                    className="
                        w-full pl-10 pr-10 py-2
                        text-sm text-stone-900 placeholder:text-gray-400
                        bg-gray-50 border border-gray-200 rounded-2xl
                        shadow-sm
                        outline-none
                        focus:border-orange-400 focus:ring-2 focus:ring-orange-100
                        transition-all duration-150
                    "
                />
                {isSearching && (
                    <button
                        type="button"
                        onClick={() => setQuery('')}
                        aria-label="Clear search"
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {/* ── Category grid OR empty state ─────────────────────────────── */}
            {hasResults ? (
                <div className="space-y-8">
                    {/* Top Section: Daily Revenue */}
                    {filteredCategories.find(([cat]) => cat === 'Daily Revenue') && (
                        <div>
                            <CategoryCard
                                category="Daily Revenue"
                                reports={filteredCategories.find(([cat]) => cat === 'Daily Revenue')![1]}
                                isSearching={isSearching}
                                basePath={basePath}
                            />
                        </div>
                    )}

                    {/* Scrollable Horizontal Categories Row */}
                    <div className="flex overflow-x-auto gap-5 pb-6 snap-x custom-scrollbar items-stretch">
                        {filteredCategories
                            .filter(([cat]) => cat !== 'Daily Revenue')
                            .map(([category, reports]) => (
                                <div key={category} className="w-[85vw] md:w-88 xl:w-104 shrink-0 snap-start">
                                    <CategoryCard
                                        category={category}
                                        reports={reports}
                                        isSearching={isSearching}
                                        basePath={basePath}
                                    />
                                </div>
                            ))}
                    </div>
                </div>
            ) : (
                <EmptySearchState query={query} onClear={() => setQuery('')} />
            )}
        </div>
    );
}

// ─── CategoryCard ─────────────────────────────────────────────────────────────

interface CategoryCardProps {
    category:    string;
    reports:     CatalogueEntry[];
    isSearching: boolean;
    basePath:    string;
}

function CategoryCard({ category, reports, isSearching, basePath }: CategoryCardProps) {
    const meta   = CATEGORY_META[category] ?? FALLBACK_META;
    const styles = ACCENT_STYLES[meta.accent];
    const Icon   = meta.icon;

    return (
        <article
            className={`
                bg-white rounded-2xl border border-gray-200
                shadow-sm hover:shadow-md
                transition-all duration-200
                ${styles.hover}
                flex flex-col overflow-hidden h-full
            `}
        >
            {/* Card header */}
            <div className="px-4 pt-3 pb-3 border-b border-gray-100 flex items-start gap-3">
                {/* Coloured icon */}
                <div className={`p-2.5 rounded-xl shrink-0 ${styles.iconWrap}`}>
                    <Icon className={`h-5 w-5 ${styles.iconText}`} aria-hidden="true" />
                </div>

                {/* Title + tagline */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h2 className="text-[14px] font-extrabold text-stone-900 leading-tight">
                            {category}
                        </h2>
                        {/* Report count badge */}
                        <span className={`
                            text-[10px] font-black uppercase tracking-widest
                            px-2 py-0.5 rounded-full shrink-0
                            ${styles.badge}
                        `}>
                            {reports.length} {reports.length === 1 ? 'report' : 'reports'}
                        </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-400 font-medium leading-snug">
                        {meta.tagline}
                    </p>
                </div>
            </div>

            {/* Report list */}
            <ul className="flex-1 divide-y divide-gray-50 overflow-y-auto max-h-100 scroll-smooth" role="list">
                {reports.map((report) => (
                    <ReportRow
                        key={report.id}
                        report={report}
                        styles={styles}
                        isSearching={isSearching}
                        basePath={basePath}
                    />
                ))}
            </ul>
        </article>
    );
}

// ─── ReportRow ────────────────────────────────────────────────────────────────

interface ReportRowProps {
    report:      CatalogueEntry;
    styles:      typeof ACCENT_STYLES[AccentKey];
    isSearching: boolean;
    basePath:    string;
}

function ReportRow({ report, styles, basePath }: ReportRowProps) {
    return (
        <li>
            <Link
                href={report.moduleFlag ? '#' : `${basePath}/${report.id}`}
                className={`
                    group flex items-start gap-3 px-4 py-2.5
                    transition-all duration-150
                    focus-visible:outline-none
                    focus-visible:ring-2 focus-visible:ring-inset
                    ${report.moduleFlag ? 'opacity-60 cursor-not-allowed bg-gray-50/70' : `${styles.ring} ${styles.rowHover}`}
                `}
                onClick={(e) => report.moduleFlag && e.preventDefault()}
                prefetch={false}
            >
                {/* Report text */}
                <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className={`text-[13px] font-bold text-stone-900 leading-snug truncate ${report.moduleFlag ? '' : 'group-hover:underline'} underline-offset-2`}>
                            {report.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-400 font-medium leading-relaxed line-clamp-2">
                            {report.description}
                        </p>
                    </div>
                    {report.moduleFlag && (
                        <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-200 text-gray-600 select-none">
                            {report.moduleFlag}
                        </span>
                    )}
                </div>

                {/* Arrow — slides in on hover */}
                {!report.moduleFlag && (
                    <ArrowRight
                        className={`
                            h-3.5 w-3.5 shrink-0 mt-0.5
                            ${styles.rowArrow}
                            opacity-0 -translate-x-1
                            group-hover:opacity-100 group-hover:translate-x-0
                            transition-all duration-150
                        `}
                        aria-hidden="true"
                    />
                )}
            </Link>
        </li>
    );
}

// ─── StatPill ─────────────────────────────────────────────────────────────────

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
    return (
        <div className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-500 text-[11px] font-bold px-2 py-1 rounded-full select-none">
            <span className="text-gray-400">{icon}</span>
            <span className="text-stone-700 font-black tabular-nums">{value}</span>
            <span>{label}</span>
        </div>
    );
}

// ─── EmptySearchState ─────────────────────────────────────────────────────────

function EmptySearchState({ query, onClear }: { query: string; onClear: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-3 bg-gray-100 rounded-2xl mb-4 inline-flex">
                <Search className="h-7 w-7 text-gray-400" aria-hidden="true" />
            </div>
            <h3 className="font-bold text-stone-900 mb-1 text-base">
                No reports match <span className="font-black">"{query}"</span>
            </h3>
            <p className="text-sm text-gray-500 max-w-xs leading-relaxed mb-4">
                Try a different keyword, or browse all categories below.
            </p>
            <button
                type="button"
                onClick={onClear}
                className="
                    inline-flex items-center gap-1.5 text-[12px] font-bold
                    px-4 py-2 rounded-xl border border-gray-200
                    bg-white text-stone-700
                    hover:bg-gray-50 hover:border-gray-300
                    transition-colors duration-150
                "
            >
                <X className="h-3.5 w-3.5" />
                Clear search
            </button>
        </div>
    );
}
