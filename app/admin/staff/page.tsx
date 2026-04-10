'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Users, UserPlus, Search, Filter, Shield, Stethoscope, Loader2,
    ChevronLeft, ChevronRight, Pencil, KeyRound, Power, X, Eye, EyeOff,
    FlaskConical, Pill, DollarSign, Bed, UserCheck, UserX,
    HeartPulse, ClipboardList, Briefcase
} from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import {
    getUsersList, getStaffStats, addUser, updateUser,
    resetUserPassword, toggleUserActive
} from '@/app/actions/admin-actions';

const ROLES = [
    { value: 'admin', label: 'Administrator', icon: Shield },
    { value: 'doctor', label: 'Doctor', icon: Stethoscope },
    { value: 'receptionist', label: 'Receptionist', icon: UserPlus },
    { value: 'lab_technician', label: 'Lab Technician', icon: FlaskConical },
    { value: 'pharmacist', label: 'Pharmacist', icon: Pill },
    { value: 'finance', label: 'Finance', icon: DollarSign },
    { value: 'ipd_manager', label: 'IPD Manager', icon: Bed },
    { value: 'nurse', label: 'Nurse', icon: HeartPulse },
    { value: 'opd_manager', label: 'OPD Manager', icon: ClipboardList },
    { value: 'hr', label: 'HR Manager', icon: Briefcase },
];

const SPECIALTIES = [
    'General Medicine', 'Cardiology', 'Orthopedics', 'Pediatrics',
    'Neurology', 'ENT', 'Dermatology', 'Pulmonology',
];

const roleLabelMap: Record<string, string> = {
    admin: 'Administrator', doctor: 'Doctor', receptionist: 'Receptionist',
    lab_technician: 'Lab Technician', pharmacist: 'Pharmacist',
    finance: 'Finance', ipd_manager: 'IPD Manager', nurse: 'Nurse',
    opd_manager: 'OPD Manager', hr: 'HR Manager',
};

const roleColorMap: Record<string, string> = {
    admin: 'bg-violet-50 text-violet-700 border border-violet-200',
    doctor: 'bg-teal-50 text-teal-700 border border-teal-200',
    receptionist: 'bg-blue-50 text-blue-700 border border-blue-200',
    lab_technician: 'bg-amber-50 text-amber-700 border border-amber-200',
    pharmacist: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    finance: 'bg-rose-50 text-rose-700 border border-rose-200',
    ipd_manager: 'bg-orange-50 text-orange-700 border border-orange-200',
    nurse: 'bg-cyan-50 text-cyan-700 border border-cyan-200',
    opd_manager: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    hr: 'bg-purple-50 text-purple-700 border border-purple-200',
};

export default function StaffManagement() {
    const [users, setUsers] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [activeFilter, setActiveFilter] = useState<'' | 'active' | 'inactive'>('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [total, setTotal] = useState(0);

    // Modals
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Form state
    const [form, setForm] = useState({
        username: '', password: '', name: '', role: 'doctor',
        specialty: '', email: '', phone: '',
    });
    const [resetPassword, setResetPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const is_active = activeFilter === 'active' ? true : activeFilter === 'inactive' ? false : undefined;
            const [usersRes, statsRes] = await Promise.all([
                getUsersList({ search, role: roleFilter, is_active, page, limit: 25 }),
                getStaffStats(),
            ]);
            if (usersRes.success && usersRes.data) {
                setUsers(usersRes.data.users);
                setTotalPages(usersRes.data.totalPages);
                setTotal(usersRes.data.total);
            }
            if (statsRes.success) setStats(statsRes.data);
        } catch (err) {
            console.error('Staff load error:', err);
        }
        setLoading(false);
    }, [search, roleFilter, activeFilter, page]);

    useEffect(() => { loadData(); }, [loadData]);

    // Debounced search
    const [searchInput, setSearchInput] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const resetForm = () => {
        setForm({ username: '', password: '', name: '', role: 'doctor', specialty: '', email: '', phone: '' });
        setError('');
        setShowPassword(false);
    };

    const handleAdd = async () => {
        setError('');
        if (!form.username || !form.password || !form.name || !form.role) {
            setError('Username, password, name, and role are required');
            return;
        }
        if (form.password.length < 8) {
            setError('Password must be at least 8 characters long');
            return;
        }
        setSubmitting(true);
        const res = await addUser(form);
        setSubmitting(false);
        if (res.success) {
            setShowAddModal(false);
            resetForm();
            loadData();
        } else {
            setError(res.error || 'Failed to add user');
        }
    };

    const handleEdit = async () => {
        if (!editingUser) return;
        setError('');
        setSubmitting(true);
        const res = await updateUser(editingUser.id, {
            name: form.name,
            role: form.role,
            specialty: form.specialty,
            email: form.email,
            phone: form.phone,
        });
        setSubmitting(false);
        if (res.success) {
            setShowEditModal(false);
            setEditingUser(null);
            resetForm();
            loadData();
        } else {
            setError(res.error || 'Failed to update user');
        }
    };

    const handleResetPassword = async () => {
        if (!editingUser) return;
        setError('');
        if (!resetPassword || resetPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        setSubmitting(true);
        const res = await resetUserPassword(editingUser.id, resetPassword);
        setSubmitting(false);
        if (res.success) {
            setShowResetModal(false);
            setEditingUser(null);
            setResetPassword('');
        } else {
            setError(res.error || 'Failed to reset password');
        }
    };

    const handleToggle = async (userId: string) => {
        await toggleUserActive(userId);
        loadData();
    };

    const openEdit = (user: any) => {
        setEditingUser(user);
        setForm({
            username: user.username, password: '', name: user.name || '',
            role: user.role, specialty: user.specialty || '',
            email: user.email || '', phone: user.phone || '',
        });
        setError('');
        setShowEditModal(true);
    };

    const openResetPassword = (user: any) => {
        setEditingUser(user);
        setResetPassword('');
        setError('');
        setShowResetModal(true);
    };

    const headerActions = (
        <button
            onClick={() => { resetForm(); setShowAddModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all"
        >
            <UserPlus className="h-3.5 w-3.5" /> Add Staff
        </button>
    );

    return (
        <AdminPage
            pageTitle="Staff Management"
            pageIcon={<Users className="h-5 w-5" />}
            headerActions={headerActions}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="space-y-6">
                {/* KPI ROW */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Total Staff</span>
                            <div className="p-1.5 bg-teal-50 rounded-lg"><Users className="h-3.5 w-3.5 text-teal-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats?.total || 0}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Doctors</span>
                            <div className="p-1.5 bg-teal-50 rounded-lg"><Stethoscope className="h-3.5 w-3.5 text-teal-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats?.doctors || 0}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Active</span>
                            <div className="p-1.5 bg-emerald-50 rounded-lg"><UserCheck className="h-3.5 w-3.5 text-emerald-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats?.active || 0}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Inactive</span>
                            <div className="p-1.5 bg-rose-50 rounded-lg"><UserX className="h-3.5 w-3.5 text-rose-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats?.inactive || 0}</p>
                    </div>
                </div>

                {/* SEARCH & FILTERS */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            placeholder="Search by name, username, or email..."
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400" />
                        <select
                            value={roleFilter}
                            onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
                            className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-teal-500"
                        >
                            <option value="">All Roles</option>
                            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        <select
                            value={activeFilter}
                            onChange={e => { setActiveFilter(e.target.value as any); setPage(1); }}
                            className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-teal-500"
                        >
                            <option value="">All Status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                </div>

                {/* STAFF TABLE */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    {['Name', 'Username', 'Role', 'Specialty', 'Contact', 'Status', 'Joined', 'Actions'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading && users.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="text-center py-16">
                                            <Loader2 className="h-6 w-6 animate-spin text-teal-500 mx-auto" />
                                            <p className="text-gray-400 text-xs mt-2">Loading staff...</p>
                                        </td>
                                    </tr>
                                ) : users.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="text-center py-16">
                                            <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                                            <p className="text-gray-400 text-sm font-medium">No staff found</p>
                                            <p className="text-gray-300 text-xs mt-1">Try adjusting your search or filters</p>
                                        </td>
                                    </tr>
                                ) : users.map((user: any) => (
                                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${user.is_active ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-400'}`}>
                                                    {(user.name || user.username || '?').charAt(0).toUpperCase()}
                                                </div>
                                                <span className={`font-medium ${user.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                                                    {user.name || '-'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs font-mono text-gray-500">{user.username}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${roleColorMap[user.role] || 'bg-gray-100 text-gray-500'}`}>
                                                {roleLabelMap[user.role] || user.role}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-xs">
                                            {user.specialty || '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-xs text-gray-500">
                                                {user.email && <p>{user.email}</p>}
                                                {user.phone && <p>{user.phone}</p>}
                                                {!user.email && !user.phone && '-'}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full ${user.is_active
                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                : 'bg-gray-100 text-gray-400 border border-gray-200'
                                                }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                                                {user.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-400 text-xs">
                                            {new Date(user.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => openEdit(user)}
                                                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-teal-600 transition-colors"
                                                    title="Edit"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => openResetPassword(user)}
                                                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-amber-600 transition-colors"
                                                    title="Reset Password"
                                                >
                                                    <KeyRound className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleToggle(user.id)}
                                                    className={`p-1.5 hover:bg-gray-100 rounded-lg transition-colors ${user.is_active ? 'text-gray-400 hover:text-rose-600' : 'text-gray-400 hover:text-emerald-600'}`}
                                                    title={user.is_active ? 'Deactivate' : 'Activate'}
                                                >
                                                    <Power className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* PAGINATION */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                            <span className="text-xs text-gray-400">
                                Showing {((page - 1) * 25) + 1} - {Math.min(page * 25, total)} of {total}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"
                                >
                                    <ChevronLeft className="h-4 w-4 text-gray-400" />
                                </button>
                                <span className="text-xs font-medium text-gray-500">Page {page} of {totalPages}</span>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"
                                >
                                    <ChevronRight className="h-4 w-4 text-gray-400" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ADD STAFF MODAL */}
            {showAddModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowAddModal(false); resetForm(); }} />
                    <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
                            <h2 className="text-base font-bold text-gray-900">Add New Staff</h2>
                            <button onClick={() => { setShowAddModal(false); resetForm(); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {error && (
                                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">{error}</div>
                            )}
                            <div>
                                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Full Name *</label>
                                <input
                                    type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    placeholder="Dr. John Smith"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Username *</label>
                                    <input
                                        type="text" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                        placeholder="doc6"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Password *</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'} value={form.password}
                                            onChange={e => setForm({ ...form, password: e.target.value })}
                                            className="w-full px-3 py-2.5 pr-10 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                            placeholder="Min 8 chars, 1 uppercase, 1 num, 1 special"
                                        />
                                        <button type="button" onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Role *</label>
                                    <select
                                        value={form.role} onChange={e => setForm({ ...form, role: e.target.value, specialty: '' })}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-teal-500"
                                    >
                                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                    </select>
                                </div>
                                {form.role === 'doctor' && (
                                    <div>
                                        <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Specialty</label>
                                        <select
                                            value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })}
                                            className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-teal-500"
                                        >
                                            <option value="">Select Specialty</option>
                                            {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email</label>
                                    <input
                                        type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                        placeholder="john@hospital.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Phone</label>
                                    <input
                                        type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                        placeholder="+91 98765 43210"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => { setShowAddModal(false); resetForm(); }}
                                    className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all">
                                    Cancel
                                </button>
                                <button onClick={handleAdd} disabled={submitting}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 transition-all">
                                    {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                                    Add Staff
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* EDIT STAFF MODAL */}
            {showEditModal && editingUser && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowEditModal(false); setEditingUser(null); resetForm(); }} />
                    <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
                            <h2 className="text-base font-bold text-gray-900">Edit Staff — {editingUser.name || editingUser.username}</h2>
                            <button onClick={() => { setShowEditModal(false); setEditingUser(null); resetForm(); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {error && (
                                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">{error}</div>
                            )}
                            <div>
                                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Full Name</label>
                                <input
                                    type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Username</label>
                                <input type="text" value={editingUser.username} disabled
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-400 cursor-not-allowed"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Role</label>
                                    <select
                                        value={form.role} onChange={e => setForm({ ...form, role: e.target.value, specialty: '' })}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-teal-500"
                                    >
                                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                    </select>
                                </div>
                                {form.role === 'doctor' && (
                                    <div>
                                        <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Specialty</label>
                                        <select
                                            value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })}
                                            className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-teal-500"
                                        >
                                            <option value="">Select Specialty</option>
                                            {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email</label>
                                    <input
                                        type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Phone</label>
                                    <input
                                        type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => { setShowEditModal(false); setEditingUser(null); resetForm(); }}
                                    className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all">
                                    Cancel
                                </button>
                                <button onClick={handleEdit} disabled={submitting}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 transition-all">
                                    {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* RESET PASSWORD MODAL */}
            {showResetModal && editingUser && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowResetModal(false); setEditingUser(null); }} />
                    <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <h2 className="text-base font-bold text-gray-900">Reset Password</h2>
                            <button onClick={() => { setShowResetModal(false); setEditingUser(null); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {error && (
                                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">{error}</div>
                            )}
                            <p className="text-sm text-gray-600">
                                Reset password for <span className="font-bold text-gray-900">{editingUser.name || editingUser.username}</span>
                            </p>
                            <div>
                                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">New Password *</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={resetPassword}
                                        onChange={e => setResetPassword(e.target.value)}
                                        className="w-full px-3 py-2.5 pr-10 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                        placeholder="Min 8 chars, 1 uppercase, 1 num, 1 special"
                                    />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => { setShowResetModal(false); setEditingUser(null); }}
                                    className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all">
                                    Cancel
                                </button>
                                <button onClick={handleResetPassword} disabled={submitting}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 transition-all">
                                    {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                                    Reset Password
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AdminPage>
    );
}
