'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '@/app/components/layout/Sidebar';
import { Calendar, Phone, CheckCircle2, Search, Filter, MessageSquare, AlertCircle, Clock, User, Loader2 } from 'lucide-react';
import { getFollowUpsDue, updateFollowUpStatus } from '@/app/actions/doctor-actions';

type FilterType = 'today' | 'week' | 'overdue' | 'all';

interface FollowUpItem {
    id: string;
    patient_id: string;
    doctor_id: string;
    scheduled_date: string;
    notes?: string;
    status: string;
    patientName: string;
    patientPhone?: string | null;
}

export default function DoctorFollowUps() {
    const [session, setSession] = useState<{ id: string; username: string; role: string; name?: string; specialty?: string } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState<FilterType>('today');
    const [markingDone, setMarkingDone] = useState<string | null>(null);

    useEffect(() => {
        async function fetchSession() {
            try {
                const res = await fetch('/api/session');
                if (res.ok) {
                    const data = await res.json();
                    setSession(data);
                }
            } catch (e) {
                console.error('Failed to fetch session', e);
            }
        }
        fetchSession();
    }, []);

    const fetchFollowUps = useCallback(async () => {
        if (!session?.id) return;
        setLoading(true);
        try {
            const result = await getFollowUpsDue(session.id, activeFilter);
            if (result.success && result.data) {
                setFollowUps(result.data as FollowUpItem[]);
            } else {
                setFollowUps([]);
            }
        } catch (error) {
            console.error('Failed to fetch follow-ups', error);
            setFollowUps([]);
        } finally {
            setLoading(false);
        }
    }, [session?.id, activeFilter]);

    useEffect(() => {
        if (session?.id) {
            fetchFollowUps();
        }
    }, [session?.id, activeFilter, fetchFollowUps]);

    // Handle marking a follow-up as done
    async function handleMarkDone(id: string) {
        setMarkingDone(id);
        try {
            const result = await updateFollowUpStatus(id, 'Completed');
            if (result.success) {
                await fetchFollowUps();
            }
        } catch (error) {
            console.error('Failed to mark follow-up as done', error);
        } finally {
            setMarkingDone(null);
        }
    }

    // Compute stats from real data
    const dueTodayCount = followUps.filter(f => {
        const today = new Date();
        const scheduled = new Date(f.scheduled_date);
        return scheduled.toDateString() === today.toDateString() && f.status === 'Pending';
    }).length;

    const upcomingCount = followUps.filter(f => {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const scheduled = new Date(f.scheduled_date);
        return scheduled > today && f.status === 'Pending';
    }).length;

    const completedCount = followUps.filter(f => f.status === 'Completed').length;

    // Format scheduled date for display
    function formatDate(dateStr: string): string {
        try {
            const d = new Date(dateStr);
            const now = new Date();
            const today = new Date(now); today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
            const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

            const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            const dateOnly = new Date(d); dateOnly.setHours(0, 0, 0, 0);

            if (dateOnly.getTime() === today.getTime()) {
                return `Today, ${timeStr}`;
            } else if (dateOnly.getTime() === tomorrow.getTime()) {
                return `Tomorrow, ${timeStr}`;
            } else if (dateOnly.getTime() === yesterday.getTime()) {
                return 'Yesterday';
            } else {
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + `, ${timeStr}`;
            }
        } catch {
            return '--';
        }
    }

    // Determine priority/risk color based on date
    function getPriorityInfo(item: FollowUpItem): { risk: string; color: string } {
        const now = new Date();
        const scheduled = new Date(item.scheduled_date);
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

        if (item.status === 'Completed') {
            return { risk: 'Done', color: 'text-gray-500 bg-gray-100 border-gray-200' };
        }
        if (scheduled < todayStart) {
            return { risk: 'Overdue', color: 'text-rose-500 bg-rose-500/10 border-rose-500/20' };
        }
        if (scheduled.toDateString() === now.toDateString()) {
            return { risk: 'Today', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
        }
        return { risk: 'Upcoming', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' };
    }

    const filteredFollowUps = followUps.filter(f => {
        const name = (f.patientName || '').toLowerCase();
        const notes = (f.notes || '').toLowerCase();
        const term = searchTerm.toLowerCase();
        return name.includes(term) || notes.includes(term);
    });

    const filterTabs: { key: FilterType; label: string }[] = [
        { key: 'today', label: 'Today' },
        { key: 'week', label: 'This Week' },
        { key: 'overdue', label: 'Overdue' },
        { key: 'all', label: 'All' },
    ];

    const inputCls = "w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400 transition-all shadow-sm";

    return (
        <div className="flex h-[calc(100vh-52px)] bg-gray-50 font-sans text-gray-900 overflow-hidden relative lg:pl-60">
            <Sidebar session={session} />

            <main className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto w-full">
                <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 border border-amber-200 bg-amber-50/50 rounded-xl shadow-sm">
                                    <Phone className="h-6 w-6 text-amber-500" />
                                </div>
                                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Follow-Ups Manager</h1>
                            </div>
                            <p className="text-sm text-gray-500 font-medium">Track and manage scheduled patient follow-ups and review checks.</p>
                        </div>
                        <div className="flex gap-3">
                            <button className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 hover:border-amber-500/30 transition-all flex items-center gap-2 shadow-sm text-sm whitespace-nowrap">
                                <Filter className="h-4 w-4" /> Priority Filter
                            </button>
                            <button className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl hover:from-amber-400 hover:to-orange-400 transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20 text-sm whitespace-nowrap">
                                <Calendar className="h-4 w-4" /> Schedule Follow-up
                            </button>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {[
                            { label: "Due Today", value: dueTodayCount, icon: AlertCircle, color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20" },
                            { label: "Upcoming", value: upcomingCount, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
                            { label: "Completed", value: completedCount, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
                            { label: "Total Listed", value: followUps.length, icon: Phone, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" }
                        ].map((stat, i) => (
                            <div key={i} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:border-amber-500/20 transition-all group">
                                <div className="flex items-center justify-between mb-3">
                                    <span className={`p-2 rounded-xl ${stat.bg} ${stat.border} border group-hover:scale-110 transition-transform`}>
                                        <stat.icon className={`h-5 w-5 ${stat.color}`} />
                                    </span>
                                </div>
                                <h3 className="text-2xl font-black text-gray-900 tracking-tight">{loading ? '...' : stat.value}</h3>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">{stat.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex gap-2 flex-wrap">
                        {filterTabs.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveFilter(tab.key)}
                                className={`px-4 py-2 text-sm font-bold rounded-xl border transition-all ${
                                    activeFilter === tab.key
                                        ? 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/20'
                                        : 'bg-white text-gray-600 border-gray-200 hover:border-amber-500/30 hover:bg-amber-50/50'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Main Content List */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row justify-between gap-4 items-center bg-gray-50/50">
                            <h2 className="font-black text-gray-800 flex items-center gap-2"><Phone className="h-5 w-5 text-amber-500" /> Active Follow-Up Queue</h2>
                            <div className="relative w-full sm:w-80 group">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-amber-500 transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Search by patient or reason..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className={inputCls}
                                />
                            </div>
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center py-16 text-gray-400">
                                <Loader2 className="h-6 w-6 animate-spin mr-3" />
                                <span className="font-medium text-sm">Loading follow-ups...</span>
                            </div>
                        ) : filteredFollowUps.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Calendar className="h-10 w-10 mb-3 text-gray-300" />
                                <span className="font-bold text-sm">
                                    {searchTerm ? 'No matching follow-ups found.' : 'No follow-ups for this filter.'}
                                </span>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {filteredFollowUps.map((item) => {
                                    const priority = getPriorityInfo(item);
                                    return (
                                        <div key={item.id} className="p-5 hover:bg-amber-50/50 transition-all group flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                                            {/* Avatar */}
                                            <div className="hidden sm:flex h-12 w-12 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-2xl border border-amber-500/10 items-center justify-center flex-shrink-0">
                                                <User className="h-6 w-6 text-amber-600" />
                                            </div>

                                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                                                <div>
                                                    <div className="font-bold text-gray-900 text-base flex flex-col items-start gap-1">
                                                        <span className="group-hover:text-amber-600 transition-colors cursor-pointer">{item.patientName}</span>
                                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md mt-1 border tracking-[0.05em] ${priority.color}`}>
                                                            Priority: {priority.risk}
                                                        </span>
                                                    </div>
                                                    {item.patientPhone && (
                                                        <div className="text-xs text-gray-400 mt-1.5 font-medium flex items-center gap-1">
                                                            <Phone className="h-3 w-3" /> {item.patientPhone}
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-gray-800 flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-gray-400" /> {formatDate(item.scheduled_date)}</div>
                                                    <div className="text-xs text-gray-500 mt-1 font-medium">{item.notes || 'No notes'}</div>
                                                </div>
                                                <div className="flex items-center sm:justify-end gap-2 w-full">
                                                    {item.status !== 'Completed' ? (
                                                        <>
                                                            {item.patientPhone && (
                                                                <a href={`tel:${item.patientPhone}`} title="Call Patient" className="p-2 text-gray-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-xl transition-all border border-transparent hover:border-emerald-500/20">
                                                                    <Phone className="h-5 w-5 text-emerald-500/80" />
                                                                </a>
                                                            )}
                                                            <button title="Send Message" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all border border-transparent hover:border-blue-500/20">
                                                                <MessageSquare className="h-5 w-5 text-blue-500/80" />
                                                            </button>
                                                            <button
                                                                title="Mark Done"
                                                                onClick={() => handleMarkDone(item.id)}
                                                                disabled={markingDone === item.id}
                                                                className="ml-2 px-4 py-2 bg-emerald-500/10 text-emerald-600 font-bold text-xs rounded-xl hover:bg-emerald-500/20 border border-emerald-500/20 transition-all flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                                                            >
                                                                {markingDone === item.id ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <CheckCircle2 className="h-4 w-4" />
                                                                )}
                                                                Done
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-500 bg-emerald-50/50 px-3 py-1.5 rounded-lg border border-emerald-100">
                                                            <CheckCircle2 className="h-4 w-4" /> Completed
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
