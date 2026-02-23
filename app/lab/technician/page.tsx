'use client';

import React, { useState, useEffect } from 'react';
import {
    Microscope, Search, Clock, AlertTriangle, CheckCircle,
    FileText, Upload, X, Send, Cloud, LogOut, RefreshCw, Loader2,
    HeartPulse, Activity, FlaskConical, Zap
} from 'lucide-react';
import { getLabOrders, getLabStats, uploadResult } from '@/app/actions/lab-actions';
import Link from 'next/link';

type LabOrder = {
    order_id: string;
    patient_name: string;
    test_type: string;
    doctor_name: string;
    status: string;
    result_value?: string;
    created_at: Date;
    barcode?: string;
};

export default function LabPage() {
    const [orders, setOrders] = useState<LabOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'Pending' | 'Completed'>('Pending');
    const [stats, setStats] = useState({ pendingCount: 0, completedToday: 0 });

    // Modal State
    const [selectedOrder, setSelectedOrder] = useState<LabOrder | null>(null);
    const [resultValue, setResultValue] = useState('');
    const [remarks, setRemarks] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch Data
    const loadData = async () => {
        setLoading(true);
        const [ordersRes, statsRes] = await Promise.all([
            getLabOrders(activeTab),
            getLabStats()
        ]);

        if (ordersRes.success) setOrders(ordersRes.data as any);
        if (statsRes.success) setStats(statsRes as any);
        setLoading(false);
    };

    useEffect(() => {
        loadData();
    }, [activeTab]);

    const handleOpenUpload = (order: LabOrder) => {
        setSelectedOrder(order);
        setResultValue('');
        setRemarks('');
    };

    const handleSubmitResult = async () => {
        if (!selectedOrder) return;
        setIsSubmitting(true);
        try {
            const res = await uploadResult(selectedOrder.order_id, resultValue || 'Result File Uploaded', remarks);
            if (res.success) {
                setSelectedOrder(null);
                loadData();
            } else {
                alert('Error: ' + res.error);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            'Pending': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
            'Processing': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
            'Completed': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
            'Cancelled': 'bg-rose-500/10 text-rose-400 border-rose-500/20'
        };
        const colorClass = styles[status] || 'bg-white/5 text-white/50 border-white/10';
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.1em] border ${colorClass}`}>
                {status}
            </span>
        );
    };

    return (
        <div className="min-h-screen bg-[#0B0F1A] text-white font-sans relative overflow-hidden">
            {/* Animated background effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/3 -left-32 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s' }} />
                <div className="absolute bottom-1/3 -right-32 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '7s' }} />
                <div className="absolute inset-0" style={{
                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.02) 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }} />
            </div>

            {/* Header */}
            <header className="bg-[#0F1425]/90 backdrop-blur-xl border-b border-white/5 px-6 py-3 sticky top-0 z-50">
                <div className="max-w-[1400px] mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-teal-400 to-emerald-600 rounded-xl blur-md opacity-50" />
                            <div className="relative bg-gradient-to-br from-teal-400 to-emerald-600 p-2 rounded-xl shadow-lg shadow-teal-500/20">
                                <HeartPulse className="h-5 w-5 text-white" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                                Avani Hospital OS
                            </h1>
                            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-[0.2em]">
                                Laboratory
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden md:flex items-center gap-3 px-4 py-1.5 bg-white/5 rounded-xl border border-white/5">
                            <div className="h-7 w-7 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-[10px] ring-2 ring-white/10">
                                LT
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-white/60">Technician</span>
                                <span className="text-[10px] text-white/25 font-medium">Lab Operations</span>
                            </div>
                        </div>
                        <Link href="/login" className="flex items-center gap-2 text-xs font-bold text-rose-400 hover:text-rose-300 px-3 py-2 rounded-lg hover:bg-rose-500/10 transition-all">
                            <LogOut className="h-3.5 w-3.5" /> Logout
                        </Link>
                    </div>
                </div>
            </header>

            <main className="relative z-10 max-w-[1400px] mx-auto px-6 py-8">

                {/* Title & Actions */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                    <div>
                        <h2 className="text-3xl font-black tracking-tight">Worklist Dashboard</h2>
                        <p className="text-white/40 mt-1 font-medium">Manage test orders and processing queue</p>
                    </div>
                    <button
                        onClick={() => loadData()}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white/60 hover:text-white transition-all"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Data
                    </button>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="group relative bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl p-5 border border-white/5 hover:border-amber-500/30 transition-all overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all" />
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Pending Orders</span>
                            <div className="p-1.5 bg-amber-500/10 rounded-lg">
                                <Clock className="h-3.5 w-3.5 text-amber-400" />
                            </div>
                        </div>
                        <p className="text-3xl font-black text-white tracking-tight">{stats.pendingCount}</p>
                        <div className="flex items-center gap-1 mt-2 text-xs font-bold text-amber-400">
                            <AlertTriangle className="h-3 w-3" /> Requires Attention
                        </div>
                    </div>

                    <div className="group relative bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl p-5 border border-white/5 hover:border-emerald-500/30 transition-all overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all" />
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Completed Today</span>
                            <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                            </div>
                        </div>
                        <p className="text-3xl font-black text-white tracking-tight">{stats.completedToday}</p>
                        <div className="flex items-center gap-1 mt-2 text-xs font-bold text-emerald-400">
                            <Activity className="h-3 w-3" /> Processed
                        </div>
                    </div>

                    <div className="group relative bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl p-5 border border-white/5 hover:border-rose-500/20 transition-all overflow-hidden opacity-60">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl" />
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Urgent Requests</span>
                            <div className="p-1.5 bg-rose-500/10 rounded-lg">
                                <Zap className="h-3.5 w-3.5 text-rose-400" />
                            </div>
                        </div>
                        <p className="text-3xl font-black text-white/40 tracking-tight">0</p>
                        <div className="flex items-center gap-1 mt-2 text-xs font-bold text-white/30">
                            <CheckCircle className="h-3 w-3" /> Normal Load
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl border border-white/5 p-1.5 flex items-center justify-between mb-6">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setActiveTab('Pending')}
                            className={`px-5 py-2.5 text-sm font-bold rounded-xl transition-all flex items-center gap-2 ${activeTab === 'Pending' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60 hover:bg-white/5'}`}
                        >
                            <Clock className="h-4 w-4" /> Pending
                        </button>
                        <button
                            onClick={() => setActiveTab('Completed')}
                            className={`px-5 py-2.5 text-sm font-bold rounded-xl transition-all flex items-center gap-2 ${activeTab === 'Completed' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60 hover:bg-white/5'}`}
                        >
                            <CheckCircle className="h-4 w-4" /> Completed
                        </button>
                    </div>
                    <div className="relative hidden md:block mr-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 h-4 w-4" />
                        <input className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 w-64 outline-none transition-all placeholder:text-white/20 font-medium text-white" placeholder="Search orders..." />
                    </div>
                </div>

                {/* Table */}
                <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl border border-white/5 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b border-white/5">
                                <tr>
                                    {['Order ID', 'Patient Name', 'Test Type', 'Status', ...(activeTab === 'Completed' ? ['Result'] : []), 'Action'].map((head) => (
                                        <th key={head} className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 first:pl-8 last:pr-8 last:text-right">
                                            {head}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {loading ? (
                                    <tr><td colSpan={6} className="text-center py-16 text-white/30 font-medium">
                                        <div className="flex items-center justify-center gap-3">
                                            <Loader2 className="h-5 w-5 animate-spin text-teal-400" />
                                            Fetching orders...
                                        </div>
                                    </td></tr>
                                ) : orders.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-20">
                                            <div className="flex flex-col items-center justify-center">
                                                <div className="h-16 w-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4">
                                                    <FlaskConical className="h-8 w-8 text-white/15" />
                                                </div>
                                                <p className="text-white/30 font-bold">No {activeTab.toLowerCase()} orders found</p>
                                                <p className="text-white/15 text-xs mt-1">Orders will appear here when created</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    orders.map((order) => (
                                        <tr key={order.order_id} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-6 py-5 pl-8 text-sm font-bold text-white/70 font-mono">#{String(order.order_id).slice(0, 8)}</td>
                                            <td className="px-6 py-5">
                                                <div className="font-bold text-white/80">{order.patient_name}</div>
                                                <div className="text-[10px] text-white/25 font-medium">{new Date(order.created_at).toLocaleDateString()}</div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <span className="bg-white/5 text-white/50 px-3 py-1 rounded-lg text-xs font-bold border border-white/10">{order.test_type}</span>
                                            </td>
                                            <td className="px-6 py-5">{getStatusBadge(order.status)}</td>
                                            {activeTab === 'Completed' && (
                                                <td className="px-6 py-5 text-sm text-white/50 font-mono font-medium">{order.result_value || '-'}</td>
                                            )}
                                            <td className="px-6 py-5 pr-8 text-right">
                                                {activeTab === 'Pending' ? (
                                                    <button
                                                        onClick={() => handleOpenUpload(order)}
                                                        className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white rounded-xl text-xs font-bold hover:from-teal-400 hover:to-emerald-500 transition-all shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30 hover:-translate-y-0.5"
                                                    >
                                                        <Upload className="h-3.5 w-3.5" /> Process Order
                                                    </button>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 text-white/25 rounded-lg text-xs font-bold border border-white/5">
                                                        <CheckCircle className="h-3.5 w-3.5" /> Archived
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </main>

            {/* Upload Modal */}
            {selectedOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-md">
                    <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] w-full max-w-lg rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
                        {/* Gradient top */}
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-teal-400 via-emerald-500 to-teal-400" />

                        <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-teal-500/10 rounded-lg">
                                    <Cloud className="h-5 w-5 text-teal-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-white leading-none">Upload Results</h3>
                                    <p className="text-[10px] font-bold text-white/25 mt-1">Order #{String(selectedOrder.order_id).slice(0, 8)}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedOrder(null)} className="text-white/30 hover:text-white/60 transition-colors bg-white/5 rounded-full p-2 hover:bg-white/10 border border-white/5">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="bg-violet-500/5 rounded-2xl p-5 border border-violet-500/10 flex items-center justify-between relative overflow-hidden">
                                <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-violet-400 to-indigo-500" />
                                <div className="pl-2">
                                    <p className="text-[10px] font-black text-violet-400/60 uppercase tracking-[0.15em] mb-1">Patient</p>
                                    <p className="text-sm font-bold text-white/90">{selectedOrder.patient_name}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-violet-400/60 uppercase tracking-[0.15em] mb-1">Test Requested</p>
                                    <p className="text-sm font-bold text-teal-400">{selectedOrder.test_type}</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-white/30 uppercase tracking-[0.15em] mb-2 ml-1">Result Value / File</label>
                                <div className="relative group">
                                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-teal-400 transition-colors h-4 w-4" />
                                    <input
                                        value={resultValue}
                                        onChange={(e) => setResultValue(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-bold text-white transition-all placeholder:text-white/15"
                                        placeholder="Enter numeric result (e.g. 12.5 g/dL)"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-white/30 uppercase tracking-[0.15em] mb-2 ml-1">Technician Remarks</label>
                                <textarea
                                    value={remarks}
                                    onChange={(e) => setRemarks(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none resize-none transition-all font-medium text-white placeholder:text-white/15"
                                    placeholder="Add clinical observations or notes..."
                                    rows={3}
                                ></textarea>
                            </div>
                        </div>

                        <div className="px-6 py-5 bg-white/[0.02] flex gap-3 justify-end border-t border-white/5">
                            <button onClick={() => setSelectedOrder(null)} className="px-6 py-3 text-sm font-bold text-white/40 hover:text-white/70 transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmitResult}
                                disabled={isSubmitting}
                                className="px-8 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl hover:from-teal-400 hover:to-emerald-500 shadow-xl shadow-teal-500/20 flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed active:scale-95 transition-all"
                            >
                                {isSubmitting ? (
                                    <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
                                ) : (
                                    <><Send className="h-4 w-4" /> Finalize Results</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Footer */}
            <footer className="relative z-10 mt-8 border-t border-white/5 py-6 px-6">
                <div className="max-w-[1400px] mx-auto flex items-center justify-between">
                    <p className="text-[10px] font-bold text-white/15 uppercase tracking-wider">
                        Avani Hospital OS · Laboratory Module · v2.0
                    </p>
                    <p className="text-[10px] font-medium text-white/15">
                        🔒 Encrypted · HIPAA-compliant
                    </p>
                </div>
            </footer>
        </div>
    );
}
