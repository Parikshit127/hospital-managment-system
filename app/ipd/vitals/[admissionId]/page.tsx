'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    HeartPulse, Thermometer, Wind, Droplets, Activity,
    Plus, Loader2, AlertTriangle, CheckCircle, ChevronLeft
} from 'lucide-react';
import Link from 'next/link';
import { recordIPDVitals, getIPDVitalsHistory } from '@/app/actions/ipd-nursing-actions';
import { VitalsChart } from '@/app/components/ipd/VitalsChart';
import { getAdmissionFullDetails } from '@/app/actions/ipd-actions';

function NEWSBadge({ score, level }: { score: number; level: string }) {
    const color =
        level === 'Critical' ? 'bg-red-600 text-white' :
        level === 'High' ? 'bg-orange-500 text-white' :
        level === 'Medium' ? 'bg-yellow-400 text-gray-900' :
        'bg-emerald-100 text-emerald-800';
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black ${color}`}>
            <Activity className="h-3 w-3" /> NEWS {score} — {level}
        </span>
    );
}

const INIT_FORM = {
    bp_systolic: '', bp_diastolic: '', heart_rate: '', temperature: '',
    respiratory_rate: '', spo2: '', pain_score: '', consciousness: 'Alert',
    blood_sugar: '', urine_output_ml: '', recorded_by: '',
};

export default function IPDVitalsPage() {
    const params = useParams();
    const admissionId = params.admissionId as string;

    const [admission, setAdmission] = useState<any>(null);
    const [vitals, setVitals] = useState<any[]>([]);
    const [form, setForm] = useState(INIT_FORM);
    const [loading, setLoading] = useState(true);
    const [chartMode, setChartMode] = useState<'vitals' | 'news'>('vitals');
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [lastSaved, setLastSaved] = useState<any>(null);

    const loadData = useCallback(async () => {
        const [admRes, vitRes] = await Promise.all([
            getAdmissionFullDetails(admissionId),
            getIPDVitalsHistory(admissionId),
        ]);
        if (admRes.success) setAdmission(admRes.data);
        if (vitRes.success) setVitals((vitRes.data as any[]).reverse());
        setLoading(false);
    }, [admissionId]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSave = async () => {
        setSaving(true);
        const res = await recordIPDVitals({
            admission_id: admissionId,
            patient_id: admission?.patient?.patient_id ?? '',
            bp_systolic: form.bp_systolic ? Number(form.bp_systolic) : undefined,
            bp_diastolic: form.bp_diastolic ? Number(form.bp_diastolic) : undefined,
            heart_rate: form.heart_rate ? Number(form.heart_rate) : undefined,
            temperature: form.temperature ? Number(form.temperature) : undefined,
            respiratory_rate: form.respiratory_rate ? Number(form.respiratory_rate) : undefined,
            spo2: form.spo2 ? Number(form.spo2) : undefined,
            pain_score: form.pain_score ? Number(form.pain_score) : undefined,
            consciousness: form.consciousness,
            blood_sugar: form.blood_sugar ? Number(form.blood_sugar) : undefined,
            urine_output_ml: form.urine_output_ml ? Number(form.urine_output_ml) : undefined,
            recorded_by: form.recorded_by,
        });
        if (res.success) {
            setLastSaved(res.data);
            setForm(INIT_FORM);
            setShowForm(false);
            loadData();
        }
        setSaving(false);
    };

    const latestVitals = vitals[0];

    return (
        <AppShell pageTitle="IPD Vitals" pageIcon={<HeartPulse className="h-5 w-5" />} onRefresh={loadData} refreshing={loading}>
            <div className="space-y-6">
                {/* Back + patient header */}
                <div className="flex items-center gap-3">
                    <Link href={`/ipd/admission/${admissionId}`} className="p-2 hover:bg-gray-100 rounded-lg">
                        <ChevronLeft className="h-4 w-4 text-gray-500" />
                    </Link>
                    <div>
                        <h2 className="text-base font-bold text-gray-900">
                            {admission?.patient?.full_name ?? '...'}
                        </h2>
                        <p className="text-xs text-gray-400">
                            {admission?.bed_id} · {admission?.ward?.ward_name} · {admission?.doctor_name}
                        </p>
                    </div>
                    {latestVitals && (
                        <div className="ml-auto">
                            <NEWSBadge score={latestVitals.news_score ?? 0} level={latestVitals.news_level ?? 'Low'} />
                        </div>
                    )}
                </div>

                {/* NEWS alert banner */}
                {latestVitals?.news_score >= 5 && (
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                        latestVitals.news_score >= 7
                            ? 'bg-red-50 border-red-300'
                            : 'bg-orange-50 border-orange-300'
                    }`}>
                        <AlertTriangle className={`h-5 w-5 ${latestVitals.news_score >= 7 ? 'text-red-600' : 'text-orange-500'}`} />
                        <div>
                            <p className={`text-sm font-bold ${latestVitals.news_score >= 7 ? 'text-red-700' : 'text-orange-700'}`}>
                                {latestVitals.news_score >= 7
                                    ? '🚨 NEWS ≥7 — Emergency response required. Page doctor immediately.'
                                    : '⚠️ NEWS 5-6 — Increase monitoring frequency. Alert nurse-in-charge.'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Latest vitals summary */}
                {latestVitals && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                        {[
                            { label: 'BP', value: latestVitals.bp_systolic ? `${latestVitals.bp_systolic}/${latestVitals.bp_diastolic}` : '—', icon: <Activity className="h-4 w-4" />, unit: 'mmHg' },
                            { label: 'Heart Rate', value: latestVitals.heart_rate ?? '—', icon: <HeartPulse className="h-4 w-4" />, unit: 'bpm' },
                            { label: 'SpO2', value: latestVitals.spo2 ? `${latestVitals.spo2}%` : '—', icon: <Droplets className="h-4 w-4" />, unit: '' },
                            { label: 'Temp', value: latestVitals.temperature ? `${latestVitals.temperature}°C` : '—', icon: <Thermometer className="h-4 w-4" />, unit: '' },
                            { label: 'RR', value: latestVitals.respiratory_rate ?? '—', icon: <Wind className="h-4 w-4" />, unit: '/min' },
                            { label: 'Pain', value: latestVitals.pain_score != null ? `${latestVitals.pain_score}/10` : '—', icon: <AlertTriangle className="h-4 w-4" />, unit: '' },
                        ].map(({ label, value, icon, unit }) => (
                            <div key={label} className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm">
                                <div className="flex items-center gap-1.5 text-gray-400 mb-1">{icon}<span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span></div>
                                <p className="text-lg font-black text-gray-900">{value}<span className="text-xs font-normal text-gray-400 ml-0.5">{unit}</span></p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Record vitals button */}
                <div className="flex justify-end">
                    <button onClick={() => setShowForm(v => !v)}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 transition-colors">
                        <Plus className="h-4 w-4" /> Record Vitals
                    </button>
                </div>

                {/* Vitals entry form */}
                {showForm && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
                        <h3 className="font-bold text-gray-900 text-sm">New Vitals Entry</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            {[
                                { key: 'bp_systolic', label: 'Systolic BP', placeholder: '120', type: 'number' },
                                { key: 'bp_diastolic', label: 'Diastolic BP', placeholder: '80', type: 'number' },
                                { key: 'heart_rate', label: 'Heart Rate', placeholder: '72', type: 'number' },
                                { key: 'temperature', label: 'Temp (°C)', placeholder: '37.0', type: 'number' },
                                { key: 'respiratory_rate', label: 'RR (/min)', placeholder: '16', type: 'number' },
                                { key: 'spo2', label: 'SpO2 (%)', placeholder: '98', type: 'number' },
                                { key: 'pain_score', label: 'Pain (0-10)', placeholder: '0', type: 'number' },
                                { key: 'blood_sugar', label: 'Blood Sugar', placeholder: 'mg/dL', type: 'number' },
                                { key: 'urine_output_ml', label: 'Urine Output', placeholder: 'ml', type: 'number' },
                            ].map(({ key, label, placeholder, type }) => (
                                <div key={key}>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">{label}</label>
                                    <input
                                        type={type}
                                        value={(form as any)[key]}
                                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                        placeholder={placeholder}
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400"
                                    />
                                </div>
                            ))}
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Consciousness</label>
                                <select value={form.consciousness} onChange={e => setForm(f => ({ ...f, consciousness: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400">
                                    {['Alert', 'Voice', 'Pain', 'Unresponsive'].map(c => <option key={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Recorded By</label>
                                <input
                                    type="text"
                                    value={form.recorded_by}
                                    onChange={e => setForm(f => ({ ...f, recorded_by: e.target.value }))}
                                    placeholder="Nurse name"
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 pt-1">
                            <button onClick={handleSave} disabled={saving}
                                className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 disabled:opacity-60 transition-colors">
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                Save Vitals
                            </button>
                            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-500 text-sm font-bold hover:bg-gray-100 rounded-xl">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Trend Chart */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-gray-700 flex-1">Trend Chart</p>
                        <button onClick={() => setChartMode('vitals')}
                            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${chartMode === 'vitals' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            Vitals
                        </button>
                        <button onClick={() => setChartMode('news')}
                            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${chartMode === 'news' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            NEWS Trend
                        </button>
                    </div>
                    <VitalsChart vitals={vitals} mode={chartMode} />
                </div>

                {/* Vitals history table */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <h3 className="font-bold text-gray-900 text-sm">Vitals History</h3>
                        <span className="text-xs text-gray-400">{vitals.length} entries</span>
                    </div>
                    {loading ? (
                        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-teal-500" /></div>
                    ) : vitals.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-12">No vitals recorded yet</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        {['Time', 'BP', 'HR', 'SpO2', 'Temp', 'RR', 'Pain', 'GCS', 'NEWS', 'By'].map(h => (
                                            <th key={h} className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {vitals.map((v: any) => (
                                        <tr key={v.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">
                                                {new Date(v.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs">{v.bp_systolic ? `${v.bp_systolic}/${v.bp_diastolic}` : '—'}</td>
                                            <td className="px-4 py-3 font-mono text-xs">{v.heart_rate ?? '—'}</td>
                                            <td className="px-4 py-3 font-mono text-xs">{v.spo2 ? `${v.spo2}%` : '—'}</td>
                                            <td className="px-4 py-3 font-mono text-xs">{v.temperature ? `${v.temperature}°` : '—'}</td>
                                            <td className="px-4 py-3 font-mono text-xs">{v.respiratory_rate ?? '—'}</td>
                                            <td className="px-4 py-3 font-mono text-xs">{v.pain_score != null ? `${v.pain_score}/10` : '—'}</td>
                                            <td className="px-4 py-3 text-xs">{v.consciousness ?? '—'}</td>
                                            <td className="px-4 py-3">
                                                <NEWSBadge score={v.news_score ?? 0} level={v.news_level ?? 'Low'} />
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-400">{v.recorded_by ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </AppShell>
    );
}
