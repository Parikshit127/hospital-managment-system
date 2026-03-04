'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    Bell, Loader2, CheckCheck, Trash2, Filter, ExternalLink,
    Info, CheckCircle2, AlertTriangle, AlertOctagon
} from 'lucide-react';
import Link from 'next/link';
import {
    getNotifications, markNotificationRead,
    markAllNotificationsRead, deleteNotification
} from '@/app/actions/notification-actions';

export default function NotificationsPage() {
    const [userId, setUserId] = useState('');
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');

    useEffect(() => {
        fetch('/api/session').then(r => r.json()).then(d => setUserId(d?.id || '')).catch(() => {});
    }, []);

    const loadData = useCallback(async () => {
        if (!userId) return;
        setRefreshing(true);
        try {
            const res = await getNotifications(userId, {
                unreadOnly: filter === 'unread',
                limit: 100,
            });
            if (res.success) setNotifications(res.data || []);
        } catch (e) { console.error(e); }
        finally { setRefreshing(false); setLoading(false); }
    }, [userId, filter]);

    useEffect(() => { if (userId) { setLoading(true); loadData(); } }, [loadData, userId]);

    const handleMarkRead = async (id: number) => {
        await markNotificationRead(id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    };

    const handleMarkAllRead = async () => {
        await markAllNotificationsRead(userId);
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    };

    const handleDelete = async (id: number) => {
        await deleteNotification(id);
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'success': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
            case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
            case 'critical': return <AlertOctagon className="h-4 w-4 text-red-500" />;
            default: return <Info className="h-4 w-4 text-blue-500" />;
        }
    };

    const unreadCount = notifications.filter(n => !n.is_read).length;

    return (
        <AppShell pageTitle="Notifications" pageIcon={<Bell className="h-5 w-5" />}
            onRefresh={loadData} refreshing={refreshing}
            headerActions={
                unreadCount > 0 ? (
                    <button onClick={handleMarkAllRead}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-teal-600 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors">
                        <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                    </button>
                ) : null
            }>
            <div className="space-y-4 max-w-3xl">
                {/* Filters */}
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-gray-400" />
                    {(['all', 'unread'] as const).map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filter === f
                                ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                            }`}>
                            {f === 'all' ? 'All' : `Unread (${unreadCount})`}
                        </button>
                    ))}
                </div>

                {/* Notification List */}
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
                        <Bell className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-400 font-medium">No notifications</p>
                        <p className="text-gray-300 text-sm mt-1">You're all caught up!</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {notifications.map((n: any) => (
                            <div key={n.id}
                                className={`bg-white border border-gray-200 shadow-sm rounded-2xl p-4 flex items-start gap-4 transition-all ${!n.is_read ? 'border-l-4 border-l-teal-500' : ''}`}>
                                <div className="mt-0.5 shrink-0">{getTypeIcon(n.type)}</div>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-bold ${!n.is_read ? 'text-gray-900' : 'text-gray-500'}`}>{n.title}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">{n.body}</p>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className="text-[10px] text-gray-300 font-medium">
                                            {new Date(n.created_at).toLocaleString()}
                                        </span>
                                        {n.link && (
                                            <Link href={n.link} className="text-[10px] text-teal-500 font-bold flex items-center gap-0.5 hover:text-teal-600">
                                                View <ExternalLink className="h-2 w-2" />
                                            </Link>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    {!n.is_read && (
                                        <button onClick={() => handleMarkRead(n.id)}
                                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-teal-600 transition-colors" title="Mark as read">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                    <button onClick={() => handleDelete(n.id)}
                                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-300 hover:text-red-500 transition-colors" title="Delete">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
