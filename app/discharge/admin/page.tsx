'use client';

import React, { useState, useEffect } from 'react';
import {
    Users, LogOut, TrendingUp, Search, Download,
    FileText, CheckSquare, X, Activity, ChevronLeft, ChevronRight,
    HeartPulse, Bed, Clock, Loader2, CheckCircle, AlertTriangle, Sparkles
} from 'lucide-react';
import { getAdmittedPatients, processDischarge, generateAISummary } from '@/app/actions/discharge-actions';
import Link from 'next/link';

type Patient = {
    id: string;
    admission_id: string;
    patient_name: string;
    doctor: string;
    diagnosis: string;
    days: number;
    status: string;
};

export default function DischargePage() {
    const [patients, setPatients] = useState<Patient[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(true);
    const [checklist, setChecklist] = useState({
        medical: true,
        meds: true,
        billing: false,
        followup: false
    });
    const [aiSummary, setAiSummary] = useState('');
    const [aiLoading, setAiLoading] = useState(false);

    useEffect(() => {
        async function init() {
            const res = await getAdmittedPatients();
            if (res.success) setPatients(res.data);
            setLoading(false);
        }
        init();
    }, []);

    const handleOpenDischarge = (p: Patient) => {
        setSelectedPatient(p);
        setChecklist({ medical: true, meds: true, billing: false, followup: false });
        setNotes('');
        setAiSummary('');
    };

    const handleGenerateAI = async () => {
        if (!selectedPatient?.admission_id) return;
        setAiLoading(true);
        try {
            const res = await generateAISummary(selectedPatient.admission_id);
            if (res.success && res.summary) {
                setAiSummary(res.summary);
            } else {
                alert(res.error || 'Failed to generate AI summary');
            }
        } catch (err) {
            alert('AI summary generation failed');
        }
        setAiLoading(false);
    };

    const handleConfirmDischarge = async () => {
        if (!selectedPatient) return;
        if (!checklist.billing) return alert('Final Bill must be cleared!');

        const fullNotes = aiSummary ? `${aiSummary}\n\n--- Additional Notes ---\n${notes}` : notes;
        await processDischarge(selectedPatient.id, selectedPatient.patient_name, fullNotes);
        alert('Discharge Summary Generated & Sent');
        setSelectedPatient(null);
        setPatients(prev => prev.filter(p => p.id !== selectedPatient.id));
    };

    const readyCount = patients.filter(p => p.status.includes('Ready')).length;

    return (
        <div className="min-h-screen bg-[#0B0F1A] text-white font-sans relative overflow-hidden">
            {/* Animated background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 -left-32 w-96 h-96 bg-rose-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s' }} />
                <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '7s' }} />
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
                            <p className="text-[10px] font-bold text-rose-400 uppercase tracking-[0.2em]">
                                Discharge Hub
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden md:flex items-center gap-2 bg-white/5 rounded-xl px-4 py-2 border border-white/5">
                            <Search className="text-white/20 h-4 w-4" />
                            <input className="bg-transparent border-none focus:ring-0 text-sm w-48 placeholder:text-white/20 p-0 text-white font-medium outline-none" placeholder="Search patient..." />
                        </div>
                        <Link href="/login" className="flex items-center gap-2 text-xs font-bold text-rose-400 hover:text-rose-300 px-3 py-2 rounded-lg hover:bg-rose-500/10 transition-all">
                            <LogOut className="h-3.5 w-3.5" /> Logout
                        </Link>
                    </div>
                </div>
            </header>

            <main className="relative z-10 max-w-[1400px] mx-auto px-6 py-8">

                {/* Title */}
                <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
                    <div>
                        <h2 className="text-3xl font-black tracking-tight">Discharge & Administration</h2>
                        <p className="text-white/40 mt-1 font-medium">Manage patient status and hospital discharge workflows</p>
                    </div>
                    <div className="flex gap-3">
                        <button className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white/60 hover:text-white transition-all flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5" /> Export CSV
                        </button>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="group relative bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl p-5 border border-white/5 hover:border-teal-500/30 transition-all overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-2xl group-hover:bg-teal-500/10 transition-all" />
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Total Admissions</span>
                            <div className="p-1.5 bg-teal-500/10 rounded-lg">
                                <Users className="h-3.5 w-3.5 text-teal-400" />
                            </div>
                        </div>
                        <p className="text-3xl font-black text-white tracking-tight">{patients.length + 120}</p>
                        <div className="flex items-center gap-1 mt-2 text-xs font-bold text-teal-400">
                            <TrendingUp className="h-3 w-3" /> 12% vs last month
                        </div>
                    </div>

                    <div className="group relative bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl p-5 border border-white/5 hover:border-amber-500/30 transition-all overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all" />
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Pending Discharges</span>
                            <div className="p-1.5 bg-amber-500/10 rounded-lg">
                                <Clock className="h-3.5 w-3.5 text-amber-400" />
                            </div>
                        </div>
                        <p className="text-3xl font-black text-white tracking-tight">{readyCount + 14}</p>
                        <div className="flex items-center gap-1 mt-2 text-xs font-bold text-amber-400">
                            <AlertTriangle className="h-3 w-3" /> 5% critical
                        </div>
                    </div>

                    <div className="group relative bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl p-5 border border-white/5 hover:border-emerald-500/30 transition-all overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all" />
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Revenue Today</span>
                            <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                            </div>
                        </div>
                        <p className="text-3xl font-black text-white tracking-tight">₹12,450</p>
                        <div className="flex items-center gap-1 mt-2 text-xs font-bold text-white/30">
                            <Activity className="h-3 w-3" /> Updated 5 mins ago
                        </div>
                    </div>
                </div>

                {/* Patients Table */}
                <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl border border-white/5 overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center">
                        <h3 className="font-black text-white/90 flex items-center gap-2 text-sm">
                            <Bed className="h-4 w-4 text-violet-400" /> Admitted Patients
                        </h3>
                        <span className="text-xs font-bold text-white/25">{patients.length} records</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b border-white/5">
                                <tr>
                                    {['Patient Name', 'Attending Doctor', 'Diagnosis', 'Stay Duration', 'Status', 'Action'].map(h => (
                                        <th key={h} className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 last:text-right">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {loading ? (
                                    <tr><td colSpan={6} className="text-center py-16 text-white/30">
                                        <div className="flex items-center justify-center gap-3">
                                            <Loader2 className="h-5 w-5 animate-spin text-teal-400" /> Loading patients...
                                        </div>
                                    </td></tr>
                                ) : patients.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-20">
                                        <div className="flex flex-col items-center">
                                            <div className="h-16 w-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4">
                                                <Bed className="h-8 w-8 text-white/15" />
                                            </div>
                                            <p className="text-white/30 font-bold">No admitted patients</p>
                                        </div>
                                    </td></tr>
                                ) : patients.map(patient => (
                                    <tr key={patient.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center text-[10px] font-black text-violet-400">
                                                    {patient.patient_name.split(' ').map(n => n[0]).join('')}
                                                </div>
                                                <span className="text-sm font-bold text-white/80">{patient.patient_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-white/50 font-medium">{patient.doctor}</td>
                                        <td className="px-6 py-4 text-sm text-white/50 font-medium">{patient.diagnosis}</td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm font-bold text-white/60 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">{patient.days} Days</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.1em] border ${patient.status === 'Admitted'
                                                ? 'bg-teal-500/10 text-teal-400 border-teal-500/20'
                                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                }`}>
                                                {patient.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center gap-2">
                                                {patient.admission_id && (
                                                    <button
                                                        onClick={() => window.open(`/api/discharge/${patient.admission_id}/pdf`, '_blank')}
                                                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 text-white/60 rounded-xl text-xs font-bold hover:bg-white/10 transition-all"
                                                    >
                                                        <Download className="h-3.5 w-3.5" /> PDF
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleOpenDischarge(patient)}
                                                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white rounded-xl text-xs font-bold hover:from-teal-400 hover:to-emerald-500 transition-all shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30"
                                                >
                                                    <FileText className="h-3.5 w-3.5" /> Process Discharge
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {/* Pagination */}
                    <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between">
                        <p className="text-xs text-white/25 font-medium">Showing {patients.length} of {patients.length + 120} patients</p>
                        <div className="flex gap-2">
                            <button disabled className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/20 disabled:opacity-50">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white/60 transition-all">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>

            </main>

            {/* Discharge Modal */}
            {selectedPatient && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
                    <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] w-full max-w-md rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-teal-400 via-emerald-500 to-teal-400" />

                        <div className="p-6 border-b border-white/5 flex justify-between items-center">
                            <h3 className="text-lg font-black text-white flex items-center gap-2">
                                <CheckSquare className="h-5 w-5 text-teal-400" /> Discharge Checklist
                            </h3>
                            <button onClick={() => setSelectedPatient(null)} className="text-white/30 hover:text-white/60 transition-colors bg-white/5 rounded-full p-2 hover:bg-white/10">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Patient Info */}
                            <div className="bg-white/5 p-4 rounded-xl border border-white/5 flex items-center gap-4">
                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border border-white/10 flex items-center justify-center text-teal-400 font-bold text-sm">
                                    {selectedPatient.patient_name[0]}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-white/90">{selectedPatient.patient_name}</p>
                                    <p className="text-xs text-white/30">Admitted for: {selectedPatient.diagnosis}</p>
                                </div>
                            </div>

                            {/* Checklist */}
                            <div className="space-y-3">
                                <label className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                                    <input type="checkbox" checked={checklist.medical} disabled className="h-4 w-4 rounded border-white/20 bg-white/5 text-teal-500 focus:ring-teal-500" />
                                    <span className="text-sm font-medium text-white/60">Medical Clearance Approved</span>
                                    <CheckCircle className="h-3.5 w-3.5 text-emerald-400 ml-auto" />
                                </label>
                                <label className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                                    <input type="checkbox" checked={checklist.meds} disabled className="h-4 w-4 rounded border-white/20 bg-white/5 text-teal-500 focus:ring-teal-500" />
                                    <span className="text-sm font-medium text-white/60">Medications Prepared</span>
                                    <CheckCircle className="h-3.5 w-3.5 text-emerald-400 ml-auto" />
                                </label>
                                <label className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={checklist.billing}
                                        onChange={(e) => setChecklist(prev => ({ ...prev, billing: e.target.checked }))}
                                        className="h-4 w-4 rounded border-white/20 bg-white/5 text-teal-500 focus:ring-teal-500"
                                    />
                                    <span className="text-sm font-bold text-white/80">Final Bill Cleared?</span>
                                </label>
                                <label className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={checklist.followup}
                                        onChange={(e) => setChecklist(prev => ({ ...prev, followup: e.target.checked }))}
                                        className="h-4 w-4 rounded border-white/20 bg-white/5 text-teal-500 focus:ring-teal-500"
                                    />
                                    <span className="text-sm font-bold text-white/80">Follow-up Scheduled</span>
                                </label>
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] mb-2 block ml-1">Special Instructions</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 placeholder:text-white/15 p-3 outline-none font-medium text-white resize-none"
                                    placeholder="Enter discharge notes..."
                                    rows={2}
                                />
                            </div>
                        </div>

                        {/* AI Summary Section */}
                        <div className="px-6 pb-2 space-y-3">
                            <button
                                onClick={handleGenerateAI}
                                disabled={aiLoading || !selectedPatient?.admission_id}
                                className="w-full py-2.5 bg-gradient-to-r from-violet-500/20 to-indigo-500/20 border border-violet-500/30 text-violet-300 rounded-xl text-xs font-bold hover:from-violet-500/30 hover:to-indigo-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                {aiLoading ? 'Generating AI Summary...' : 'Generate AI Summary'}
                            </button>
                            {aiSummary && (
                                <div>
                                    <label className="text-[10px] font-black text-violet-400/60 uppercase tracking-[0.15em] mb-2 block ml-1">AI-Generated Summary (editable)</label>
                                    <textarea
                                        value={aiSummary}
                                        onChange={(e) => setAiSummary(e.target.value)}
                                        className="w-full bg-violet-500/5 border border-violet-500/20 rounded-xl text-xs focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/30 placeholder:text-white/15 p-3 outline-none font-medium text-white/80 resize-none"
                                        rows={8}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-white/[0.02] border-t border-white/5 flex flex-col gap-3">
                            <button
                                onClick={handleConfirmDischarge}
                                className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                            >
                                <FileText className="h-5 w-5" /> Confirm Discharge
                            </button>
                            <button onClick={() => setSelectedPatient(null)} className="w-full py-2 text-white/30 font-bold text-sm hover:text-white/50 transition-colors">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Footer */}
            <footer className="relative z-10 mt-8 border-t border-white/5 py-6 px-6">
                <div className="max-w-[1400px] mx-auto flex items-center justify-between">
                    <p className="text-[10px] font-bold text-white/15 uppercase tracking-wider">
                        Avani Hospital OS · Discharge Module · v2.0
                    </p>
                    <p className="text-[10px] font-medium text-white/15">
                        🔒 Encrypted · HIPAA-compliant
                    </p>
                </div>
            </footer>
        </div>
    );
}
