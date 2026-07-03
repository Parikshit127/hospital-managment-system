'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
    Bell, CheckCheck, Trash2, ExternalLink, Info,
    CheckCircle2, AlertTriangle, AlertOctagon,
} from 'lucide-react';
import {
    getNotifications, markNotificationRead,
    markAllNotificationsRead, deleteNotification,
} from '@/app/actions/notification-actions';
import { LoadingState } from '@/app/components/ui/LoadingState';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { Button } from '@/app/components/ui/Button';

// Full notification history for the hospital-side Help Center (v2 §3.2 Tab 4).
// Reuses the same legacy per-user notification actions as the standalone
// /notifications page — a relocation into the tabbed Help Center, not new
// functionality (PRD v3 Addendum §4).

interface NotificationRow {
    id: number;
    title: string;
    body: string;
    type: string;
    is_read: boolean;
    link: string | null;
    created_at: string;
}

function getTypeIcon(type: string) {
    switch (type) {
        case 'success': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
        case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
        case 'critical': return <AlertOctagon className="h-4 w-4 text-red-500" />;
        default: return <Info className="h-4 w-4 text-blue-500" />;
    }
}

export function NotificationsPanel({ userId }: { userId: string }) {
    const [notifications, setNotifications] = useState<NotificationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');

    const loadData = useCallback(async () => {
        if (!userId) return;
        try {
            const res = await getNotifications(userId, { limit: 100 });
            if (res.success) setNotifications((res.data as NotificationRow[]) || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleMarkRead = async (id: number) => {
        await markNotificationRead(id);
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    };

    const handleMarkAllRead = async () => {
        await markAllNotificationsRead(userId);
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    };

    const handleDelete = async (id: number) => {
        await deleteNotification(id);
        setNotifications((prev) => prev.filter((n) => n.id !== id));
    };

    const unreadCount = notifications.filter((n) => !n.is_read).length;
    const visible = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;

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
                            key={n.id}
                            className={`bg-white border border-gray-200 shadow-sm rounded-2xl p-4 flex items-start gap-4 transition-all ${
                                !n.is_read ? 'border-l-4 border-l-primary-500' : ''
                            }`}
                        >
                            <div className="mt-0.5 shrink-0">{getTypeIcon(n.type)}</div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold ${!n.is_read ? 'text-gray-900' : 'text-gray-500'}`}>{n.title}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{n.body}</p>
                                <div className="flex items-center gap-3 mt-2">
                                    <span className="text-[10px] text-gray-300 font-medium">
                                        {new Date(n.created_at).toLocaleString()}
                                    </span>
                                    {n.link && (
                                        <Link href={n.link} className="text-[10px] text-primary-500 font-bold flex items-center gap-0.5 hover:text-primary-600">
                                            View <ExternalLink className="h-2 w-2" />
                                        </Link>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {!n.is_read && (
                                    <button
                                        onClick={() => handleMarkRead(n.id)}
                                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-primary-600 transition-colors"
                                        title="Mark as read"
                                    >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDelete(n.id)}
                                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-300 hover:text-red-500 transition-colors"
                                    title="Delete"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
