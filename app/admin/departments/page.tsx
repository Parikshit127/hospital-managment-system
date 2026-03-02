'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { LayoutGrid, Plus, MoreVertical, Edit2, ShieldAlert } from 'lucide-react';
import { getDepartments, createDepartment, updateDepartment } from '@/app/actions/admin-actions';
import { useRouter } from 'next/navigation';

export default function DepartmentsPage() {
    const [departments, setDepartments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);

    // Modal state
    const [editId, setEditId] = useState<number | null>(null);
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [fee, setFee] = useState(500);
    const [isActive, setIsActive] = useState(true);
    const [saving, setSaving] = useState(false);

    const loadData = async () => {
        setLoading(true);
        const res = await getDepartments();
        if (res.success) setDepartments(res.data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        let res;

        if (editId) {
            res = await updateDepartment(editId, { name, description: desc, base_consultation_fee: Number(fee), is_active: isActive });
        } else {
            res = await createDepartment({ name, description: desc, base_consultation_fee: Number(fee), is_active: isActive });
        }

        setSaving(false);
        if (res?.success) {
            setModalOpen(false);
            loadData();
        } else {
            alert('Operation failed. Please check inputs.');
        }
    };

    const openModal = (dept?: any) => {
        if (dept) {
            setEditId(dept.id);
            setName(dept.name);
            setDesc(dept.description || '');
            setFee(Number(dept.base_consultation_fee) || 0);
            setIsActive(dept.is_active);
        } else {
            setEditId(null);
            setName(''); setDesc(''); setFee(500); setIsActive(true);
        }
        setModalOpen(true);
    };

    const toggleStatus = async (id: number, currentStatus: boolean) => {
        const res = await updateDepartment(id, { is_active: !currentStatus });
        if (res.success) loadData();
    };

    return (
        <AppShell
            pageTitle="Clinical Departments"
            pageIcon={<LayoutGrid className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h2 className="text-xl font-black text-gray-900">Manage Departments</h2>
                    <p className="text-sm font-medium text-gray-500">Add or update hospital clinical and non-clinical departments.</p>
                </div>
                <button onClick={() => openModal()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors">
                    <Plus className="h-4 w-4" /> New Department
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {departments.map((d: any) => (
                    <div key={d.id} className={`bg-white rounded-2xl border ${d.is_active ? 'border-gray-200 shadow-sm' : 'border-dashed border-gray-300 opacity-75'} p-5 relative overflow-hidden group hover:border-indigo-300 transition-colors`}>
                        <div className={`absolute top-0 w-full h-1 left-0 ${d.is_active ? 'bg-indigo-500' : 'bg-gray-300'}`}></div>

                        <div className="flex justify-between items-start mb-4 mt-2">
                            <h3 className="text-lg font-black text-gray-900">{d.name}</h3>
                            <div className="flex gap-2">
                                <button onClick={() => openModal(d)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Edit2 className="h-4 w-4" /></button>
                            </div>
                        </div>

                        <p className="text-sm text-gray-500 font-medium mb-6 min-h-[40px]">{d.description || 'No description provided.'}</p>

                        <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Base Fee</p>
                                <p className="font-bold text-gray-900">₹{Number(d.base_consultation_fee).toFixed(2)}</p>
                            </div>
                            <button
                                onClick={() => toggleStatus(d.id, d.is_active)}
                                className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider transition-colors ${d.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'}`}
                            >
                                {d.is_active ? 'Active' : 'Disabled'}
                            </button>
                        </div>
                    </div>
                ))}

                {departments.length === 0 && !loading && (
                    <div className="col-span-full border-2 border-dashed border-gray-200 rounded-3xl p-16 text-center text-gray-500 bg-gray-50/50">
                        <LayoutGrid className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                        <h2 className="text-xl font-black text-gray-900 mb-2">No Departments Configured</h2>
                        <p className="text-sm font-medium leading-relaxed max-w-sm mx-auto">Create departments to categorize doctors and establish base consultation fees for the OPD.</p>
                    </div>
                )}
            </div>

            {/* Form Modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleSave} className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <div>
                                <h3 className="font-black text-gray-900">{editId ? 'Edit Department' : 'Create Department'}</h3>
                                <p className="text-xs font-bold text-gray-500 mt-1 uppercase">OPD Structure</p>
                            </div>
                            <button type="button" onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-900 p-2">&times;</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs uppercase font-bold text-gray-500 mb-2">Department Name *</label>
                                <input required value={name} onChange={e => setName(e.target.value)} type="text" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors" placeholder="e.g. Cardiology" />
                            </div>

                            <div>
                                <label className="block text-xs uppercase font-bold text-gray-500 mb-2">Description / Notes</label>
                                <textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors min-h-[80px]" placeholder="Optional description..." />
                            </div>

                            <div>
                                <label className="block text-xs uppercase font-bold text-gray-500 mb-2">Base Consultation Fee (₹) *</label>
                                <input required value={fee} onChange={e => setFee(Number(e.target.value))} type="number" min="0" step="0.01" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors" />
                            </div>

                            <div className="flex items-center gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                                <input type="checkbox" id="isActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                                <label htmlFor="isActive" className="text-sm font-bold text-indigo-900">Enable Department</label>
                            </div>

                            <button disabled={saving} type="submit" className="w-full text-center py-4 bg-gray-900 hover:bg-black text-white font-bold rounded-xl shadow-md transition-colors disabled:opacity-50 mt-2">
                                {saving ? 'Saving...' : 'Save Configuration'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </AppShell>
    );
}
