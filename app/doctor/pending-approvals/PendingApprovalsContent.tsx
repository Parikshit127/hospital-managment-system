'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, User, FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';
import { useSearchParams } from 'next/navigation';
import { getPendingApprovals, approveEncounter, rejectEncounter } from '@/app/actions/coordinator-actions';

type PendingEncounter = {
    id: string;
    patient_id: string;
    typed_by: string | null;
    created_at: string;
    approval_status: string;
    subjective: Record<string, unknown>;
    assessment: unknown[];
    plan: Record<string, unknown>;
    patient: { patient_id: string; full_name: string; age: string | null; gender: string | null };
};

export default function PendingApprovalsContent() {
    const searchParams = useSearchParams();
    const doctorId = searchParams.get('doctor_id') || '';
    const toast = useToast();
    const [encounters, setEncounters] = useState<PendingEncounter[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [rejectingId, setRejectingId] = useState<string | null>(null);

    useEffect(() => {
        if (!doctorId) { setLoading(false); return; }
        getPendingApprovals(doctorId).then(res => {
            if (res.success) setEncounters(res.data as PendingEncounter[]);
            setLoading(false);
        });
    }, [doctorId]);

    const handleApprove = async (id: string) => {
        setActionLoading(id);
        const res = await approveEncounter(id, doctorId);
        setActionLoading(null);
        if (res.success) {
            toast.success('EMR entry approved and signed');
            setEncounters(prev => prev.filter(e => e.id !== id));
        } else {
            toast.error('Failed to approve');
        }
    };

    const handleReject = async (id: string) => {
        if (!rejectReason.trim()) { toast.error('Please enter a rejection reason'); return; }
        setActionLoading(id);
        const res = await rejectEncounter(id, doctorId, rejectReason);
        setActionLoading(null);
        if (res.success) {
            toast.success('EMR entry rejected');
            setEncounters(prev => prev.filter(e => e.id !== id));
            setRejectingId(null);
            setRejectReason('');
        } else {
            toast.error('Failed to reject');
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <div className="flex items-center gap-3">
                <Clock className="w-7 h-7 text-amber-600" />
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Pending EMR Approvals</h1>
                    <p className="text-sm text-gray-500">Review and approve EMR entries made by coordinators on your behalf</p>
                </div>
                {encounters.length > 0 && (
                    <span className="ml-auto bg-amber-100 text-amber-700 text-sm font-medium px-3 py-1 rounded-full">
                        {encounters.length} pending
                    </span>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
            ) : encounters.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                    <CheckCircle className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-sm">No pending approvals</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {encounters.map(enc => (
                        <div key={enc.id} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <User className="w-4 h-4 text-gray-400" />
                                        <span className="font-semibold text-gray-900">{enc.patient.full_name}</span>
                                        <span className="text-sm text-gray-500">{enc.patient.patient_id}</span>
                                        {enc.patient.age && <span className="text-xs text-gray-400">{enc.patient.age}y {enc.patient.gender}</span>}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                        <FileText className="w-3 h-3" />
                                        <span>Entered by: <strong>{enc.typed_by}</strong></span>
                                        <span>·</span>
                                        <span>{new Date(enc.created_at).toLocaleString('en-IN')}</span>
                                    </div>
                                </div>
                                <span className="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full">Pending Approval</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                                {(enc.subjective?.chief_complaint as string | undefined) && (
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <p className="text-xs font-medium text-gray-500 mb-1">Chief Complaint</p>
                                        <p className="text-gray-800">{enc.subjective.chief_complaint as string}</p>
                                    </div>
                                )}
                                {Array.isArray(enc.assessment) && enc.assessment.length > 0 && (
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <p className="text-xs font-medium text-gray-500 mb-1">Assessment</p>
                                        <p className="text-gray-800">{(enc.assessment[0] as Record<string, unknown>)?.diagnosis_text as string}</p>
                                    </div>
                                )}
                                {(enc.plan?.instructions as string | undefined) && (
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <p className="text-xs font-medium text-gray-500 mb-1">Instructions</p>
                                        <p className="text-gray-800">{enc.plan.instructions as string}</p>
                                    </div>
                                )}
                            </div>

                            {rejectingId === enc.id && (
                                <div className="flex gap-2">
                                    <input
                                        className="flex-1 px-3 py-2 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
                                        placeholder="Enter rejection reason..."
                                        value={rejectReason}
                                        onChange={e => setRejectReason(e.target.value)}
                                    />
                                    <button
                                        onClick={() => handleReject(enc.id)}
                                        disabled={actionLoading === enc.id}
                                        className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                                    >
                                        {actionLoading === enc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Reject'}
                                    </button>
                                    <button onClick={() => setRejectingId(null)} className="px-3 py-2 text-gray-500 text-sm">Cancel</button>
                                </div>
                            )}

                            {rejectingId !== enc.id && (
                                <div className="flex gap-3 pt-2 border-t border-gray-100">
                                    <button
                                        onClick={() => handleApprove(enc.id)}
                                        disabled={actionLoading === enc.id}
                                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                                    >
                                        {actionLoading === enc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                        Approve & Sign
                                    </button>
                                    <button
                                        onClick={() => setRejectingId(enc.id)}
                                        className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50"
                                    >
                                        <XCircle className="w-4 h-4" />
                                        Reject
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
