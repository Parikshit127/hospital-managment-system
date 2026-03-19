'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
    Bell, Check, CheckCheck, ExternalLink, Calendar, FlaskConical,
    Pill, CreditCard, Info, AlertTriangle, Filter, Trash2
} from 'lucide-react';
import Link from 'next/link';
import {
    getPatientNotifications,
    markPatientNotificationRead,
    markAllPatientNotificationsRead,
} from './actions';

type Notification = {
    id: number;
    title: string;
    body: string;
    type: string;
    is_read: boolean;
    link: string | null;
    created_at: string;
};

type FilterType = 'all' | 'unread' | 'info' | 'success' | 'warning' | 'critical';

function getTypeIcon(type: string) {
    switch (type) {
        case 'success': return FlaskConical;
        case 'warning': return AlertTriangle;
        case 'critical': return AlertTriangle;
        default: return Info;
    }
}

function getTypeStyle(type: string) {
    switch (type) {
        case 'success': return { bg: 'bg-emerald-100', text: 'text-emerald-600', ring: 'ring-emerald-200' };
        case 'warning': return { bg: 'bg-amber-100', text: 'text-amber-600', ring: 'ring-amber-200' };
        case 'critical': return { bg: 'bg-red-100', text: 'text-red-600', ring: 'ring-red-200' };
        default: return { bg: 'bg-blue-100', text: 'text-blue-600', ring: 'ring-blue-200' };
    }
}

function formatDate(date: string) {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;

    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PatientNotificationsPage() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [total, setTotal] = useState(0);
    const [unreadCount, setUnreadCount] = useState(0);
    const [filter, setFilter] = useState<FilterType>('all');
    const [loading, setLoading] = useState(true);

    const loadNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const options: { unreadOnly?: boolean; limit: number } = { limit: 100 };
            if (filter === 'unread') options.unreadOnly = true;

            const res = await getPatientNotifications(options);
            if (res.success) {
                let data = (res.data || []) as Notification[];

                // Client-side filter by type
                if (['info', 'success', 'warning', 'critical'].includes(filter)) {
                    data = data.filter(n => n.type === filter);
                }

                setNotifications(data);
                setTotal(res.total || 0);
                setUnreadCount(res.unreadCount || 0);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        loadNotifications();
    }, [loadNotifications]);

    const handleMarkRead = async (id: number) => {
        await markPatientNotificationRead(id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(prev - 1, 0));
    };

    const handleMarkAllRead = async () => {
        await markAllPatientNotificationsRead();
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
    };

    const filters: { key: FilterType; label: string }[] = [
        { key: 'all', label: 'All' },
        { key: 'unread', label: `Unread (${unreadCount})` },
        { key: 'info', label: 'Info' },
        { key: 'success', label: 'Success' },
        { key: 'warning', label: 'Warnings' },
        { key: 'critical', label: 'Critical' },
    ];

    // Group notifications by date
    const grouped = notifications.reduce((groups, n) => {
        const date = new Date(n.created_at);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

        let label: string;
        if (diffDays === 0) label = 'Today';
        else if (diffDays === 1) label = 'Yesterday';
        else if (diffDays < 7) label = 'This Week';
        else if (diffDays < 30) label = 'This Month';
        else label = 'Older';

        if (!groups[label]) groups[label] = [];
        groups[label].push(n);
        return groups;
    }, {} as Record<string, Notification[]>);

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {total} total, {unreadCount} unread
                    </p>
                </div>
                {unreadCount > 0 && (
                    <button
                        onClick={handleMarkAllRead}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition"
                    >
                        <CheckCheck className="h-4 w-4" /> Mark all read
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {filters.map(f => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-full whitespace-nowrap transition ${
                            filter === f.key
                                ? 'bg-emerald-500 text-white'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Notification List */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="animate-pulse bg-white rounded-2xl p-5 border border-gray-100">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 bg-gray-100 rounded-xl" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-gray-100 rounded w-1/3" />
                                    <div className="h-3 bg-gray-100 rounded w-2/3" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : notifications.length === 0 ? (
                <div className="text-center py-16">
                    <Bell className="h-12 w-12 text-gray-200 mx-auto mb-4" />
                    <p className="text-lg font-bold text-gray-400">No notifications</p>
                    <p className="text-sm text-gray-300 mt-1">
                        {filter !== 'all' ? 'Try a different filter' : 'You\'re all caught up!'}
                    </p>
                </div>
            ) : (
                <div className="space-y-6">
                    {Object.entries(grouped).map(([label, items]) => (
                        <div key={label}>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">
                                {label}
                            </h3>
                            <div className="space-y-2">
                                {items.map((n) => {
                                    const style = getTypeStyle(n.type);
                                    const TypeIcon = getTypeIcon(n.type);

                                    return (
                                        <div
                                            key={n.id}
                                            className={`bg-white border rounded-2xl p-4 transition-all ${
                                                !n.is_read
                                                    ? 'border-emerald-200 shadow-sm shadow-emerald-100'
                                                    : 'border-gray-100 hover:border-gray-200'
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`w-10 h-10 rounded-xl ${style.bg} flex items-center justify-center shrink-0`}>
                                                    <TypeIcon className={`h-5 w-5 ${style.text}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className={`text-sm font-bold truncate ${!n.is_read ? 'text-gray-900' : 'text-gray-600'}`}>
                                                            {n.title}
                                                        </p>
                                                        {!n.is_read && (
                                                            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                                                        )}
                                                    </div>
                                                    <p className={`text-xs mt-1 ${!n.is_read ? 'text-gray-600' : 'text-gray-400'}`}>
                                                        {n.body}
                                                    </p>
                                                    <div className="flex items-center gap-3 mt-2">
                                                        <span className="text-[10px] text-gray-300 font-medium">
                                                            {formatDate(n.created_at)}
                                                        </span>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                                                            {n.type}
                                                        </span>
                                                        {n.link && (
                                                            <Link
                                                                href={n.link}
                                                                className="text-[10px] font-bold text-emerald-500 hover:text-emerald-600 flex items-center gap-0.5"
                                                            >
                                                                View <ExternalLink className="h-2.5 w-2.5" />
                                                            </Link>
                                                        )}
                                                    </div>
                                                </div>
                                                {!n.is_read && (
                                                    <button
                                                        onClick={() => handleMarkRead(n.id)}
                                                        className="p-2 hover:bg-emerald-50 rounded-xl shrink-0 transition"
                                                        title="Mark as read"
                                                    >
                                                        <Check className="h-4 w-4 text-gray-400" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
