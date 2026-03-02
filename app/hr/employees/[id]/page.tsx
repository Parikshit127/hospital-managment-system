'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    User, Loader2, AlertCircle, ArrowLeft, Save, X,
    Pencil, Calendar, Clock, FileText, Shield, ShieldOff,
    CheckCircle, XCircle, MinusCircle, Briefcase, Mail, Phone
} from 'lucide-react';
import { getEmployeeDetail, updateEmployee, getLeaveBalance } from '@/app/actions/hr-actions';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface LeaveBalance {
    leaveType: string;
    total: number;
    used: number;
    remaining: number;
}

export default function EmployeeDetailPage() {
    const params = useParams();
    const employeeId = Number(params.id);

    const [employee, setEmployee] = useState<any>(null);
    const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'leaves' | 'shifts'>('overview');
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState({
        name: '',
        designation: '',
        salaryBasic: 0,
        phone: '',
        email: '',
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const [empRes, balRes] = await Promise.all([
                getEmployeeDetail(employeeId),
                getLeaveBalance(employeeId),
            ]);
            if (empRes.success && empRes.data) {
                setEmployee(empRes.data);
                setEditForm({
                    name: empRes.data.name || '',
                    designation: empRes.data.designation || '',
                    salaryBasic: empRes.data.salary_basic || 0,
                    phone: empRes.data.phone || '',
                    email: empRes.data.email || '',
                });
            } else {
                setError(true);
            }
            if (balRes.success) {
                setLeaveBalances(balRes.data as LeaveBalance[]);
            }
        } catch {
            setError(true);
        }
        setLoading(false);
    }, [employeeId]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await updateEmployee(employeeId, {
                name: editForm.name,
                designation: editForm.designation,
                salaryBasic: editForm.salaryBasic,
                phone: editForm.phone || undefined,
                email: editForm.email || undefined,
            });
            if (res.success) {
                setEditing(false);
                loadData();
            }
        } catch {
            // error handled silently
        }
        setSaving(false);
    };

    const handleToggleActive = async () => {
        if (!employee) return;
        setSaving(true);
        try {
            const res = await updateEmployee(employeeId, { isActive: !employee.is_active });
            if (res.success) loadData();
        } catch {
            // error handled silently
        }
        setSaving(false);
    };

    const tabs = [
        { key: 'overview' as const, label: 'Overview', icon: User },
        { key: 'attendance' as const, label: 'Attendance History', icon: Clock },
        { key: 'leaves' as const, label: 'Leave History', icon: FileText },
        { key: 'shifts' as const, label: 'Shift History', icon: Calendar },
    ];

    const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : '-';
    const formatTime = (d: string | null) => d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';

    if (loading) {
        return (
            <AppShell pageTitle="Employee Detail" pageIcon={<User className="h-5 w-5" />}>
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
                    <span className="ml-3 text-gray-500 font-medium">Loading employee details...</span>
                </div>
            </AppShell>
        );
    }

    if (error || !employee) {
        return (
            <AppShell pageTitle="Employee Detail" pageIcon={<User className="h-5 w-5" />}>
                <div className="flex flex-col items-center justify-center py-20">
                    <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
                    <p className="text-gray-600 font-bold text-lg">Employee not found</p>
                    <Link href="/hr/employees" className="mt-4 text-sm text-teal-600 font-bold hover:underline">
                        Back to Employees
                    </Link>
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell
            pageTitle={employee.name}
            pageIcon={<User className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
            headerActions={
                <Link href="/hr/employees" className="flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-700">
                    <ArrowLeft className="h-4 w-4" /> Back
                </Link>
            }
        >
            {/* Header Card */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white text-2xl font-black">
                            {employee.name?.charAt(0)?.toUpperCase() || 'E'}
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900">{employee.name}</h2>
                            <p className="text-sm text-gray-500 font-medium">{employee.employee_code} &middot; {employee.designation}</p>
                            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                employee.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                                {employee.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {!editing && (
                            <button
                                onClick={() => setEditing(true)}
                                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                            >
                                <Pencil className="h-4 w-4" /> Edit
                            </button>
                        )}
                        <button
                            onClick={handleToggleActive}
                            disabled={saving}
                            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors ${
                                employee.is_active
                                    ? 'border border-red-200 text-red-600 hover:bg-red-50'
                                    : 'border border-green-200 text-green-600 hover:bg-green-50'
                            }`}
                        >
                            {employee.is_active ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                            {employee.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Leave Balance Card */}
            {leaveBalances.length > 0 && (
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 mb-6">
                    <h3 className="text-sm font-black text-gray-900 mb-4">Leave Balance</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                        {leaveBalances.map((lb) => (
                            <div key={lb.leaveType} className="bg-gray-50 rounded-xl p-3">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{lb.leaveType}</p>
                                <p className="text-2xl font-black text-gray-900">{lb.remaining}</p>
                                <p className="text-[10px] text-gray-500 font-medium mt-1">{lb.used} used of {lb.total}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${
                            activeTab === tab.key
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <tab.icon className="h-4 w-4" />
                        <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                {activeTab === 'overview' && (
                    <div className="p-6">
                        {editing ? (
                            <div className="space-y-4 max-w-lg">
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Name</label>
                                    <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Designation</label>
                                    <input
                                        type="text"
                                        value={editForm.designation}
                                        onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Basic Salary</label>
                                    <input
                                        type="number"
                                        value={editForm.salaryBasic}
                                        onChange={(e) => setEditForm({ ...editForm, salaryBasic: Number(e.target.value) })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Phone</label>
                                    <input
                                        type="text"
                                        value={editForm.phone}
                                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={editForm.email}
                                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                                    />
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl px-5 py-2.5 text-sm flex items-center gap-2 hover:shadow-lg transition-shadow disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        Save Changes
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditing(false);
                                            setEditForm({
                                                name: employee.name || '',
                                                designation: employee.designation || '',
                                                salaryBasic: employee.salary_basic || 0,
                                                phone: employee.phone || '',
                                                email: employee.email || '',
                                            });
                                        }}
                                        className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                                    >
                                        <X className="h-4 w-4" /> Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Employee Code</p>
                                        <p className="text-sm font-bold text-gray-900 mt-0.5">{employee.employee_code}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Designation</p>
                                        <p className="text-sm font-bold text-gray-900 mt-0.5 flex items-center gap-2"><Briefcase className="h-4 w-4 text-gray-400" />{employee.designation}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Date of Joining</p>
                                        <p className="text-sm font-bold text-gray-900 mt-0.5 flex items-center gap-2"><Calendar className="h-4 w-4 text-gray-400" />{formatDate(employee.date_of_joining)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Basic Salary</p>
                                        <p className="text-sm font-bold text-gray-900 mt-0.5">&#8377; {employee.salary_basic?.toLocaleString() || '0'}</p>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Email</p>
                                        <p className="text-sm font-bold text-gray-900 mt-0.5 flex items-center gap-2"><Mail className="h-4 w-4 text-gray-400" />{employee.email || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Phone</p>
                                        <p className="text-sm font-bold text-gray-900 mt-0.5 flex items-center gap-2"><Phone className="h-4 w-4 text-gray-400" />{employee.phone || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</p>
                                        <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            employee.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                        }`}>
                                            {employee.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'attendance' && (
                    <div className="overflow-x-auto">
                        {employee.attendances && employee.attendances.length > 0 ? (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50/50">
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Date</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Check In</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Check Out</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Hours</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employee.attendances.map((att: any) => (
                                        <tr key={att.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 font-bold text-gray-900">{formatDate(att.date)}</td>
                                            <td className="px-4 py-3 text-gray-600">{formatTime(att.check_in)}</td>
                                            <td className="px-4 py-3 text-gray-600">{formatTime(att.check_out)}</td>
                                            <td className="px-4 py-3 text-gray-600">{att.total_hours ? `${att.total_hours}h` : '-'}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    att.status === 'Present' ? 'bg-green-100 text-green-700' :
                                                    att.status === 'Absent' ? 'bg-red-100 text-red-700' :
                                                    att.status === 'Half-Day' ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {att.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16">
                                <Clock className="h-10 w-10 text-gray-300 mb-3" />
                                <p className="text-gray-500 font-medium text-sm">No attendance records found</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'leaves' && (
                    <div className="overflow-x-auto">
                        {employee.leave_requests && employee.leave_requests.length > 0 ? (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50/50">
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Type</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">From</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">To</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Reason</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employee.leave_requests.map((lr: any) => (
                                        <tr key={lr.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 font-bold text-gray-900">{lr.leave_type?.name || '-'}</td>
                                            <td className="px-4 py-3 text-gray-600">{formatDate(lr.from_date)}</td>
                                            <td className="px-4 py-3 text-gray-600">{formatDate(lr.to_date)}</td>
                                            <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{lr.reason || '-'}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    lr.status === 'Approved' ? 'bg-green-100 text-green-700' :
                                                    lr.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                                                    'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                    {lr.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16">
                                <FileText className="h-10 w-10 text-gray-300 mb-3" />
                                <p className="text-gray-500 font-medium text-sm">No leave requests found</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'shifts' && (
                    <div className="overflow-x-auto">
                        {employee.shift_assignments && employee.shift_assignments.length > 0 ? (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50/50">
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Date</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Shift</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Start</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">End</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employee.shift_assignments.map((sa: any) => (
                                        <tr key={sa.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 font-bold text-gray-900">{formatDate(sa.date)}</td>
                                            <td className="px-4 py-3 text-gray-700 font-semibold">{sa.shift_pattern?.name || '-'}</td>
                                            <td className="px-4 py-3 text-gray-600">{sa.shift_pattern?.start_time || '-'}</td>
                                            <td className="px-4 py-3 text-gray-600">{sa.shift_pattern?.end_time || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16">
                                <Calendar className="h-10 w-10 text-gray-300 mb-3" />
                                <p className="text-gray-500 font-medium text-sm">No shift assignments found</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
