'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TicketStatus } from '@prisma/client';
import { Plus, TicketCheck, RefreshCw } from 'lucide-react';
import { getTicketsByFacility } from '@/app/actions/help-center-actions';
import { listBranches } from '@/app/actions/branch-actions';
import { Table, TableHeader, TableBody, TableRow, TableCell } from '@/app/components/ui/Table';
import { Badge } from '@/app/components/ui/Badge';
import { Button } from '@/app/components/ui/Button';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { LoadingState } from '@/app/components/ui/LoadingState';
import { Card, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/Card';
import { Select } from '@/app/components/ui/Select';

// -------------------------------------------------
// Types
// -------------------------------------------------

interface TicketRow {
    id: string;
    title: string;
    priority: string;
    status: string;
    created_at: string;
    user_id: string;
    user: { id: string; name: string; username: string } | null;
    branch: { id: string; branch_name: string } | null;
}

interface BranchOption {
    id: string;
    branch_name: string;
}

type LoadState = 'loading' | 'loaded' | 'error' | 'security-error';

// -------------------------------------------------
// Status display config
// -------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'neutral' }> = {
    [TicketStatus.Open]: { label: 'Open', variant: 'info' },
    [TicketStatus.InProgress]: { label: 'In Progress', variant: 'warning' },
    [TicketStatus.Resolved]: { label: 'Resolved', variant: 'success' },
};

const PRIORITY_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'danger'> = {
    Low: 'neutral',
    Medium: 'info',
    High: 'warning',
    Critical: 'danger',
};

function formatDate(dateStr: string): string {
    try {
        return new Date(dateStr).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    } catch {
        return dateStr;
    }
}

// -------------------------------------------------
// Component
// -------------------------------------------------

export function TicketTable({ userId }: { userId: string }) {
    const router = useRouter();

    const [tickets, setTickets] = useState<TicketRow[]>([]);
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [selectedBranch, setSelectedBranch] = useState('');
    const [loadState, setLoadState] = useState<LoadState>('loading');
    const [refreshing, setRefreshing] = useState(false);

    // Load branches
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const result = await listBranches();
            if (cancelled) return;
            if (result.success && result.data.length > 0) {
                const mapped = result.data.map((b: any) => ({ id: b.id, branch_name: b.branch_name }));
                setBranches(mapped);
                // Auto-select first branch
                if (mapped.length >= 1) {
                    setSelectedBranch(mapped[0].id);
                }
            } else {
                // No branches found or call failed — stop loading
                setLoadState('loaded');
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Load tickets when branch changes
    useEffect(() => {
        if (!selectedBranch) return;
        let cancelled = false;

        const load = async () => {
            setLoadState('loading');
            try {
                const result = await getTicketsByFacility(selectedBranch);
                if (cancelled) return;
                if (result.success) {
                    const data = result.data as TicketRow[];
                    const hasLeak = data.some((t) => t.user_id !== userId);
                    if (hasLeak) {
                        setLoadState('security-error');
                    } else {
                        setTickets(data);
                        setLoadState('loaded');
                    }
                } else {
                    setLoadState('error');
                }
            } catch {
                if (!cancelled) setLoadState('error');
            }
        };

        load();
        return () => { cancelled = true; };
    }, [selectedBranch, userId]);

    const handleRefresh = async () => {
        if (!selectedBranch || refreshing) return;
        setRefreshing(true);
        try {
            const result = await getTicketsByFacility(selectedBranch);
            if (result.success) {
                const data = result.data as TicketRow[];
                const hasLeak = data.some((t) => t.user_id !== userId);
                if (hasLeak) {
                    setLoadState('security-error');
                } else {
                    setTickets(data);
                    setLoadState('loaded');
                }
            }
        } finally {
            setRefreshing(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto mt-6 space-y-5">
            {/* Header */}
            <Card padding="md">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle className="text-base">My Support Tickets</CardTitle>
                        <CardDescription>Track the status of your submitted issues</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={<RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
                            onClick={handleRefresh}
                            disabled={refreshing || loadState === 'loading'}
                        >
                            Refresh
                        </Button>
                        <Button
                            variant="primary"
                            size="md"
                            icon={<Plus className="h-4 w-4" />}
                            onClick={() => router.push('/help-center/raise')}
                        >
                            Raise Ticket
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Branch filter — only show if multiple branches */}
            {branches.length > 1 && (
                <div className="max-w-xs">
                    <Select
                        id="help-center-branch-filter"
                        label="Facility"
                        options={branches.map((b) => ({ value: b.id, label: b.branch_name }))}
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                    />
                </div>
            )}

            {/* Content */}
            {loadState === 'loading' && <LoadingState message="Loading tickets…" />}

            {loadState === 'error' && (
                <Card padding="md">
                    <div className="flex flex-col items-center py-10 text-center">
                        <div className="p-3 rounded-2xl bg-rose-50 text-rose-500 mb-3 ring-1 ring-rose-200/50">
                            <TicketCheck className="h-7 w-7" />
                        </div>
                        <p className="text-sm font-semibold text-gray-700 mb-1">Could not load tickets</p>
                        <p className="text-xs text-gray-500 mb-4">An error occurred while fetching your tickets.</p>
                        <Button variant="secondary" size="sm" onClick={handleRefresh}>
                            Try Again
                        </Button>
                    </div>
                </Card>
            )}

            {loadState === 'security-error' && (
                <Card padding="md">
                    <div className="flex flex-col items-center py-10 text-center">
                        <div className="p-3 rounded-2xl bg-rose-50 text-rose-600 mb-3 ring-1 ring-rose-200/50">
                            <TicketCheck className="h-7 w-7" />
                        </div>
                        <p className="text-sm font-bold text-rose-700 mb-1">Security Warning: Backend Gap Detected</p>
                        <p className="text-sm text-rose-600 mb-4 max-w-lg">
                            The server action <code>getTicketsByFacility</code> is returning tickets that belong to other users.
                            To prevent data leakage, the UI has been blocked. Please fix the server action to scope queries securely by <code>user_id</code>.
                        </p>
                    </div>
                </Card>
            )}

            {loadState === 'loaded' && tickets.length === 0 && (
                <Card padding="none">
                    <EmptyState
                        icon={<TicketCheck className="h-8 w-8" />}
                        title="No tickets yet"
                        description="You haven't raised any support tickets. Use the button above to create one."
                        action={
                            <Button
                                variant="primary"
                                size="md"
                                icon={<Plus className="h-4 w-4" />}
                                onClick={() => router.push('/help-center/raise')}
                            >
                                Raise Your First Ticket
                            </Button>
                        }
                    />
                </Card>
            )}

            {loadState === 'loaded' && tickets.length > 0 && (
                <Table>
                    <TableHeader>
                        <TableCell header>Ticket ID</TableCell>
                        <TableCell header>Summary</TableCell>
                        <TableCell header>Priority</TableCell>
                        <TableCell header>Status</TableCell>
                        <TableCell header>Date Created</TableCell>
                    </TableHeader>
                    <TableBody>
                        {tickets.map((ticket) => {
                            const statusCfg = STATUS_CONFIG[ticket.status] || {
                                label: ticket.status,
                                variant: 'neutral' as const,
                            };

                            return (
                                <TableRow key={ticket.id}>
                                    <TableCell className="font-mono text-xs text-gray-500 whitespace-nowrap">
                                        {ticket.id.slice(0, 8).toUpperCase()}
                                    </TableCell>
                                    <TableCell className="max-w-[260px]">
                                        <span className="line-clamp-2 text-sm font-medium text-gray-900">
                                            {ticket.title}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={PRIORITY_VARIANT[ticket.priority] || 'neutral'}
                                            size="sm"
                                            dot
                                        >
                                            {ticket.priority}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={statusCfg.variant} size="sm" dot>
                                            {statusCfg.label}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                                        {formatDate(ticket.created_at)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            )}

            {/* Ticket count */}
            {loadState === 'loaded' && tickets.length > 0 && (
                <p className="text-xs text-gray-400 text-right pr-1">
                    {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
                </p>
            )}
        </div>
    );
}
