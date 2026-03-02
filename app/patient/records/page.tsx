'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { FileText, FlaskConical, Activity, Stethoscope } from 'lucide-react';
import { getPatientRecords } from '@/app/actions/patient-actions';

export default function MedicalRecordsPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        setLoading(true);
        const res = await getPatientRecords();
        if (res.success) setData(res.data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    if (loading) return <AppShell pageTitle="Loading"><div className="p-10 text-center text-gray-500 font-medium">Fetching medical records securely...</div></AppShell>;
    if (!data) return <AppShell pageTitle="Error"><div className="p-10 text-center text-red-500 font-bold">Failed to load records.</div></AppShell>;

    return (
        <AppShell
            pageTitle="Medical Records"
            pageIcon={<FileText className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="space-y-10 max-w-5xl mx-auto">
                {/* Lab Results */}
                <section>
                    <div className="flex items-center gap-3 mb-6 border-b border-gray-200 pb-2">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><FlaskConical className="h-6 w-6" /></div>
                        <h2 className="text-xl font-black text-gray-900">Laboratory Results</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {data.labs?.length > 0 ? data.labs.map((lab: any) => (
                            <div key={lab.tracking_id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:border-blue-300 transition-colors">
                                <div className="flex justify-between items-start mb-3">
                                    <h3 className="font-bold text-gray-900">{lab.test?.test_name}</h3>
                                    <span className="text-[10px] uppercase font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded tracking-wider">
                                        {new Date(lab.collected_at || lab.updated_at).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Result / Value</p>
                                    <p className="text-lg font-black text-blue-800">{lab.result_text || 'Pending'}</p>
                                    {lab.test?.normal_range && <p className="text-[10px] text-gray-500 mt-1 uppercase">Ref Range: {lab.test.normal_range}</p>}
                                </div>
                            </div>
                        )) : <p className="text-gray-500 p-4 border border-dashed rounded-xl w-full text-center text-sm font-medium">No verified lab records on file.</p>}
                    </div>
                </section>

                {/* AI Diagnoses & Clinical Summaries */}
                <section>
                    <div className="flex items-center gap-3 mb-6 border-b border-gray-200 pb-2">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Stethoscope className="h-6 w-6" /></div>
                        <h2 className="text-xl font-black text-gray-900">Clinical Summaries</h2>
                    </div>

                    <div className="space-y-4">
                        {data.diagnoses?.length > 0 ? data.diagnoses.map((diag: any) => (
                            <div key={diag.id} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <p className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider">{new Date(diag.generated_at).toLocaleString()}</p>
                                <div className="prose prose-sm prose-emerald max-w-none prose-headings:font-black prose-p:font-medium text-gray-700" dangerouslySetInnerHTML={{ __html: diag.summary_text }} />
                            </div>
                        )) : <p className="text-gray-500 p-4 border border-dashed rounded-xl w-full text-center text-sm font-medium">No clinical summaries on file.</p>}
                    </div>
                </section>

            </div>
        </AppShell>
    );
}
