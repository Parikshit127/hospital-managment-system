'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Users, Search, Plus, Mail, Phone, MapPin } from 'lucide-react';
import { getSuppliers } from '@/app/actions/pharmacy-actions';

export default function SuppliersPage() {
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = async () => {
        setRefreshing(true);
        const res = await getSuppliers();
        if (res.success) setSuppliers(res.data);
        setRefreshing(false);
    };

    useEffect(() => { loadData(); }, []);

    return (
        <AppShell
            pageTitle="Pharmacy Suppliers"
            pageIcon={<Users className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={refreshing}
            headerActions={
                <button className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold py-2 px-4 rounded-xl text-sm shadow-sm transition-all hover:-translate-y-0.5">
                    <Plus className="h-4 w-4" /> Add Supplier
                </button>
            }
        >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {suppliers.length > 0 ? suppliers.map((sup: any) => (
                    <div key={sup.id} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 transition-all hover:shadow-md hover:border-teal-200">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="font-black text-gray-900 text-lg mb-1">{sup.name}</h3>
                                <p className="text-[10px] text-teal-600 font-bold uppercase tracking-wider bg-teal-50 px-2 py-0.5 rounded-md inline-block">ID: {sup.id}</p>
                            </div>
                            <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md ${sup.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                {sup.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </div>

                        <div className="space-y-3 pt-4 border-t border-gray-100 text-sm font-medium text-gray-600">
                            <div className="flex items-center gap-3"><Mail className="h-4 w-4 text-gray-400" /> {sup.email || 'N/A'}</div>
                            <div className="flex items-center gap-3"><Phone className="h-4 w-4 text-gray-400" /> {sup.phone || 'N/A'}</div>
                            <div className="flex items-center gap-3"><MapPin className="h-4 w-4 text-gray-400" /> {sup.gst_no || 'Check GST'}</div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button className="text-teal-600 text-xs font-bold bg-teal-50 hover:bg-teal-100 py-2 px-4 rounded-lg transition-colors">Edit Details</button>
                        </div>
                    </div>
                )) : (
                    <div className="col-span-full bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center text-gray-500">
                        <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <h3 className="font-bold text-gray-900 mb-1">No Suppliers Found</h3>
                        <p className="text-sm">Click "Add Supplier" to create your first vendor database entry.</p>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
