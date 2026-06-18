'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    ClipboardList,
    Clock,
    CheckCircle2,
    XCircle,
    User,
    Loader2,
    RefreshCw,
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { getCoordinatorEncounters } from '@/app/actions/coordinator-actions';

type CoordinatorEncounter = {
    id: string;
    patient_id: string;
    approval_status: string;
    created_at: string;
    rejection_reason: string | null;
    patient: { patient_id: string; full_name: string } | null;
};

const STATUS_META: Record<string, { label: string; icon: typeof Clock; cls: string }> = {
    pending_approval: { label: 'Pending Approval', icon: Clock, cls: 'bg-amber-100 text-amber-700' },
    approved: { label: 'Approved & Signed', icon: CheckCircle2, cls: 'bg-green-100 text-green-700' },
    rejected: { label: 'Rejected', icon: XCircle, cls: 'bg-red-100 text-red-700' },
};

export default function CoordinatorDashboardPage() {
    const [encounters, setEncounters] = useState<CoordinatorEncounter[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = async () => {
        setRefreshing(true);
        const res = await getCoordinatorEncounters();
        if (res.success) setEncounters(res.data as CoordinatorEncounter[]);
        setLoading(false);
        setRefreshing(false);
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const counts = {
        pending: encounters.filter(e => e.approval_status === 'pending_approval').length,
        approved: encounters.filter(e => e.approval_status === 'approved').length,
        rejected: encounters.filter(e => e.approval_status === 'rejected').length,
    };

    return (
        <AppShell>
            <div className="max-w-4xl mx-auto p-6 space-y-6">
                <div className="flex items-center gap-3">
                    <ClipboardList className="w-7 h-7 text-cyan-600" />
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">My EMR Entries</h1>
                        <p className="text-sm text-gray-500">
                            EMR data you entered on a doctor&apos;s behalf, with approval status.
                        </p>
                    </div>
                    <button
                        onClick={load}
                        disabled={refreshing}
                        className="ml-auto flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                {/* Status summary */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <p className="text-xs font-medium text-gray-500">Pending</p>
                        <p className="text-2xl font-bold text-amber-600">{counts.pending}</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <p className="text-xs font-medium text-gray-500">Approved</p>
                        <p className="text-2xl font-bold text-green-600">{counts.approved}</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <p className="text-xs font-medium text-gray-500">Rejected</p>
                        <p className="text-2xl font-bold text-red-600">{counts.rejected}</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center h-48">
                        <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
                    </div>
                ) : encounters.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                        <ClipboardList className="w-12 h-12 mb-3 opacity-30" />
                        <p className="text-sm">No EMR entries yet.</p>
                        <p className="text-xs mt-1">
                            Entries you create on a doctor&apos;s behalf will appear here.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {encounters.map(enc => {
                            const meta = STATUS_META[enc.approval_status] ?? {
                                label: enc.approval_status,
                                icon: Clock,
                                cls: 'bg-gray-100 text-gray-700',
                            };
                            const Icon = meta.icon;
                            return (
                                <div
                                    key={enc.id}
                                    className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-4"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <User className="w-4 h-4 text-gray-400 shrink-0" />
                                            <span className="font-semibold text-gray-900 truncate">
                                                {enc.patient?.full_name ?? 'Unknown patient'}
                                            </span>
                                            <span className="text-sm text-gray-500">
                                                {enc.patient?.patient_id ?? enc.patient_id}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1">
                                            {new Date(enc.created_at).toLocaleString('en-IN')}
                                        </p>
                                        {enc.approval_status === 'rejected' && enc.rejection_reason && (
                                            <p className="text-xs text-red-600 mt-1">
                                                Reason: {enc.rejection_reason}
                                            </p>
                                        )}
                                    </div>
                                    <span
                                        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${meta.cls}`}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        {meta.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                <p className="text-xs text-gray-400">
                    Need to review approvals as a doctor?{' '}
                    <Link href="/doctor/pending-approvals" className="text-cyan-600 hover:underline">
                        Open the approval inbox
                    </Link>
                    .
                </p>
            </div>
        </AppShell>
    );
}
