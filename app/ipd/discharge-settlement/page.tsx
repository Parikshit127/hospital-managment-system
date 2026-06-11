'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Wallet, Search, Filter, ArrowRight, User, Bed, Clock, Loader2, CircleDollarSign } from 'lucide-react';
import { getIPDAdmissions } from '@/app/actions/ipd-actions';
import Link from 'next/link';

export default function IPDSettlementListPage() {
    const [admissions, setAdmissions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const loadData = async () => {
        setLoading(true);
        const res = await getIPDAdmissions('Admitted');
        if (res.success) setAdmissions(res.data || []);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const filtered = admissions.filter(adm => {
        const nameMatch = (adm.patient?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase());
        const idMatch = (adm.patient_id || '').toLowerCase().includes(searchTerm.toLowerCase());
        const admMatch = (adm.admission_id || '').toLowerCase().includes(searchTerm.toLowerCase());
        return nameMatch || idMatch || admMatch;
    });

    return (
        <AppShell
            pageTitle="IPD Discharge Settlement"
            pageIcon={<Wallet className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="relative w-full md:max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                            <input
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                type="text"
                                placeholder="Search by Patient Name, ID, or Admission ID..."
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors"
                            />
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-400 bg-gray-100 px-4 py-2 rounded-lg">
                            <User className="h-3.5 w-3.5" />
                            {filtered.length} Patients Admitted
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
                        <p className="text-gray-400 font-bold">Fetching admitted patients...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered.map((adm) => (
                            <div key={adm.admission_id} className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-indigo-500/40 transition-all group shadow-sm hover:shadow-md">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-black text-gray-900 leading-tight group-hover:text-indigo-600 transition-colors">
                                            {adm.patient?.full_name}
                                        </h3>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
                                            UHID: {adm.patient_id}
                                        </p>
                                    </div>
                                    <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-md text-[10px] font-black uppercase tracking-tight">
                                        Day {adm.daysAdmitted}
                                    </span>
                                </div>

                                <div className="space-y-3 mb-6">
                                    <div className="flex items-center gap-3 text-xs text-gray-600">
                                        <div className="p-1.5 bg-gray-50 rounded-lg">
                                            <Bed className="h-3.5 w-3.5 text-gray-400" />
                                        </div>
                                        <span className="font-bold">{adm.wardName} — {adm.bed_id}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-600">
                                        <div className="p-1.5 bg-gray-50 rounded-lg">
                                            <Clock className="h-3.5 w-3.5 text-gray-400" />
                                        </div>
                                        <span className="font-medium">Admitted: {new Date(adm.admission_date).toLocaleDateString('en-GB')}</span>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Est. Bill Breakdown</span>
                                        <span className="text-sm font-black text-emerald-600 flex items-center gap-1">
                                            <CircleDollarSign className="h-3.5 w-3.5" />
                                            View Details
                                        </span>
                                    </div>
                                    <Link 
                                        href={`/ipd/discharge-settlement/${adm.admission_id}`}
                                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/20 group-hover:translate-x-1"
                                    >
                                        Settle & Discharge <ArrowRight className="h-3.5 w-3.5" />
                                    </Link>
                                </div>
                            </div>
                        ))}

                        {filtered.length === 0 && (
                            <div className="col-span-full py-20 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                                <Wallet className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-400 font-bold">No admitted patients found matching your search.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
