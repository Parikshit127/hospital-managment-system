'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Download, RefreshCw, Loader2, FileText, Clock } from 'lucide-react';
import { getImportJobStatus, downloadErrorReport } from '@/app/actions/import-actions';
import { exportToCSV } from '@/app/lib/csv-export';
import type { ImportType, ImportJobSummary } from '@/app/types/import';

interface Props {
    jobId: string;
    importType: ImportType;
    onStartOver: () => void;
}

const TYPE_LABELS: Record<ImportType, string> = {
    patients: 'Patient Records',
    staff: 'Staff & Doctors',
    invoices: 'Invoices',
    lab_results: 'Lab Results',
    pharmacy: 'Pharmacy Inventory',
    appointments: 'Appointments',
};

export default function StepResults({ jobId, importType, onStartOver }: Props) {
    const [job, setJob] = useState<ImportJobSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchStatus() {
            const res = await getImportJobStatus(jobId);
            if (res.success && res.job) {
                setJob(res.job);
            }
            setLoading(false);
        }
        fetchStatus();
    }, [jobId]);

    async function handleDownloadErrors() {
        const res = await downloadErrorReport(jobId);
        if (res.success && res.csv) {
            const blob = new Blob([res.csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `import_errors_${jobId.slice(0, 8)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 size={36} className="text-blue-500 animate-spin" />
                <p className="text-sm text-gray-600">Loading results...</p>
            </div>
        );
    }

    if (!job) return <p className="text-red-600 text-sm">Failed to load import results</p>;

    const isSuccess = job.status === 'completed' && job.failedRows === 0;
    const hasFailures = job.failedRows > 0;

    return (
        <div className="space-y-6">
            {/* Status Header */}
            <div className={`p-6 rounded-xl text-center ${
                isSuccess ? 'bg-emerald-50 border border-emerald-200' :
                hasFailures ? 'bg-amber-50 border border-amber-200' :
                'bg-gray-50 border border-gray-200'
            }`}>
                {isSuccess ? (
                    <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-3" />
                ) : (
                    <XCircle size={48} className="text-amber-500 mx-auto mb-3" />
                )}
                <h3 className={`text-xl font-bold ${isSuccess ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {isSuccess ? 'Import Successful!' : 'Import Completed with Issues'}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                    {TYPE_LABELS[importType]} import — {job.successfulRows.toLocaleString()} records imported
                </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Rows" value={job.totalRows} icon={<FileText size={18} />} />
                <StatCard label="Imported" value={job.successfulRows} icon={<CheckCircle2 size={18} />} color="emerald" />
                <StatCard label="Failed" value={job.failedRows} icon={<XCircle size={18} />} color="red" />
                <StatCard label="Skipped" value={job.skippedRows} icon={<Clock size={18} />} color="gray" />
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-4 bg-gray-50 rounded-xl">
                    <p className="text-gray-500">File Name</p>
                    <p className="font-medium text-gray-800 mt-0.5">{job.fileName}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                    <p className="text-gray-500">Status</p>
                    <p className="font-medium text-gray-800 mt-0.5 capitalize">{job.status}</p>
                </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
                {hasFailures && (
                    <button
                        onClick={handleDownloadErrors}
                        className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-700 text-sm font-medium rounded-xl hover:bg-red-50"
                    >
                        <Download size={16} /> Download Error Report
                    </button>
                )}
                <button
                    onClick={onStartOver}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700"
                >
                    <RefreshCw size={16} /> Start New Import
                </button>
            </div>
        </div>
    );
}

function StatCard({ label, value, icon, color = 'blue' }: { label: string; value: number; icon: React.ReactNode; color?: string }) {
    const colors: Record<string, string> = {
        blue: 'text-blue-600',
        emerald: 'text-emerald-600',
        red: 'text-red-600',
        gray: 'text-gray-500',
    };
    return (
        <div className="p-4 bg-white border border-gray-200 rounded-xl">
            <div className={`flex items-center gap-1.5 ${colors[color]}`}>{icon}<span className="text-xs font-medium">{label}</span></div>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value.toLocaleString()}</p>
        </div>
    );
}
