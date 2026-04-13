'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { Button } from '@/app/components/ui/Button';
import { Badge } from '@/app/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/app/components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableCell } from '@/app/components/ui/Table';
import { Input } from '@/app/components/ui/Input';
import { Select } from '@/app/components/ui/Select';
import { generateTallyXML, getTallyExports, deleteTallyExport } from '@/app/actions/tally-export-actions';
import { Download, Trash2, FileCode2, Loader2, RefreshCw } from 'lucide-react';

const EXPORT_TYPE_OPTIONS = [
    { value: 'Vouchers', label: 'Vouchers' },
    { value: 'Ledgers', label: 'Ledgers' },
    { value: 'Masters', label: 'Masters' },
    { value: 'Full', label: 'Full Export' },
];

type ExportType = 'Vouchers' | 'Ledgers' | 'Masters' | 'Full';
type ExportStatus = 'Completed' | 'Processing' | 'Failed' | 'Pending';

interface TallyExportRecord {
    id: string;
    export_number: string;
    export_type: string;
    start_date: Date | null;
    end_date: Date | null;
    record_count: number | null;
    file_size: bigint | null;
    status: string;
    created_at: Date;
    file_path: string | null;
}

function formatDate(date: Date | null | undefined): string {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatFileSize(bytes: bigint | null | undefined): string {
    if (!bytes) return '—';
    const n = Number(bytes);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
    const map: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
        Completed: 'success',
        Processing: 'warning',
        Failed: 'danger',
        Pending: 'neutral',
    };
    return map[status] ?? 'neutral';
}

export default function TallyExportPage() {
    const toast = useToast();

    // Form state
    const [exportType, setExportType] = useState<ExportType>('Vouchers');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [generating, setGenerating] = useState(false);

    // History state
    const [exports, setExports] = useState<TallyExportRecord[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const organizationId = (): string =>
        (typeof window !== 'undefined' && localStorage.getItem('organizationId')) || '';

    const loadExports = useCallback(async () => {
        setLoadingHistory(true);
        const result = await getTallyExports(organizationId());
        if (result.success) {
            setExports(result.exports as TallyExportRecord[]);
        } else {
            toast.error('Failed to load export history');
        }
        setLoadingHistory(false);
    }, [toast]);

    useEffect(() => {
        loadExports();
    }, [loadExports]);

    async function handleGenerate() {
        const orgId = organizationId();
        if (!orgId) {
            toast.error('Organization not found. Please reload the page.');
            return;
        }
        if (!startDate || !endDate) {
            toast.error('Please select both start and end dates.');
            return;
        }
        if (new Date(startDate) > new Date(endDate)) {
            toast.error('Start date must be before end date.');
            return;
        }

        setGenerating(true);
        try {
            const result = await generateTallyXML({
                organizationId: orgId,
                export_type: exportType,
                start_date: new Date(startDate),
                end_date: new Date(endDate),
            });

            if (result.success) {
                toast.success(`Export ${result.export_number} generated successfully — ${result.record_count ?? 0} records`);
                await loadExports();
            } else {
                toast.error(result.error ?? 'Failed to generate export');
            }
        } catch {
            toast.error('An unexpected error occurred');
        } finally {
            setGenerating(false);
        }
    }

    async function handleDownload(record: TallyExportRecord) {
        if (!record.file_path) {
            toast.error('File path not available for this export');
            return;
        }
        try {
            const response = await fetch(`/api/tally-export/download?id=${record.id}`);
            if (!response.ok) {
                // Fall back: try to read the file content directly via the action
                toast.error('Download failed — file may have been moved or deleted');
                return;
            }
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${record.export_number}_${record.export_type.toLowerCase()}.xml`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch {
            toast.error('Download failed');
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Delete this export? This action cannot be undone.')) return;
        setDeletingId(id);
        try {
            const result = await deleteTallyExport(id);
            if (result.success) {
                toast.success('Export deleted');
                setExports((prev) => prev.filter((e) => e.id !== id));
            } else {
                toast.error(result.error ?? 'Failed to delete export');
            }
        } catch {
            toast.error('An unexpected error occurred');
        } finally {
            setDeletingId(null);
        }
    }

    return (
        <AppShell
            pageTitle="Tally XML Export"
            pageIcon={<FileCode2 className="h-5 w-5" />}
            onRefresh={loadExports}
            refreshing={loadingHistory}
        >
            <div className="p-6 space-y-6 max-w-[1360px] mx-auto">

                {/* Export Configuration Card */}
                <Card>
                    <CardHeader className="mb-5">
                        <CardTitle>Generate New Export</CardTitle>
                    </CardHeader>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Select
                            label="Export Type"
                            options={EXPORT_TYPE_OPTIONS}
                            value={exportType}
                            onChange={(e) => setExportType(e.target.value as ExportType)}
                        />
                        <Input
                            label="Start Date"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                        <Input
                            label="End Date"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                        <div className="flex items-end">
                            <Button
                                variant="primary"
                                loading={generating}
                                icon={<FileCode2 className="h-4 w-4" />}
                                onClick={handleGenerate}
                                disabled={generating}
                                className="w-full"
                            >
                                {generating ? 'Generating...' : 'Generate Export'}
                            </Button>
                        </div>
                    </div>
                </Card>

                {/* Export History Card */}
                <Card padding="none">
                    <div className="px-6 py-4 border-b border-gray-100/80 flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 tracking-tight">Export History</h3>
                            <p className="text-xs text-gray-500 mt-0.5">Previously generated Tally XML exports</p>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            icon={<RefreshCw className="h-3.5 w-3.5" />}
                            onClick={loadExports}
                            loading={loadingHistory}
                        >
                            Refresh
                        </Button>
                    </div>

                    {loadingHistory ? (
                        <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="text-sm">Loading exports...</span>
                        </div>
                    ) : exports.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                            <FileCode2 className="h-8 w-8 opacity-40" />
                            <p className="text-sm font-medium">No exports yet</p>
                            <p className="text-xs">Generate your first Tally XML export above</p>
                        </div>
                    ) : (
                        <Table className="rounded-none border-0 shadow-none">
                            <TableHeader>
                                <TableCell header>Export #</TableCell>
                                <TableCell header>Type</TableCell>
                                <TableCell header>Date Range</TableCell>
                                <TableCell header>Records</TableCell>
                                <TableCell header>File Size</TableCell>
                                <TableCell header>Status</TableCell>
                                <TableCell header>Created</TableCell>
                                <TableCell header className="text-right">Actions</TableCell>
                            </TableHeader>
                            <TableBody>
                                {exports.map((exp) => (
                                    <TableRow key={exp.id}>
                                        <TableCell>
                                            <span className="font-mono text-xs font-semibold text-gray-700">
                                                {exp.export_number}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm text-gray-700">{exp.export_type}</span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs text-gray-600">
                                                {exp.start_date || exp.end_date
                                                    ? `${formatDate(exp.start_date)} – ${formatDate(exp.end_date)}`
                                                    : '—'}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm text-gray-700">
                                                {exp.record_count != null ? exp.record_count.toLocaleString() : '—'}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs text-gray-600">{formatFileSize(exp.file_size)}</span>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={statusVariant(exp.status)} dot>
                                                {exp.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs text-gray-500">{formatDate(exp.created_at)}</span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    icon={<Download className="h-3.5 w-3.5" />}
                                                    onClick={() => handleDownload(exp)}
                                                    disabled={exp.status !== 'Completed' || !exp.file_path}
                                                >
                                                    Download
                                                </Button>
                                                <Button
                                                    variant="danger"
                                                    size="sm"
                                                    icon={
                                                        deletingId === exp.id ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        )
                                                    }
                                                    onClick={() => handleDelete(exp.id)}
                                                    loading={deletingId === exp.id}
                                                >
                                                    Delete
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </Card>
            </div>
        </AppShell>
    );
}
