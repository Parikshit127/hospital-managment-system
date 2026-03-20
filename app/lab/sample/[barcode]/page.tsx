'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { FlaskConical, Save, AlertTriangle, ArrowLeft, CheckCircle } from 'lucide-react';
import { getLabOrderDetails, updateSampleStatus, uploadResult, flagCriticalResult } from '@/app/actions/lab-actions';
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
                toast.success("Critical alert flagged successfully!");
            }
        }
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

    return (
        <AppShell
            pageTitle="Process Lab Sample"
            pageIcon={<FlaskConical className="h-5 w-5" />}
        >
            <div className="max-w-4xl mx-auto">
                <Link href="/lab/worklist" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6 font-medium transition-colors">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Worklist
                </Link>

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
                                onClick={() => handleUpdateStatus('Received')}
                                disabled={saving || status === 'Received' || status === 'Processing' || status === 'Completed'}
                                className={`w-full flex items-center justify-between p-4 rounded-xl border ${status === 'Pending' ? 'bg-white border-gray-200 hover:border-teal-500 text-gray-700 group transition-all' :
                                        'bg-gray-50 border-transparent text-gray-400'
                                    }`}
                            >
                                <span className="font-bold text-sm">Mark Received at Lab</span>
                                {(status !== 'Pending') && <CheckCircle className="h-5 w-5 text-emerald-500" />}
                            </button>

                            <button
                                onClick={() => handleUpdateStatus('Processing')}
                                disabled={saving || status === 'Processing' || status === 'Completed'}
                                className={`w-full flex items-center justify-between p-4 rounded-xl border ${status === 'Received' ? 'bg-white border-gray-200 hover:border-teal-500 text-gray-700 group transition-all' :
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
                            {!order.is_critical && status !== 'Completed' && (
                                <button
                                    onClick={handleFlagCritical}
                                    className="text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                >
                                    <AlertTriangle className="h-3.5 w-3.5" /> Flag Critical
                                </button>
                            )}
                        </div>

                        <div className="mb-4">
                            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Measurement Value / Notes</label>
                            <textarea
                                value={resultData}
                                onChange={(e) => setResultData(e.target.value)}
                                disabled={status === 'Completed'}
                                className="w-full h-32 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:bg-white transition-all resize-none disabled:opacity-75 disabled:cursor-not-allowed"
                                placeholder={`Enter ${order.test_type} results here...`}
                            />
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
        </AppShell>
    );
}
