'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Package, Search, Plus, Edit2, AlertTriangle, FileBox } from 'lucide-react';
import { getLowStockAlerts, searchMedicine, addInventoryBatch } from '@/app/actions/pharmacy-actions';

export default function PharmacyInventoryPage() {
    const [medicines, setMedicines] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterLow, setFilterLow] = useState(false);

    // Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState({ brand_name: '', generic_name: '', batch_no: '', stock: '', price: '', expiry: '', rack: '' });

    const loadInventory = async (query: string = '') => {
        setRefreshing(true);
        if (filterLow) {
            const res = await getLowStockAlerts();
            if (res.success) setMedicines(res.data);
        } else {
            const res = await searchMedicine(query);
            if (res.success) setMedicines(res.data);
        }
        setRefreshing(false);
    };

    useEffect(() => { loadInventory(searchQuery); }, [searchQuery, filterLow]);

    const handleSaveBatch = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            brand_name: form.brand_name,
            generic_name: form.generic_name,
            batch_no: form.batch_no,
            stock: Number(form.stock),
            price: Number(form.price),
            expiry: new Date(form.expiry),
            rack: form.rack
        };
        const res = await addInventoryBatch(payload);
        if (res.success) {
            setModalOpen(false);
            loadInventory();
        } else alert(res.error || 'Failed');
    };

    return (
        <AppShell
            pageTitle="Pharmacy Inventory"
            pageIcon={<Package className="h-5 w-5" />}
            onRefresh={() => loadInventory(searchQuery)}
            refreshing={refreshing}
            headerActions={
                <button onClick={() => { setForm({ brand_name: '', generic_name: '', batch_no: '', stock: '', price: '', expiry: '', rack: '' }); setModalOpen(true); }} className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold py-2 px-4 rounded-xl shadow-sm transition-all text-sm">
                    <Plus className="h-4 w-4" /> Add Bulk Stock
                </button>
            }
        >
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex gap-4 bg-gray-50/50">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text" placeholder="Search medicines..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                        />
                    </div>
                    <button onClick={() => setFilterLow(!filterLow)} className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${filterLow ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        {filterLow ? 'Showing Low Stock' : 'Show All Stock'}
                    </button>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {medicines.map((med: any) => (
                        <div key={med.id} className="border border-gray-200 rounded-2xl p-4 bg-white hover:shadow-md transition-shadow">
                            <h3 className="font-bold text-gray-900">{med.brand_name}</h3>
                            <p className="text-xs text-gray-500 mb-4">{med.generic_name || 'Generic N/A'}</p>

                            <div className="space-y-2">
                                {med.batches?.length > 0 ? med.batches.map((b: any) => (
                                    <div key={b.id} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                                        <div>
                                            <p className="text-xs font-bold text-gray-700 tracking-wider">BATCH: {b.batch_no}</p>
                                            <p className="text-[10px] text-gray-400">Exp: {new Date(b.expiry_date).toLocaleDateString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-sm font-black ${b.current_stock < 10 ? 'text-red-500' : 'text-emerald-600'}`}>{b.current_stock}</p>
                                            <p className="text-[10px] font-bold text-gray-500">Vol</p>
                                        </div>
                                    </div>
                                )) : <div className="p-3 text-center text-xs font-bold text-red-500 bg-red-50 rounded-lg">Out of Stock</div>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Quick Add Modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleSaveBatch} className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-4 border-b bg-gray-50 flex justify-between"><h3 className="font-bold">Add Generic Item & Batch</h3><button type="button" onClick={() => setModalOpen(false)}>&times;</button></div>
                        <div className="p-6 space-y-4">
                            <input required placeholder="Brand Name" className="w-full p-2 border rounded-lg text-sm" value={form.brand_name} onChange={e => setForm({ ...form, brand_name: e.target.value })} />
                            <input placeholder="Generic Name" className="w-full p-2 border rounded-lg text-sm" value={form.generic_name} onChange={e => setForm({ ...form, generic_name: e.target.value })} />
                            <div className="grid grid-cols-2 gap-4">
                                <input required placeholder="Batch No" className="w-full p-2 border rounded-lg text-sm" value={form.batch_no} onChange={e => setForm({ ...form, batch_no: e.target.value })} />
                                <input required type="number" placeholder="Qty" className="w-full p-2 border rounded-lg text-sm" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <input required type="number" placeholder="Unit Price" className="w-full p-2 border rounded-lg text-sm" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
                                <input required type="date" className="w-full p-2 border rounded-lg text-sm text-gray-500" value={form.expiry} onChange={e => setForm({ ...form, expiry: e.target.value })} />
                            </div>
                            <button type="submit" className="w-full bg-teal-600 text-white font-bold p-2 rounded-lg">Save Item</button>
                        </div>
                    </form>
                </div>
            )}
        </AppShell>
    );
}
