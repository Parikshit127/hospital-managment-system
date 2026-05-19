'use client';

/**
 * Feature 372 — View Orders and their Current Status
 * Shows all orders: appointments, medicine orders, ambulance requests
 */

import React, { useState, useEffect } from 'react';
import { Package, Pill, Ambulance, Calendar, Clock, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';

type Order = {
    id: string; type: 'appointment' | 'medicine' | 'ambulance';
    title: string; subtitle: string; status: string;
    created_at: string; amount?: number;
};

const STATUS_STYLE: Record<string, string> = {
    Pending: 'bg-amber-100 text-amber-700',
    Confirmed: 'bg-blue-100 text-blue-700',
    Processing: 'bg-blue-100 text-blue-700',
    Completed: 'bg-emerald-100 text-emerald-700',
    Cancelled: 'bg-red-100 text-red-700',
    Dispatched: 'bg-purple-100 text-purple-700',
    Delivered: 'bg-emerald-100 text-emerald-700',
    Scheduled: 'bg-indigo-100 text-indigo-700',
    'Checked In': 'bg-orange-100 text-orange-700',
};

const TYPE_ICON = {
    appointment: Calendar,
    medicine: Pill,
    ambulance: Ambulance,
};

const TYPE_COLOR = {
    appointment: 'bg-blue-100 text-blue-600',
    medicine: 'bg-orange-100 text-orange-600',
    ambulance: 'bg-red-100 text-red-600',
};

export default function OrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'appointment' | 'medicine' | 'ambulance'>('all');

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/patient/orders');
            const data = await res.json();
            if (data.success) setOrders(data.orders || []);
        } catch {}
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const filtered = filter === 'all' ? orders : orders.filter(o => o.type === filter);

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-20">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                        <Package className="h-6 w-6 text-indigo-500" /> My Orders
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Track all your orders and appointments</p>
                </div>
                <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition">
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
                {(['all', 'appointment', 'medicine', 'ambulance'] as const).map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {f === 'all' ? 'All Orders' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No orders found</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map(order => {
                        const Icon = TYPE_ICON[order.type];
                        return (
                            <div key={order.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TYPE_COLOR[order.type]}`}>
                                    <Icon className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm text-gray-900">{order.title}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">{order.subtitle}</p>
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[order.status] || 'bg-gray-100 text-gray-600'}`}>
                                            {order.status}
                                        </span>
                                        <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </span>
                                    </div>
                                </div>
                                {order.amount && (
                                    <div className="text-right shrink-0">
                                        <p className="font-black text-gray-900 text-sm">₹{order.amount}</p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
