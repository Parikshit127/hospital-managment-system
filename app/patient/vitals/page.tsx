'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Activity, Heart, Thermometer, Droplet, Wind } from 'lucide-react';
import { getPatientRecords } from '@/app/actions/patient-actions';

export default function VitalsPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        setLoading(true);
        const res = await getPatientRecords();
        if (res.success) setData(res.data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    if (loading) return <AppShell pageTitle="Loading"><div className="p-10 text-center text-gray-500 font-medium">Loading vitals...</div></AppShell>;

    // Sort and get latest
    const vitals = data?.vitals || [];
    const latest = vitals.length > 0 ? vitals[0] : null;

    return (
        <AppShell
            pageTitle="My Vitals History"
            pageIcon={<Activity className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="max-w-5xl mx-auto space-y-8">

                {latest ? (
                    <>
                        <div className="flex border-b border-gray-200 pb-2 items-end justify-between">
                            <h2 className="text-xl font-black text-gray-900">Latest Reading</h2>
                            <p className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-lg tracking-wider uppercase">Recorded: {new Date(latest.recorded_at).toLocaleString()}</p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Blood Pressure */}
                            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-5 hover:shadow-md transition-shadow">
                                <div className="h-10 w-10 bg-rose-100 rounded-full flex items-center justify-center mb-4">
                                    <Heart className="h-5 w-5 text-rose-600" />
                                </div>
                                <p className="text-xs uppercase tracking-widest font-bold text-rose-400 mb-1">Blood Pressure</p>
                                <p className="text-2xl font-black text-rose-900">{latest.blood_pressure || '--'}</p>
                                <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase">mmHg</p>
                            </div>

                            {/* Heart Rate */}
                            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 hover:shadow-md transition-shadow">
                                <div className="h-10 w-10 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                                    <Activity className="h-5 w-5 text-orange-600" />
                                </div>
                                <p className="text-xs uppercase tracking-widest font-bold text-orange-400 mb-1">Heart Rate</p>
                                <p className="text-2xl font-black text-orange-900">{latest.heart_rate || '--'}</p>
                                <p className="text-[10px] font-bold text-orange-500 mt-1 uppercase">BPM</p>
                            </div>

                            {/* Temperature */}
                            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 hover:shadow-md transition-shadow">
                                <div className="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                                    <Thermometer className="h-5 w-5 text-amber-600" />
                                </div>
                                <p className="text-xs uppercase tracking-widest font-bold text-amber-400 mb-1">Temperature</p>
                                <p className="text-2xl font-black text-amber-900">{latest.temperature || '--'}</p>
                                <p className="text-[10px] font-bold text-amber-500 mt-1 uppercase">°F</p>
                            </div>

                            {/* SpO2 */}
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

                {/* Historical Table */}
                {vitals.length > 1 && (
                    <div className="mt-12 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-gray-200 bg-gray-50">
                            <h3 className="font-bold text-gray-900 uppercase tracking-widest text-xs">Historical Readings</h3>
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
                                    {vitals.slice(1).map((v: any, idx: number) => (
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
        </AppShell>
    );
}
