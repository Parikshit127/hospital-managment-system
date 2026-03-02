'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    Timer, Loader2, Plus, X, Calendar, Clock, Users
} from 'lucide-react';
import {
    getShiftPatterns, createShiftPattern,
    getShiftAssignments, createShiftRoster, getEmployeeList
} from '@/app/actions/hr-actions';

export default function HRShiftsPage() {
    const [patterns, setPatterns] = useState<any[]>([]);
    const [assignments, setAssignments] = useState<any[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [showAddPattern, setShowAddPattern] = useState(false);
    const [showAssign, setShowAssign] = useState(false);
    const [saving, setSaving] = useState(false);
    const [patternForm, setPatternForm] = useState({ name: '', startTime: '09:00', endTime: '17:00' });
    const [assignForm, setAssignForm] = useState({ employeeId: '', shiftPatternId: '', startDate: '', endDate: '' });

    const loadData = useCallback(async () => {
        setRefreshing(true);
        try {
            const [pRes, aRes] = await Promise.all([
                getShiftPatterns(),
                getShiftAssignments(date),
            ]);
            if (pRes.success) setPatterns(pRes.data || []);
            if (aRes.success) setAssignments(aRes.data || []);
        } catch (e) { console.error(e); }
        finally { setRefreshing(false); setLoading(false); }
    }, [date]);

    useEffect(() => { setLoading(true); loadData(); }, [loadData]);

    const loadEmployees = async () => {
        const res = await getEmployeeList({ limit: 500, isActive: true });
        if (res.success) setEmployees(res.data || []);
    };

    const handleAddPattern = async () => {
        if (!patternForm.name.trim()) return;
        setSaving(true);
        try {
            await createShiftPattern(patternForm);
            setShowAddPattern(false);
            setPatternForm({ name: '', startTime: '09:00', endTime: '17:00' });
            await loadData();
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    };

    const handleAssign = async () => {
        if (!assignForm.employeeId || !assignForm.shiftPatternId || !assignForm.startDate || !assignForm.endDate) return;
        setSaving(true);
        try {
            const res = await createShiftRoster({
                employeeId: parseInt(assignForm.employeeId),
                shiftPatternId: parseInt(assignForm.shiftPatternId),
                startDate: assignForm.startDate,
                endDate: assignForm.endDate,
            });
            if (res.success) {
                setShowAssign(false);
                setAssignForm({ employeeId: '', shiftPatternId: '', startDate: '', endDate: '' });
                await loadData();
            }
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    };

    const openAssignForm = async () => {
        setShowAssign(true);
        if (employees.length === 0) await loadEmployees();
    };

    return (
        <AppShell pageTitle="Shift Management" pageIcon={<Timer className="h-5 w-5" />}
            onRefresh={loadData} refreshing={refreshing}
            headerActions={
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowAddPattern(true)}
                        className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-colors">
                        <Plus className="h-3.5 w-3.5" /> Add Shift
                    </button>
                    <button onClick={openAssignForm}
                        className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl hover:shadow-md transition-all">
                        <Calendar className="h-3.5 w-3.5" /> Assign Roster
                    </button>
                </div>
            }>
            <div className="space-y-6">
                {/* Add Pattern Form */}
                {showAddPattern && (
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-black text-gray-900">New Shift Pattern</h3>
                            <button onClick={() => setShowAddPattern(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                                <X className="h-4 w-4 text-gray-400" />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Shift Name *</label>
                                <input type="text" placeholder="e.g. Morning Shift"
                                    value={patternForm.name} onChange={e => setPatternForm({ ...patternForm, name: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Start Time</label>
                                <input type="time" value={patternForm.startTime}
                                    onChange={e => setPatternForm({ ...patternForm, startTime: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">End Time</label>
                                <input type="time" value={patternForm.endTime}
                                    onChange={e => setPatternForm({ ...patternForm, endTime: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                            </div>
                        </div>
                        <button onClick={handleAddPattern} disabled={saving}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            Create Pattern
                        </button>
                    </div>
                )}

                {/* Assign Roster Form */}
                {showAssign && (
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-black text-gray-900">Assign Shift Roster</h3>
                            <button onClick={() => setShowAssign(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                                <X className="h-4 w-4 text-gray-400" />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Employee *</label>
                                <select value={assignForm.employeeId} onChange={e => setAssignForm({ ...assignForm, employeeId: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white">
                                    <option value="">Select Employee</option>
                                    {employees.map((emp: any) => (
                                        <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_code})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Shift Pattern *</label>
                                <select value={assignForm.shiftPatternId} onChange={e => setAssignForm({ ...assignForm, shiftPatternId: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white">
                                    <option value="">Select Shift</option>
                                    {patterns.map((p: any) => (
                                        <option key={p.id} value={p.id}>{p.name} ({p.start_time} - {p.end_time})</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Start Date *</label>
                                <input type="date" value={assignForm.startDate}
                                    onChange={e => setAssignForm({ ...assignForm, startDate: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">End Date *</label>
                                <input type="date" value={assignForm.endDate}
                                    onChange={e => setAssignForm({ ...assignForm, endDate: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                            </div>
                        </div>
                        <button onClick={handleAssign} disabled={saving}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                            Assign Roster
                        </button>
                    </div>
                )}

                {/* Shift Patterns */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100">
                        <h3 className="text-sm font-black text-gray-900">Shift Patterns</h3>
                    </div>
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                        </div>
                    ) : patterns.length === 0 ? (
                        <div className="p-12 text-center text-gray-400">
                            <Timer className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                            <p className="font-medium">No shift patterns defined</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                            {patterns.map((p: any) => (
                                <div key={p.id} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                    <p className="text-sm font-black text-gray-900">{p.name}</p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <Clock className="h-3.5 w-3.5 text-teal-500" />
                                        <span className="text-xs text-gray-600 font-medium">{p.start_time} - {p.end_time}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Today's Assignments */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="text-sm font-black text-gray-900">Shift Roster</h3>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-teal-500" />
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/50">
                                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Employee</th>
                                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Designation</th>
                                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Shift</th>
                                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Timing</th>
                                </tr>
                            </thead>
                            <tbody>
                                {assignments.length === 0 ? (
                                    <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                                        <Users className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                                        <p className="font-medium">No assignments for this date</p>
                                    </td></tr>
                                ) : assignments.map((a: any) => (
                                    <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <p className="font-bold text-gray-900">{a.employee?.name || 'N/A'}</p>
                                            <p className="text-[10px] text-gray-400">{a.employee?.employee_code}</p>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">{a.employee?.designation || '-'}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-0.5 bg-teal-50 text-teal-700 text-[10px] font-bold rounded-full border border-teal-200">
                                                {a.shift_pattern?.name || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 text-xs font-medium">
                                            {a.shift_pattern?.start_time || '-'} - {a.shift_pattern?.end_time || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
