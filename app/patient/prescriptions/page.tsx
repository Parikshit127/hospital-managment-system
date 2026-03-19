'use client';

import React from 'react';
import { Pill, Info, Printer, RefreshCw } from 'lucide-react';
import { usePatientDashboard } from '@/app/lib/hooks/usePatientData';
import { usePullToRefresh } from '@/app/lib/hooks/usePullToRefresh';

export default function PrescriptionsPage() {
    const { data, isLoading: loading, isValidating, refresh } = usePatientDashboard();
    const { refreshing } = usePullToRefresh(refresh);
    const prescriptions = data?.activePrescriptions || [];

    if (loading) {
        return (
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="animate-pulse space-y-6">
                    <div className="h-6 w-48 bg-gray-200 rounded-lg" />
                    {[1, 2].map(i => <div key={i} className="h-40 bg-gray-200 rounded-2xl" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            {/* Pull-to-refresh indicator */}
            {refreshing && (
                <div className="flex justify-center py-2">
                    <RefreshCw className="h-5 w-5 animate-spin text-emerald-500" />
                </div>
            )}

            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                        <Pill className="h-6 w-6 text-purple-500" aria-hidden="true" /> Active Prescriptions
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Your medication orders from doctors.</p>
                </div>
                <button onClick={refresh} disabled={isValidating} className="min-h-[44px] min-w-[44px] p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition disabled:opacity-50" aria-label="Refresh prescriptions">
                    <RefreshCw className={`h-5 w-5 ${isValidating ? 'animate-spin' : ''}`} aria-hidden="true" />
                </button>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-start gap-4 shadow-sm">
                <Info className="h-6 w-6 text-indigo-600 shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-indigo-900">Always consult your doctor before modifying your medication regime. If you experience adverse side effects, contact the hospital immediately.</p>
            </div>

            <div className="grid gap-6">
                {prescriptions.length > 0 ? prescriptions.map((px: any) => {
                    const items = px.items || [];

                    return (
                        <div key={px.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:border-purple-300 transition-colors group">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-50/80 p-5 border-b border-gray-100">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="bg-purple-100 text-purple-700 font-bold text-xs px-2 py-1 rounded-md uppercase tracking-wider">Order #{px.id}</span>
                                        <p className="text-sm font-black text-gray-900">{new Date(px.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <p className="text-xs font-bold text-gray-500 uppercase">
                                        {px.doctor_id ? `Dr. ID: ${px.doctor_id}` : 'Doctor prescribed'}
                                        {px.status && <span className={`ml-2 px-2 py-0.5 rounded text-[10px] ${px.status === 'Dispensed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{px.status}</span>}
                                    </p>
                                </div>
                                <button
                                    onClick={() => window.open(`/api/reports/prescription/pdf?orderId=${px.id}`, '_blank')}
                                    className="mt-4 md:mt-0 bg-white border border-gray-200 text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 font-bold px-4 py-2.5 min-h-[44px] rounded-xl text-xs flex items-center gap-2 shadow-sm transition"
                                    aria-label={`Print prescription order ${px.id}`}
                                >
                                    <Printer className="h-4 w-4" aria-hidden="true" /> Print RX
                                </button>
                            </div>
                            <div className="p-5">
                                {items.length > 0 ? (
                                    <>
                                        {/* Desktop table */}
                                        <table className="hidden md:table w-full text-left text-sm whitespace-nowrap">
                                            <thead>
                                                <tr className="text-xs uppercase font-bold text-gray-400 border-b border-gray-100">
                                                    <th scope="col" className="pb-3 pr-4">Medication</th>
                                                    <th scope="col" className="pb-3 px-4">Quantity</th>
                                                    <th scope="col" className="pb-3 px-4">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {items.map((item: any, idx: number) => (
                                                    <tr key={idx} className="hover:bg-purple-50/30">
                                                        <td className="py-4 pr-4 font-black text-gray-900 flex items-center gap-2">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                                            {item.medicine_name}
                                                        </td>
                                                        <td className="py-4 px-4 font-bold text-purple-700">{item.quantity_requested || item.quantity || '-'}</td>
                                                        <td className="py-4 px-4 font-medium text-gray-600">{item.status || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {/* Mobile cards */}
                                        <div className="md:hidden space-y-3">
                                            {items.map((item: any, idx: number) => (
                                                <div key={idx} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                    <p className="font-black text-gray-900 text-sm flex items-center gap-2">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                                                        {item.medicine_name}
                                                    </p>
                                                    <div className="flex items-center gap-4 mt-2 text-xs">
                                                        <span className="font-bold text-purple-700">Qty: {item.quantity_requested || item.quantity || '-'}</span>
                                                        <span className="font-medium text-gray-500">{item.status || '-'}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-sm text-gray-400 text-center py-4">No medication items.</p>
                                )}
                            </div>
                        </div>
                    );
                }) : (
                    <div className="border-2 border-dashed border-gray-200 rounded-3xl p-16 text-center text-gray-500 bg-gray-50/50">
                        <Pill className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                        <h3 className="text-xl font-black text-gray-900 mb-2">No Active Prescriptions</h3>
                        <p className="text-sm font-medium">You currently do not have any medication orders on file.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
