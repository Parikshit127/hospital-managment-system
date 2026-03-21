'use client';

import { useState } from 'react';
import { Search, Archive, ArrowLeft, Loader2, User, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { searchArchive, triggerArchival } from '@/app/actions/import-actions';

interface ArchivedRecord {
    id: string;
    original_patient_id: string;
    patient_data: Record<string, unknown>;
    archive_reason: string;
    original_created_at: string;
    archived_at: string;
}

export default function ArchiveSearchPage() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ArchivedRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [archiving, setArchiving] = useState(false);
    const [archiveResult, setArchiveResult] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    async function handleSearch(e: React.FormEvent) {
        e.preventDefault();
        if (!query.trim()) return;
        setLoading(true);
        setSearched(true);
        const res = await searchArchive(query.trim(), page);
        if (res.success) {
            setResults(res.records as unknown as ArchivedRecord[]);
            setTotalPages(res.pagination?.totalPages || 1);
        }
        setLoading(false);
    }

    async function handleTriggerArchival() {
        if (!confirm('This will archive patient records older than 5 years. Continue?')) return;
        setArchiving(true);
        setArchiveResult(null);
        const res = await triggerArchival(5);
        if (res.success) {
            setArchiveResult(`Archived ${res.archived} patient records (cutoff: ${new Date(res.cutoffDate!).toLocaleDateString()})`);
        }
        setArchiving(false);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/admin/data-import" className="p-2 hover:bg-gray-200 rounded-lg">
                        <ArrowLeft size={18} className="text-gray-600" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Archived Records</h1>
                        <p className="text-sm text-gray-500 mt-0.5">Search and view archived patient data (7-year retention)</p>
                    </div>
                </div>
                <button
                    onClick={handleTriggerArchival}
                    disabled={archiving}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 text-sm font-medium rounded-xl border border-amber-200 hover:bg-amber-100 disabled:opacity-50"
                >
                    {archiving ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
                    Archive Old Records
                </button>
            </div>

            {archiveResult && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">{archiveResult}</div>
            )}

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="flex gap-3">
                <div className="flex-1 relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by Patient ID or Name..."
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading || !query.trim()}
                    className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
                </button>
            </form>

            {/* Results */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 size={30} className="text-blue-500 animate-spin" />
                </div>
            ) : searched && results.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
                    <Archive size={48} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No archived records found for &ldquo;{query}&rdquo;</p>
                </div>
            ) : results.length > 0 ? (
                <div className="space-y-3">
                    {results.map(record => {
                        const patientData = record.patient_data as Record<string, string>;
                        const isExpanded = expandedId === record.id;
                        return (
                            <div key={record.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                <button
                                    onClick={() => setExpandedId(isExpanded ? null : record.id)}
                                    className="w-full p-4 flex items-center gap-4 text-left hover:bg-gray-50"
                                >
                                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                                        <User size={20} className="text-gray-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-900">{patientData.full_name || 'Unknown'}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            ID: {record.original_patient_id} | Archived: {new Date(record.archived_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                                            {record.archive_reason}
                                        </span>
                                        {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                                    </div>
                                </button>
                                {isExpanded && (
                                    <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                                        <h4 className="text-sm font-medium text-gray-700 mb-2">Patient Details</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                                            {Object.entries(patientData).filter(([k]) => !['id', 'organizationId', 'password', 'is_archived', 'archived_at'].includes(k)).map(([key, value]) => (
                                                <div key={key} className="p-2 bg-gray-50 rounded-lg">
                                                    <p className="text-xs text-gray-500">{key.replace(/_/g, ' ')}</p>
                                                    <p className="text-gray-800 mt-0.5">{String(value || '—')}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-2">
                            <button onClick={() => { setPage(p => Math.max(1, p - 1)); handleSearch(new Event('submit') as unknown as React.FormEvent); }} disabled={page === 1} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50">Previous</button>
                            <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
                            <button onClick={() => { setPage(p => p + 1); handleSearch(new Event('submit') as unknown as React.FormEvent); }} disabled={page >= totalPages} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50">Next</button>
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}
