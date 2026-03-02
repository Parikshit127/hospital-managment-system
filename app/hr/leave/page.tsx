'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    CalendarDays, Loader2, CheckCircle2, XCircle, Filter,
    Plus, X, Clock
} from 'lucide-react';
import {
    getLeaveRequests, approveLeave, rejectLeave,
    applyLeave, getLeaveTypes, getEmployeeList
} from '@/app/actions/hr-actions';

export default function HRLeavePage() {
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [showApply, setShowApply] = useState(false);
    const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [session, setSession] = useState<any>(null);
    const [applyForm, setApplyForm] = useState({
        employeeId: '', leaveTypeId: '', fromDate: '', toDate: '', reason: ''
    });

    useEffect(() => {
        fetch('/api/session').then(r => r.json()).then(d => setSession(d)).catch(() => {});
    }, []);

    const loadData = useCallback(async () => {
        setRefreshing(true);
        try {
            const res = await getLeaveRequests(filter);
            if (res.success) setRequests(res.data || []);
        } catch (e) { console.error(e); }
        finally { setRefreshing(false); setLoading(false); }
    }, [filter]);

    useEffect(() => { setLoading(true); loadData(); }, [loadData]);

    const openApplyForm = async () => {
        setShowApply(true);
        const [ltRes, empRes] = await Promise.all([getLeaveTypes(), getEmployeeList({ limit: 500 })]);
        if (ltRes.success) setLeaveTypes(ltRes.data || []);
        if (empRes.success) setEmployees(empRes.data || []);
    };

    const handleApprove = async (id: number) => {
        setActionLoading(id);
        try {
            await approveLeave(id, session?.id || 'admin');
            await loadData();
        } catch (e) { console.error(e); }
        finally { setActionLoading(null); }
    };

    const handleReject = async (id: number) => {
        setActionLoading(id);
        try {
            await rejectLeave(id, session?.id || 'admin');
            await loadData();
        } catch (e) { console.error(e); }
        finally { setActionLoading(null); }
    };

    const handleApplySubmit = async () => {
        if (!applyForm.employeeId || !applyForm.leaveTypeId || !applyForm.fromDate || !applyForm.toDate) return;
        setSubmitting(true);
        try {
            const res = await applyLeave({
                employeeId: parseInt(applyForm.employeeId),
                leaveTypeId: parseInt(applyForm.leaveTypeId),
                fromDate: applyForm.fromDate,
                toDate: applyForm.toDate,
                reason: applyForm.reason || undefined,
            });
            if (res.success) {
                setShowApply(false);
                setApplyForm({ employeeId: '', leaveTypeId: '', fromDate: '', toDate: '', reason: '' });
                await loadData();
            }
        } catch (e) { console.error(e); }
        finally { setSubmitting(false); }
    };

    const getDays = (from: string, to: string) => {
        if (!from || !to) return 0;
        return Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    };

    return (
        <AppShell pageTitle="Leave Management" pageIcon={<CalendarDays className="h-5 w-5" />}
            onRefresh={loadData} refreshing={refreshing}
            headerActions={
                <button onClick={openApplyForm}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl hover:shadow-md transition-all">
                    <Plus className="h-3.5 w-3.5" /> Apply Leave
                </button>
            }>
            <div className="space-y-4">
                {/* Apply Leave Modal */}
                {showApply && (
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-black text-gray-900">Apply Leave</h3>
                            <button onClick={() => setShowApply(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                                <X className="h-4 w-4 text-gray-400" />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Employee *</label>
                                <select value={applyForm.employeeId} onChange={e => setApplyForm({ ...applyForm, employeeId: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white">
                                    <option value="">Select Employee</option>
                                    {employees.map((emp: any) => (
                                        <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_code})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Leave Type *</label>
                                <select value={applyForm.leaveTypeId} onChange={e => setApplyForm({ ...applyForm, leaveTypeId: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white">
                                    <option value="">Select Type</option>
                                    {leaveTypes.map((lt: any) => (
                                        <option key={lt.id} value={lt.id}>{lt.name} ({lt.days_per_year} days/yr)</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">From Date *</label>
                                <input type="date" value={applyForm.fromDate}
                                    onChange={e => setApplyForm({ ...applyForm, fromDate: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">To Date *</label>
                                <input type="date" value={applyForm.toDate}
                                    onChange={e => setApplyForm({ ...applyForm, toDate: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                            </div>
                        </div>
                        {applyForm.fromDate && applyForm.toDate && (
                            <p className="text-xs text-teal-600 font-bold mb-4">
                                Duration: {getDays(applyForm.fromDate, applyForm.toDate)} day(s)
                            </p>
                        )}
                        <div className="mb-4">
                            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Reason</label>
                            <textarea rows={2} value={applyForm.reason}
                                onChange={e => setApplyForm({ ...applyForm, reason: e.target.value })}
                                placeholder="Optional reason"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none" />
                        </div>
                        <button onClick={handleApplySubmit} disabled={submitting}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50">
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Submit
                        </button>
                    </div>
                )}

                {/* Filter Tabs */}
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-gray-400" />
                    {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filter === f
                                ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                            }`}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Leave Requests Table */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/50">
                                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Employee</th>
                                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Leave Type</th>
                                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">From</th>
                                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">To</th>
                                    <th className="text-center px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Days</th>
                                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Reason</th>
                                    <th className="text-center px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={8} className="px-4 py-12 text-center">
                                        <Loader2 className="h-6 w-6 animate-spin text-teal-500 mx-auto" />
                                    </td></tr>
                                ) : requests.length === 0 ? (
                                    <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                                        <CalendarDays className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                                        <p className="font-medium">No leave requests found</p>
                                    </td></tr>
                                ) : requests.map((req: any) => {
                                    const days = getDays(req.from_date, req.to_date);
                                    const isPending = req.status === 'Pending';
                                    return (
                                        <tr key={req.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="font-bold text-gray-900">{req.employee?.name || 'N/A'}</p>
                                                <p className="text-[10px] text-gray-400">{req.employee?.employee_code}</p>
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 font-medium">{req.leave_type?.name || 'N/A'}</td>
                                            <td className="px-4 py-3 text-gray-600">{new Date(req.from_date).toLocaleDateString()}</td>
                                            <td className="px-4 py-3 text-gray-600">{new Date(req.to_date).toLocaleDateString()}</td>
                                            <td className="px-4 py-3 text-center font-black text-gray-900">{days}</td>
                                            <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{req.reason || '-'}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    req.status === 'Approved' ? 'bg-green-100 text-green-700' :
                                                    req.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                                                    'bg-yellow-100 text-yellow-700'
                                                }`}>{req.status}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {isPending ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        {actionLoading === req.id ? (
                                                            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                                                        ) : (
                                                            <>
                                                                <button onClick={() => handleApprove(req.id)}
                                                                    className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1">
                                                                    <CheckCircle2 className="h-3 w-3" /> Approve
                                                                </button>
                                                                <button onClick={() => handleReject(req.id)}
                                                                    className="px-3 py-1.5 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-200 hover:bg-red-100 transition-colors flex items-center gap-1">
                                                                    <XCircle className="h-3 w-3" /> Reject
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-gray-400">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
