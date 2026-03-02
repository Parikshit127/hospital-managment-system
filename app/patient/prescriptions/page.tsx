'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Pill, Activity, Printer, Info } from 'lucide-react';
import { getPatientDashboardData } from '@/app/actions/patient-actions';

export default function PrescriptionsPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        setLoading(true);
        const res = await getPatientDashboardData();
        if (res.success) setData(res.data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    if (loading) return <AppShell pageTitle="Loading"><div className="p-10 text-center text-gray-500 font-medium">Fetching medication history...</div></AppShell>;
    if (!data) return <AppShell pageTitle="Error"><div className="p-10 text-center text-red-500 font-bold">Failed to load prescriptions.</div></AppShell>;

    return (
        <AppShell
            pageTitle="Active Prescriptions"
            pageIcon={<Pill className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="max-w-5xl mx-auto space-y-6">
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-start gap-4 shadow-sm">
                    <Info className="h-6 w-6 text-indigo-600 shrink-0 mt-0.5" />
                    <p className="text-sm font-medium text-indigo-900">Always consult your doctor before modifying your medication regime. If you experience adverse side effects, contact the hospital immediately.</p>
                </div>

                <div className="grid gap-6">
                    {data.activePrescriptions?.length > 0 ? data.activePrescriptions.map((px: any) => {
                        let meds = [];
                        try {
                            meds = JSON.parse(px.medications_json);
                        } catch (e) { }

                        return (
                            <div key={px.prescription_id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:border-purple-300 transition-colors group">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-50/80 p-5 border-b border-gray-100">
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="bg-purple-100 text-purple-700 font-bold text-xs px-2 py-1 rounded-md uppercase tracking-wider">{px.prescription_id}</span>
                                            <p className="text-sm font-black text-gray-900">{new Date(px.prescription_date).toLocaleDateString()}</p>
                                        </div>
                                        <p className="text-xs font-bold text-gray-500 uppercase">Dr. ID: {px.doctor_id}</p>
                                    </div>
                                    <button className="mt-4 md:mt-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-200 text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-sm">
                                        <Printer className="h-4 w-4" /> Print RX
                                    </button>
                                </div>
                                <div className="p-5 overflow-x-auto">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead>
                                            <tr className="text-xs uppercase font-bold text-gray-400 border-b border-gray-100">
                                                <th className="pb-3 pr-4">Medication</th>
                                                <th className="pb-3 px-4">Dosage</th>
                                                <th className="pb-3 px-4">Frequency</th>
                                                <th className="pb-3 pl-4">Duration</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {meds.map((m: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-purple-50/30">
                                                    <td className="py-4 pr-4 font-black text-gray-900 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>{m.name || m.medicine}</td>
                                                    <td className="py-4 px-4 font-bold text-purple-700">{m.dosage}</td>
                                                    <td className="py-4 px-4 font-medium text-gray-600">{m.frequency}</td>
                                                    <td className="py-4 pl-4 font-bold text-gray-800">{m.duration || 'N/A'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {px.notes && (
                                    <div className="px-5 py-4 bg-amber-50/50 border-t border-amber-100">
                                        <p className="text-xs uppercase font-bold text-amber-600 tracking-wider mb-1">Doctor's Notes / Instructions</p>
                                        <p className="text-sm font-medium text-amber-900">{px.notes}</p>
                                    </div>
                                )}
                            </div>
                        );
                    }) : (
                        <div className="col-span-full border-2 border-dashed border-gray-200 rounded-3xl p-16 text-center text-gray-500 bg-gray-50/50">
                            <Pill className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                            <h2 className="text-xl font-black text-gray-900 mb-2">No Active Prescriptions</h2>
                            <p className="text-sm font-medium">You currently do not have any active medication orders on file.</p>
                        </div>
                    )}
                </div>
            </div>
        </AppShell>
    );
}
