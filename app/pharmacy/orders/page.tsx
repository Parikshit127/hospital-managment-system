'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Pill, Search, ClipboardList, ChevronRight } from 'lucide-react';
import { getPharmacyQueue } from '@/app/actions/pharmacy-actions';
import Link from 'next/link';

export default function PharmacyOrdersPage() {
    const [orders, setOrders] = useState<any[]>([]);
    const [filteredOrders, setFilteredOrders] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const loadOrders = async () => {
        setRefreshing(true);
        const res = await getPharmacyQueue();
        if (res.success) {
            setOrders(res.data);
            setFilteredOrders(res.data);
        }
        setRefreshing(false);
    };

    useEffect(() => { loadOrders(); }, []);

    useEffect(() => {
        if (!searchQuery) return setFilteredOrders(orders);
        const q = searchQuery.toLowerCase();
        setFilteredOrders(orders.filter(o =>
            (o.patient?.full_name?.toLowerCase().includes(q)) ||
            (o.doctor_id?.toLowerCase().includes(q))
        ));
    }, [searchQuery, orders]);

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'Pending': return 'bg-amber-100 text-amber-800';
            case 'Completed': return 'bg-emerald-100 text-emerald-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <AppShell
            pageTitle="Prescription Queue"
            pageIcon={<ClipboardList className="h-5 w-5" />}
            onRefresh={loadOrders}
            refreshing={refreshing}
        >
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 justify-between bg-gray-50/50">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by patient name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Patient Name</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Doctor</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Time</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Total Items</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 font-bold text-xs right-align">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filteredOrders.length > 0 ? filteredOrders.map((order) => (
                                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 font-bold text-gray-900">{order.patient?.full_name || 'Unknown'}</td>
                                    <td className="px-6 py-4 font-medium text-gray-600">{order.doctor_id}</td>
                                    <td className="px-6 py-4 text-gray-500 text-xs">
                                        {new Date(order.created_at).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-700">{order.items.length} items</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide ${getStatusStyle(order.status)}`}>
                                            {order.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {order.status === 'Pending' ? (
                                            <Link
                                                href={`/pharmacy/dispense/${order.id}`}
                                                className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 font-bold text-xs bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg transition-colors"
                                            >
                                                Start Dispensing
                                                <ChevronRight className="h-3 w-3" />
                                            </Link>
                                        ) : (
                                            <span className="text-gray-400 font-bold text-xs">Dispensed</span>
                                        )}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                        <Pill className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                                        <p className="font-medium">No pending pharmacy orders.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </AppShell>
    );
}
