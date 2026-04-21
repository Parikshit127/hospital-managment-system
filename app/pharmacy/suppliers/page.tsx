'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Users, Plus, Mail, Phone, Hash, X, Loader2, Pencil, CheckCircle } from 'lucide-react';
import { getSuppliers, createSupplier, updateSupplier } from '@/app/actions/pharmacy-actions';

const emptyForm = { name: '', contact_person: '', phone: '', email: '', gst_no: '' };

export default function SuppliersPage() {
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);

    const loadData = async () => {
        setRefreshing(true);
        const res = await getSuppliers();
        if (res.success) setSuppliers(res.data);
        setRefreshing(false);
    };

    useEffect(() => { loadData(); }, []);

    const openCreate = () => {
        setEditId(null);
        setForm(emptyForm);
        setShowModal(true);
    };

    const openEdit = (sup: any) => {
        setEditId(sup.id);
        setForm({
            name: sup.name || '',
            contact_person: sup.contact_person || '',
            phone: sup.phone || '',
            email: sup.email || '',
            gst_no: sup.gst_no || '',
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) return alert('Supplier name is required');
        setSaving(true);
        let res;
        if (editId) {
            res = await updateSupplier(editId, form);
        } else {
            res = await createSupplier(form);
        }
        if (res.success) {
            setShowModal(false);
            setForm(emptyForm);
            setEditId(null);
            loadData();
        } else {
            alert(res.error || 'Failed to save');
        }
        setSaving(false);
    };

    const toggleActive = async (sup: any) => {
        await updateSupplier(sup.id, { is_active: !sup.is_active });
        loadData();
    };

    return (
        <AppShell
            pageTitle="Pharmacy Suppliers"
            pageIcon={<Users className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={refreshing}
            headerActions={
                <button onClick={openCreate} className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold py-2 px-4 rounded-xl text-sm shadow-sm transition-all hover:-translate-y-0.5">
                    <Plus className="h-4 w-4" /> Add Supplier
                </button>
            }
        >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {suppliers.length > 0 ? suppliers.map((sup: any) => (
                    <div key={sup.id} className="bg-white border border-gray-200 rounded-2xl p-5 transition-all hover:border-teal-200 group">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h3 className="font-black text-gray-900 text-base">{sup.name}</h3>
                                {sup.contact_person && (
                                    <p className="text-xs text-gray-500 mt-0.5">{sup.contact_person}</p>
                                )}
                            </div>
                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md cursor-pointer transition-colors ${sup.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                                onClick={() => toggleActive(sup)} title="Click to toggle">
                                {sup.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </div>

                        <div className="space-y-2 pt-3 border-t border-gray-100 text-sm text-gray-600">
                            {sup.email && (
                                <div className="flex items-center gap-2">
                                    <Mail className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="text-xs">{sup.email}</span>
                                </div>
                            )}
                            {sup.phone && (
                                <div className="flex items-center gap-2">
                                    <Phone className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="text-xs">{sup.phone}</span>
                                </div>
                            )}
                            {sup.gst_no && (
                                <div className="flex items-center gap-2">
                                    <Hash className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="text-xs font-mono">{sup.gst_no}</span>
                                </div>
                            )}
                        </div>

                        <div className="mt-4 flex justify-end">
                            <button onClick={() => openEdit(sup)} className="text-teal-600 text-xs font-bold bg-teal-50 hover:bg-teal-100 py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1.5">
                                <Pencil className="h-3 w-3" /> Edit
                            </button>
                        </div>
                    </div>
                )) : (
                    <div className="col-span-full bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center text-gray-500">
                        <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <h3 className="font-bold text-gray-900 mb-1">No Suppliers Found</h3>
                        <p className="text-sm mb-4">Click "Add Supplier" to create your first vendor.</p>
                        <button onClick={openCreate} className="inline-flex items-center gap-2 bg-teal-500 text-white font-bold py-2 px-4 rounded-xl text-sm">
                            <Plus className="h-4 w-4" /> Add Supplier
                        </button>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="text-lg font-black text-gray-900">{editId ? 'Edit Supplier' : 'Add Supplier'}</h3>
                            <button onClick={() => setShowModal(false)}><X className="h-5 w-5 text-gray-400 hover:text-gray-700 transition-colors" /></button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Supplier Name *</label>
                                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                                    className="w-full p-3 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-bold text-gray-900 placeholder:text-gray-400"
                                    placeholder="e.g. MedSupply India Pvt Ltd" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Contact Person</label>
                                <input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })}
                                    className="w-full p-3 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none font-medium text-gray-900 placeholder:text-gray-400"
                                    placeholder="Name" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Phone</label>
                                    <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                                        className="w-full p-3 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none font-medium text-gray-900 placeholder:text-gray-400"
                                        placeholder="+91..." />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Email</label>
                                    <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email"
                                        className="w-full p-3 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none font-medium text-gray-900 placeholder:text-gray-400"
                                        placeholder="email@supplier.com" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">GST Number</label>
                                <input value={form.gst_no} onChange={e => setForm({ ...form, gst_no: e.target.value })}
                                    className="w-full p-3 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none font-mono font-medium text-gray-900 placeholder:text-gray-400"
                                    placeholder="e.g. 27AABCU9603R1ZM" />
                            </div>
                        </div>

                        <div className="p-5 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                            <button onClick={() => setShowModal(false)} className="px-5 py-2.5 text-gray-500 font-bold hover:text-gray-700 rounded-xl transition-all">Cancel</button>
                            <button onClick={handleSave} disabled={saving}
                                className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl hover:from-teal-400 hover:to-emerald-500 shadow-lg shadow-teal-500/20 flex items-center gap-2 disabled:opacity-70">
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                {editId ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
