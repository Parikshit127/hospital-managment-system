'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { FlaskConical, Save, AlertTriangle, ArrowLeft, CheckCircle, Printer, XCircle, PhoneCall, X } from 'lucide-react';
import QRCode from 'qrcode';
import { getLabOrderDetails, updateSampleStatus, uploadResult, flagCriticalResult, markSampleCollected, rejectSample, logCriticalCallback } from '@/app/actions/lab-actions';
import { computeLabFlag, parseLeadingNumber, rangeText } from '@/app/lib/lab/flag';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/app/components/ui/Toast';
import Link from 'next/link';

export default function ProcessSamplePage() {
    const toast = useToast();
    const params = useParams();
    const barcode = params.barcode as string;
    const router = useRouter();

    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<string>('');
    const [resultData, setResultData] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [callbackOpen, setCallbackOpen] = useState(false);
    const [cbName, setCbName] = useState('');
    const [cbRole, setCbRole] = useState('Doctor');
    const [cbReadBack, setCbReadBack] = useState(false);
    const [cbRemarks, setCbRemarks] = useState('');
    const [cbSaving, setCbSaving] = useState(false);

    const loadOrder = async () => {
        setLoading(true);
        const res = await getLabOrderDetails(barcode);
        if (res.success && res.data) {
            setOrder(res.data);
            setStatus(res.data.status);
            setResultData(res.data.result_value || '');
        }
        setLoading(false);
    };

    useEffect(() => {
        if (barcode) {
            loadOrder();
        }
    }, [barcode]);

    const handleUpdateStatus = async (newStatus: string) => {
        setSaving(true);
        const res = await updateSampleStatus(barcode, newStatus);
        if (res.success) {
            setStatus(newStatus);
            setOrder({ ...order, status: newStatus });
        }
        setSaving(false);
    };

    const handleSaveResult = async () => {
        setSaving(true);
        const res = await uploadResult(barcode, resultData, 'Entered manually');
        if (res.success) {
            setStatus('Completed');
            setOrder({ ...order, status: 'Completed', result_value: resultData });
            router.push('/lab/worklist');
        } else {
            toast.error(res.error || 'Failed to save result');
        }
        setSaving(false);
    };

    const handleFlagCritical = async () => {
        if (confirm("Are you sure you want to flag this result as critical? This will notify the physician immediately.")) {
            const res = await flagCriticalResult(barcode);
            if (res.success) {
                setOrder({ ...order, is_critical: true });
                toast.success("Critical alert flagged — please log the callback.");
                setCallbackOpen(true);
            }
        }
    };

    const handlePrintLabel = async () => {
        try {
            const qr = await QRCode.toDataURL(order.barcode, { width: 160, margin: 1 });
            const w = window.open('', '_blank', 'width=420,height=340');
            if (!w) { toast.error('Popup blocked — allow popups to print labels.'); return; }
            w.document.write(`<!DOCTYPE html><html><head><title>Label ${order.barcode}</title>
                <style>body{font-family:Arial,sans-serif;margin:0;padding:12px;}.label{border:1px solid #000;padding:10px;width:280px;}.row{font-size:12px;margin:2px 0;}.bc{font-family:monospace;font-weight:bold;font-size:14px;letter-spacing:1px;text-align:center;}img{display:block;margin:6px auto;}</style>
                </head><body onload="window.print()">
                <div class="label">
                    <div class="row"><b>${order.patient_name || ''}</b></div>
                    <div class="row">${order.test_type || ''}</div>
                    <img src="${qr}" width="120" height="120"/>
                    <div class="row bc">${order.barcode}</div>
                    <div class="row" style="text-align:center;font-size:10px;color:#555;">${new Date().toLocaleString()}</div>
                </div></body></html>`);
            w.document.close();
        } catch {
            toast.error('Failed to generate label');
        }
    };

    const handleMarkCollected = async () => {
        setSaving(true);
        const res = await markSampleCollected(barcode);
        setSaving(false);
        if (res.success) { toast.success('Sample marked as collected'); loadOrder(); }
        else toast.error(res.error || 'Failed to mark collected');
    };

    const handleReject = async () => {
        const reason = window.prompt('Reason for rejecting this sample (e.g. haemolysed, clotted, insufficient):');
        if (!reason || !reason.trim()) return;
        const res = await rejectSample(barcode, reason.trim());
        if (res.success) { toast.success('Sample rejected — order returned to Pending for recollection.'); router.push('/lab/worklist'); }
        else toast.error(res.error || 'Failed to reject sample');
    };

    const handleSaveCallback = async () => {
        if (!cbName.trim()) { toast.error('Enter who was notified'); return; }
        setCbSaving(true);
        const res = await logCriticalCallback({ barcode, notified_name: cbName.trim(), notified_role: cbRole, read_back_confirmed: cbReadBack, remarks: cbRemarks.trim() });
        setCbSaving(false);
        if (res.success) {
            toast.success('Critical callback logged');
            setCallbackOpen(false); setCbName(''); setCbReadBack(false); setCbRemarks('');
        } else toast.error(res.error || 'Failed to log callback');
    };

    if (loading) {
        return (
            <AppShell pageTitle="Processing Sample">
                <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div></div>
            </AppShell>
        );
    }

    if (!order) {
        return (
            <AppShell pageTitle="Sample Not Found">
                <div className="p-12 text-center text-gray-500">Order logic not found for requested barcode.</div>
            </AppShell>
        );
    }

    const refText = order?.testInfo ? rangeText(order.testInfo) : null;
    const numericResult = parseLeadingNumber(resultData);
    const liveFlag = numericResult != null && order?.testInfo ? computeLabFlag(numericResult, order.testInfo) : null;

    return (
        <AppShell
            pageTitle="Process Lab Sample"
            pageIcon={<FlaskConical className="h-5 w-5" />}
        >
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <Link href="/lab/worklist" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Worklist
                    </Link>
                    <div className="flex items-center gap-2">
                        <button onClick={handlePrintLabel} className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg">
                            <Printer className="h-4 w-4" /> Print Label
                        </button>
                        {status !== 'Completed' && (
                            <button onClick={handleReject} className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 px-3 py-1.5 rounded-lg">
                                <XCircle className="h-4 w-4" /> Reject / Recollect
                            </button>
                        )}
                    </div>
                </div>

                {/* Patient & Order Details Card */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 flex flex-col md:flex-row gap-6 justify-between mb-6">
                    <div>
                        <div className="flex items-center gap-3 justify-start mb-2">
                            <h2 className="text-xl font-black text-gray-900">{order.test_type}</h2>
                            {order.is_critical && (
                                <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold uppercase">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Critical
                                </span>
                            )}
                        </div>
                        <p className="text-sm font-medium text-gray-500 mb-1">Barcode: <span className="text-gray-900 font-mono tracking-wide">{order.barcode}</span></p>
                        <p className="text-sm font-medium text-gray-500 mb-1">Patient: <span className="text-gray-900">{order.patient_name}</span></p>
                        <p className="text-sm font-medium text-gray-500">Doctor ID: <span className="text-gray-900">{order.doctor_id}</span></p>
                    </div>

                    <div className="md:text-right">
                        <p className="text-[10px] uppercase font-bold text-gray-400 mb-1">Current Status</p>
                        <span className={`inline-flex px-3 py-1 rounded-full text-sm font-bold shadow-sm ${status === 'Completed' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                status === 'Processing' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                    'bg-amber-100 text-amber-700 border border-amber-200'
                            }`}>
                            {status}
                        </span>
                        <div className="mt-4 text-xs text-gray-400 font-medium">
                            Ordered: {new Date(order.created_at).toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* Processing Steps */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Status Tracking */}
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                        <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Workflow Tracker</h3>

                        <div className="space-y-3">
                            <button
                                onClick={handleMarkCollected}
                                disabled={saving || !!order.tracking?.collected_at}
                                className={`w-full flex items-center justify-between p-4 rounded-xl border ${order.tracking?.collected_at ? 'bg-gray-50 border-transparent text-gray-400' : 'bg-white border-gray-200 hover:border-orange-500 text-gray-700 group transition-all'}`}
                            >
                                <span className="font-bold text-sm">Mark Sample Collected</span>
                                {order.tracking?.collected_at && <CheckCircle className="h-5 w-5 text-emerald-500" />}
                            </button>
                            <button
                                onClick={() => handleUpdateStatus('Received')}
                                disabled={saving || status === 'Received' || status === 'Processing' || status === 'Completed'}
                                className={`w-full flex items-center justify-between p-4 rounded-xl border ${status === 'Pending' ? 'bg-white border-gray-200 hover:border-orange-500 text-gray-700 group transition-all' :
                                        'bg-gray-50 border-transparent text-gray-400'
                                    }`}
                            >
                                <span className="font-bold text-sm">Mark Received at Lab</span>
                                {(status !== 'Pending') && <CheckCircle className="h-5 w-5 text-emerald-500" />}
                            </button>

                            <button
                                onClick={() => handleUpdateStatus('Processing')}
                                disabled={saving || status === 'Processing' || status === 'Completed'}
                                className={`w-full flex items-center justify-between p-4 rounded-xl border ${status === 'Received' ? 'bg-white border-gray-200 hover:border-orange-500 text-gray-700 group transition-all' :
                                        status === 'Processing' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                                            'bg-gray-50 border-transparent text-gray-400'
                                    }`}
                            >
                                <span className="font-bold text-sm">Start Processing Sample</span>
                                {(status === 'Processing' || status === 'Completed') && <CheckCircle className="h-5 w-5 text-blue-500" />}
                            </button>
                        </div>
                    </div>

                    {/* Result Entry */}
                    <div className={`bg-white border shadow-sm rounded-2xl p-6 transition-colors ${status === 'Completed' ? 'border-emerald-200' : 'border-gray-200'
                        }`}>
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Enter Results</h3>
                            {order.is_critical ? (
                                <button
                                    onClick={() => setCallbackOpen(true)}
                                    className="text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                >
                                    <PhoneCall className="h-3.5 w-3.5" /> Log Callback
                                </button>
                            ) : status !== 'Completed' ? (
                                <button
                                    onClick={handleFlagCritical}
                                    className="text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                >
                                    <AlertTriangle className="h-3.5 w-3.5" /> Flag Critical
                                </button>
                            ) : null}
                        </div>

                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide">Measurement Value / Notes</label>
                                {refText && (
                                    <span className="text-[11px] font-medium text-gray-500">Ref: <span className="text-gray-700 font-semibold">{refText}</span></span>
                                )}
                            </div>
                            <textarea
                                value={resultData}
                                onChange={(e) => setResultData(e.target.value)}
                                disabled={status === 'Completed'}
                                className="w-full h-32 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-all resize-none disabled:opacity-75 disabled:cursor-not-allowed"
                                placeholder={`Enter ${order.test_type} results here...`}
                            />
                            {liveFlag && (
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                                        liveFlag.level === 'critical' ? 'bg-red-50 text-red-700 border-red-200'
                                            : liveFlag.level === 'high' ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                : liveFlag.level === 'low' ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        }`}>
                                        {liveFlag.level === 'critical' && <AlertTriangle className="h-3.5 w-3.5" />}
                                        {liveFlag.label}
                                    </span>
                                    {liveFlag.level === 'critical' && (
                                        <span className="text-[11px] text-red-600 font-medium">Critical range — completing will alert the doctor.</span>
                                    )}
                                </div>
                            )}
                        </div>

                        {status !== 'Completed' ? (
                            <button
                                onClick={handleSaveResult}
                                disabled={saving || !resultData.trim() || status === 'Pending'}
                                className="w-full flex justify-center items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-teal-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Save className="h-5 w-5" />
                                Verify & Completion
                            </button>
                        ) : (
                            <div className="w-full flex justify-center items-center gap-2 bg-emerald-50 text-emerald-700 font-bold py-3 px-4 rounded-xl border border-emerald-200">
                                <CheckCircle className="h-5 w-5" />
                                Verified & Locked
                            </div>
                        )}

                        {(status === 'Pending' || status === 'Received') && (
                            <p className="text-[10px] text-gray-400 text-center mt-3 font-medium">Please mark sample as "Processing" before entering results.</p>
                        )}
                    </div>
                </div>
            </div>

            {callbackOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-red-50">
                            <h3 className="font-bold text-red-700 flex items-center gap-2"><PhoneCall className="h-4 w-4" /> Log Critical-Value Callback</h3>
                            <button onClick={() => setCallbackOpen(false)} className="text-gray-400 hover:text-gray-700"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-xs text-gray-500">Record who was informed of this critical result and whether they read the value back.</p>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Notified (name) *</label>
                                <input value={cbName} onChange={e => setCbName(e.target.value)} placeholder="e.g. Dr. Gupta"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Role</label>
                                <select value={cbRole} onChange={e => setCbRole(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500">
                                    <option>Doctor</option><option>Nurse</option><option>Other</option>
                                </select>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input type="checkbox" checked={cbReadBack} onChange={e => setCbReadBack(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-red-600" />
                                Read-back confirmed
                            </label>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Remarks</label>
                                <textarea value={cbRemarks} onChange={e => setCbRemarks(e.target.value)} rows={2}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none" />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setCallbackOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">Cancel</button>
                                <button onClick={handleSaveCallback} disabled={cbSaving} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50">
                                    {cbSaving ? 'Saving...' : 'Save Callback'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
