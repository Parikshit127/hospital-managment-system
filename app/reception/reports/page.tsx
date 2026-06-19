'use client';

import React, { useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { DateField } from '@/app/components/ui/DateField';
import { ExportButton } from '@/app/components/finance/ExportButton';
import { BedDouble, Stethoscope, Footprints, Printer, Loader2, FileBarChart } from 'lucide-react';
import {
    getIpdPatientReport,
    getOpdPatientReport,
    getWalkinPatientReport,
} from '@/app/actions/reception-reports-actions';
import type { ReportColumn, ReportRow } from '@/app/lib/reports/reception-reports';

type TabKey = 'ipd' | 'opd' | 'walkin';

type ReportActionResult =
    | { success: true; columns: ReportColumn[]; rows: ReportRow[] }
    | { success: false; error: string };

const TABS: { key: TabKey; label: string; icon: typeof BedDouble; hint: string }[] = [
    { key: 'ipd', label: 'IPD Patients', icon: BedDouble, hint: 'Admitted patients, ward/room allocation & admission summary' },
    { key: 'opd', label: 'OPD Patients', icon: Stethoscope, hint: 'Doctor consultations & daily appointments, department-wise' },
    { key: 'walkin', label: 'Walk-in / Casualty', icon: Footprints, hint: 'Direct patients with no prior appointment' },
];

const RUNNERS: Record<TabKey, (from: string, to: string) => Promise<ReportActionResult>> = {
    ipd: getIpdPatientReport,
    opd: getOpdPatientReport,
    walkin: getWalkinPatientReport,
};

function todayIso(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // yyyy-mm-dd
}

export default function ReceptionReportsPage() {
    const [tab, setTab] = useState<TabKey>('ipd');
    const [from, setFrom] = useState<string>(todayIso());
    const [to, setTo] = useState<string>(todayIso());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [columns, setColumns] = useState<ReportColumn[]>([]);
    const [rows, setRows] = useState<ReportRow[]>([]);
    const [generatedFor, setGeneratedFor] = useState<TabKey | null>(null);

    const activeTab = TABS.find(t => t.key === tab)!;

    async function generate() {
        if (!from || !to) { setError('Please select both From and To dates.'); return; }
        if (from > to) { setError('From date cannot be after To date.'); return; }
        setLoading(true);
        setError(null);
        try {
            const res = await RUNNERS[tab](from, to);
            if (res.success) {
                setColumns(res.columns);
                setRows(res.rows);
                setGeneratedFor(tab);
            } else {
                setError(res.error || 'Failed to generate report.');
                setRows([]);
                setColumns([]);
            }
        } catch {
            setError('Something went wrong while generating the report.');
        } finally {
            setLoading(false);
        }
    }

    function openPdf() {
        const url = `/api/reports/reception/${tab}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
        window.open(url, '_blank');
    }

    function switchTab(next: TabKey) {
        setTab(next);
        setRows([]);
        setColumns([]);
        setGeneratedFor(null);
        setError(null);
    }

    const showTable = generatedFor === tab;

    return (
        <AppShell>
            <div className="max-w-6xl mx-auto p-6 space-y-6">
                <div className="flex items-center gap-3">
                    <FileBarChart className="w-7 h-7 text-orange-600" />
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Patient Reports</h1>
                        <p className="text-sm text-gray-500">{activeTab.hint}</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap gap-2 border-b border-gray-200">
                    {TABS.map(t => {
                        const Icon = t.icon;
                        const active = t.key === tab;
                        return (
                            <button
                                key={t.key}
                                onClick={() => switchTab(t.key)}
                                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                                    active
                                        ? 'border-orange-600 text-orange-700'
                                        : 'border-transparent text-gray-500 hover:text-gray-800'
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                {t.label}
                            </button>
                        );
                    })}
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-end gap-4 bg-white border border-gray-200 rounded-xl p-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                        <DateField
                            value={from}
                            max={to || undefined}
                            onChange={e => setFrom(e.target.value)}
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                        <DateField
                            value={to}
                            min={from || undefined}
                            onChange={e => setTo(e.target.value)}
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                    </div>
                    <button
                        onClick={generate}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileBarChart className="w-4 h-4" />}
                        Generate
                    </button>

                    <div className="ml-auto flex items-center gap-2">
                        <ExportButton
                            data={showTable ? rows : null}
                            filename={`${activeTab.label.replace(/[^a-z0-9]+/gi, '_')}_${from}_to_${to}`}
                            columns={columns}
                        />
                        <button
                            onClick={openPdf}
                            disabled={!showTable || rows.length === 0}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Printer className="w-4 h-4" /> Print / PDF
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                        {error}
                    </div>
                )}

                {/* Results */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center h-48">
                            <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
                        </div>
                    ) : !showTable ? (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                            <FileBarChart className="w-12 h-12 mb-3 opacity-30" />
                            <p className="text-sm">Choose a date range and click Generate.</p>
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                            <p className="text-sm">No records for the selected period.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
                                {rows.length} record{rows.length === 1 ? '' : 's'}
                            </div>
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium text-gray-500 w-12">#</th>
                                        {columns.map(c => (
                                            <th key={c.key} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">
                                                {c.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, idx) => (
                                        <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                                            <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                                            {columns.map(c => (
                                                <td key={c.key} className="px-3 py-2 text-gray-800 whitespace-nowrap">
                                                    {row[c.key] ?? '-'}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </AppShell>
    );
}
