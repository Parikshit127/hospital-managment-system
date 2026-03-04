'use client';

import React, { useEffect, useState } from 'react';
import { FileText, FlaskConical, Stethoscope, Search, RefreshCw, Download } from 'lucide-react';
import { getPatientRecords } from '@/app/actions/patient-actions';

export default function MedicalRecordsPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

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
                    <div className="grid grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-gray-200 rounded-2xl" />)}
                    </div>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="p-10 text-center text-red-500 font-bold">Failed to load records.</div>
            </div>
        );
    }

    const filteredLabs = (data.labs || []).filter((lab: any) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (lab.test_type || '').toLowerCase().includes(s) || (lab.barcode || '').toLowerCase().includes(s);
    });

    const filteredDiagnoses = (data.diagnoses || []).filter((diag: any) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (diag.diagnosis || '').toLowerCase().includes(s) || (diag.doctor_notes || '').toLowerCase().includes(s);
    });

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                        <FileText className="h-6 w-6 text-emerald-500" /> Medical Records
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Your lab results and clinical summaries.</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search records..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 outline-none transition"
                        />
                    </div>
                    <button onClick={loadData} disabled={loading} className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition border border-gray-200">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Lab Results */}
            <section>
                <div className="flex items-center gap-3 mb-6 border-b border-gray-200 pb-2">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><FlaskConical className="h-6 w-6" /></div>
                    <h3 className="text-xl font-black text-gray-900">Laboratory Results</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredLabs.length > 0 ? filteredLabs.map((lab: any) => (
                        <div key={lab.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:border-blue-300 transition-colors">
                            <div className="flex justify-between items-start mb-3">
                                <h4 className="font-bold text-gray-900">{lab.test_type}</h4>
                                <span className="text-[10px] uppercase font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded tracking-wider">
                                    {new Date(lab.created_at).toLocaleDateString()}
                                </span>
                            </div>
                            <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 mb-3">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Result / Value</p>
                                <p className="text-lg font-black text-blue-800">{lab.result_value || 'Pending'}</p>
                            </div>
                            {lab.barcode && lab.status === 'Completed' && (
                                <a
                                    href={`/api/reports/lab/pdf?barcode=${lab.barcode}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition"
                                >
                                    <Download className="h-3.5 w-3.5" /> View Report
                                </a>
                            )}
                        </div>
                    )) : (
                        <p className="text-gray-500 p-4 border border-dashed rounded-xl w-full text-center text-sm font-medium col-span-2">
                            {search ? 'No lab records match your search.' : 'No lab records on file.'}
                        </p>
                    )}
                </div>
            </section>

            {/* Clinical Summaries */}
            <section>
                <div className="flex items-center gap-3 mb-6 border-b border-gray-200 pb-2">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Stethoscope className="h-6 w-6" /></div>
                    <h3 className="text-xl font-black text-gray-900">Clinical Summaries</h3>
                </div>

                <div className="space-y-4">
                    {filteredDiagnoses.length > 0 ? filteredDiagnoses.map((diag: any) => (
                        <div key={diag.id || diag.appointment_id} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <div className="flex justify-between items-center mb-3">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    {new Date(diag.created_at).toLocaleString()}
                                </p>
                                {diag.doctor_name && (
                                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                                        Dr. {diag.doctor_name}
                                    </span>
                                )}
                            </div>
                            {diag.diagnosis && (
                                <p className="font-bold text-gray-900 mb-2">Diagnosis: {diag.diagnosis}</p>
                            )}
                            {diag.doctor_notes && (
                                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-medium bg-gray-50 p-4 rounded-xl border border-gray-100 leading-relaxed">
                                    {diag.doctor_notes}
                                </pre>
                            )}
                        </div>
                    )) : (
                        <p className="text-gray-500 p-4 border border-dashed rounded-xl text-center text-sm font-medium">
                            {search ? 'No clinical summaries match your search.' : 'No clinical summaries on file.'}
                        </p>
                    )}
                </div>
            </section>
        </div>
    );
}
