'use client';

// Dedicated Indent Details section for nurses — pick an admitted patient and see
// every pharmacy indent raised for them, newest first, in a simple list. Reuses
// the existing getPatientIndentHistory action (same data shown in the My Patients
// "Indent History" tab) so nurses no longer have to hunt for it.

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    ClipboardList, Search, Loader2, Clock, User, BedDouble, Package, CheckCircle2,
    RotateCcw, X,
} from 'lucide-react';
import { getWardPatients, getPatientIndentHistory, createIndentReturn } from '@/app/actions/nurse-actions';
import { useToast } from '@/app/components/ui/Toast';

const RETURN_REASONS = ['Unopened / sealed', 'Unused', 'Not administered', 'Excess supplied', 'Other'];

function formatWhen(d: string | Date): string {
    return new Date(d).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    });
}

function statusStyle(status: string) {
    switch ((status || '').toLowerCase()) {
        case 'dispensed':
        case 'completed': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
        case 'partial':
        case 'partially dispensed': return 'text-amber-700 bg-amber-50 border-amber-200';
        case 'cancelled':
        case 'rejected': return 'text-rose-700 bg-rose-50 border-rose-200';
        default: return 'text-blue-700 bg-blue-50 border-blue-200'; // Pending
    }
}

export default function NurseIndentsPage() {
    const toast = useToast();
    const [patients, setPatients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<any | null>(null);
    const [indents, setIndents] = useState<any[]>([]);
    const [indentsLoading, setIndentsLoading] = useState(false);

    // Return-unused-medicine modal state.
    const [returnCtx, setReturnCtx] = useState<{ item: any; indentNumber: string } | null>(null);
    const [returnQty, setReturnQty] = useState('');
    const [returnReason, setReturnReason] = useState(RETURN_REASONS[0]);
    const [returnNote, setReturnNote] = useState('');
    const [returnSubmitting, setReturnSubmitting] = useState(false);

    const reloadIndents = useCallback(async (patientId: string) => {
        const res = await getPatientIndentHistory(patientId);
        if (res.success) setIndents(res.data || []);
    }, []);

    const openReturn = (item: any, indentNumber: string) => {
        setReturnCtx({ item, indentNumber });
        setReturnQty(String(item.quantity_dispensed || ''));
        setReturnReason(RETURN_REASONS[0]);
        setReturnNote('');
    };

    const submitReturn = async () => {
        if (!returnCtx || !selected) return;
        const qty = Number(returnQty);
        if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }
        if (qty > (returnCtx.item.quantity_dispensed || 0)) {
            toast.error(`Cannot return more than dispensed (${returnCtx.item.quantity_dispensed})`);
            return;
        }
        const reason = returnReason === 'Other'
            ? (returnNote.trim() || 'Other')
            : (returnNote.trim() ? `${returnReason} — ${returnNote.trim()}` : returnReason);
        setReturnSubmitting(true);
        try {
            const res = await createIndentReturn({ order_item_id: returnCtx.item.id, quantity: qty, reason });
            if (res.success) {
                toast.success('Return filed — stock restocked and bill credited');
                setReturnCtx(null);
                await reloadIndents(selected.patientId);
            } else {
                toast.error(res.error || 'Failed to file return');
            }
        } finally {
            setReturnSubmitting(false);
        }
    };

    const loadPatients = useCallback(async () => {
        setRefreshing(true);
        try {
            const res = await getWardPatients(undefined, 'Admitted');
            if (res.success) setPatients(res.data || []);
        } finally {
            setRefreshing(false);
            setLoading(false);
        }
    }, []);

    useEffect(() => { setLoading(true); loadPatients(); }, [loadPatients]);

    const selectPatient = async (p: any) => {
        setSelected(p);
        setIndents([]);
        setIndentsLoading(true);
        try {
            const res = await getPatientIndentHistory(p.patientId);
            if (res.success) setIndents(res.data || []);
        } finally {
            setIndentsLoading(false);
        }
    };

    const filtered = patients.filter(p => {
        if (!search) return true;
        const q = search.toLowerCase();
        return p.patientName?.toLowerCase().includes(q) || p.patientId?.toLowerCase().includes(q) || p.bedLabel?.toLowerCase?.().includes(q);
    });

    return (
        <AppShell
            pageTitle="Indent Details"
            pageIcon={<ClipboardList className="h-5 w-5" />}
            onRefresh={loadPatients}
            refreshing={refreshing}
        >
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
                {/* Patient list */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col max-h-[calc(100vh-160px)]">
                    <div className="p-3 border-b border-gray-100 bg-gray-50/60">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search admitted patients…"
                                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {loading ? (
                            <div className="flex items-center justify-center h-40"><Loader2 className="h-5 w-5 animate-spin text-teal-400" /></div>
                        ) : filtered.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-10">No admitted patients found.</p>
                        ) : filtered.map(p => (
                            <button
                                key={p.admissionId}
                                onClick={() => selectPatient(p)}
                                className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${selected?.admissionId === p.admissionId ? 'bg-teal-50' : 'hover:bg-gray-50'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="h-8 w-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                                        <User className="h-4 w-4 text-teal-500" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm text-gray-800 truncate">{p.patientName}</p>
                                        <p className="text-[11px] text-gray-400 flex items-center gap-1">
                                            <BedDouble className="h-3 w-3" /> {p.wardName} · {p.bedLabel || 'No bed'}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Indents panel */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 min-h-[300px]">
                    {!selected ? (
                        <div className="flex flex-col items-center justify-center h-full text-center py-16">
                            <ClipboardList className="h-10 w-10 text-gray-200 mb-3" />
                            <p className="font-bold text-gray-600">Select a patient to view their indents</p>
                            <p className="text-xs text-gray-400 mt-1">All pharmacy indents raised for the patient show here, newest first.</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                                <div className="h-9 w-9 rounded-lg bg-teal-50 flex items-center justify-center">
                                    <User className="h-4 w-4 text-teal-500" />
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800">{selected.patientName}</p>
                                    <p className="text-[11px] text-gray-400 font-mono">{selected.patientId}</p>
                                </div>
                            </div>

                            {indentsLoading ? (
                                <div className="flex items-center justify-center h-24"><Loader2 className="h-5 w-5 animate-spin text-teal-400" /></div>
                            ) : indents.length === 0 ? (
                                <p className="text-xs text-gray-400 italic py-6 text-center">No indents raised for this patient yet.</p>
                            ) : (
                                <div className="space-y-3">
                                    {indents.map((ind: any) => (
                                        <div key={ind.id} className="border border-gray-200 rounded-xl overflow-hidden">
                                            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                                                <div className="flex items-center gap-2">
                                                    <Package className="h-4 w-4 text-violet-500" />
                                                    <span className="font-bold text-sm text-gray-800 font-mono">{ind.indent_number || `#${ind.id}`}</span>
                                                    <span className={`text-[10px] font-black uppercase tracking-wide border rounded px-1.5 py-0.5 ${statusStyle(ind.status)}`}>{ind.status || 'Pending'}</span>
                                                </div>
                                                <span className="text-[11px] text-gray-400 flex items-center gap-1"><Clock className="h-3 w-3" /> {formatWhen(ind.created_at)}</span>
                                            </div>
                                            <div className="px-4 py-2 divide-y divide-gray-50">
                                                {(ind.items || []).length === 0 ? (
                                                    <p className="text-xs text-gray-400 py-1.5">No line items.</p>
                                                ) : ind.items.map((it: any) => (
                                                    <div key={it.id} className="flex items-center justify-between py-1.5 text-sm gap-2">
                                                        <span className="text-gray-700">{it.medicine_name}</span>
                                                        <span className="text-gray-500 flex items-center gap-2 shrink-0">
                                                            <span>Req: <b className="text-gray-700">{it.quantity_requested}</b></span>
                                                            {it.quantity_dispensed > 0 && (
                                                                <span className="text-emerald-600 flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" /> {it.quantity_dispensed}</span>
                                                            )}
                                                            {it.quantity_dispensed > 0 && (
                                                                <button
                                                                    onClick={() => openReturn(it, ind.indent_number || `#${ind.id}`)}
                                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg px-2 py-1 transition-colors"
                                                                    title="Return unused / unopened medicine"
                                                                >
                                                                    <RotateCcw className="h-3 w-3" /> Return
                                                                </button>
                                                            )}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Return unused / unopened medicine modal */}
            {returnCtx && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <RotateCcw className="h-4 w-4 text-rose-500" />
                                <h3 className="font-black text-gray-800">Return Medicine</h3>
                            </div>
                            <button onClick={() => setReturnCtx(null)} className="text-gray-400 hover:text-gray-700">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                                <p className="font-bold text-gray-800 text-sm">{returnCtx.item.medicine_name}</p>
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                    Indent {returnCtx.indentNumber} · Dispensed: <b className="text-gray-700">{returnCtx.item.quantity_dispensed}</b>
                                </p>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wide mb-1">Return Quantity</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={returnCtx.item.quantity_dispensed}
                                    value={returnQty}
                                    onChange={e => setReturnQty(e.target.value)}
                                    className="w-full p-2.5 border border-gray-300 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
                                    placeholder="Units to return"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wide mb-1">Reason</label>
                                <select
                                    value={returnReason}
                                    onChange={e => setReturnReason(e.target.value)}
                                    className="w-full p-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
                                >
                                    {RETURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wide mb-1">
                                    Note {returnReason === 'Other' ? '(required)' : '(optional)'}
                                </label>
                                <input
                                    type="text"
                                    value={returnNote}
                                    onChange={e => setReturnNote(e.target.value)}
                                    className="w-full p-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
                                    placeholder="e.g. strip sealed, patient discharged"
                                />
                            </div>

                            <p className="text-[11px] text-gray-400 leading-snug">
                                Only unopened / unused stock should be returned. This restocks the pharmacy and credits the patient&apos;s bill by the return value.
                            </p>

                            <div className="flex gap-3 pt-1">
                                <button
                                    onClick={() => setReturnCtx(null)}
                                    className="flex-1 py-2.5 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitReturn}
                                    disabled={returnSubmitting}
                                    className="flex-1 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-lg shadow-rose-600/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {returnSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                    File Return
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
