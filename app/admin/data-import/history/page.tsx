'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, Loader2, ArrowLeft, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';
import { getImportHistory } from '@/app/actions/import-actions';

interface ImportJob {
    id: string;
    import_type: string;
    file_name: string;
    status: string;
    total_rows: number;
    successful_rows: number;
    failed_rows: number;
    skipped_rows: number;
    created_at: string;
    completed_at: string | null;
    created_by: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2 },
    failed: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
    cancelled: { bg: 'bg-gray-100', text: 'text-gray-700', icon: XCircle },
    importing: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Loader2 },
    validated: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Clock },
    uploaded: { bg: 'bg-gray-100', text: 'text-gray-600', icon: Clock },
    mapping: { bg: 'bg-gray-100', text: 'text-gray-600', icon: Clock },
    validating: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Loader2 },
};

const TYPE_LABELS: Record<string, string> = {
    patients: 'Patients',
    staff: 'Staff',
    invoices: 'Invoices',
    lab_results: 'Lab Results',
    pharmacy: 'Pharmacy',
    appointments: 'Appointments',
};

export default function ImportHistoryPage() {
    const [jobs, setJobs] = useState<ImportJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    useEffect(() => {
        async function fetchHistory() {
            setLoading(true);
            const res = await getImportHistory(page);
            if (res.success) {
                setJobs(res.jobs as unknown as ImportJob[]);
                setTotalPages(res.pagination.totalPages);
            }
            setLoading(false);
        }
        fetchHistory();
    }, [page]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/admin/data-import" className="p-2 hover:bg-gray-200 rounded-lg">
                        <ArrowLeft size={18} className="text-gray-600" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Import History</h1>
                        <p className="text-sm text-gray-500 mt-0.5">View past data import jobs</p>
                    </div>
                </div>
                <Link
                    href="/admin/data-import"
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700"
                >
                    New Import
                </Link>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 size={30} className="text-blue-500 animate-spin" />
                </div>
            ) : jobs.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
                    <FileSpreadsheet size={48} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No import jobs yet</p>
                    <Link href="/admin/data-import" className="text-blue-600 text-sm hover:underline mt-2 inline-block">
                        Start your first import
                    </Link>
                </div>
            ) : (
                <>
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">File</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                                    <th className="text-right px-4 py-3 font-medium text-gray-600">Rows</th>
                                    <th className="text-right px-4 py-3 font-medium text-gray-600">Imported</th>
                                    <th className="text-right px-4 py-3 font-medium text-gray-600">Failed</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">By</th>
                                </tr>
                            </thead>
                            <tbody>
                                {jobs.map(job => {
                                    const style = STATUS_STYLES[job.status] || STATUS_STYLES.uploaded;
                                    const StatusIcon = style.icon;
                                    return (
                                        <tr key={job.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                            <td className="px-4 py-3 font-medium text-gray-800">{TYPE_LABELS[job.import_type] || job.import_type}</td>
                                            <td className="px-4 py-3 text-gray-600 max-w-[150px] truncate">{job.file_name}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${style.bg} ${style.text}`}>
                                                    <StatusIcon size={12} />
                                                    {job.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-600">{job.total_rows.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-emerald-600 font-medium">{job.successful_rows.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-red-600">{job.failed_rows.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-gray-500 text-xs">{new Date(job.created_at).toLocaleDateString()}</td>
                                            <td className="px-4 py-3 text-gray-600">{job.created_by}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50"
                            >Previous</button>
                            <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50"
                            >Next</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
