'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { FlaskConical, Search, AlertCircle, FileText, ChevronRight } from 'lucide-react';
import { getLabOrders, updateSampleStatus, flagCriticalResult } from '@/app/actions/lab-actions';
import Link from 'next/link';

export default function LabWorklistPage() {
    const [orders, setOrders] = useState<any[]>([]);
    const [filteredOrders, setFilteredOrders] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');

    const loadOrders = async () => {
        setRefreshing(true);
        const res = await getLabOrders('All');
        if (res.success) {
            setOrders(res.data);
            applyFilters(res.data, searchQuery, filterStatus);
        }
        setRefreshing(false);
    };

    useEffect(() => {
        loadOrders();
    }, []);

    const applyFilters = (data: any[], query: string, status: string) => {
        let filtered = data;
        if (query) {
            filtered = filtered.filter(o =>
                o.order_id.toLowerCase().includes(query.toLowerCase()) ||
                o.patient_name.toLowerCase().includes(query.toLowerCase())
            );
        }
        if (status !== 'All') {
            filtered = filtered.filter(o => o.status === status);
        }
        setFilteredOrders(filtered);
    };

    useEffect(() => {
        applyFilters(orders, searchQuery, filterStatus);
    }, [searchQuery, filterStatus, orders]);


    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'Pending': return 'bg-amber-100 text-amber-800';
            case 'Processing': return 'bg-blue-100 text-blue-800';
            case 'Completed': return 'bg-emerald-100 text-emerald-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <AppShell
            pageTitle="Laboratory Worklist"
            pageIcon={<FlaskConical className="h-5 w-5" />}
            onRefresh={loadOrders}
            refreshing={refreshing}
        >
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                {/* Header Controls */}
                <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 justify-between bg-gray-50/50">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Scan or type barcode, patient name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        {['All', 'Pending', 'Processing', 'Completed'].map(status => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filterStatus === status
                                        ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                                    }`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Barcode / Order ID</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Patient Name</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Test Type</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Date / Time</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 font-bold text-xs right-align">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filteredOrders.length > 0 ? filteredOrders.map((order) => (
                                <tr key={order.order_id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <span className="font-mono text-xs font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded inline-flex items-center gap-1">
                                            {order.order_id}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-900">{order.patient_name}</td>
                                    <td className="px-6 py-4 text-gray-600 font-medium">{order.test_type}</td>
                                    <td className="px-6 py-4 text-gray-500 text-xs">
                                        {new Date(order.created_at).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide ${getStatusStyle(order.status)}`}>
                                            {order.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Link
                                            href={`/lab/sample/${order.order_id}`}
                                            className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 font-bold text-xs bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                            Process Sample
                                            <ChevronRight className="h-3 w-3" />
                                        </Link>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                        <FlaskConical className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                                        <p className="font-medium">No lab orders found matching your criteria</p>
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
