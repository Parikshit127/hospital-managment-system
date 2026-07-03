'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
    Bell, CheckCheck, Trash2, ExternalLink, Info, Megaphone, Rocket,
    CheckCircle2, AlertTriangle, AlertOctagon,
} from 'lucide-react';
import {
    getNotifications, markNotificationRead,
    markAllNotificationsRead, deleteNotification,
} from '@/app/actions/notification-actions';
import { LoadingState } from '@/app/components/ui/LoadingState';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { Button } from '@/app/components/ui/Button';
import { helpCenterTabHref } from '@/app/help-center/routes';

// Full notification history for the hospital-side Help Center (v2 §3.2 Tab 4).
//
// This tab unions TWO independent notification systems so the user sees one
// consolidated history (the same broadcasts also surface in the top-nav bell):
//   1. Legacy per-user notifications  — `notifications` table, via
//      notification-actions (ticket status pings etc.). Has delete.
//   2. Admin broadcasts               — `Broadcast` + `NotificationReceipt`,
//      via the REST API the bell uses (GET /api/notifications). No delete.
// Read state is tracked per source, so "mark read" routes to the correct
// backend for each item. (NOTE: broadcast data is Person B's domain — this tab
// only READS it; coordinate before changing the broadcast schema/endpoints.)

type NotificationSource = 'legacy' | 'broadcast';

interface UnifiedNotification {
    key: string;            // React key, unique across sources
    source: NotificationSource;
    legacyId?: number;      // legacy mark-read / delete
    receiptId?: string;     // broadcast mark-read
    title: string;
    body: string;
    type: string;           // drives the icon
    read: boolean;
    createdAt: string;      // ISO, for sorting + display
    link: string | null;
    canDelete: boolean;
    isRelease: boolean;     // broadcast that announces a published release note
}

function toIso(value: unknown): string {
    try {
        return new Date(value as string).toISOString();
    } catch {
        return new Date(0).toISOString();
    }
}

function getIcon(item: UnifiedNotification) {
    if (item.source === 'broadcast') {
        return item.isRelease
            ? <Rocket className="h-4 w-4 text-indigo-500" />
            : <Megaphone className="h-4 w-4 text-purple-500" />;
    }
    switch (item.type) {
        case 'success': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
        case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
        case 'critical': return <AlertOctagon className="h-4 w-4 text-red-500" />;
        default: return <Info className="h-4 w-4 text-blue-500" />;
    }
}

export function NotificationsPanel({ userId }: { userId: string }) {
    const [items, setItems] = useState<UnifiedNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');

    const loadData = useCallback(async () => {
        if (!userId) return;

        // Legacy per-user notifications (server action).
        const legacyPromise = getNotifications(userId, { limit: 100 })
            .then((res): UnifiedNotification[] => {
                if (!res.success || !res.data) return [];
                return (res.data as any[]).map((n) => ({
                    key: `legacy:${n.id}`,
                    source: 'legacy' as const,
                    legacyId: n.id,
                    title: n.title,
                    body: n.body,
                    type: n.type ?? 'info',
                    read: Boolean(n.is_read),
                    createdAt: toIso(n.created_at),
                    link: n.link ?? null,
                    canDelete: true,
                    isRelease: false,
                }));
            })
            .catch(() => [] as UnifiedNotification[]);

        // Admin broadcasts — the same REST source the notification bell uses.
        const broadcastPromise = fetch('/api/notifications?limit=100')
            .then((r) => r.json())
            .then((data): UnifiedNotification[] => {
                if (!data?.success || !data.notifications) return [];
                return (data.notifications as any[]).map((n) => ({
                    key: `broadcast:${n.receiptId}`,
                    source: 'broadcast' as const,
                    receiptId: n.receiptId,
                    title: n.title,
                    body: n.body,
                    type: 'broadcast',
                    read: Boolean(n.read),
                    createdAt: toIso(n.createdAt),
                    link: n.releaseNoteId
                        ? helpCenterTabHref('release-notes', { id: n.releaseNoteId })
                        : null,
                    canDelete: false,
                    isRelease: Boolean(n.releaseNoteId),
                }));
            })
            .catch(() => [] as UnifiedNotification[]);

        try {
            const [legacy, broadcast] = await Promise.all([legacyPromise, broadcastPromise]);
            const merged = [...legacy, ...broadcast].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
            setItems(merged);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { loadData(); }, [loadData]);

    const markReadInState = (key: string) =>
        setItems((prev) => prev.map((n) => (n.key === key ? { ...n, read: true } : n)));

    const handleMarkRead = async (item: UnifiedNotification) => {
        if (item.source === 'legacy' && item.legacyId != null) {
            await markNotificationRead(item.legacyId);
        } else if (item.source === 'broadcast' && item.receiptId) {
            await fetch(`/api/notifications/${item.receiptId}/read`, { method: 'POST' });
        }
        markReadInState(item.key);
    };

    const handleMarkAllRead = async () => {
        // Each system has its own "mark all read" endpoint — hit both.
        await Promise.all([
            markAllNotificationsRead(userId),
            fetch('/api/notifications/read-all', { method: 'POST' }),
        ]);
        setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    };

    const handleDelete = async (item: UnifiedNotification) => {
        // Only legacy notifications support deletion; broadcasts have no delete.
        if (item.source !== 'legacy' || item.legacyId == null) return;
        await deleteNotification(item.legacyId);
        setItems((prev) => prev.filter((n) => n.key !== item.key));
    };

    const unreadCount = items.filter((n) => !n.read).length;
    const visible = filter === 'unread' ? items.filter((n) => !n.read) : items;

    if (loading) {
        return <LoadingState message="Loading notifications…" />;
    }

    return (
        <div className="max-w-3xl mx-auto space-y-5">
            {/* Header + filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary-100 text-primary-600 rounded-xl">
                        <Bell className="h-6 w-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-gray-900">Notifications</h2>
                        <p className="text-gray-500">Your notification history</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {(['all', 'unread'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                filter === f
                                    ? 'bg-primary-50 text-primary-700 border border-primary-200'
                                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            {f === 'all' ? 'All' : `Unread (${unreadCount})`}
                        </button>
                    ))}
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={<CheckCheck className="h-3.5 w-3.5" />}
                            onClick={handleMarkAllRead}
                        >
                            Mark all read
                        </Button>
                    )}
                </div>
            </div>

            {/* List */}
            {visible.length === 0 ? (
                <EmptyState
                    icon={<Bell className="h-8 w-8" />}
                    title={filter === 'unread' ? 'No unread notifications' : 'No notifications'}
                    description={filter === 'unread' ? "You're all caught up!" : 'You have no notifications yet.'}
                />
            ) : (
                <div className="space-y-2">
                    {visible.map((n) => (
                        <div
                            key={n.key}
                            className={`bg-white border border-gray-200 shadow-sm rounded-2xl p-4 flex items-start gap-4 transition-all ${
                                !n.read ? 'border-l-4 border-l-primary-500' : ''
                            }`}
                        >
                            <div className="mt-0.5 shrink-0">{getIcon(n)}</div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className={`text-sm font-bold ${!n.read ? 'text-gray-900' : 'text-gray-500'}`}>{n.title}</p>
                                    {n.source === 'broadcast' && (
                                        n.isRelease ? (
                                            <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[9px] font-bold uppercase tracking-wider shrink-0">
                                                Release
                                            </span>
                                        ) : (
                                            <span className="px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-600 text-[9px] font-bold uppercase tracking-wider shrink-0">
                                                Broadcast
                                            </span>
                                        )
                                    )}
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">{n.body}</p>
                                <div className="flex items-center gap-3 mt-2">
                                    <span className="text-[10px] text-gray-300 font-medium">
                                        {new Date(n.createdAt).toLocaleString()}
                                    </span>
                                    {n.link && (
                                        <Link href={n.link} className="text-[10px] text-primary-500 font-bold flex items-center gap-0.5 hover:text-primary-600">
                                            View <ExternalLink className="h-2 w-2" />
                                        </Link>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {!n.read && (
                                    <button
                                        onClick={() => handleMarkRead(n)}
                                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-primary-600 transition-colors"
                                        title="Mark as read"
                                    >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                                {n.canDelete && (
                                    <button
                                        onClick={() => handleDelete(n)}
                                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-300 hover:text-red-500 transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
