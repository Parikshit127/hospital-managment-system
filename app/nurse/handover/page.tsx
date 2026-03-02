'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    ArrowLeftRight, Loader2, Plus, Clock, User, FileText, X, CheckCircle2
} from 'lucide-react';
import {
    generateHandoverReport, getHandoverHistory, getWardsList
} from '@/app/actions/nurse-actions';

export default function NurseHandoverPage() {
    const [nurseId, setNurseId] = useState('');
    const [handovers, setHandovers] = useState<any[]>([]);
    const [wards, setWards] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({ wardId: '', toNurseId: '', summary: '' });

    useEffect(() => {
        async function fetchSession() {
            try {
                const res = await fetch('/api/session');
                if (res.ok) { const d = await res.json(); setNurseId(d.id || ''); }
            } catch (e) { console.error(e); }
        }
        fetchSession();
    }, []);

    const loadData = useCallback(async () => {
        setRefreshing(true);
        try {
            const [hRes, wRes] = await Promise.all([
                getHandoverHistory(),
                getWardsList(),
            ]);
            if (hRes.success) setHandovers(hRes.data || []);
            if (wRes.success) setWards(wRes.data || []);
        } catch (e) { console.error(e); }
        finally { setRefreshing(false); setLoading(false); }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSubmit = async () => {
        if (!form.summary.trim() || !nurseId) return;
        setSubmitting(true);
        try {
            const res = await generateHandoverReport({
                wardId: form.wardId ? parseInt(form.wardId) : undefined,
                fromNurseId: nurseId,
                toNurseId: form.toNurseId || undefined,
                summary: form.summary,
            });
            if (res.success) {
                setShowForm(false);
                setForm({ wardId: '', toNurseId: '', summary: '' });
                await loadData();
            }
        } catch (e) { console.error(e); }
        finally { setSubmitting(false); }
    };

    return (
        <AppShell pageTitle="Shift Handover" pageIcon={<ArrowLeftRight className="h-5 w-5" />}
            onRefresh={loadData} refreshing={refreshing}
            headerActions={
                <button onClick={() => setShowForm(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl hover:shadow-md transition-all">
                    <Plus className="h-3.5 w-3.5" /> New Handover
                </button>
            }
        >
            <div className="space-y-6">
                {/* New Handover Form */}
                {showForm && (
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-black text-gray-900">Create Handover Report</h3>
                            <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                                <X className="h-4 w-4 text-gray-400" />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Ward (Optional)</label>
                                <select value={form.wardId} onChange={e => setForm({ ...form, wardId: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white">
                                    <option value="">Select Ward</option>
                                    {wards.map((w: any) => (
                                        <option key={w.id} value={w.id}>{w.ward_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Incoming Nurse ID (Optional)</label>
                                <input type="text" placeholder="Nurse ID"
                                    value={form.toNurseId} onChange={e => setForm({ ...form, toNurseId: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                            </div>
                        </div>
                        <div className="mb-4">
                            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Handover Summary *</label>
                            <textarea rows={5} placeholder="Summarize key patient updates, pending tasks, critical observations..."
                                value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none" />
                        </div>
                        <button onClick={handleSubmit} disabled={submitting || !form.summary.trim()}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50">
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Submit Handover
                        </button>
                    </div>
                )}

                {/* Handover History */}
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                    </div>
                ) : handovers.length === 0 ? (
                    <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
                        <ArrowLeftRight className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-400 font-medium">No handover reports yet</p>
                        <p className="text-gray-300 text-sm mt-1">Create your first handover report above</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <h3 className="text-sm font-black text-gray-900">Recent Handovers</h3>
                        {handovers.map((h: any) => (
                            <div key={h.id} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                <div className="flex items-start justify-between gap-4 mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                                            <FileText className="h-5 w-5 text-indigo-500" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">
                                                Shift Handover {h.ward_id ? `- Ward ${h.ward_id}` : ''}
                                            </p>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                                    <User className="h-2.5 w-2.5" /> From: {h.from_nurse_id?.slice(0, 8) || 'N/A'}
                                                </span>
                                                {h.to_nurse_id && (
                                                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                                        <User className="h-2.5 w-2.5" /> To: {h.to_nurse_id?.slice(0, 8)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-gray-400 flex items-center gap-1 shrink-0">
                                        <Clock className="h-2.5 w-2.5" />
                                        {h.shift_date ? new Date(h.shift_date).toLocaleDateString() : 'N/A'}
                                    </span>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{h.summary}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
