'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Heart, Thermometer, Wind, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { getPatientRecords } from '@/app/actions/patient-actions';

const PAGE_SIZE = 10;

export default function VitalsPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);

    const loadData = async () => {
        setLoading(true);
        const res = await getPatientRecords();
        if (res.success) setData(res.data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    if (loading) {
        return (
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="animate-pulse space-y-6">
                    <div className="h-6 w-48 bg-gray-200 rounded-lg" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-gray-200 rounded-2xl" />)}
                    </div>
                </div>
            </div>
        );
    }

    const vitals = data?.vitals || [];
    const latest = vitals.length > 0 ? vitals[0] : null;
    const historyVitals = vitals.slice(1);
    const totalPages = Math.ceil(historyVitals.length / PAGE_SIZE);
    const pagedVitals = historyVitals.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                        <Activity className="h-6 w-6 text-emerald-500" /> My Vitals History
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Track your health measurements over time.</p>
                </div>
                <button onClick={loadData} disabled={loading} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition disabled:opacity-50">
                    <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {latest ? (
                <>
                    <div className="flex border-b border-gray-200 pb-2 items-end justify-between">
                        <h3 className="text-lg font-black text-gray-900">Latest Reading</h3>
                        <p className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-lg tracking-wider uppercase">
                            Recorded: {new Date(latest.recorded_at).toLocaleString()}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-5 hover:shadow-md transition-shadow">
                            <div className="h-10 w-10 bg-rose-100 rounded-full flex items-center justify-center mb-4">
                                <Heart className="h-5 w-5 text-rose-600" />
                            </div>
                            <p className="text-xs uppercase tracking-widest font-bold text-rose-400 mb-1">Blood Pressure</p>
                            <p className="text-2xl font-black text-rose-900">{latest.blood_pressure || '--'}</p>
                            <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase">mmHg</p>
                        </div>
                        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 hover:shadow-md transition-shadow">
                            <div className="h-10 w-10 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                                <Activity className="h-5 w-5 text-orange-600" />
                            </div>
                            <p className="text-xs uppercase tracking-widest font-bold text-orange-400 mb-1">Heart Rate</p>
                            <p className="text-2xl font-black text-orange-900">{latest.heart_rate || '--'}</p>
                            <p className="text-[10px] font-bold text-orange-500 mt-1 uppercase">BPM</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 hover:shadow-md transition-shadow">
                            <div className="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                                <Thermometer className="h-5 w-5 text-amber-600" />
                            </div>
                            <p className="text-xs uppercase tracking-widest font-bold text-amber-400 mb-1">Temperature</p>
                            <p className="text-2xl font-black text-amber-900">{latest.temperature || '--'}</p>
                            <p className="text-[10px] font-bold text-amber-500 mt-1 uppercase">°F</p>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 hover:shadow-md transition-shadow">
                            <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                                <Wind className="h-5 w-5 text-blue-600" />
                            </div>
                            <p className="text-xs uppercase tracking-widest font-bold text-blue-400 mb-1">Oxygen (SpO2)</p>
                            <p className="text-2xl font-black text-blue-900">{latest.oxygen_saturation || '--'}</p>
                            <p className="text-[10px] font-bold text-blue-500 mt-1 uppercase">%</p>
                        </div>
                    </div>
                </>
            ) : (
                <div className="border border-dashed border-gray-200 rounded-3xl p-16 text-center text-gray-500 bg-gray-50/50">
                    <Activity className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-lg font-black text-gray-800">No Vitals Recorded</p>
                    <p className="text-sm">We don't have any vital signs on file for you.</p>
                </div>
            )}

            {historyVitals.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                        <h3 className="font-bold text-gray-900 uppercase tracking-widest text-xs">Historical Readings</h3>
                        {totalPages > 1 && (
                            <div className="flex items-center gap-2">
                                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition">
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="text-xs font-bold text-gray-500">{page + 1} / {totalPages}</span>
                                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition">
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-white border-b border-gray-100 text-gray-500 text-xs uppercase">
                                <tr>
                                    <th className="px-6 py-4 font-bold">Date / Time</th>
                                    <th className="px-6 py-4 font-bold text-rose-500">BP</th>
                                    <th className="px-6 py-4 font-bold text-orange-500">HR</th>
                                    <th className="px-6 py-4 font-bold text-amber-500">Temp</th>
                                    <th className="px-6 py-4 font-bold text-blue-500">SpO2</th>
                                    <th className="px-6 py-4 font-bold text-gray-400">Weight</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {pagedVitals.map((v: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 font-bold text-gray-900">{new Date(v.recorded_at).toLocaleString()}</td>
                                        <td className="px-6 py-4 font-bold text-gray-800">{v.blood_pressure || '-'}</td>
                                        <td className="px-6 py-4 font-bold text-gray-800">{v.heart_rate || '-'}</td>
                                        <td className="px-6 py-4 font-bold text-gray-800">{v.temperature || '-'}</td>
                                        <td className="px-6 py-4 font-bold text-gray-800">{v.oxygen_saturation || '-'}</td>
                                        <td className="px-6 py-4 font-medium text-gray-500">{v.weight || '-'} kg</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
