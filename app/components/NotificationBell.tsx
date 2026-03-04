'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import {
    getNotifications, markNotificationRead, markAllNotificationsRead
} from '@/app/actions/notification-actions';

interface NotificationBellProps {
    userId: string;
}

export function NotificationBell({ userId }: NotificationBellProps) {
    const [notifications, setNotifications] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const loadNotifications = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const res = await getNotifications(userId, { limit: 10 });
            if (res.success) {
                setNotifications(res.data || []);
                setUnreadCount(res.unreadCount || 0);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [userId]);

    useEffect(() => {
        loadNotifications();
        const interval = setInterval(loadNotifications, 60000);
        return () => clearInterval(interval);
    }, [loadNotifications]);

    // Close on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleMarkRead = async (id: number) => {
        await markNotificationRead(id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(prev - 1, 0));
    };

    const handleMarkAllRead = async () => {
        await markAllNotificationsRead(userId);
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'success': return 'bg-emerald-500';
            case 'warning': return 'bg-amber-500';
            case 'critical': return 'bg-red-500';
            default: return 'bg-blue-500';
        }
    };

    const timeAgo = (date: string) => {
        const diff = Date.now() - new Date(date).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    };

    return (
        <div ref={ref} className="relative">
            <button onClick={() => { setOpen(!open); if (!open) loadNotifications(); }}
                className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden z-50">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="text-sm font-black text-gray-900">Notifications</h3>
                        {unreadCount > 0 && (
                            <button onClick={handleMarkAllRead}
                                className="text-[10px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                                <CheckCheck className="h-3 w-3" /> Mark all read
                            </button>
                        )}
                    </div>

                    {/* List */}
                    <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center">
                                <Bell className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                                <p className="text-sm text-gray-400 font-medium">No notifications</p>
                            </div>
                        ) : (
                            notifications.map((n: any) => (
                                <div key={n.id}
                                    className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${!n.is_read ? 'bg-blue-50/30' : ''}`}
                                    onClick={() => !n.is_read && handleMarkRead(n.id)}>
                                    <div className="flex items-start gap-3">
                                        <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${!n.is_read ? getTypeColor(n.type) : 'bg-gray-200'}`} />
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-xs font-bold ${!n.is_read ? 'text-gray-900' : 'text-gray-500'}`}>
                                                {n.title}
                                            </p>
                                            <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-[9px] text-gray-300 font-medium">{timeAgo(n.created_at)}</span>
                                                {n.link && (
                                                    <Link href={n.link} onClick={() => setOpen(false)}
                                                        className="text-[9px] text-teal-500 font-bold flex items-center gap-0.5 hover:text-teal-600">
                                                        View <ExternalLink className="h-2 w-2" />
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                        {!n.is_read && (
                                            <button onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }}
                                                className="p-1 hover:bg-gray-200 rounded-lg shrink-0" title="Mark as read">
                                                <Check className="h-3 w-3 text-gray-400" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-2.5 border-t border-gray-100 text-center">
                        <Link href="/notifications" onClick={() => setOpen(false)}
                            className="text-xs font-bold text-teal-600 hover:text-teal-700">
                            View all notifications
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
