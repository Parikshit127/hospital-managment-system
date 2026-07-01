'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import {
    LifeBuoy, Search, Filter, CheckCircle2, Clock, AlertCircle, AlertTriangle,
    Building2, User, Calendar, Loader2, RefreshCw, X, Check, Paperclip, Eye, Download, Image, FileText,
    UserCheck, MessageSquare, Lock, Globe
} from 'lucide-react';
import {
    getAllTickets, updateTicketStatus, getAttachmentSignedUrl,
    getAssignableUsers, assignTicket, createTicketNote, getTicketNotes
} from '@/app/actions/help-center-actions';
import { listBranches } from '@/app/actions/branch-actions';
import { TicketPriority, TicketStatus, TicketNoteVisibility } from '@prisma/client';

/* ─── Interfaces ─── */
interface TicketAttachment {
    id: string;
    ticket_id: string;
    file_url: string;
    file_name: string;
    file_size: number;
    mime_type: string;
    uploaded_at: Date | string;
    signedUrl?: string;
}

interface Ticket {
    id: string;
    title: string;
    description: string;
    priority: TicketPriority;
    status: TicketStatus;
    user_id: string;
    branch_id: string;
    organizationId: string;
    created_at: Date | string;
    updated_at: Date | string;
    user: {
        id: string;
        name: string | null;
        username: string;
    };
    branch: {
        id: string;
        branch_name: string;
    };
    attachments?: TicketAttachment[];
    assigned_to_id?: string | null;
    assigned_to?: {
        id: string;
        name: string | null;
        username: string;
    } | null;
}

interface Branch {
    id: string;
    branch_name: string;
    branch_code: string;
}

interface Developer {
    id: string;
    name: string | null;
    username: string;
    role: string;
}

interface TicketNote {
    id: string;
    body: string;
    visibility: TicketNoteVisibility;
    created_at: Date | string;
    author: {
        id: string;
        name: string | null;
        username: string;
    };
}

export default function SupportPortalPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [developers, setDevelopers] = useState<Developer[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);
    const [assigningTicketId, setAssigningTicketId] = useState<string | null>(null);
    const [activeNotesTicketId, setActiveNotesTicketId] = useState<string | null>(null);
    const [ticketNotes, setTicketNotes] = useState<Record<string, TicketNote[]>>({});
    const [loadingNotesTicketId, setLoadingNotesTicketId] = useState<string | null>(null);
    const [noteInput, setNoteInput] = useState('');
    const [noteVisibility, setNoteVisibility] = useState<TicketNoteVisibility>(TicketNoteVisibility.INTERNAL);
    const [submittingNoteTicketId, setSubmittingNoteTicketId] = useState<string | null>(null);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

    /* ─── Filter States ─── */
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
    const [branchFilter, setBranchFilter] = useState<string>('ALL');

    /* ─── Toast helper ─── */
    const triggerNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 4000);
    };

    /* ─── Fetch Data ─── */
    const loadData = useCallback(async (isRefresh = false) => {
        if (isRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        try {
            const [ticketsRes, branchesRes, devsRes] = await Promise.all([
                getAllTickets(),
                listBranches(),
                getAssignableUsers()
            ]);

            if (ticketsRes.success && ticketsRes.data) {
                const rawTickets = ticketsRes.data as Ticket[];
                // Resolve a signed URL for every attachment (private bucket).
                const enriched = await Promise.all(
                    rawTickets.map(async (t) => {
                        if (!t.attachments || t.attachments.length === 0) return t;
                        const attachments = await Promise.all(
                            t.attachments.map(async (att) => {
                                const res = await getAttachmentSignedUrl(att.file_url);
                                return { ...att, signedUrl: res.success ? res.signedUrl ?? undefined : undefined };
                            })
                        );
                        return { ...t, attachments };
                    })
                );
                setTickets(enriched);
            } else {
                triggerNotification('error', 'Failed to fetch support tickets');
            }

            if (branchesRes.success && branchesRes.data) {
                setBranches(branchesRes.data as Branch[]);
            }

            if (devsRes.success && devsRes.data) {
                setDevelopers(devsRes.data as Developer[]);
            }
        } catch (error) {
            console.error('Error loading support portal data:', error);
            triggerNotification('error', 'An error occurred while loading data');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    /* ─── Status Update Handler ─── */
    const handleStatusUpdate = async (ticketId: string, newStatus: TicketStatus) => {
        setUpdatingTicketId(ticketId);
        try {
            const res = await updateTicketStatus(ticketId, newStatus);
            if (res.success && res.data) {
                setTickets((prev) =>
                    prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
                );
                triggerNotification(
                    'success',
                    `Ticket status updated to ${newStatus === TicketStatus.Resolved ? 'Resolved' : 'In Progress'}`
                );
            } else {
                triggerNotification('error', 'Failed to update ticket status');
            }
        } catch (error) {
            console.error('Error updating ticket:', error);
            triggerNotification('error', 'An error occurred while updating the ticket');
        } finally {
            setUpdatingTicketId(null);
        }
    };

    /* ─── Download Handler (blob-based so cross-origin signed URLs force a real download) ─── */
    const handleDownloadAttachment = async (att: TicketAttachment) => {
        if (!att.signedUrl) {
            triggerNotification('error', 'File is not available for download');
            return;
        }
        try {
            const res = await fetch(att.signedUrl);
            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = att.file_name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(objectUrl);
        } catch (error) {
            console.error('Attachment download failed:', error);
            triggerNotification('error', 'Failed to download attachment');
        }
    };

    /* ─── Assign Ticket Handler ─── */
    const handleAssignTicket = async (ticketId: string, developerId: string | null) => {
        setAssigningTicketId(ticketId);
        try {
            const res = await assignTicket(ticketId, developerId);
            if (res.success && res.data) {
                const assignedDev = developers.find((d) => d.id === developerId) || null;
                setTickets((prev) =>
                    prev.map((t) =>
                        t.id === ticketId
                            ? {
                                  ...t,
                                  assigned_to_id: developerId,
                                  assigned_to: assignedDev
                                      ? {
                                            id: assignedDev.id,
                                            name: assignedDev.name,
                                            username: assignedDev.username,
                                        }
                                      : null,
                              }
                            : t
                    )
                );
                triggerNotification(
                    'success',
                    developerId
                        ? `Ticket assigned to ${assignedDev?.name || assignedDev?.username}`
                        : 'Ticket unassigned successfully'
                );
            } else {
                triggerNotification('error', 'Failed to assign ticket');
            }
        } catch (error) {
            console.error('Error assigning ticket:', error);
            triggerNotification('error', 'An error occurred while assigning the ticket');
        } finally {
            setAssigningTicketId(null);
        }
    };

    /* ─── Load Ticket Notes ─── */
    const loadNotes = async (ticketId: string) => {
        setLoadingNotesTicketId(ticketId);
        try {
            const res = await getTicketNotes(ticketId);
            if (res.success && res.data) {
                setTicketNotes((prev) => ({
                    ...prev,
                    [ticketId]: res.data as TicketNote[],
                }));
            } else {
                triggerNotification('error', 'Failed to fetch ticket notes');
            }
        } catch (error) {
            console.error('Error fetching ticket notes:', error);
            triggerNotification('error', 'An error occurred while loading notes');
        } finally {
            setLoadingNotesTicketId(null);
        }
    };

    /* ─── Toggle Notes Drawer ─── */
    const handleToggleNotes = (ticketId: string) => {
        if (activeNotesTicketId === ticketId) {
            setActiveNotesTicketId(null);
        } else {
            setActiveNotesTicketId(ticketId);
            setNoteInput('');
            setNoteVisibility(TicketNoteVisibility.INTERNAL);
            loadNotes(ticketId);
        }
    };

    /* ─── Submit Note/Reply ─── */
    const handleSubmitNote = async (ticketId: string) => {
        if (!noteInput.trim()) return;
        setSubmittingNoteTicketId(ticketId);
        try {
            const res = await createTicketNote({
                ticketId,
                body: noteInput,
                visibility: noteVisibility,
            });
            if (res.success && res.data) {
                await loadNotes(ticketId);
                setNoteInput('');
                triggerNotification(
                    'success',
                    noteVisibility === TicketNoteVisibility.HOSPITAL_VISIBLE
                        ? 'Reply sent to hospital successfully'
                        : 'Internal note saved successfully'
                );
            } else {
                triggerNotification('error', 'Failed to create note');
            }
        } catch (error) {
            console.error('Error creating note:', error);
            triggerNotification('error', 'An error occurred while submitting the note');
        } finally {
            setSubmittingNoteTicketId(null);
        }
    };

    /* ─── Reset All Filters ─── */
    const handleResetFilters = () => {
        setSearchQuery('');
        setStatusFilter('ALL');
        setPriorityFilter('ALL');
        setBranchFilter('ALL');
    };

    /* ─── Filter & Search Logic ─── */
    const filteredTickets = useMemo(() => {
        return tickets.filter((ticket) => {
            // Search Query Filter
            const matchesSearch =
                searchQuery.trim() === '' ||
                ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                ticket.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                ticket.user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (ticket.user.name && ticket.user.name.toLowerCase().includes(searchQuery.toLowerCase()));

            // Status Filter
            const matchesStatus = statusFilter === 'ALL' || ticket.status === statusFilter;

            // Priority Filter
            const matchesPriority = priorityFilter === 'ALL' || ticket.priority === priorityFilter;

            // Branch Filter
            const matchesBranch = branchFilter === 'ALL' || ticket.branch_id === branchFilter;

            return matchesSearch && matchesStatus && matchesPriority && matchesBranch;
        });
    }, [tickets, searchQuery, statusFilter, priorityFilter, branchFilter]);

    /* ─── KPI Calculations ─── */
    const kpis = useMemo(() => {
        const total = tickets.length;
        const open = tickets.filter((t) => t.status === TicketStatus.Open).length;
        const inProgress = tickets.filter((t) => t.status === TicketStatus.InProgress).length;
        const resolved = tickets.filter((t) => t.status === TicketStatus.Resolved).length;
        return { total, open, inProgress, resolved };
    }, [tickets]);

    /* ─── Badge Style Helpers ─── */
    const getPriorityBadgeStyles = (priority: TicketPriority) => {
        switch (priority) {
            case TicketPriority.Critical:
                return 'bg-red-50 text-red-700 border-red-200';
            case TicketPriority.High:
                return 'bg-orange-50 text-orange-700 border-orange-200';
            case TicketPriority.Medium:
                return 'bg-blue-50 text-blue-700 border-blue-200';
            case TicketPriority.Low:
            default:
                return 'bg-slate-50 text-slate-600 border-slate-200';
        }
    };

    const getStatusBadgeStyles = (status: TicketStatus) => {
        switch (status) {
            case TicketStatus.Resolved:
                return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case TicketStatus.InProgress:
                return 'bg-indigo-50 text-indigo-700 border-indigo-200';
            case TicketStatus.Open:
            default:
                return 'bg-amber-50 text-amber-700 border-amber-200';
        }
    };

    /* ─── SLA Calculation ─── */
    const getSLADetails = (ticket: Ticket) => {
        const priority = ticket.priority;
        const createdAt = new Date(ticket.created_at);
        const resolved = ticket.status === TicketStatus.Resolved;
        const resolvedAt = resolved ? new Date(ticket.updated_at) : new Date();

        let slaHours = 24; // Default fallback
        switch (priority) {
            case TicketPriority.Critical:
                slaHours = 4;
                break;
            case TicketPriority.High:
                slaHours = 12;
                break;
            case TicketPriority.Medium:
                slaHours = 24;
                break;
            case TicketPriority.Low:
                slaHours = 72;
                break;
        }

        const slaLimitTime = createdAt.getTime() + slaHours * 60 * 60 * 1000;
        const remainingTimeMs = slaLimitTime - resolvedAt.getTime();
        const remainingHours = remainingTimeMs / (1000 * 60 * 60);

        if (resolved) {
            const metSla = resolvedAt.getTime() <= slaLimitTime;
            return {
                status: metSla ? 'RESOLVED_MET' : 'RESOLVED_BREACHED',
                label: metSla ? 'Resolved (SLA Met)' : 'Resolved (SLA Breached)',
                colorClass: metSla ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200',
                remainingText: metSla ? 'Met SLA' : `Breached by ${Math.abs(remainingHours).toFixed(1)} hrs`,
            };
        } else {
            if (remainingTimeMs < 0) {
                return {
                    status: 'BREACHED',
                    label: 'SLA Breached',
                    colorClass: 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse',
                    remainingText: `Breached by ${Math.abs(remainingHours).toFixed(1)} hrs`,
                };
            } else if (remainingHours <= 2) {
                return {
                    status: 'APPROACHING',
                    label: 'Approaching Breach',
                    colorClass: 'bg-amber-50 text-amber-700 border-amber-200 font-semibold',
                    remainingText: `${remainingHours.toFixed(1)} hrs remaining`,
                };
            } else {
                return {
                    status: 'WITHIN_SLA',
                    label: 'Within SLA',
                    colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    remainingText: `${remainingHours.toFixed(1)} hrs remaining`,
                };
            }
        }
    };

    return (
        <AdminPage
            pageTitle="Support Portal"
            pageIcon={<LifeBuoy className="h-5 w-5" />}
            onRefresh={() => loadData(true)}
            refreshing={refreshing}
            headerActions={
                <button
                    onClick={() => loadData(true)}
                    disabled={refreshing || loading}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
                    style={{ color: 'var(--admin-text-muted)' }}
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            }
        >
            {/* ─── Notification Toast ─── */}
            {notification && (
                <div
                    className={`fixed top-5 right-5 z-[100] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm transition-all duration-300 animate-slide-in`}
                    style={{
                        backgroundColor: notification.type === 'success' ? '#ecfdf5' : '#fef2f2',
                        borderColor: notification.type === 'success' ? '#10b981' : '#ef4444',
                        color: notification.type === 'success' ? '#065f46' : '#991b1b',
                    }}
                >
                    {notification.type === 'success' ? (
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
                    ) : (
                        <AlertTriangle className="h-4.5 w-4.5 text-red-600" />
                    )}
                    <span>{notification.message}</span>
                </div>
            )}

            {/* ─── KPI Cards Section ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Total Tickets */}
                <div className="bg-white p-5 rounded-2xl border border-[var(--admin-border)] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Tickets</p>
                            <h3 className="text-3xl font-extrabold text-slate-900 mt-1.5">{loading ? '...' : kpis.total}</h3>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-slate-500">
                            <LifeBuoy className="h-5 w-5" />
                        </div>
                    </div>
                </div>

                {/* Open Tickets */}
                <div className="bg-white p-5 rounded-2xl border border-[var(--admin-border)] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Open</p>
                            <h3 className="text-3xl font-extrabold text-amber-600 mt-1.5">{loading ? '...' : kpis.open}</h3>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-amber-600">
                            <AlertCircle className="h-5 w-5" />
                        </div>
                    </div>
                </div>

                {/* In Progress Tickets */}
                <div className="bg-white p-5 rounded-2xl border border-[var(--admin-border)] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">In Progress</p>
                            <h3 className="text-3xl font-extrabold text-indigo-600 mt-1.5">{loading ? '...' : kpis.inProgress}</h3>
                        </div>
                        <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 text-indigo-600">
                            <Clock className="h-5 w-5" />
                        </div>
                    </div>
                </div>

                {/* Resolved Tickets */}
                <div className="bg-white p-5 rounded-2xl border border-[var(--admin-border)] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Resolved</p>
                            <h3 className="text-3xl font-extrabold text-emerald-600 mt-1.5">{loading ? '...' : kpis.resolved}</h3>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-emerald-600">
                            <CheckCircle2 className="h-5 w-5" />
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Filters & Search Controls ─── */}
            <div className="bg-white p-5 rounded-2xl border border-[var(--admin-border)] shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                    {/* Search query input */}
                    <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by title, description, or username..."
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--admin-primary)]/20 focus:border-[var(--admin-primary)] transition-all bg-slate-50/50"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Filter controls */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Status Filter */}
                        <div className="flex items-center gap-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase hidden lg:inline">Status:</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="border border-slate-200 px-3 py-2 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--admin-primary)]/20 hover:border-slate-300 transition-colors"
                            >
                                <option value="ALL">All Statuses</option>
                                <option value="Open">Open</option>
                                <option value="InProgress">In Progress</option>
                                <option value="Resolved">Resolved</option>
                            </select>
                        </div>

                        {/* Priority Filter */}
                        <div className="flex items-center gap-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase hidden lg:inline">Priority:</label>
                            <select
                                value={priorityFilter}
                                onChange={(e) => setPriorityFilter(e.target.value)}
                                className="border border-slate-200 px-3 py-2 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--admin-primary)]/20 hover:border-slate-300 transition-colors"
                            >
                                <option value="ALL">All Priorities</option>
                                <option value="Critical">Critical</option>
                                <option value="High">High</option>
                                <option value="Medium">Medium</option>
                                <option value="Low">Low</option>
                            </select>
                        </div>

                        {/* Branch Filter */}
                        <div className="flex items-center gap-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase hidden lg:inline">Branch:</label>
                            <select
                                value={branchFilter}
                                onChange={(e) => setBranchFilter(e.target.value)}
                                className="border border-slate-200 px-3 py-2 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--admin-primary)]/20 hover:border-slate-300 transition-colors max-w-[200px] truncate"
                            >
                                <option value="ALL">All Branches</option>
                                {branches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.branch_name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Reset filters button */}
                        {(searchQuery || statusFilter !== 'ALL' || priorityFilter !== 'ALL' || branchFilter !== 'ALL') && (
                            <button
                                onClick={handleResetFilters}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all"
                            >
                                <X className="h-3.5 w-3.5" />
                                Reset Filters
                            </button>
                        )}
                    </div>
                </div>

                {/* Filter indicator details */}
                <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-3">
                    <span>
                        Showing <strong>{filteredTickets.length}</strong> of <strong>{tickets.length}</strong> support tickets
                    </span>
                </div>
            </div>

            {/* ─── Main Ticket List Section ─── */}
            {loading ? (
                /* Spinner Loading State */
                <div className="flex flex-col items-center justify-center py-20 bg-white border border-[var(--admin-border)] rounded-2xl shadow-sm">
                    <Loader2 className="h-9 w-9 text-[var(--admin-primary)] animate-spin" />
                    <p className="text-sm font-semibold text-slate-500 mt-4">Loading support tickets...</p>
                </div>
            ) : filteredTickets.length === 0 ? (
                /* Empty/Filtered State */
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white border border-[var(--admin-border)] rounded-2xl shadow-sm">
                    <div className="p-4 bg-slate-50 rounded-full border border-slate-100 text-slate-400">
                        <LifeBuoy className="h-8 w-8" />
                    </div>
                    <h3 className="text-base font-bold text-slate-800 mt-4">No support tickets found</h3>
                    <p className="text-sm text-slate-500 mt-1 max-w-sm">
                        {tickets.length === 0
                            ? 'There are no support tickets in your database yet.'
                            : 'No tickets match the search query or active filter settings. Try adjusting your filters.'}
                    </p>
                    {(searchQuery || statusFilter !== 'ALL' || priorityFilter !== 'ALL' || branchFilter !== 'ALL') && (
                        <button
                            onClick={handleResetFilters}
                            className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-[var(--admin-primary)] hover:bg-[var(--admin-primary-dark)] rounded-xl transition-all shadow-sm"
                        >
                            Clear All Filters
                        </button>
                    )}
                </div>
            ) : (
                /* Ticket Card List */
                <div className="space-y-4">
                    {filteredTickets.map((ticket) => {
                        const isUpdating = updatingTicketId === ticket.id;
                        const isResolved = ticket.status === TicketStatus.Resolved;

                        return (
                            <div
                                key={ticket.id}
                                className={`bg-white border rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-[1px] transition-all duration-200 overflow-hidden flex flex-col md:flex-row justify-between ${
                                    isResolved ? 'border-slate-100 bg-slate-50/20 opacity-85' : 'border-[var(--admin-border)]'
                                }`}
                            >
                                {/* Ticket details content (Left) */}
                                <div className="p-6 flex-1 space-y-3.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {/* Status Badge */}
                                        <span className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full border ${getStatusBadgeStyles(ticket.status)}`}>
                                            {ticket.status === TicketStatus.InProgress ? 'In Progress' : ticket.status}
                                        </span>

                                        {/* Priority Badge */}
                                        <span className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full border ${getPriorityBadgeStyles(ticket.priority)}`}>
                                            {ticket.priority} Priority
                                        </span>

                                        {/* SLA Badge */}
                                        {(() => {
                                            const sla = getSLADetails(ticket);
                                            return (
                                                <span className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full border ${sla.colorClass}`}>
                                                    {sla.label} ({sla.remainingText})
                                                </span>
                                            );
                                        })()}
                                    </div>

                                    <div>
                                        <h4 className="text-base font-bold text-slate-800 line-clamp-1">{ticket.title}</h4>
                                        <p className="text-slate-600 text-sm leading-relaxed mt-1.5 whitespace-pre-line">{ticket.description}</p>
                                    </div>

                                    {/* Attachments Section */}
                                    {ticket.attachments && ticket.attachments.length > 0 && (
                                        <div className="mt-4 pt-3 border-t border-slate-100/60">
                                            <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <Paperclip className="h-3.5 w-3.5" />
                                                Attachments ({ticket.attachments.length})
                                            </h5>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                                {ticket.attachments.map((att) => {
                                                    const isImage = att.mime_type.startsWith('image/');
                                                    const sizeKb = Math.round(att.file_size / 102.4) / 10;
                                                    return (
                                                        <div key={att.id} className="flex items-center justify-between p-2 rounded-xl border border-slate-100 bg-slate-50/30 hover:bg-slate-50/70 hover:border-slate-200/85 transition-all group">
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                <div className="h-9 w-9 rounded-lg bg-white border border-slate-100 text-slate-400 shrink-0 shadow-sm flex items-center justify-center overflow-hidden">
                                                                    {isImage && att.signedUrl ? (
                                                                        <img 
                                                                            src={att.signedUrl} 
                                                                            alt={att.file_name} 
                                                                            className="h-full w-full object-cover cursor-pointer hover:scale-105 transition-transform duration-200" 
                                                                            onClick={() => setPreviewImageUrl(att.signedUrl || null)}
                                                                        />
                                                                    ) : isImage ? (
                                                                        <Image className="h-4 w-4 text-[var(--admin-primary)]" />
                                                                    ) : (
                                                                        <FileText className="h-4 w-4" />
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-semibold text-slate-700 truncate" title={att.file_name}>
                                                                        {att.file_name}
                                                                    </p>
                                                                    <p className="text-[10px] text-slate-400 font-medium">
                                                                        {sizeKb} KB
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={() => {
                                                                        if (isImage && att.signedUrl) {
                                                                            setPreviewImageUrl(att.signedUrl || null);
                                                                        } else if (att.signedUrl) {
                                                                            window.open(att.signedUrl, '_blank');
                                                                        }
                                                                    }}
                                                                    className="p-1.5 hover:bg-white rounded-lg text-slate-500 hover:text-[var(--admin-primary)] border border-transparent hover:border-slate-100 transition-all shadow-sm cursor-pointer"
                                                                    title="View"
                                                                >
                                                                    <Eye className="h-3.5 w-3.5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDownloadAttachment(att)}
                                                                    disabled={!att.signedUrl}
                                                                    className="p-1.5 hover:bg-white rounded-lg text-slate-500 hover:text-emerald-600 border border-transparent hover:border-slate-100 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                                                    title="Download"
                                                                >
                                                                    <Download className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Notes & Replies Section Toggle */}
                                    <div className="mt-3 pt-3 border-t border-slate-100/60">
                                        <button
                                            onClick={() => handleToggleNotes(ticket.id)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-[var(--admin-primary)] bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl transition-all shadow-sm cursor-pointer"
                                        >
                                            <MessageSquare className="h-3.5 w-3.5" />
                                            {activeNotesTicketId === ticket.id ? 'Hide Notes & Replies' : 'Show Notes & Replies'}
                                        </button>
                                    </div>

                                    {/* Collapsible Notes Drawer */}
                                    {activeNotesTicketId === ticket.id && (
                                        <div className="mt-3.5 p-4 rounded-2xl border border-slate-100 bg-slate-50/40 space-y-4">
                                            <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                                <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                                                Ticket Notes & Replies
                                            </h5>

                                            {/* Notes List */}
                                            {loadingNotesTicketId === ticket.id && !ticketNotes[ticket.id] ? (
                                                <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    Loading notes...
                                                </div>
                                            ) : !ticketNotes[ticket.id] || ticketNotes[ticket.id].length === 0 ? (
                                                <p className="text-xs text-slate-400 italic py-2">No notes or replies added yet.</p>
                                            ) : (
                                                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                                                    {ticketNotes[ticket.id].map((note) => {
                                                        const isInternal = note.visibility === TicketNoteVisibility.INTERNAL;
                                                        return (
                                                            <div
                                                                key={note.id}
                                                                className={`p-3 rounded-xl border text-xs shadow-sm space-y-1.5 ${
                                                                    isInternal
                                                                        ? 'bg-amber-50/50 border-amber-100/60'
                                                                        : 'bg-blue-50/40 border-blue-100/60'
                                                                }`}
                                                            >
                                                                <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                                                                    <span className="flex items-center gap-1">
                                                                        <User className="h-3 w-3" />
                                                                        {note.author.name || note.author.username}
                                                                    </span>
                                                                    <span className="flex items-center gap-1">
                                                                        {isInternal ? (
                                                                            <span className="flex items-center gap-0.5 text-amber-600 bg-amber-100/60 px-1.5 py-0.5 rounded-full uppercase text-[8px] font-black">
                                                                                <Lock className="h-2 w-2" /> Internal Note
                                                                            </span>
                                                                        ) : (
                                                                            <span className="flex items-center gap-0.5 text-blue-600 bg-blue-100/60 px-1.5 py-0.5 rounded-full uppercase text-[8px] font-black">
                                                                                <Globe className="h-2 w-2" /> Reply
                                                                            </span>
                                                                        )}
                                                                        <span>•</span>
                                                                        <span>{new Date(note.created_at).toLocaleString()}</span>
                                                                    </span>
                                                                </div>
                                                                <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{note.body}</p>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* Add Note Form */}
                                            <div className="space-y-3 pt-3 border-t border-slate-100">
                                                <textarea
                                                    value={noteInput}
                                                    onChange={(e) => setNoteInput(e.target.value)}
                                                    placeholder="Type an internal note or a message to the hospital..."
                                                    rows={3}
                                                    className="w-full p-3 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[var(--admin-primary)]/20 bg-white"
                                                />
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    {/* Visibility selector */}
                                                    <div className="flex items-center gap-4">
                                                        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                                                            <input
                                                                type="radio"
                                                                name={`note-vis-${ticket.id}`}
                                                                checked={noteVisibility === TicketNoteVisibility.INTERNAL}
                                                                onChange={() => setNoteVisibility(TicketNoteVisibility.INTERNAL)}
                                                                className="text-[var(--admin-primary)] focus:ring-[var(--admin-primary)]"
                                                            />
                                                            <Lock className="h-3 w-3 text-amber-500" />
                                                            <span>Internal Note (Staff-only)</span>
                                                        </label>
                                                        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                                                            <input
                                                                type="radio"
                                                                name={`note-vis-${ticket.id}`}
                                                                checked={noteVisibility === TicketNoteVisibility.HOSPITAL_VISIBLE}
                                                                onChange={() => setNoteVisibility(TicketNoteVisibility.HOSPITAL_VISIBLE)}
                                                                className="text-[var(--admin-primary)] focus:ring-[var(--admin-primary)]"
                                                            />
                                                            <Globe className="h-3 w-3 text-blue-500" />
                                                            <span>Reply (Share with Hospital)</span>
                                                        </label>
                                                    </div>

                                                    <button
                                                        onClick={() => handleSubmitNote(ticket.id)}
                                                        disabled={submittingNoteTicketId === ticket.id || !noteInput.trim()}
                                                        className="px-4 py-2 text-xs font-bold text-white bg-[var(--admin-primary)] hover:bg-[var(--admin-primary-dark)] rounded-xl transition-all shadow-sm disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                                                    >
                                                        {submittingNoteTicketId === ticket.id && <Loader2 className="h-3 w-3 animate-spin" />}
                                                        Submit
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Metadata Footer */}
                                    <div className="flex flex-wrap items-center gap-y-2 gap-x-5 text-xs text-slate-500 pt-1.5 border-t border-slate-100/60">
                                        {/* User author info */}
                                        <div className="flex items-center gap-1.5">
                                            <User className="h-3.5 w-3.5 text-slate-400" />
                                            <span>
                                                Created by: <strong>{ticket.user.name || ticket.user.username}</strong> ({ticket.user.username})
                                            </span>
                                        </div>

                                        {/* Branch info */}
                                        <div className="flex items-center gap-1.5">
                                            <Building2 className="h-3.5 w-3.5 text-slate-400" />
                                            <span>
                                                Facility: <strong>{ticket.branch.branch_name}</strong>
                                            </span>
                                        </div>

                                        {/* Timestamp info */}
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                            <span>
                                                {new Date(ticket.created_at).toLocaleString('en-US', {
                                                    dateStyle: 'medium',
                                                    timeStyle: 'short'
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Action controls (Right) */}
                                <div className="p-6 md:border-l border-slate-100 flex items-center justify-end bg-slate-50/50 md:bg-transparent min-w-[200px] shrink-0">
                                    <div className="flex flex-row md:flex-col gap-2 w-full md:w-auto">
                                        {/* Developer Assignee Dropdown */}
                                        <div className="space-y-1 mb-2 w-full">
                                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Assignee</label>
                                            <div className="relative">
                                                <select
                                                    value={ticket.assigned_to_id || ''}
                                                    onChange={(e) => handleAssignTicket(ticket.id, e.target.value || null)}
                                                    disabled={assigningTicketId === ticket.id}
                                                    className="w-full pl-7 pr-2 py-1 border border-slate-200 rounded-lg text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--admin-primary)] hover:border-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
                                                >
                                                    <option value="">Unassigned</option>
                                                    {developers.map((dev) => (
                                                        <option key={dev.id} value={dev.id}>
                                                            {dev.name || dev.username}
                                                        </option>
                                                    ))}
                                                </select>
                                                <UserCheck className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                                            </div>
                                        </div>
                                        {/* Mark In Progress (Only if ticket is Open) */}
                                        {ticket.status === TicketStatus.Open && (
                                            <button
                                                onClick={() => handleStatusUpdate(ticket.id, TicketStatus.InProgress)}
                                                disabled={isUpdating}
                                                className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200 rounded-xl transition-all shadow-sm disabled:opacity-50 shrink-0"
                                            >
                                                {isUpdating ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Clock className="h-3.5 w-3.5" />
                                                )}
                                                Set In Progress
                                            </button>
                                        )}

                                        {/* Mark Resolved (If ticket is Open or InProgress) */}
                                        {ticket.status !== TicketStatus.Resolved ? (
                                            <button
                                                onClick={() => handleStatusUpdate(ticket.id, TicketStatus.Resolved)}
                                                disabled={isUpdating}
                                                className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-sm hover:shadow hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 shrink-0"
                                            >
                                                {isUpdating ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Check className="h-3.5 w-3.5" />
                                                )}
                                                Mark as Resolved
                                            </button>
                                        ) : (
                                            /* Resolved indicator */
                                            <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3.5 py-2 rounded-xl text-xs font-bold border border-emerald-100 self-center md:self-end">
                                                <CheckCircle2 className="h-4 w-4" />
                                                Resolved
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Image Preview Lightbox Modal */}
            {previewImageUrl && (
                <div 
                    className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 cursor-zoom-out animate-fade-in"
                    onClick={() => setPreviewImageUrl(null)}
                >
                    <div 
                        className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl p-2 cursor-default animate-scale-in"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setPreviewImageUrl(null)}
                            className="absolute top-4 right-4 p-2 bg-white/90 hover:bg-white rounded-full shadow-md text-slate-700 hover:text-slate-900 transition-all z-10 border border-slate-100 cursor-pointer"
                        >
                            <X className="h-5 w-5" />
                        </button>
                        <img 
                            src={previewImageUrl} 
                            alt="Attachment Preview" 
                            className="max-w-full max-h-[80vh] object-contain rounded-xl"
                        />
                    </div>
                </div>
            )}
        </AdminPage>
    );
}
