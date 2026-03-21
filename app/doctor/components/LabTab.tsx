'use client';

import React from 'react';
import { FlaskConical, Loader2, RefreshCw } from 'lucide-react';

const inputCls = "w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400";

interface LabTabProps {
    labOrders: any[];
    selectedTest: string;
    setSelectedTest: (v: string) => void;
    loadingLabs: boolean;
    isSubmitting: boolean;
    onOrderLab: () => void;
    onRefresh: () => void;
}

export function LabTab({ labOrders, selectedTest, setSelectedTest, loadingLabs, isSubmitting, onOrderLab, onRefresh }: LabTabProps) {
    return (
        <div className="max-w-3xl space-y-8">
            <div className="bg-violet-500/5 p-6 rounded-2xl border border-violet-500/10">
                <h3 className="font-black text-violet-300 mb-4 flex items-center gap-2"><FlaskConical className="h-5 w-5 text-violet-400" /> Order New Test</h3>
                <div className="flex gap-4">
                    <select value={selectedTest} onChange={e => setSelectedTest(e.target.value)} className={`flex-1 ${inputCls}`}>
                        <option value="" className="bg-white text-gray-900">Select Test Type...</option>
                        <option value="Complete Blood Count (CBC)" className="bg-white text-gray-900">Complete Blood Count (CBC)</option>
                        <option value="Lipid Profile" className="bg-white text-gray-900">Lipid Profile</option>
                        <option value="Dengue NS1 Antigen" className="bg-white text-gray-900">Dengue NS1 Antigen</option>
                        <option value="Liver Function Test" className="bg-white text-gray-900">Liver Function Test</option>
                        <option value="Kidney Function Test" className="bg-white text-gray-900">Kidney Function Test</option>
                        <option value="Thyroid Profile (T3/T4/TSH)" className="bg-white text-gray-900">Thyroid Profile</option>
                        <option value="HbA1c" className="bg-white text-gray-900">HbA1c</option>
                        <option value="Chest X-Ray" className="bg-white text-gray-900">Chest X-Ray</option>
                    </select>
                    <button onClick={onOrderLab} disabled={!selectedTest || isSubmitting} className="px-6 py-2 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-bold rounded-xl hover:from-violet-400 hover:to-indigo-500 disabled:opacity-50 shadow-lg shadow-violet-500/20 flex items-center gap-2">
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Order Test'}
                    </button>
                </div>
            </div>
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-gray-700 text-lg">Lab History</h3>
                    <button onClick={onRefresh} className="text-teal-400 hover:bg-teal-500/10 p-2 rounded-lg transition-colors"><RefreshCw className={`h-4 w-4 ${loadingLabs ? 'animate-spin' : ''}`} /></button>
                </div>
                <div className="space-y-3">
                    {labOrders.length === 0 ? <div className="bg-gray-100 border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm font-bold">No lab orders found.</div> : labOrders.map(order => (
                        <div key={order.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 p-4 rounded-xl hover:border-teal-500/20 transition-all">
                            <div className="flex items-center gap-4">
                                <div className={`h-3 w-3 rounded-full ${order.status === 'Completed' ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-amber-500 shadow-amber-500/30'} shadow-sm`} />
                                <div><p className="font-bold text-gray-700">{order.test_type}</p><p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">{order.barcode && <span className="font-mono bg-gray-100 px-1 rounded border border-gray-200">#{order.barcode}</span>}<span className="text-gray-200">&bull;</span>{new Date(order.created_at).toLocaleDateString()}</p></div>
                            </div>
                            <div className="text-right">
                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide border ${order.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{order.status}</span>
                                {order.result_value && <p className="text-xs text-gray-500 mt-1 font-mono bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200 inline-block">{order.result_value}</p>}
                                {order.technician_remarks && <p className="text-xs text-gray-400 mt-1 italic">{order.technician_remarks}</p>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
