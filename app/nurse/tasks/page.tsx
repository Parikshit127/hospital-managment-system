'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    ClipboardCheck, Loader2, CheckCircle2, Clock, Filter,
    AlertTriangle, Search, User
} from 'lucide-react';
import { getNursingTasks, completeNursingTask } from '@/app/actions/nurse-actions';

export default function NurseTasksPage() {
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<'pending' | 'completed' | 'all'>('pending');
    const [search, setSearch] = useState('');
    const [completing, setCompleting] = useState<number | null>(null);

    const loadTasks = useCallback(async () => {
        setRefreshing(true);
        try {
            const res = await getNursingTasks({ status: filter === 'all' ? undefined : filter });
            if (res.success) setTasks(res.data || []);
        } catch (e) {
            console.error('Failed to load tasks', e);
        } finally {
            setRefreshing(false);
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { setLoading(true); loadTasks(); }, [loadTasks]);

    const handleComplete = async (taskId: number) => {
        setCompleting(taskId);
        try {
            const res = await completeNursingTask(taskId);
            if (res.success) await loadTasks();
        } catch (e) {
            console.error('Complete task error', e);
        } finally {
            setCompleting(null);
        }
    };

    const filtered = tasks.filter(t => {
        if (!search) return true;
        const q = search.toLowerCase();
        return t.description?.toLowerCase().includes(q) || t.patientName?.toLowerCase().includes(q);
    });

    const pendingCount = tasks.filter(t => t.status === 'pending' || t.status === 'Pending').length;

    const getPriorityStyle = (p: string) => {
        switch (p?.toLowerCase()) {
            case 'high': case 'urgent': return 'bg-red-100 text-red-700 border-red-200';
            case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200';
            default: return 'bg-blue-100 text-blue-700 border-blue-200';
        }
    };

    return (
        <AppShell pageTitle="Nursing Tasks" pageIcon={<ClipboardCheck className="h-5 w-5" />}
            onRefresh={loadTasks} refreshing={refreshing}
            headerActions={
                pendingCount > 0 ? (
                    <span className="bg-amber-50 text-amber-600 text-[10px] font-black px-2.5 py-1 rounded-lg border border-amber-200">
                        {pendingCount} PENDING
                    </span>
                ) : null
            }
        >
            <div className="space-y-4">
                {/* Filters */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4 flex flex-col sm:flex-row gap-4 justify-between">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input type="text" placeholder="Search tasks or patients..."
                            value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400" />
                        {(['pending', 'completed', 'all'] as const).map(f => (
                            <button key={f} onClick={() => setFilter(f)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filter === f
                                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                                }`}>
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Task List */}
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
                        <ClipboardCheck className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-400 font-medium">No tasks found</p>
                        <p className="text-gray-300 text-sm mt-1">
                            {filter === 'pending' ? 'All caught up!' : 'No tasks match your filters'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((task: any) => {
                            const isDone = task.status === 'completed' || task.status === 'Completed';
                            return (
                                <div key={task.id} className={`bg-white border border-gray-200 shadow-sm rounded-2xl p-4 flex items-center justify-between gap-4 transition-all ${isDone ? 'opacity-60' : 'hover:shadow-md'}`}>
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${isDone ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                                            {isDone ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Clock className="h-5 w-5 text-amber-500" />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`text-sm font-bold ${isDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                                {task.description || 'Unnamed Task'}
                                            </p>
                                            <div className="flex items-center gap-3 mt-1">
                                                {task.patientName && (
                                                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                                        <User className="h-2.5 w-2.5" /> {task.patientName}
                                                    </span>
                                                )}
                                                {task.priority && (
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getPriorityStyle(task.priority)}`}>
                                                        {task.priority}
                                                    </span>
                                                )}
                                                {task.due_time && (
                                                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                                        <Clock className="h-2.5 w-2.5" /> {new Date(task.due_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {!isDone && (
                                        <button onClick={() => handleComplete(task.id)}
                                            disabled={completing === task.id}
                                            className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl hover:shadow-md transition-all disabled:opacity-50">
                                            {completing === task.id
                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                : <CheckCircle2 className="h-3.5 w-3.5" />}
                                            Done
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
