'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import {
    Users, UserPlus, Search, Filter, Shield, Stethoscope, Loader2,
    ChevronLeft, ChevronRight, Pencil, KeyRound, Power, X, Eye, EyeOff,
    FlaskConical, Pill, DollarSign, Bed, UserCheck, UserX,
    HeartPulse, ClipboardList, Briefcase
} from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import {
    getUsersList, getStaffStats, addUser, updateUser,
    resetUserPassword, toggleUserActive, getWardsForDropdown,
} from '@/app/actions/admin-actions';

const sanitizeName = (v: string) => v.replace(/[^a-zA-Z\s.'-]/g, '');
const sanitizePhone = (v: string) => v.replace(/\D/g, '').slice(0, 10);
const sanitizeUsername = (v: string) => v.toLowerCase().replace(/[^a-z0-9._-]/g, '');

const ROLES = [
    { value: 'receptionist', label: 'Receptionist', icon: UserPlus },
    { value: 'nurse', label: 'Nurse', icon: HeartPulse },
    { value: 'lab_technician', label: 'Lab Technician', icon: FlaskConical },
    { value: 'pharmacist', label: 'Pharmacist', icon: Pill },
    { value: 'finance', label: 'Finance', icon: DollarSign },
    { value: 'ipd_manager', label: 'IPD Manager', icon: Bed },
    { value: 'opd_manager', label: 'OPD Manager', icon: ClipboardList },
    { value: 'hr', label: 'HR Manager', icon: Briefcase },
    { value: 'coordinator', label: 'Coordinator', icon: Users },
    { value: 'admin', label: 'Administrator', icon: Shield },
    { value: 'doctor', label: 'Doctor', icon: Stethoscope },
];

const ALL_ROLES_FILTER = [{ value: '', label: 'All Roles' }, ...ROLES];

const roleLabelMap: Record<string, string> = Object.fromEntries(ROLES.map(r => [r.value, r.label]));

const roleColorMap: Record<string, string> = {
    admin: 'bg-violet-50 text-violet-700 border border-violet-200',
    doctor: 'bg-orange-50 text-orange-700 border border-orange-200',
    receptionist: 'bg-blue-50 text-blue-700 border border-blue-200',
    lab_technician: 'bg-amber-50 text-amber-700 border border-amber-200',
    pharmacist: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    finance: 'bg-rose-50 text-rose-700 border border-rose-200',
    ipd_manager: 'bg-orange-50 text-orange-700 border border-orange-200',
    nurse: 'bg-cyan-50 text-cyan-700 border border-cyan-200',
    opd_manager: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    hr: 'bg-purple-50 text-purple-700 border border-purple-200',
    coordinator: 'bg-sky-50 text-sky-700 border border-sky-200',
};

const inputCls = 'w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500';
const selectCls = 'w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-orange-500';

function SectionLabel({ label, badge }: { label: string; badge: 'mandatory' | 'preferred' | 'optional' }) {
    const colors = { mandatory: 'bg-red-50 text-red-600 border-red-200', preferred: 'bg-amber-50 text-amber-600 border-amber-200', optional: 'bg-gray-100 text-gray-500 border-gray-200' };
    return (
        <div className="col-span-2 flex items-center gap-2 pt-3 pb-1 border-b border-gray-100">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{label}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors[badge]}`}>{badge}</span>
        </div>
    );
}

function FL({ label, badge }: { label: string; badge: 'mandatory' | 'preferred' | 'optional' }) {
    const dot = { mandatory: 'bg-red-400', preferred: 'bg-amber-400', optional: 'bg-gray-300' };
    return (
        <label className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot[badge]}`} />
            {label}{badge === 'mandatory' && <span className="text-red-500 normal-case font-normal ml-0.5">*</span>}
        </label>
    );
}

const EMPTY_FORM = {
    username: '', password: '', name: '', role: 'receptionist',
    phone: '', email: '', specialty: '',
    department: '', employee_code: '', designation: '',
    date_of_joining: '', assigned_ward_id: '',
};

export default function StaffManagement() {
    const [users, setUsers] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [wards, setWards] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [activeFilter, setActiveFilter] = useState<'' | 'active' | 'inactive'>('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [total, setTotal] = useState(0);

    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState(EMPTY_FORM);
    const [resetPassword, setResetPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const is_active = activeFilter === 'active' ? true : activeFilter === 'inactive' ? false : undefined;
            const [usersRes, statsRes, wardsRes] = await Promise.all([
                getUsersList({ search, role: roleFilter, is_active, page, limit: 25 }),
                getStaffStats(),
                getWardsForDropdown(),
            ]);
            if (usersRes.success && usersRes.data) {
                setUsers(usersRes.data.users);
                setTotalPages(usersRes.data.totalPages);
                setTotal(usersRes.data.total);
            }
            if (statsRes.success) setStats(statsRes.data);
            if (wardsRes.success) setWards(wardsRes.data);
        } catch (err) { console.error('Staff load error:', err); }
        setLoading(false);
    }, [search, roleFilter, activeFilter, page]);

    useEffect(() => { loadData(); }, [loadData]);
    useEffect(() => {
        const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
        return () => clearTimeout(t);
    }, [searchInput]);

    const resetForm = () => { setForm(EMPTY_FORM); setError(''); setShowPassword(false); };

    const handleAdd = async () => {
        setError('');
        if (!form.username || !form.password || !form.name || !form.role || !form.phone) {
            setError('Full name, username, password, role, and phone are required');
            return;
        }
        if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
        setSubmitting(true);
        const res = await addUser({
            ...form,
            assigned_ward_id: form.assigned_ward_id ? Number(form.assigned_ward_id) : undefined,
        });
        setSubmitting(false);
        if (res.success) { setShowAddModal(false); resetForm(); loadData(); }
        else setError(res.error || 'Failed to add staff');
    };

    const handleEdit = async () => {
        if (!editingUser) return;
        setError('');
        setSubmitting(true);
        const res = await updateUser(editingUser.id, {
            name: form.name, role: form.role, specialty: form.specialty,
            email: form.email, phone: form.phone,
            department: form.department, designation: form.designation,
            employee_code: form.employee_code, date_of_joining: form.date_of_joining || undefined,
            assigned_ward_id: form.assigned_ward_id ? Number(form.assigned_ward_id) : undefined,
        });
        setSubmitting(false);
        if (res.success) { setShowEditModal(false); setEditingUser(null); resetForm(); loadData(); }
        else setError(res.error || 'Failed to update');
    };

    const handleResetPassword = async () => {
        if (!editingUser) return;
        setError('');
        if (!resetPassword || resetPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
        setSubmitting(true);
        const res = await resetUserPassword(editingUser.id, resetPassword);
        setSubmitting(false);
        if (res.success) { setShowResetModal(false); setEditingUser(null); setResetPassword(''); }
        else setError(res.error || 'Failed to reset password');
    };

    const openEdit = (user: any) => {
        setEditingUser(user);
        setForm({ ...EMPTY_FORM, ...user, password: '', assigned_ward_id: user.assigned_ward_id ? String(user.assigned_ward_id) : '' });
        setError('');
        setShowEditModal(true);
    };

    const openResetPassword = (user: any) => { setEditingUser(user); setResetPassword(''); setError(''); setShowResetModal(true); };
    const handleToggle = async (userId: string) => { await toggleUserActive(userId); loadData(); };

    return (
        <AdminPage pageTitle="Staff Management" pageIcon={<Users className="h-5 w-5" />}
            headerActions={<button onClick={() => { resetForm(); setShowAddModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all"><UserPlus className="h-3.5 w-3.5" /> Add Staff</button>}
            onRefresh={loadData} refreshing={loading}>
            <div className="space-y-6">
                {/* KPI */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Total Staff', val: stats?.total || 0, icon: Users, color: 'teal' },
                        { label: 'Doctors', val: stats?.doctors || 0, icon: Stethoscope, color: 'teal' },
                        { label: 'Active', val: stats?.active || 0, icon: UserCheck, color: 'emerald' },
                        { label: 'Inactive', val: stats?.inactive || 0, icon: UserX, color: 'rose' },
                    ].map(s => (
                        <div key={s.label} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{s.label}</span>
                                <div className={`p-1.5 bg-${s.color}-50 rounded-lg`}><s.icon className={`h-3.5 w-3.5 text-${s.color}-500`} /></div>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{s.val}</p>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
                            placeholder="Search by name, username, or email..."
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500" />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400" />
                        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-orange-500">
                            {ALL_ROLES_FILTER.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        <select value={activeFilter} onChange={e => { setActiveFilter(e.target.value as any); setPage(1); }} className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-orange-500">
                            <option value="">All Status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead><tr className="border-b border-gray-200">
                                {['Name', 'Username', 'Role', 'Department', 'Contact', 'Status', 'Joined', 'Actions'].map(h => (
                                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                                ))}
                            </tr></thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading && users.length === 0 ? (
                                    <tr><td colSpan={8} className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-500 mx-auto" /><p className="text-gray-400 text-xs mt-2">Loading staff...</p></td></tr>
                                ) : users.length === 0 ? (
                                    <tr><td colSpan={8} className="text-center py-16"><Users className="h-8 w-8 text-gray-300 mx-auto mb-2" /><p className="text-gray-400 text-sm font-medium">No staff found</p></td></tr>
                                ) : users.map((user: any) => (
                                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${user.is_active ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'}`}>{(user.name || user.username || '?').charAt(0).toUpperCase()}</div>
                                                <div><p className={`font-medium text-sm ${user.is_active ? 'text-gray-900' : 'text-gray-400'}`}>{user.name || '-'}</p>{user.designation && <p className="text-[10px] text-gray-400">{user.designation}</p>}</div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3"><span className="text-xs font-mono text-gray-500">{user.username}</span></td>
                                        <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${roleColorMap[user.role] || 'bg-gray-100 text-gray-500'}`}>{roleLabelMap[user.role] || user.role}</span></td>
                                        <td className="px-4 py-3 text-gray-500 text-xs">{user.specialty || user.department || '-'}</td>
                                        <td className="px-4 py-3"><div className="text-xs text-gray-500">{user.email && <p>{user.email}</p>}{user.phone && <p>{user.phone}</p>}{!user.email && !user.phone && '-'}</div></td>
                                        <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full ${user.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}><span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />{user.is_active ? 'Active' : 'Inactive'}</span></td>
                                        <td className="px-4 py-3 text-gray-400 text-xs">{new Date(user.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => openEdit(user)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-orange-600 transition-colors" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                                                <button onClick={() => openResetPassword(user)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-amber-600 transition-colors" title="Reset Password"><KeyRound className="h-3.5 w-3.5" /></button>
                                                <button onClick={() => handleToggle(user.id)} className={`p-1.5 hover:bg-gray-100 rounded-lg transition-colors ${user.is_active ? 'text-gray-400 hover:text-rose-600' : 'text-gray-400 hover:text-emerald-600'}`} title={user.is_active ? 'Deactivate' : 'Activate'}><Power className="h-3.5 w-3.5" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                            <span className="text-xs text-gray-400">Showing {((page - 1) * 25) + 1}–{Math.min(page * 25, total)} of {total}</span>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronLeft className="h-4 w-4 text-gray-400" /></button>
                                <span className="text-xs font-medium text-gray-500">Page {page} of {totalPages}</span>
                                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronRight className="h-4 w-4 text-gray-400" /></button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ADD STAFF MODAL */}
            {showAddModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowAddModal(false); resetForm(); }} />
                    <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-xl max-h-[92vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl shrink-0">
                            <div>
                                <h2 className="text-base font-bold text-gray-900">Add New Staff</h2>
                                <p className="text-[10px] text-gray-400 mt-0.5 flex gap-3">
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />Mandatory</span>
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Preferred</span>
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />Optional</span>
                                </p>
                            </div>
                            <button onClick={() => { setShowAddModal(false); resetForm(); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            {error && <div className="p-3 mb-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">{error}</div>}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                <SectionLabel label="Identity & Access" badge="mandatory" />
                                <div><FL label="Full Name" badge="mandatory" /><input type="text" required value={form.name} onChange={e => set('name', sanitizeName(e.target.value))} maxLength={60} placeholder="Priya Singh" className={inputCls} /></div>
                                <div><FL label="Role" badge="mandatory" /><select required value={form.role} onChange={e => set('role', e.target.value)} className={selectCls}>{ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
                                <div><FL label="Username" badge="mandatory" /><input type="text" required value={form.username} onChange={e => set('username', sanitizeUsername(e.target.value))} maxLength={24} placeholder="priya.singh" className={inputCls} /></div>
                                <div><FL label="Password" badge="mandatory" /><div className="relative"><input type={showPassword ? 'text' : 'password'} required value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min 8 chars, 1 upper, 1 num, 1 special" className={inputCls + ' pr-10'} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
                                <div><FL label="Phone" badge="mandatory" /><input type="tel" required value={form.phone} onChange={e => set('phone', sanitizePhone(e.target.value))} inputMode="numeric" maxLength={10} pattern="[0-9]{10}" placeholder="9876543210" className={inputCls} /></div>
                                <div><FL label="Email" badge="optional" /><input type="email" value={form.email} onChange={e => set('email', e.target.value.trim())} placeholder="priya@hospital.com" className={inputCls} /></div>

                                <SectionLabel label="Work Details" badge="preferred" />
                                <div><FL label="Department" badge="preferred" /><input type="text" value={form.department} onChange={e => set('department', e.target.value)} placeholder="e.g. Cardiology / Lab / Pharmacy" className={inputCls} /></div>
                                <div><FL label="Designation" badge="preferred" /><input type="text" value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="e.g. Senior Nurse" className={inputCls} /></div>
                                <div><FL label="Employee Code" badge="preferred" /><input type="text" value={form.employee_code} onChange={e => set('employee_code', e.target.value)} placeholder="EMP-0042" className={inputCls} /></div>
                                <div><FL label="Date of Joining" badge="preferred" /><DateField value={form.date_of_joining} onChange={e => set('date_of_joining', e.target.value)} className={inputCls} /></div>
                                {form.role === 'nurse' && (
                                    <div className="col-span-2"><FL label="Assigned Ward (Nurses only)" badge="preferred" /><select value={form.assigned_ward_id} onChange={e => set('assigned_ward_id', e.target.value)} className={selectCls}><option value="">— Not assigned —</option>{wards.map((w: any) => <option key={w.ward_id} value={w.ward_id}>{w.ward_name} ({w.ward_type})</option>)}</select></div>
                                )}
                                {form.role === 'doctor' && (
                                    <div className="col-span-2"><FL label="Specialty" badge="mandatory" /><input type="text" value={form.specialty} onChange={e => set('specialty', e.target.value)} placeholder="e.g. Cardiology" className={inputCls} /></div>
                                )}
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
                            <button onClick={() => { setShowAddModal(false); resetForm(); }} className="flex-1 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all">Cancel</button>
                            <button onClick={handleAdd} disabled={submitting} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 transition-all">{submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}Add Staff</button>
                        </div>
                    </div>
                </div>
            )}
            {/* EDIT STAFF MODAL */}
            {showEditModal && editingUser && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowEditModal(false); setEditingUser(null); resetForm(); }} />
                    <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-xl max-h-[92vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                            <div>
                                <h2 className="text-base font-bold text-gray-900">Edit Staff — {editingUser.name || editingUser.username}</h2>
                                <p className="text-[10px] text-gray-400 mt-0.5 flex gap-3">
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />Mandatory</span>
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Preferred</span>
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />Optional</span>
                                </p>
                            </div>
                            <button onClick={() => { setShowEditModal(false); setEditingUser(null); resetForm(); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            {error && <div className="p-3 mb-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">{error}</div>}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                <SectionLabel label="Identity & Access" badge="mandatory" />
                                <div><FL label="Full Name" badge="mandatory" /><input type="text" value={form.name} onChange={e => set('name', sanitizeName(e.target.value))} maxLength={60} className={inputCls} /></div>
                                <div><FL label="Role" badge="mandatory" /><select value={form.role} onChange={e => set('role', e.target.value)} className={selectCls}>{ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
                                <div className="col-span-2"><FL label="Username (cannot change)" badge="mandatory" /><input type="text" value={editingUser.username} disabled className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-400 cursor-not-allowed" /></div>
                                <div><FL label="Phone" badge="mandatory" /><input type="tel" value={form.phone} onChange={e => set('phone', sanitizePhone(e.target.value))} inputMode="numeric" maxLength={10} className={inputCls} /></div>
                                <div><FL label="Email" badge="optional" /><input type="email" value={form.email} onChange={e => set('email', e.target.value.trim())} className={inputCls} /></div>
                                {form.role === 'doctor' && (
                                    <div className="col-span-2"><FL label="Specialty" badge="mandatory" /><input type="text" value={form.specialty} onChange={e => set('specialty', e.target.value)} className={inputCls} /></div>
                                )}
                                <SectionLabel label="Work Details" badge="preferred" />
                                <div><FL label="Department" badge="preferred" /><input type="text" value={form.department} onChange={e => set('department', e.target.value)} placeholder="e.g. Cardiology / Lab" className={inputCls} /></div>
                                <div><FL label="Designation" badge="preferred" /><input type="text" value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="e.g. Senior Nurse" className={inputCls} /></div>
                                <div><FL label="Employee Code" badge="preferred" /><input type="text" value={form.employee_code} onChange={e => set('employee_code', e.target.value)} placeholder="EMP-0042" className={inputCls} /></div>
                                <div><FL label="Date of Joining" badge="preferred" /><DateField value={form.date_of_joining} onChange={e => set('date_of_joining', e.target.value)} className={inputCls} /></div>
                                {form.role === 'nurse' && (
                                    <div className="col-span-2"><FL label="Assigned Ward (Nurses only)" badge="preferred" /><select value={form.assigned_ward_id} onChange={e => set('assigned_ward_id', e.target.value)} className={selectCls}><option value="">— Not assigned —</option>{wards.map((w: any) => <option key={w.ward_id} value={w.ward_id}>{w.ward_name} ({w.ward_type})</option>)}</select></div>
                                )}
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
                            <button onClick={() => { setShowEditModal(false); setEditingUser(null); resetForm(); }} className="flex-1 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all">Cancel</button>
                            <button onClick={handleEdit} disabled={submitting} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 transition-all">{submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}Save Changes</button>
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
                            <button onClick={() => { setShowResetModal(false); setEditingUser(null); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">{error}</div>}
                            <p className="text-sm text-gray-600">Reset password for <span className="font-bold text-gray-900">{editingUser.name || editingUser.username}</span></p>
                            <div>
                                <FL label="New Password" badge="mandatory" />
                                <div className="relative">
                                    <input type={showPassword ? 'text' : 'password'} value={resetPassword} onChange={e => setResetPassword(e.target.value)} className={inputCls + ' pr-10'} placeholder="Min 8 chars, 1 upper, 1 num, 1 special" />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => { setShowResetModal(false); setEditingUser(null); }} className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all">Cancel</button>
                                <button onClick={handleResetPassword} disabled={submitting} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 transition-all">{submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}Reset Password</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AdminPage>
    );
}
