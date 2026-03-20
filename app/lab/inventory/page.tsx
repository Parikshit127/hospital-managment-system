'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { FlaskConical, Search, Plus, AlertTriangle, Edit2, LayoutGrid } from 'lucide-react';
import { getLabInventory, addLabReagent, updateLabInventory } from '@/app/actions/lab-actions';
import { z } from 'zod';
import { useToast } from '@/app/components/ui/Toast';

const ReagentSchema = z.object({
    reagent_name: z.string().min(2, "Name is required"),
    current_stock: z.coerce.number().min(0),
    unit: z.string().min(1, "Unit required"),
    min_threshold: z.coerce.number().min(0),
    expiry_date: z.string().optional()
});

export default function LabInventoryPage() {
    const toast = useToast();
    const [inventory, setInventory] = useState<any[]>([]);
    const [filtered, setFiltered] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        reagent_name: '', current_stock: '', unit: '', min_threshold: '', expiry_date: ''
    });

    const loadData = async () => {
        setRefreshing(true);
        const res = await getLabInventory();
        if (res.success) {
            setInventory(res.data);
            setFiltered(res.data);
        }
        setRefreshing(false);
    };

    useEffect(() => { loadData(); }, []);

    useEffect(() => {
        if (!searchQuery) return setFiltered(inventory);
        setFiltered(inventory.filter(i => i.reagent_name.toLowerCase().includes(searchQuery.toLowerCase())));
    }, [searchQuery, inventory]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            ReagentSchema.parse(form); // Validate
        } catch (err) {
            toast.warning('Please check required fields.');
            return;
        }

        setSaving(true);
        const payload = {
            reagent_name: form.reagent_name,
            current_stock: Number(form.current_stock),
            unit: form.unit,
            min_threshold: Number(form.min_threshold),
            expiry_date: form.expiry_date || undefined
        };

        let res;
        if (editingId) res = await updateLabInventory(editingId, payload);
        else res = await addLabReagent(payload);

        if (res.success) {
            setModalOpen(false);
            loadData();
        } else toast.error('Failed to save reagent');
        setSaving(false);
    };

    const isLowStock = (item: any) => item.current_stock <= item.min_threshold;
    const isExpiringSoon = (item: any) => {
        if (!item.expiry_date) return false;
        const days = (new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 3600 * 24);
        return days < 30; // Less than 30 days
    };

    return (
        <AppShell
            pageTitle="Lab Inventory"
            pageIcon={<LayoutGrid className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={refreshing}
            headerActions={
                <button
                    onClick={() => { setEditingId(null); setForm({ reagent_name: '', current_stock: '', unit: '', min_threshold: '', expiry_date: '' }); setModalOpen(true); }}
                    className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold py-2 px-4 rounded-xl shadow-sm transition-all"
                >
                    <Plus className="h-4 w-4" /> Add Reagent
                </button>
            }
        >
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 bg-gray-50/50">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search reagents..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Item Name</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Stock Level</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Expiry</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 right-align"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filtered.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 font-bold text-gray-900">{item.reagent_name}</td>
                                    <td className="px-6 py-4 font-medium text-gray-700">
                                        {item.current_stock} <span className="text-gray-400 text-xs">{item.unit}</span>
                                        <p className="text-[10px] text-gray-400 font-medium">Min: {item.min_threshold}</p>
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 text-xs font-medium">
                                        {item.expiry_date ? new Date(item.expiry_date).toISOString().split('T')[0] : 'N/A'}
                                    </td>
                                    <td className="px-6 py-4">
                                        {isLowStock(item) ? (
                                            <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2 py-0.5 rounded-md text-xs font-bold uppercase"><AlertTriangle className="h-3 w-3" /> Low Stock</span>
                                        ) : isExpiringSoon(item) ? (
                                            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md text-xs font-bold uppercase"><FlaskConical className="h-3 w-3" /> Expiring</span>
                                        ) : (
                                            <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md text-xs font-bold uppercase">Optimal</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => { setEditingId(item.id); setForm({ reagent_name: item.reagent_name, current_stock: item.current_stock.toString(), unit: item.unit, min_threshold: item.min_threshold.toString(), expiry_date: item.expiry_date ? new Date(item.expiry_date).toISOString().split('T')[0] : '' }); setModalOpen(true); }}
                                            className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors inline-block"
                                        >
                                            <Edit2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <h3 className="font-bold text-gray-900">{editingId ? 'Edit Reagent' : 'Add New Reagent'}</h3>
                            <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-900 text-xl font-bold">&times;</button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Reagent Name</label>
                                <input required value={form.reagent_name} onChange={e => setForm({ ...form, reagent_name: e.target.value })} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 text-sm font-medium" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Current Stock</label>
                                    <input required type="number" min="0" value={form.current_stock} onChange={e => setForm({ ...form, current_stock: e.target.value })} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 text-sm font-medium" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Unit (e.g., ml, kit)</label>
                                    <input required value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 text-sm font-medium" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Min Threshold</label>
                                    <input required type="number" min="0" value={form.min_threshold} onChange={e => setForm({ ...form, min_threshold: e.target.value })} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 text-sm font-medium" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Expiry Date</label>
                                    <input type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 text-sm font-medium" />
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 font-bold text-gray-500 hover:text-gray-800 text-sm">Cancel</button>
                                <button type="submit" disabled={saving} className="px-4 py-2 font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm shadow-md disabled:opacity-50">Save Reagent</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
