'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { Clock, Search, Filter, ChevronLeft, ChevronRight, Activity, AlertCircle, Database, ShieldAlert, FileText, CheckCircle2, Download } from 'lucide-react';
import { getAuditLogs, getAuditStats } from '@/app/actions/audit-actions';
import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';
import { Select } from '@/app/components/ui/Select';
import { Table, TableHeader, TableBody, TableRow, TableCell } from '@/app/components/ui/Table';
import { LoadingState } from '@/app/components/ui/LoadingState';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { Badge } from '@/app/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/app/components/ui/Card';

const MODULES = [
    { value: '', label: 'All Modules' },
    { value: 'Authentication', label: 'Authentication' },
    { value: 'User Management', label: 'User Management' },
    { value: 'Notifications', label: 'Notifications' },
    { value: 'Billing', label: 'Billing' },
    { value: 'Clinical', label: 'Clinical' },
    { value: 'System', label: 'System' },
];

export default function AuditLogsPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [limit] = useState(50);

    const [filterModule, setFilterModule] = useState('');
    const [filterAction, setFilterAction] = useState('');
    const [filterUsername, setFilterUsername] = useState('');
    const [filterEntityType, setFilterEntityType] = useState('');

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        const res = await getAuditLogs(page, limit, {
            module: filterModule || undefined,
            action: filterAction || undefined,
            username: filterUsername || undefined,
            entity_type: filterEntityType || undefined,
        });
        if (res.success && res.data) {
            setLogs(res.data);
            setTotalPages(res.pagination?.totalPages || 1);
        }
        setLoading(false);
    }, [page, limit, filterModule, filterAction, filterUsername, filterEntityType]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    useEffect(() => {
        getAuditStats().then(res => {
            if (res.success) {
                setStats(res.data);
            }
        });
    }, []);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchLogs();
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: true
        });
    };

    const getActionBadge = (action: string) => {
        const a = action.toUpperCase();
        if (a.includes('CREATE') || a.includes('ADD') || a.includes('PUBLISH')) return <Badge variant="success" size="sm">{action}</Badge>;
        if (a.includes('DELETE') || a.includes('REMOVE') || a.includes('FAIL')) return <Badge variant="danger" size="sm">{action}</Badge>;
        if (a.includes('UPDATE') || a.includes('EDIT')) return <Badge variant="warning" size="sm">{action}</Badge>;
        if (a.includes('LOGIN') || a.includes('LOGOUT')) return <Badge variant="info" size="sm">{action}</Badge>;
        return <Badge variant="neutral" size="sm">{action}</Badge>;
    };

    const handleExportCSV = () => {
        if (!logs || logs.length === 0) return;
        
        const headers = ['Timestamp', 'User', 'Role', 'Module', 'Action', 'Entity Type', 'Entity ID', 'Details', 'IP Address'];
        
        const csvRows = logs.map(log => {
            return [
                new Date(log.created_at).toLocaleString().replace(/,/g, ''), // prevent commas in date
                log.username || 'System',
                log.role || '-',
                log.module || '-',
                log.action || '-',
                log.entity_type || '-',
                log.entity_id || '-',
                log.details ? `"${log.details.replace(/"/g, '""')}"` : '-',
                log.ip_address || '-'
            ].join(',');
        });
        
        const csvString = [headers.join(','), ...csvRows].join('\n');
        
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <AdminPage
            pageTitle="Audit Logs"
            pageIcon={<Clock className="h-5 w-5" />}
            headerActions={
                <Button 
                    variant="secondary" 
                    icon={<Download className="h-4 w-4" />}
                    onClick={handleExportCSV}
                    disabled={logs.length === 0}
                >
                    Export CSV
                </Button>
            }
        >
            <div className="max-w-7xl mx-auto py-6 space-y-6">
                
                {/* Stats */}
                {stats && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card padding="md">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                                    <Activity className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-500">Events Today</p>
                                    <p className="text-2xl font-black text-gray-900">{stats.totalToday.toLocaleString()}</p>
                                </div>
                            </div>
                        </Card>
                        <Card padding="md">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
                                    <ShieldAlert className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-500">Logins Today</p>
                                    <p className="text-2xl font-black text-gray-900">{stats.loginCount.toLocaleString()}</p>
                                </div>
                            </div>
                        </Card>
                        <Card padding="md">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
                                    <Database className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-500">Total Events</p>
                                    <p className="text-2xl font-black text-gray-900">{stats.totalAll.toLocaleString()}</p>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {/* Filters */}
                <Card padding="md">
                    <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 w-full">
                            <Input
                                id="filter-username"
                                label="Username"
                                placeholder="Search by username..."
                                value={filterUsername}
                                onChange={(e) => setFilterUsername(e.target.value)}
                            />
                        </div>
                        <div className="flex-1 w-full">
                            <Input
                                id="filter-action"
                                label="Action"
                                placeholder="e.g. USER_LOGIN"
                                value={filterAction}
                                onChange={(e) => setFilterAction(e.target.value)}
                            />
                        </div>
                        <div className="flex-1 w-full">
                            <Select
                                id="filter-module"
                                label="Module"
                                options={MODULES}
                                value={filterModule}
                                onChange={(e) => setFilterModule(e.target.value)}
                            />
                        </div>
                        <div className="flex-1 w-full">
                            <Input
                                id="filter-entity-type"
                                label="Entity Type"
                                placeholder="e.g. User, Ticket"
                                value={filterEntityType}
                                onChange={(e) => setFilterEntityType(e.target.value)}
                            />
                        </div>
                        <div className="w-full md:w-auto">
                            <Button type="submit" variant="primary" icon={<Filter className="h-4 w-4" />}>
                                Apply Filters
                            </Button>
                        </div>
                    </form>
                </Card>

                {/* Table */}
                <Card padding="none">
                    {loading ? (
                        <div className="py-20">
                            <LoadingState message="Loading audit logs..." />
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="py-20">
                            <EmptyState
                                icon={<FileText className="h-8 w-8" />}
                                title="No audit logs found"
                                description="Try adjusting your search filters."
                            />
                        </div>
                    ) : (
                        <>
                            <Table>
                                <TableHeader>
                                    <TableCell header>Timestamp</TableCell>
                                    <TableCell header>User</TableCell>
                                    <TableCell header>Module</TableCell>
                                    <TableCell header>Action</TableCell>
                                    <TableCell header>Entity</TableCell>
                                    <TableCell header>Details</TableCell>
                                </TableHeader>
                                <TableBody>
                                    {logs.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                                                {formatDate(log.created_at)}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-semibold text-gray-900">{log.username || 'System'}</span>
                                                    {log.role && <span className="text-[10px] text-gray-400 uppercase">{log.role}</span>}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-600">{log.module}</span>
                                            </TableCell>
                                            <TableCell>
                                                {getActionBadge(log.action)}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-sm text-gray-700">{log.entity_type || '-'}</span>
                                                    {log.entity_id && <span className="text-[10px] text-gray-400 font-mono">{log.entity_id.slice(0, 8)}...</span>}
                                                </div>
                                            </TableCell>
                                            <TableCell className="max-w-xs">
                                                <span className="text-xs text-gray-500 truncate block" title={log.details}>
                                                    {log.details || '-'}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>

                            {/* Pagination */}
                            <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-gray-50 rounded-b-2xl">
                                <p className="text-sm text-gray-500 font-medium">
                                    Page {page} of {totalPages || 1}
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        icon={<ChevronLeft className="h-4 w-4" />}
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page >= totalPages}
                                    >
                                        Next <ChevronRight className="h-4 w-4 ml-1.5" />
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </Card>

            </div>
        </AdminPage>
    );
}
