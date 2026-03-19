'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Bell, Check, CheckCheck, ExternalLink, Calendar, FlaskConical, Pill, CreditCard, Info, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import {
    getPatientNotifications,
    markPatientNotificationRead,
    markAllPatientNotificationsRead,
} from './notifications/actions';

type Notification = {
    id: number;
    title: string;
    body: string;
    type: string;
    is_read: boolean;
    link: string | null;
    created_at: string;
};

function getTypeIcon(type: string) {
    switch (type) {
        case 'success': return FlaskConical;
        case 'warning': return AlertTriangle;
        case 'critical': return AlertTriangle;
        default: return Info;
    }
}

function getTypeColor(type: string) {
    switch (type) {
        case 'success': return 'bg-emerald-500';
        case 'warning': return 'bg-amber-500';
        case 'critical': return 'bg-red-500';
        default: return 'bg-blue-500';
    }
}

function timeAgo(date: string) {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function PatientNotificationBell() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const loadNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getPatientNotifications({ limit: 10 });
            if (res.success) {
                setNotifications((res.data || []) as Notification[]);
                setUnreadCount(res.unreadCount || 0);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadNotifications();
        const interval = setInterval(loadNotifications, 30000); // 30s polling
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
        await markPatientNotificationRead(id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(prev - 1, 0));
    };

    const handleMarkAllRead = async () => {
        await markAllPatientNotificationsRead();
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
    };

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => { setOpen(!open); if (!open) loadNotifications(); }}
                className="relative p-2 rounded-xl hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors"
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4.5 w-4.5 min-w-[18px] bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden z-50">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-white">
                        <h3 className="text-sm font-black text-gray-900">Notifications</h3>
                        <div className="flex items-center gap-3">
                            {unreadCount > 0 && (
                                <button
                                    onClick={handleMarkAllRead}
                                    className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                                >
                                    <CheckCheck className="h-3 w-3" /> Mark all read
                                </button>
                            )}
                            {unreadCount > 0 && (
                                <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                                    {unreadCount} new
                                </span>
                            )}
                        </div>
                    </div>

                    {/* List */}
                    <div className="max-h-80 overflow-y-auto">
                        {loading && notifications.length === 0 ? (
                            <div className="p-8 text-center">
                                <div className="animate-pulse space-y-3">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="h-12 bg-gray-100 rounded-lg" />
                                    ))}
                                </div>
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="p-8 text-center">
                                <Bell className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                                <p className="text-sm text-gray-400 font-medium">No notifications yet</p>
                                <p className="text-xs text-gray-300 mt-1">We&apos;ll notify you about appointments, lab results, and more</p>
                            </div>
                        ) : (
                            notifications.map((n) => {
                                const TypeIcon = getTypeIcon(n.type);
                                return (
                                    <div
                                        key={n.id}
                                        className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${!n.is_read ? 'bg-emerald-50/30' : ''}`}
                                        onClick={() => !n.is_read && handleMarkRead(n.id)}
                                    >
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
                                                        <Link
                                                            href={n.link}
                                                            onClick={() => setOpen(false)}
                                                            className="text-[9px] text-emerald-500 font-bold flex items-center gap-0.5 hover:text-emerald-600"
                                                        >
                                                            View <ExternalLink className="h-2 w-2" />
                                                        </Link>
                                                    )}
                                                </div>
                                            </div>
                                            {!n.is_read && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }}
                                                    className="p-1 hover:bg-emerald-100 rounded-lg shrink-0"
                                                    title="Mark as read"
                                                >
                                                    <Check className="h-3 w-3 text-gray-400" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-2.5 border-t border-gray-100 text-center">
                        <Link
                            href="/patient/notifications"
                            onClick={() => setOpen(false)}
                            className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                        >
                            View all notifications
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
