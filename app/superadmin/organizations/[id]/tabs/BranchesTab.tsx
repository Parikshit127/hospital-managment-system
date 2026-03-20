'use client';

import { useState, useEffect } from 'react';
import {
    getOrganizationBranches, createBranch, updateBranch, toggleBranch, deleteBranch,
} from '@/app/actions/superadmin-actions';
import {
    MapPin, Plus, Edit2, Trash2, Power, Phone, Mail, AlertCircle, Building2, Star,
} from 'lucide-react';

interface BranchesTabProps {
    orgId: string;
}

export default function BranchesTab({ orgId }: BranchesTabProps) {
    const [branches, setBranches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editBranch, setEditBranch] = useState<any>(null);

    async function loadBranches() {
        setLoading(true);
        const res = await getOrganizationBranches(orgId);
        if (res.success) setBranches(res.data || []);
        setLoading(false);
    }

    useEffect(() => { loadBranches(); }, [orgId]);

    const handleToggle = async (branchId: string, branchName: string, isActive: boolean) => {
        if (!confirm(`${isActive ? 'Deactivate' : 'Activate'} branch "${branchName}"?`)) return;
        const res = await toggleBranch(branchId);
        if (res.success) loadBranches();
        else alert(res.error);
    };

    const handleDelete = async (branchId: string, branchName: string) => {
        if (!confirm(`Permanently delete branch "${branchName}"? This cannot be undone.`)) return;
        const res = await deleteBranch(branchId);
        if (res.success) loadBranches();
        else alert(res.error);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-white">Branches & Locations</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{branches.length} branch{branches.length !== 1 ? 'es' : ''} registered</p>
                </div>
                <button
                    onClick={() => { setEditBranch(null); setShowModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition"
                >
                    <Plus className="h-4 w-4" /> Add Branch
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
                </div>
            ) : branches.length === 0 ? (
                <div className="text-center py-16 bg-white/5 border border-white/5 rounded-xl">
                    <MapPin className="h-10 w-10 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400 font-medium">No branches added yet</p>
                    <p className="text-xs text-gray-500 mt-1">Add branches to manage multiple locations</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {branches.map((branch) => (
                        <div key={branch.id} className="bg-white/5 border border-white/5 rounded-xl p-5 hover:border-white/10 transition">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
                                        <Building2 className="h-5 w-5 text-violet-400" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold text-white">{branch.branch_name}</h4>
                                            {branch.is_main_branch && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/15 text-amber-400 text-[10px] font-bold rounded uppercase">
                                                    <Star className="h-2.5 w-2.5" /> Main
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 font-mono">{branch.branch_code}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                        branch.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-500/15 text-gray-500'
                                    }`}>
                                        {branch.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-1.5 text-sm text-gray-400 mb-4">
                                {branch.city && (
                                    <p className="flex items-center gap-2">
                                        <MapPin className="h-3.5 w-3.5 text-gray-600" />
                                        {[branch.address, branch.city, branch.state, branch.pincode].filter(Boolean).join(', ')}
                                    </p>
                                )}
                                {branch.phone && (
                                    <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-600" /> {branch.phone}</p>
                                )}
                                {branch.email && (
                                    <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gray-600" /> {branch.email}</p>
                                )}
                            </div>

                            <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                                <button
                                    onClick={() => { setEditBranch(branch); setShowModal(true); }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition"
                                >
                                    <Edit2 className="h-3 w-3" /> Edit
                                </button>
                                <button
                                    onClick={() => handleToggle(branch.id, branch.branch_name, branch.is_active)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition"
                                >
                                    <Power className="h-3 w-3" /> {branch.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                                <button
                                    onClick={() => handleDelete(branch.id, branch.branch_name)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition ml-auto"
                                >
                                    <Trash2 className="h-3 w-3" /> Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <BranchModal
                    branch={editBranch}
                    orgId={orgId}
                    onClose={() => { setShowModal(false); setEditBranch(null); }}
                    onSave={() => { setShowModal(false); setEditBranch(null); loadBranches(); }}
                />
            )}
        </div>
    );
}

function BranchModal({ branch, orgId, onClose, onSave }: {
    branch?: any; orgId: string; onClose: () => void; onSave: () => void;
}) {
    const [form, setForm] = useState({
        branch_name: branch?.branch_name || '',
        branch_code: branch?.branch_code || '',
        address: branch?.address || '',
        city: branch?.city || '',
        state: branch?.state || '',
        pincode: branch?.pincode || '',
        phone: branch?.phone || '',
        email: branch?.email || '',
        is_main_branch: branch?.is_main_branch || false,
        latitude: branch?.latitude ?? '',
        longitude: branch?.longitude ?? '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const update = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.branch_name || !form.branch_code) {
            setError('Branch name and code are required');
            return;
        }
        setSaving(true);
        setError('');

        const payload = {
            ...form,
            latitude: form.latitude !== '' ? Number(form.latitude) : null,
            longitude: form.longitude !== '' ? Number(form.longitude) : null,
        };

        const res = branch
            ? await updateBranch(branch.id, payload)
            : await createBranch(orgId, payload);

        if (res.success) {
            onSave();
        } else {
            setError(res.error || 'Failed to save branch');
        }
        setSaving(false);
    }

    const fieldClass = 'w-full px-3 py-2.5 bg-[#161b22] border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none';
    const labelClass = 'block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-[#0d1117] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">{branch ? 'Edit Branch' : 'Add Branch'}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">&times;</button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" /> {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Branch Name *</label>
                            <input type="text" value={form.branch_name} onChange={e => update('branch_name', e.target.value)} className={fieldClass} placeholder="Main Branch" />
                        </div>
                        <div>
                            <label className={labelClass}>Branch Code *</label>
                            <input type="text" value={form.branch_code} onChange={e => update('branch_code', e.target.value)} className={fieldClass} placeholder="BR-001" disabled={!!branch} />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Address</label>
                        <input type="text" value={form.address} onChange={e => update('address', e.target.value)} className={fieldClass} />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className={labelClass}>City</label>
                            <input type="text" value={form.city} onChange={e => update('city', e.target.value)} className={fieldClass} />
                        </div>
                        <div>
                            <label className={labelClass}>State</label>
                            <input type="text" value={form.state} onChange={e => update('state', e.target.value)} className={fieldClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Pincode</label>
                            <input type="text" value={form.pincode} onChange={e => update('pincode', e.target.value)} className={fieldClass} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Phone</label>
                            <input type="text" value={form.phone} onChange={e => update('phone', e.target.value)} className={fieldClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Email</label>
                            <input type="email" value={form.email} onChange={e => update('email', e.target.value)} className={fieldClass} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Latitude</label>
                            <input type="number" step="any" value={form.latitude} onChange={e => update('latitude', e.target.value)} className={fieldClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Longitude</label>
                            <input type="number" step="any" value={form.longitude} onChange={e => update('longitude', e.target.value)} className={fieldClass} />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={form.is_main_branch}
                            onChange={e => update('is_main_branch', e.target.checked)}
                            className="rounded border-gray-600 text-violet-600 focus:ring-violet-500 bg-[#161b22]"
                        />
                        <label className="text-sm text-gray-300">Main Branch</label>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-400 bg-white/5 rounded-lg hover:bg-white/10 transition">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving} className="px-6 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-500 disabled:opacity-50 transition">
                            {saving ? 'Saving...' : branch ? 'Update Branch' : 'Add Branch'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
