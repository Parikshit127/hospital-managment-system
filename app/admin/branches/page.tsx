'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import {
    GitBranch, Plus, Edit2, Trash2, ToggleLeft, ToggleRight,
    MapPin, Phone, Mail, Building2, Hash, Crown, X, Loader2,
    CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react';
import {
    listBranches,
    createBranch,
    updateBranch,
    toggleBranch,
    deleteBranch,
} from '@/app/actions/branch-actions';

/* ─── Types ─── */
interface Branch {
    id: string;
    branch_name: string;
    branch_code: string;
    address: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    phone: string | null;
    email: string | null;
    is_main_branch: boolean;
    is_active: boolean;
    latitude: number | null;
    longitude: number | null;
    created_at: string;
    updated_at: string;
}

interface FormData {
    branch_name: string;
    branch_code: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email: string;
    is_main_branch: boolean;
    latitude: string;
    longitude: string;
}

const EMPTY_FORM: FormData = {
    branch_name: '',
    branch_code: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    email: '',
    is_main_branch: false,
    latitude: '',
    longitude: '',
};

/* ─── Page Component ─── */
export default function BranchManagementPage() {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState<FormData>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    /* ─── Data Loading ─── */
    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await listBranches();
        if (res.success) setBranches(res.data);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    /* ─── Toast ─── */
    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 4000);
    };

    /* ─── KPI Calculations ─── */
    const totalBranches = branches.length;
    const activeBranches = branches.filter(b => b.is_active).length;
    const inactiveBranches = branches.filter(b => !b.is_active).length;
    const mainBranch = branches.find(b => b.is_main_branch);

    /* ─── Form Helpers ─── */
    const updateField = (field: keyof FormData, value: string | boolean) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const openCreateModal = () => {
        setEditId(null);
        setForm(EMPTY_FORM);
        setModalOpen(true);
    };

    const openEditModal = (branch: Branch) => {
        setEditId(branch.id);
        setForm({
            branch_name: branch.branch_name,
            branch_code: branch.branch_code,
            address: branch.address || '',
            city: branch.city || '',
            state: branch.state || '',
            pincode: branch.pincode || '',
            phone: branch.phone || '',
            email: branch.email || '',
            is_main_branch: branch.is_main_branch,
            latitude: branch.latitude != null ? String(branch.latitude) : '',
            longitude: branch.longitude != null ? String(branch.longitude) : '',
        });
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditId(null);
        setForm(EMPTY_FORM);
    };

    /* ─── CRUD Handlers ─── */
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.branch_name.trim() || !form.branch_code.trim()) return;
        setSaving(true);

        const payload = {
            branch_name: form.branch_name.trim(),
            branch_code: form.branch_code.trim().toUpperCase(),
            address: form.address.trim() || undefined,
            city: form.city.trim() || undefined,
            state: form.state.trim() || undefined,
            pincode: form.pincode.trim() || undefined,
            phone: form.phone.trim() || undefined,
            email: form.email.trim() || undefined,
            is_main_branch: form.is_main_branch,
            latitude: form.latitude ? parseFloat(form.latitude) : null,
            longitude: form.longitude ? parseFloat(form.longitude) : null,
        };

        let res;
        if (editId) {
            res = await updateBranch(editId, payload);
        } else {
            res = await createBranch(payload);
        }

        setSaving(false);

        if (res.success) {
            showToast('success', editId ? 'Branch updated successfully' : 'Branch created successfully');
            closeModal();
            loadData();
        } else {
            showToast('error', res.error || 'Operation failed');
        }
    };

    const handleToggle = async (id: string) => {
        const res = await toggleBranch(id);
        if (res.success) {
            showToast('success', `Branch ${res.data.is_active ? 'activated' : 'deactivated'}`);
            loadData();
        } else {
            showToast('error', res.error || 'Toggle failed');
        }
    };

    const handleDelete = async (id: string) => {
        const res = await deleteBranch(id);
        if (res.success) {
            showToast('success', 'Branch deleted successfully');
            setDeleteConfirm(null);
            loadData();
        } else {
            showToast('error', res.error || 'Delete failed');
            setDeleteConfirm(null);
        }
    };

    /* ─── Render ─── */
    return (
        <AdminPage
            pageTitle="Branch Management"
            pageIcon={<GitBranch className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
        >
            {/* Toast Notification */}
            {toast && (
                <div className={`fixed top-6 right-6 z-[60] flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border text-sm font-bold transition-all ${
                    toast.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                    {toast.type === 'success'
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        : <XCircle className="h-4 w-4 text-red-600" />
                    }
                    {toast.message}
                </div>
            )}

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-8">
                <div>
                    <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                        <GitBranch className="h-5 w-5" style={{ color: 'var(--admin-primary)' }} />
                        Branch Management
                    </h2>
                    <p className="text-sm font-medium text-gray-500 mt-1">
                        Configure and manage your hospital branches across locations.
                    </p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 px-5 py-2.5 text-white font-bold rounded-xl shadow-sm transition-all hover:shadow-md"
                    style={{ background: 'var(--admin-primary)' }}
                >
                    <Plus className="h-4 w-4" />
                    Add Branch
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <KpiCard
                    label="Total Branches"
                    value={totalBranches}
                    icon={<Building2 className="h-5 w-5" />}
                    color="indigo"
                />
                <KpiCard
                    label="Active"
                    value={activeBranches}
                    icon={<CheckCircle2 className="h-5 w-5" />}
                    color="emerald"
                />
                <KpiCard
                    label="Inactive"
                    value={inactiveBranches}
                    icon={<XCircle className="h-5 w-5" />}
                    color="rose"
                />
                <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5 flex items-center gap-4" style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)' }}>
                    <div className="h-11 w-11 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0">
                        <Crown className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] uppercase font-bold text-amber-500 tracking-wider">Main Branch</p>
                        <p className="text-sm font-black text-gray-900 truncate">
                            {mainBranch?.branch_name || 'Not Set'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Branch Grid */}
            {loading && branches.length === 0 ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
                </div>
            ) : branches.length === 0 ? (
                <div className="col-span-full border-2 border-dashed border-gray-200 rounded-3xl p-16 text-center text-gray-500 bg-gray-50/50">
                    <GitBranch className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                    <h2 className="text-xl font-black text-gray-900 mb-2">No Branches Configured</h2>
                    <p className="text-sm font-medium leading-relaxed max-w-sm mx-auto mb-6">
                        Set up branches to manage multi-location hospital operations. Start by adding your main branch.
                    </p>
                    <button
                        onClick={openCreateModal}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-white font-bold rounded-xl shadow-sm transition-all hover:shadow-md"
                        style={{ background: 'var(--admin-primary)' }}
                    >
                        <Plus className="h-4 w-4" />
                        Add Your First Branch
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {branches.map((branch) => (
                        <BranchCard
                            key={branch.id}
                            branch={branch}
                            onEdit={() => openEditModal(branch)}
                            onToggle={() => handleToggle(branch.id)}
                            onDelete={() => setDeleteConfirm(branch.id)}
                        />
                    ))}
                </div>
            )}

            {/* Create/Edit Modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <form
                        onSubmit={handleSave}
                        className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
                    >
                        {/* Modal Header */}
                        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center flex-shrink-0">
                            <div>
                                <h3 className="font-black text-gray-900 text-lg">
                                    {editId ? 'Edit Branch' : 'Create New Branch'}
                                </h3>
                                <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-wider">
                                    Branch Configuration
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded-xl transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-5 overflow-y-auto flex-1">
                            {/* Row 1: Name + Code */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">
                                        Branch Name *
                                    </label>
                                    <input
                                        required
                                        type="text"
                                        value={form.branch_name}
                                        onChange={(e) => updateField('branch_name', e.target.value)}
                                        placeholder="e.g. City Hospital Downtown"
                                        className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors text-sm font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">
                                        Branch Code *
                                    </label>
                                    <input
                                        required
                                        type="text"
                                        value={form.branch_code}
                                        onChange={(e) => updateField('branch_code', e.target.value.toUpperCase().slice(0, 10))}
                                        placeholder="e.g. MAIN01"
                                        maxLength={10}
                                        className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors text-sm font-mono font-bold tracking-wider"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1 font-medium">Uppercase, max 10 characters</p>
                                </div>
                            </div>

                            {/* Address */}
                            <div>
                                <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">
                                    Address
                                </label>
                                <textarea
                                    value={form.address}
                                    onChange={(e) => updateField('address', e.target.value)}
                                    placeholder="Street address, building, floor..."
                                    rows={2}
                                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors text-sm font-medium resize-none"
                                />
                            </div>

                            {/* Row 2: City, State, Pincode */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">
                                        City
                                    </label>
                                    <input
                                        type="text"
                                        value={form.city}
                                        onChange={(e) => updateField('city', e.target.value)}
                                        placeholder="City"
                                        className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors text-sm font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">
                                        State
                                    </label>
                                    <input
                                        type="text"
                                        value={form.state}
                                        onChange={(e) => updateField('state', e.target.value)}
                                        placeholder="State"
                                        className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors text-sm font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">
                                        Pincode
                                    </label>
                                    <input
                                        type="text"
                                        value={form.pincode}
                                        onChange={(e) => updateField('pincode', e.target.value)}
                                        placeholder="Pincode"
                                        className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors text-sm font-medium"
                                    />
                                </div>
                            </div>

                            {/* Row 3: Phone + Email */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">
                                        Phone
                                    </label>
                                    <input
                                        type="text"
                                        value={form.phone}
                                        onChange={(e) => updateField('phone', e.target.value)}
                                        placeholder="+91 98765 43210"
                                        className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors text-sm font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={(e) => updateField('email', e.target.value)}
                                        placeholder="branch@hospital.com"
                                        className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors text-sm font-medium"
                                    />
                                </div>
                            </div>

                            {/* Row 4: Lat + Long */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">
                                        Latitude
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={form.latitude}
                                        onChange={(e) => updateField('latitude', e.target.value)}
                                        placeholder="e.g. 28.6139"
                                        className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors text-sm font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">
                                        Longitude
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={form.longitude}
                                        onChange={(e) => updateField('longitude', e.target.value)}
                                        placeholder="e.g. 77.2090"
                                        className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors text-sm font-medium"
                                    />
                                </div>
                            </div>

                            {/* Main Branch Toggle */}
                            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                <input
                                    type="checkbox"
                                    id="isMainBranch"
                                    checked={form.is_main_branch}
                                    onChange={(e) => updateField('is_main_branch', e.target.checked)}
                                    disabled={editId !== null && form.is_main_branch}
                                    className="w-5 h-5 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                                />
                                <div>
                                    <label htmlFor="isMainBranch" className="text-sm font-bold text-amber-900 cursor-pointer">
                                        Main Branch (HQ)
                                    </label>
                                    <p className="text-[11px] text-amber-600 font-medium mt-0.5">
                                        {editId && form.is_main_branch
                                            ? 'This is the main branch. Assign another branch first to change.'
                                            : 'Only one branch can be the main branch. Setting this will unset any other.'}
                                    </p>
                                </div>
                            </div>

                            {/* Submit Button */}
                            <button
                                disabled={saving}
                                type="submit"
                                className="w-full text-center py-4 bg-gray-900 hover:bg-black text-white font-bold rounded-xl shadow-md transition-colors disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    editId ? 'Update Branch' : 'Create Branch'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
                        <div className="p-6 text-center">
                            <div className="h-14 w-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle className="h-7 w-7 text-red-600" />
                            </div>
                            <h3 className="font-black text-gray-900 text-lg mb-2">Delete Branch?</h3>
                            <p className="text-sm text-gray-500 font-medium mb-6">
                                This action cannot be undone. The branch and its configuration will be permanently removed.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="flex-1 py-3 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleDelete(deleteConfirm)}
                                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-sm transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AdminPage>
    );
}

/* ─── KPI Card Sub-component ─── */
function KpiCard({
    label,
    value,
    icon,
    color,
}: {
    label: string;
    value: number;
    icon: React.ReactNode;
    color: 'indigo' | 'emerald' | 'rose';
}) {
    const colorMap = {
        indigo: { bg: 'bg-indigo-100', text: 'text-indigo-600', label: 'text-indigo-500' },
        emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600', label: 'text-emerald-500' },
        rose: { bg: 'bg-rose-100', text: 'text-rose-600', label: 'text-rose-500' },
    };
    const c = colorMap[color];

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
            <div className={`h-11 w-11 rounded-xl ${c.bg} flex items-center justify-center ${c.text} flex-shrink-0`}>
                {icon}
            </div>
            <div>
                <p className={`text-[10px] uppercase font-bold ${c.label} tracking-wider`}>{label}</p>
                <p className="text-2xl font-black text-gray-900">{value}</p>
            </div>
        </div>
    );
}

/* ─── Branch Card Sub-component ─── */
function BranchCard({
    branch,
    onEdit,
    onToggle,
    onDelete,
}: {
    branch: Branch;
    onEdit: () => void;
    onToggle: () => void | Promise<void>;
    onDelete: () => void;
}) {
    const isMain = branch.is_main_branch;
    const isActive = branch.is_active;

    const locationParts = [branch.city, branch.state, branch.pincode].filter(Boolean).join(', ');

    return (
        <div
            className={`bg-white rounded-2xl border shadow-sm relative overflow-hidden group transition-all hover:shadow-md ${
                isMain
                    ? 'border-amber-300 bg-amber-50/30'
                    : isActive
                        ? 'border-gray-200'
                        : 'border-dashed border-gray-300 opacity-80'
            }`}
        >
            {/* Top accent bar */}
            <div
                className={`absolute top-0 left-0 w-full h-1 ${
                    isMain ? 'bg-gradient-to-r from-amber-400 to-amber-500' : isActive ? 'bg-indigo-500' : 'bg-gray-300'
                }`}
            />

            <div className="p-6 pt-5">
                {/* Header Row */}
                <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-lg font-black text-gray-900 truncate">
                                {branch.branch_name}
                            </h3>
                            {isMain && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-bold bg-amber-100 text-amber-700 border border-amber-200 rounded-full flex-shrink-0">
                                    <Crown className="h-3 w-3" />
                                    Main Branch
                                </span>
                            )}
                        </div>
                        <p className="text-xs font-mono font-bold text-gray-400 tracking-widest mt-1 flex items-center gap-1.5">
                            <Hash className="h-3 w-3" />
                            {branch.branch_code}
                        </p>
                    </div>

                    {/* Status Badge */}
                    <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-full flex-shrink-0 ${
                            isActive
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700'
                        }`}
                    >
                        <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {isActive ? 'Active' : 'Inactive'}
                    </span>
                </div>

                {/* Details */}
                <div className="space-y-2.5 mb-5">
                    {branch.address && (
                        <div className="flex items-start gap-2.5 text-sm text-gray-600">
                            <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                            <span className="font-medium leading-snug">
                                {branch.address}
                                {locationParts && <span className="text-gray-400">, {locationParts}</span>}
                            </span>
                        </div>
                    )}
                    {!branch.address && locationParts && (
                        <div className="flex items-start gap-2.5 text-sm text-gray-600">
                            <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                            <span className="font-medium">{locationParts}</span>
                        </div>
                    )}
                    {branch.phone && (
                        <div className="flex items-center gap-2.5 text-sm text-gray-600">
                            <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="font-medium">{branch.phone}</span>
                        </div>
                    )}
                    {branch.email && (
                        <div className="flex items-center gap-2.5 text-sm text-gray-600">
                            <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="font-medium">{branch.email}</span>
                        </div>
                    )}
                    {!branch.address && !locationParts && !branch.phone && !branch.email && (
                        <p className="text-xs text-gray-400 font-medium italic">No contact details provided</p>
                    )}
                </div>

                {/* Actions Row */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-1.5">
                        {/* Edit */}
                        <button
                            onClick={onEdit}
                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit branch"
                        >
                            <Edit2 className="h-4 w-4" />
                        </button>

                        {/* Toggle Active */}
                        {!isMain && (
                            <button
                                onClick={onToggle}
                                className={`p-2 rounded-lg transition-colors ${
                                    isActive
                                        ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                                        : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
                                }`}
                                title={isActive ? 'Deactivate branch' : 'Activate branch'}
                            >
                                {isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                            </button>
                        )}

                        {/* Delete */}
                        {!isMain && (
                            <button
                                onClick={onDelete}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete branch"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    {/* Coordinates indicator */}
                    {(branch.latitude != null && branch.longitude != null) && (
                        <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-md">
                            {branch.latitude.toFixed(4)}, {branch.longitude.toFixed(4)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
