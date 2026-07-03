'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TicketStatus } from '@prisma/client';
import { Plus, TicketCheck, RefreshCw, ChevronDown, ChevronRight, Loader2, MessageSquare, AlertTriangle } from 'lucide-react';
import { getMyTickets, getHospitalVisibleNotes } from '@/app/actions/help-center-actions';
import { Table, TableHeader, TableBody, TableRow, TableCell } from '@/app/components/ui/Table';
import { Badge } from '@/app/components/ui/Badge';
import { Button } from '@/app/components/ui/Button';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { LoadingState } from '@/app/components/ui/LoadingState';
import { Card, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/Card';
import { Select } from '@/app/components/ui/Select';
import { Input } from '@/app/components/ui/Input';

// -------------------------------------------------
// Types
// -------------------------------------------------

interface TicketRow {
    id: string;
    title: string;
    module: string | null;
    priority: string;
    status: string;
    created_at: string;
    user_id: string;
    user: { id: string; name: string; username: string } | null;
    branch: { id: string; branch_name: string } | null;
}

interface NoteData {
    id: string;
    body: string;
    visibility: string;
    created_at: string;
    author: { id: string; name: string | null; username: string };
}

type NotesFetchState = 'idle' | 'loading' | 'loaded' | 'error';

type LoadState = 'loading' | 'loaded' | 'error' | 'security-error';

// The exact enum value from TicketNoteVisibility in schema.prisma.
// Used as a client-side safety guard to ensure INTERNAL notes never render,
// even if the server action were to return them by mistake.
const VISIBLE_TO_HOSPITAL = 'HOSPITAL_VISIBLE';

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
    const [loadState, setLoadState] = useState<LoadState>('loading');
    const [refreshing, setRefreshing] = useState(false);

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>('All');
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');

    // Reply expansion state
    const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
    const [notesCache, setNotesCache] = useState<Record<string, NoteData[]>>({});
    const [notesFetchState, setNotesFetchState] = useState<Record<string, NotesFetchState>>({});

    const fetchNotesForTicket = useCallback(async (ticketId: string) => {
        // Skip if already cached
        if (notesCache[ticketId]) return;

        setNotesFetchState((prev) => ({ ...prev, [ticketId]: 'loading' }));
        try {
            const result = await getHospitalVisibleNotes(ticketId);
            if (result.success && result.data) {
                // CLIENT-SIDE SAFETY GUARD: even though the server action already
                // filters to HOSPITAL_VISIBLE, double-filter here so INTERNAL
                // notes can never render if the server action were ever changed.
                const safeNotes = (result.data as NoteData[]).filter(
                    (note) => note.visibility === VISIBLE_TO_HOSPITAL
                );
                setNotesCache((prev) => ({ ...prev, [ticketId]: safeNotes }));
                setNotesFetchState((prev) => ({ ...prev, [ticketId]: 'loaded' }));
            } else {
                setNotesFetchState((prev) => ({ ...prev, [ticketId]: 'error' }));
            }
        } catch {
            setNotesFetchState((prev) => ({ ...prev, [ticketId]: 'error' }));
        }
    }, [notesCache]);

    const handleToggleExpand = useCallback((ticketId: string) => {
        // Compute the next expansion state with a PURE updater. Previously the
        // fetch (which calls setState) ran inside the setExpandedTicketId
        // updater — React executes updaters during the render phase, so that
        // triggered "Cannot update a component while rendering a different one".
        // The fetch must happen in the event handler, not in the updater.
        const willExpand = expandedTicketId !== ticketId;
        setExpandedTicketId(willExpand ? ticketId : null);
        if (willExpand && !notesCache[ticketId]) {
            fetchNotesForTicket(ticketId);
        }
    }, [expandedTicketId, notesCache, fetchNotesForTicket]);

    const handleRetryNotes = useCallback((ticketId: string) => {
        // Clear cached error state and re-fetch
        setNotesCache((prev) => {
            const next = { ...prev };
            delete next[ticketId];
            return next;
        });
        setNotesFetchState((prev) => ({ ...prev, [ticketId]: 'idle' }));
        fetchNotesForTicket(ticketId);
    }, [fetchNotesForTicket]);

    // Load the current user's own tickets on mount. Per PRD v3 Addendum §5 the
    // Track Status view is scoped strictly to createdById = current user, with no
    // facility/branch dimension, so there is no branch selection to load or track.
    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoadState('loading');
            try {
                const result = await getMyTickets();
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
    }, [userId]);

    const handleRefresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            const result = await getMyTickets();
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

    const filteredTickets = tickets.filter((t) => {
        if (statusFilter !== 'All' && t.status !== statusFilter) return false;
        
        const ticketDate = new Date(t.created_at);
        ticketDate.setHours(0, 0, 0, 0);

        if (dateFrom) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            if (ticketDate < from) return false;
        }
        if (dateTo) {
            const to = new Date(dateTo);
            to.setHours(0, 0, 0, 0);
            if (ticketDate > to) return false;
        }
        return true;
    });

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
                            onClick={() => router.push('/help-center?tab=raise')}
                        >
                            Raise Ticket
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 min-w-[150px]">
                    <Select
                        id="help-center-status-filter"
                        label="Status"
                        options={[
                            { value: 'All', label: 'All Statuses' },
                            { value: TicketStatus.Open, label: 'Open' },
                            { value: TicketStatus.InProgress, label: 'In Progress' },
                            { value: TicketStatus.Resolved, label: 'Resolved' },
                        ]}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    />
                </div>
                <div className="flex-1 min-w-[140px]">
                    <Input
                        type="date"
                        id="help-center-date-from"
                        label="From"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                    />
                </div>
                <div className="flex-1 min-w-[140px]">
                    <Input
                        type="date"
                        id="help-center-date-to"
                        label="To"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                    />
                </div>
            </div>

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
                            The server action <code>getMyTickets</code> is returning tickets that belong to other users.
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
                                onClick={() => router.push('/help-center?tab=raise')}
                            >
                                Raise Your First Ticket
                            </Button>
                        }
                    />
                </Card>
            )}

            {loadState === 'loaded' && tickets.length > 0 && filteredTickets.length === 0 && (
                <Card padding="none">
                    <EmptyState
                        icon={<TicketCheck className="h-8 w-8" />}
                        title="No matching tickets"
                        description="No tickets match the selected filters. Try adjusting your criteria."
                        action={
                            <Button
                                variant="secondary"
                                size="md"
                                onClick={() => {
                                    setStatusFilter('All');
                                    setDateFrom('');
                                    setDateTo('');
                                }}
                            >
                                Clear Filters
                            </Button>
                        }
                    />
                </Card>
            )}

            {loadState === 'loaded' && filteredTickets.length > 0 && (
                <Table>
                    <TableHeader>
                        <TableCell header className="w-8">{null}</TableCell>
                        <TableCell header>Ticket ID</TableCell>
                        <TableCell header>Summary</TableCell>
                        <TableCell header>Module</TableCell>
                        <TableCell header>Priority</TableCell>
                        <TableCell header>Status</TableCell>
                        <TableCell header>Date Created</TableCell>
                    </TableHeader>
                    <TableBody>
                        {filteredTickets.map((ticket) => {
                            const statusCfg = STATUS_CONFIG[ticket.status] || {
                                label: ticket.status,
                                variant: 'neutral' as const,
                            };
                            const isExpanded = expandedTicketId === ticket.id;
                            const ticketNoteState = notesFetchState[ticket.id] || 'idle';
                            const ticketNotes = notesCache[ticket.id];

                            return (
                                <React.Fragment key={ticket.id}>
                                    <TableRow onClick={() => handleToggleExpand(ticket.id)} className={isExpanded ? 'bg-gray-50/80' : ''}>
                                        <TableCell className="w-8 pr-0">
                                            {isExpanded
                                                ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                                                : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                                            }
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-gray-500 whitespace-nowrap">
                                            {ticket.id.slice(0, 8).toUpperCase()}
                                        </TableCell>
                                        <TableCell className="max-w-[260px]">
                                            <span className="line-clamp-2 text-sm font-medium text-gray-900">
                                                {ticket.title}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm text-gray-600">{ticket.module || 'General'}</span>
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

                                    {/* Expansion panel — reply thread */}
                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={7} className="p-0">
                                                <div className="border-l-2 border-gray-200 bg-gray-50/50 px-6 py-4 mx-4 mb-2 rounded-b-lg">
                                                    {/* Loading state */}
                                                    {ticketNoteState === 'loading' && (
                                                        <div className="flex items-center gap-2 py-2">
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                                                            <span className="text-xs text-gray-500">Loading replies…</span>
                                                        </div>
                                                    )}

                                                    {/* Error state */}
                                                    {ticketNoteState === 'error' && (
                                                        <div className="flex items-center gap-3 py-2">
                                                            <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                                                            <span className="text-xs text-rose-600 font-medium">Could not load replies. Try again.</span>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); handleRetryNotes(ticket.id); }}
                                                                className="text-xs font-semibold text-primary-600 hover:text-primary-700 underline underline-offset-2"
                                                            >
                                                                Retry
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* Loaded — zero replies */}
                                                    {ticketNoteState === 'loaded' && ticketNotes && ticketNotes.length === 0 && (
                                                        <p className="text-xs text-gray-400 italic py-1">No replies yet.</p>
                                                    )}

                                                    {/* Loaded — has replies */}
                                                    {ticketNoteState === 'loaded' && ticketNotes && ticketNotes.length > 0 && (
                                                        <div className="space-y-3">
                                                            <div className="flex items-center gap-1.5 mb-1">
                                                                <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
                                                                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                                                                    Replies ({ticketNotes.length})
                                                                </span>
                                                            </div>
                                                            {ticketNotes.map((note) => (
                                                                <div
                                                                    key={note.id}
                                                                    className="bg-white rounded-lg border border-gray-200/60 px-4 py-3 shadow-[var(--shadow-card)]"
                                                                >
                                                                    <div className="flex items-center justify-between mb-1.5">
                                                                        <span className="text-xs font-semibold text-gray-700">
                                                                            {note.author?.name || note.author?.username || 'Support Team'}
                                                                        </span>
                                                                        <span className="text-[11px] text-gray-400">
                                                                            {formatDate(note.created_at)}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                                                                        {note.body}
                                                                    </p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            )}

            {/* Ticket count */}
            {loadState === 'loaded' && filteredTickets.length > 0 && (
                <p className="text-xs text-gray-400 text-right pr-1">
                    {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}
                </p>
            )}
        </div>
    );
}
