'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    ClipboardCheck, Loader2, CheckCircle2, Clock, Filter,
    AlertTriangle, Search, User, ListTodo, Flame
} from 'lucide-react';
import { getNursingTasks, completeNursingTask, claimNursingTask, releaseNursingTask } from '@/app/actions/nurse-actions';

export default function NurseTasksPage() {
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<'pending' | 'completed' | 'all'>('pending');
    const [search, setSearch] = useState('');
    const [completing, setCompleting] = useState<number | null>(null);
    const [claiming, setClaiming] = useState<number | null>(null);
    const [msg, setMsg] = useState<string | null>(null);

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

    // Taking a task stamps your name on it so two nurses do not walk to the
    // same bedside. A refusal names who already has it.
    const handleClaim = async (taskId: number) => {
        setClaiming(taskId);
        try {
            const res = await claimNursingTask(taskId);
            if (!res.success) setMsg(res.error || 'Could not take that task');
            await loadTasks();
        } finally {
            setClaiming(null);
            setTimeout(() => setMsg(null), 5000);
        }
    };

    const handleRelease = async (taskId: number) => {
        setClaiming(taskId);
        try {
            const res = await releaseNursingTask(taskId);
            if (!res.success) setMsg(res.error || 'Could not hand that task back');
            await loadTasks();
        } finally {
            setClaiming(null);
            setTimeout(() => setMsg(null), 5000);
        }
    };

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

    const isTaskDone = (t: any) => t.status === 'completed' || t.status === 'Completed';
    const isHighPriority = (p?: string) => p?.toLowerCase() === 'high' || p?.toLowerCase() === 'urgent';
    const isOverdue = (t: any) =>
        !isTaskDone(t) && t.scheduled_at && new Date(t.scheduled_at).getTime() < Date.now();

    const pendingCount = tasks.filter(t => !isTaskDone(t)).length;
    const overdueCount = tasks.filter(isOverdue).length;
    const urgentCount = tasks.filter(t => !isTaskDone(t) && isHighPriority(t.priority)).length;

    const getPriorityStyle = (p: string) => {
        switch (p?.toLowerCase()) {
            case 'high': case 'urgent': return 'bg-red-100 text-red-700 border-red-200';
            case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200';
            default: return 'bg-blue-100 text-blue-700 border-blue-200';
        }
    };

    // left accent bar colour per task state
    const getAccent = (t: any) => {
        if (isTaskDone(t)) return 'before:bg-emerald-400';
        if (isOverdue(t)) return 'before:bg-red-500';
        if (isHighPriority(t.priority)) return 'before:bg-red-400';
        if (t.priority?.toLowerCase() === 'medium') return 'before:bg-amber-400';
        return 'before:bg-blue-400';
    };

    return (
        <AppShell pageTitle="Nursing Tasks" pageIcon={<ClipboardCheck className="h-5 w-5" />}
            onRefresh={loadTasks} refreshing={refreshing}
            headerActions={
                <div className="flex items-center gap-2">
                    {overdueCount > 0 && (
                        <span className="flex items-center gap-1 bg-red-50 text-red-600 text-[10px] font-black px-2.5 py-1 rounded-lg border border-red-200">
                            <AlertTriangle className="h-3 w-3" /> {overdueCount} OVERDUE
                        </span>
                    )}
                    {pendingCount > 0 && (
                        <span className="bg-amber-50 text-amber-600 text-[10px] font-black px-2.5 py-1 rounded-lg border border-amber-200">
                            {pendingCount} PENDING
                        </span>
                    )}
                </div>
            }
        >
            <div className="space-y-4">
                {/* Summary strip */}
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { label: 'Pending', value: pendingCount, icon: ListTodo, color: 'text-amber-500', bg: 'bg-amber-50' },
                        { label: 'Overdue', value: overdueCount, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
                        { label: 'Urgent', value: urgentCount, icon: Flame, color: 'text-rose-500', bg: 'bg-rose-50' },
                    ].map((s) => {
                        const Icon = s.icon;
                        return (
                            <div key={s.label} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4 flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-0.5">{s.label}</p>
                                    <p className="text-2xl font-black text-gray-900">{s.value}</p>
                                </div>
                                <div className={`p-2.5 rounded-xl ${s.bg}`}>
                                    <Icon className={`h-5 w-5 ${s.color}`} />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Filters */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4 flex flex-col sm:flex-row gap-4 justify-between">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input type="text" placeholder="Search tasks or patients..."
                            value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400 shrink-0" />
                        <div className="flex bg-gray-100 p-1 rounded-xl">
                            {(['pending', 'completed', 'all'] as const).map(f => (
                                <button key={f} onClick={() => setFilter(f)}
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === f
                                        ? 'bg-white text-orange-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                    }`}>
                                    {f.charAt(0).toUpperCase() + f.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* A refused claim names who already holds the task. */}
                {msg && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
                        {msg}
                    </div>
                )}

                {/* Task List */}
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
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
                            const isDone = isTaskDone(task);
                            const overdue = isOverdue(task);
                            return (
                                <div key={task.id}
                                    className={`relative overflow-hidden bg-white border shadow-sm rounded-2xl p-4 pl-5 flex items-center justify-between gap-4 transition-all
                                        before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 ${getAccent(task)}
                                        ${isDone ? 'opacity-60 border-gray-200' : overdue ? 'border-red-200 hover:shadow-md hover:shadow-red-500/5' : 'border-gray-200 hover:shadow-md'}`}>
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${isDone ? 'bg-emerald-50' : overdue ? 'bg-red-50' : 'bg-amber-50'}`}>
                                            {isDone
                                                ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                                : overdue
                                                    ? <AlertTriangle className="h-5 w-5 text-red-500" />
                                                    : <Clock className="h-5 w-5 text-amber-500" />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`text-sm font-bold ${isDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                                {task.description || 'Unnamed Task'}
                                            </p>
                                            <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                                                {task.patientName && (
                                                    <span className="text-[10px] text-gray-500 flex items-center gap-1 font-medium">
                                                        <User className="h-2.5 w-2.5" /> {task.patientName}
                                                    </span>
                                                )}
                                                {task.priority && (
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getPriorityStyle(task.priority)}`}>
                                                        {task.priority}
                                                    </span>
                                                )}
                                                {overdue && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black border bg-red-100 text-red-700 border-red-200 uppercase tracking-wide">
                                                        Overdue
                                                    </span>
                                                )}
                                                {task.scheduled_at && (
                                                    <span className={`text-[10px] flex items-center gap-1 font-medium ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
                                                        <Clock className="h-2.5 w-2.5" /> {new Date(task.scheduled_at).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                )}
                                                {/* Who owns this. Unclaimed work used to be invisible. */}
                                                {!isDone && task.isUnclaimed && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black border bg-violet-100 text-violet-700 border-violet-200 uppercase tracking-wide">
                                                        Unclaimed
                                                    </span>
                                                )}
                                                {!isDone && task.isMine && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-teal-50 text-teal-700 border-teal-200">
                                                        You
                                                    </span>
                                                )}
                                                {!isDone && !task.isMine && task.assignedToName && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-gray-100 text-gray-600 border-gray-200">
                                                        {task.assignedToName}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {!isDone && task.isUnclaimed && (
                                        <button onClick={() => handleClaim(task.id)}
                                            disabled={claiming === task.id}
                                            className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-xl hover:shadow-md transition-all disabled:opacity-50">
                                            {claiming === task.id
                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                : <User className="h-3.5 w-3.5" />}
                                            I'll take it
                                        </button>
                                    )}
                                    {!isDone && task.isMine && (
                                        <button onClick={() => handleRelease(task.id)}
                                            disabled={claiming === task.id}
                                            title="Put this back for anyone on the ward"
                                            className="shrink-0 px-3 py-2 border border-gray-200 text-gray-500 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50">
                                            Hand back
                                        </button>
                                    )}
                                    {!isDone && (
                                        <button onClick={() => handleComplete(task.id)}
                                            disabled={completing === task.id}
                                            className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl hover:shadow-md hover:shadow-teal-500/20 transition-all disabled:opacity-50">
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
