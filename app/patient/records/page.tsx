'use client';

import React, { useEffect, useState } from 'react';
import {
    FileText, FlaskConical, Stethoscope, Search, RefreshCw,
    Download, Bed, Plus, X, Trash2, Upload, ExternalLink, ChevronDown, ChevronUp
} from 'lucide-react';
import { getPatientRecords, getPatientIPDHistory, getExternalRecords, saveExternalRecord, deleteExternalRecord } from '@/app/actions/patient-actions';

export default function MedicalRecordsPage() {
    const [data, setData] = useState<any>(null);
    const [ipdAdmissions, setIpdAdmissions] = useState<any[]>([]);
    const [externalRecords, setExternalRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [expandedAdmission, setExpandedAdmission] = useState<string | null>(null);

    // Upload modal
    const [showUpload, setShowUpload] = useState(false);
    const [form, setForm] = useState({ title: '', description: '', hospital_name: '', record_date: '', file_url: '', file_name: '' });
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    const loadData = async () => {
        setLoading(true);
        const [recRes, ipdRes, extRes] = await Promise.all([
            getPatientRecords(),
            getPatientIPDHistory(),
            getExternalRecords(),
        ]);
        if (recRes.success) setData(recRes.data);
        if (ipdRes.success) setIpdAdmissions(ipdRes.data || []);
        if (extRes.success) setExternalRecords(extRes.data || []);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const fd = new FormData();
        fd.append('file', file);
        try {
            const res = await fetch('/api/upload/patient-record', { method: 'POST', body: fd });
            const json = await res.json();
            if (json.url) {
                setForm(f => ({ ...f, file_url: json.url, file_name: file.name }));
            }
        } catch {
            alert('Upload failed');
        }
        setUploading(false);
    };

    const handleSave = async () => {
        if (!form.title.trim()) return alert('Title is required');
        setSaving(true);
        const res = await saveExternalRecord(form);
        if (res.success) {
            setShowUpload(false);
            setForm({ title: '', description: '', hospital_name: '', record_date: '', file_url: '', file_name: '' });
            loadData();
        } else {
            alert(res.error);
        }
        setSaving(false);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this record?')) return;
        await deleteExternalRecord(id);
        loadData();
    };

    const fmtDate = (v?: string | null) => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

    if (loading) return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="animate-pulse space-y-6">
                <div className="h-6 w-48 bg-gray-200 rounded-lg" />
                <div className="grid grid-cols-2 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-32 bg-gray-200 rounded-2xl" />)}</div>
            </div>
        </div>
    );

    const filteredLabs = (data?.labs || []).filter((lab: any) => !search || (lab.test_type || '').toLowerCase().includes(search.toLowerCase()));
    const filteredDiagnoses = (data?.diagnoses || []).filter((d: any) => !search || (d.diagnosis || '').toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10 pb-20">
            <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                        <FileText className="h-6 w-6 text-emerald-500" /> Medical Records
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Your complete health history.</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input type="text" placeholder="Search records..." value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none" />
                    </div>
                    <button onClick={loadData} className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-400 border border-gray-200">
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* IPD History */}
            {ipdAdmissions.length > 0 && (
                <section>
                    <div className="flex items-center gap-3 mb-4 border-b border-gray-200 pb-2">
                        <div className="p-2 bg-rose-50 text-rose-600 rounded-xl"><Bed className="h-5 w-5" /></div>
                        <h3 className="text-xl font-black text-gray-900">IPD Admissions</h3>
                    </div>
                    <div className="space-y-3">
                        {ipdAdmissions.map((adm: any) => {
                            const isOpen = expandedAdmission === adm.admission_id;
                            const days = Math.max(1, Math.ceil((new Date(adm.discharge_date || Date.now()).getTime() - new Date(adm.admission_date).getTime()) / (1000 * 60 * 60 * 24)));
                            return (
                                <div key={adm.admission_id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                    <button onClick={() => setExpandedAdmission(isOpen ? null : adm.admission_id)}
                                        className="w-full text-left p-4 flex items-center justify-between hover:bg-gray-50">
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-gray-900">{adm.diagnosis || 'No diagnosis'}</span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${adm.status === 'Admitted' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                                    {adm.status}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {fmtDate(adm.admission_date)} — {adm.discharge_date ? fmtDate(adm.discharge_date) : 'Ongoing'} &bull; {days} day{days > 1 ? 's' : ''} &bull; {adm.ward?.ward_name || 'N/A'} &bull; Dr. {adm.doctor_name || 'N/A'}
                                            </p>
                                        </div>
                                        {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
                                    </button>
                                    {isOpen && (
                                        <div className="border-t border-gray-100 p-4 space-y-4">
                                            {adm.medical_notes?.length > 0 && (
                                                <div>
                                                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">Medical Notes</p>
                                                    {adm.medical_notes.map((n: any, i: number) => (
                                                        <div key={i} className="bg-gray-50 rounded-xl p-3 mb-2 text-sm text-gray-700">
                                                            <span className="text-[10px] font-bold text-teal-600 uppercase">{n.note_type}</span>
                                                            <p className="mt-1">{n.details}</p>
                                                            <p className="text-[10px] text-gray-400 mt-1">{fmtDate(n.created_at)}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {adm.ward_rounds?.length > 0 && (
                                                <div>
                                                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">Ward Rounds</p>
                                                    {adm.ward_rounds.map((wr: any, i: number) => (
                                                        <div key={i} className="bg-gray-50 rounded-xl p-3 mb-2 text-sm text-gray-700">
                                                            <p className="font-semibold">{wr.observations || 'No observations'}</p>
                                                            <p className="text-xs text-gray-400 mt-1">{fmtDate(wr.created_at)} &bull; Dr. {wr.doctor_name || 'N/A'}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {adm.summaries?.length > 0 && (
                                                <div>
                                                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">Discharge Summary</p>
                                                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-sm text-gray-700"
                                                        dangerouslySetInnerHTML={{ __html: adm.summaries[0]?.generated_summary || '' }} />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Lab Results */}
            <section>
                <div className="flex items-center gap-3 mb-4 border-b border-gray-200 pb-2">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><FlaskConical className="h-5 w-5" /></div>
                    <h3 className="text-xl font-black text-gray-900">Lab Results</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredLabs.length > 0 ? filteredLabs.map((lab: any) => (
                        <div key={lab.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                            <div className="flex justify-between items-start mb-3">
                                <h4 className="font-bold text-gray-900">{lab.test_type}</h4>
                                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{fmtDate(lab.created_at)}</span>
                            </div>
                            <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 mb-3">
                                <p className="text-xs font-bold text-gray-500 uppercase mb-1">Result</p>
                                <p className="text-lg font-black text-blue-800">{lab.result_value || 'Pending'}</p>
                            </div>
                            {lab.barcode && lab.status === 'Completed' && (
                                <a href={`/api/reports/lab/pdf?barcode=${lab.barcode}`} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
                                    <Download className="h-3.5 w-3.5" /> View Report
                                </a>
                            )}
                        </div>
                    )) : (
                        <p className="text-gray-500 p-4 border border-dashed rounded-xl text-center text-sm col-span-2">No lab records on file.</p>
                    )}
                </div>
            </section>

            {/* Clinical Summaries */}
            <section>
                <div className="flex items-center gap-3 mb-4 border-b border-gray-200 pb-2">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Stethoscope className="h-5 w-5" /></div>
                    <h3 className="text-xl font-black text-gray-900">Clinical Summaries</h3>
                </div>
                <div className="space-y-4">
                    {filteredDiagnoses.length > 0 ? filteredDiagnoses.map((diag: any) => (
                        <div key={diag.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                            <div className="flex justify-between items-center mb-2">
                                <p className="text-xs font-bold text-gray-400 uppercase">{fmtDate(diag.created_at)}</p>
                                {diag.doctor_name && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Dr. {diag.doctor_name}</span>}
                            </div>
                            {diag.diagnosis && <p className="font-bold text-gray-900 mb-2">Diagnosis: {diag.diagnosis}</p>}
                            {diag.doctor_notes && (
                                <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 p-4 rounded-xl border border-gray-100 leading-relaxed">
                                    {diag.doctor_notes}
                                </pre>
                            )}
                        </div>
                    )) : (
                        <p className="text-gray-500 p-4 border border-dashed rounded-xl text-center text-sm">No clinical summaries on file.</p>
                    )}
                </div>
            </section>

            {/* External Records */}
            <section>
                <div className="flex items-center justify-between mb-4 border-b border-gray-200 pb-2">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-violet-50 text-violet-600 rounded-xl"><Upload className="h-5 w-5" /></div>
                        <h3 className="text-xl font-black text-gray-900">External Records</h3>
                    </div>
                    <button onClick={() => setShowUpload(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition">
                        <Plus className="h-4 w-4" /> Add Record
                    </button>
                </div>
                <div className="space-y-3">
                    {externalRecords.length === 0 ? (
                        <div className="p-8 border border-dashed border-gray-300 rounded-2xl text-center text-gray-400 text-sm">
                            No external records yet. Add records from other hospitals, clinics, or previous treatments.
                        </div>
                    ) : externalRecords.map((rec: any) => (
                        <div key={rec.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex items-start justify-between gap-4">
                            <div className="flex-1">
                                <p className="font-bold text-gray-900">{rec.title}</p>
                                {rec.hospital_name && <p className="text-xs text-gray-500 mt-0.5">{rec.hospital_name}</p>}
                                {rec.description && <p className="text-sm text-gray-600 mt-1">{rec.description}</p>}
                                {rec.record_date && <p className="text-xs text-gray-400 mt-1">{fmtDate(rec.record_date)}</p>}
                                {rec.file_url && (
                                    <a href={rec.file_url} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 bg-violet-50 px-3 py-1.5 rounded-lg mt-2">
                                        <ExternalLink className="h-3.5 w-3.5" /> {rec.file_name || 'View File'}
                                    </a>
                                )}
                            </div>
                            <button onClick={() => handleDelete(rec.id)} className="text-gray-300 hover:text-red-500 transition p-1">
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            {/* Upload Modal */}
            {showUpload && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-gray-900">Add External Record</h3>
                            <button onClick={() => setShowUpload(false)}><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Title *</label>
                                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder="e.g. Blood Report - Apollo Hospital"
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-500" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Hospital / Clinic Name</label>
                                <input type="text" value={form.hospital_name} onChange={e => setForm(f => ({ ...f, hospital_name: e.target.value }))}
                                    placeholder="e.g. Apollo Hospital"
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-500" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Date</label>
                                <input type="date" value={form.record_date} onChange={e => setForm(f => ({ ...f, record_date: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-500" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Description</label>
                                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    rows={2} placeholder="Brief description..."
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-500 resize-none" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Upload File (Image / PDF)</label>
                                <input type="file" accept="image/*,.pdf" onChange={handleFileUpload}
                                    className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-violet-50 file:text-violet-700 file:font-bold" />
                                {uploading && <p className="text-xs text-violet-500 mt-1">Uploading...</p>}
                                {form.file_name && <p className="text-xs text-emerald-600 mt-1">✓ {form.file_name}</p>}
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setShowUpload(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-500">Cancel</button>
                            <button onClick={handleSave} disabled={saving || !form.title.trim()}
                                className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">
                                {saving ? 'Saving...' : 'Save Record'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
