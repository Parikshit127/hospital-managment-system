'use client';

/**
 * GAP 5 — 2-Hour Initial Assessment Alert with Group Notification
 */

import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, CheckCircle, Bell, Loader2, Timer } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { getOverdueAssessments, getPendingAssessments, markAssessmentCompleted } from '@/app/actions/assessment-alert-actions';

type AssessmentAlert = {
    id: string;
    admission_id: string;
    patient_id: string;
    arrival_in_unit_at: string;
    assessment_due_at: string;
    assessment_completed: boolean;
    doctor_group_id: string | null;
};

function TimeRemaining({ dueAt }: { dueAt: string }) {
    const [remaining, setRemaining] = useState('');

    useEffect(() => {
        const update = () => {
            const diff = new Date(dueAt).getTime() - Date.now();
            if (diff <= 0) { setRemaining('OVERDUE'); return; }
            const mins = Math.floor(diff / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            setRemaining(`${mins}m ${secs}s`);
        };
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [dueAt]);

    const isOverdue = remaining === 'OVERDUE';
    return (
        <span className={`font-mono text-sm font-bold ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
            {remaining}
        </span>
    );
}

export default function AssessmentAlertsPage() {
    const toast = useToast();
    const [overdue, setOverdue] = useState<AssessmentAlert[]>([]);
    const [pending, setPending] = useState<AssessmentAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [completing, setCompleting] = useState<string | null>(null);

    const loadData = async () => {
        const [od, pd] = await Promise.all([getOverdueAssessments(), getPendingAssessments()]);
        if (od.success) setOverdue(od.data as AssessmentAlert[]);
        if (pd.success) setPending(pd.data as AssessmentAlert[]);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleComplete = async (admissionId: string) => {
        setCompleting(admissionId);
        const res = await markAssessmentCompleted(admissionId, 'nurse');
        setCompleting(null);
        if (res.success) {
            toast.success(`Assessment completed ${res.was_on_time ? 'on time' : '(overdue)'}`, );
            loadData();
        } else {
            toast.error('Failed to mark completed');
        }
    };

    return (
        <AppShell>
            <div className="max-w-4xl mx-auto p-6 space-y-6">
                <div className="flex items-center gap-3">
                    <Timer className="w-7 h-7 text-amber-600" />
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Initial Assessment Alerts</h1>
                        <p className="text-sm text-gray-500">2-hour initial assessment tracking for newly admitted patients</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center h-48">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                    </div>
                ) : (
                    <>
                        {/* Overdue */}
                        {overdue.length > 0 && (
                            <div className="space-y-3">
                                <h2 className="font-semibold text-red-700 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" /> Overdue Assessments ({overdue.length})
                                </h2>
                                {overdue.map(alert => (
                                    <div key={alert.id} className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
                                        <div>
                                            <p className="font-semibold text-red-800">Patient: {alert.patient_id}</p>
                                            <p className="text-xs text-red-600">Admission: {alert.admission_id}</p>
                                            <p className="text-xs text-red-500 mt-1">
                                                Arrived: {new Date(alert.arrival_in_unit_at).toLocaleTimeString('en-IN')} ·
                                                Due: {new Date(alert.assessment_due_at).toLocaleTimeString('en-IN')}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full font-bold">OVERDUE</span>
                                            <button
                                                onClick={() => handleComplete(alert.admission_id)}
                                                disabled={completing === alert.admission_id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                                            >
                                                {completing === alert.admission_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                                                Mark Done
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Pending */}
                        {pending.length > 0 && (
                            <div className="space-y-3">
                                <h2 className="font-semibold text-amber-700 flex items-center gap-2">
                                    <Clock className="w-4 h-4" /> Pending Assessments ({pending.length})
                                </h2>
                                {pending.map(alert => (
                                    <div key={alert.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
                                        <div>
                                            <p className="font-semibold text-amber-800">Patient: {alert.patient_id}</p>
                                            <p className="text-xs text-amber-600">Admission: {alert.admission_id}</p>
                                            <p className="text-xs text-amber-500 mt-1">
                                                Arrived: {new Date(alert.arrival_in_unit_at).toLocaleTimeString('en-IN')} ·
                                                Due by: {new Date(alert.assessment_due_at).toLocaleTimeString('en-IN')}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <p className="text-xs text-amber-600 mb-0.5">Time remaining</p>
                                                <TimeRemaining dueAt={alert.assessment_due_at} />
                                            </div>
                                            <button
                                                onClick={() => handleComplete(alert.admission_id)}
                                                disabled={completing === alert.admission_id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                                            >
                                                {completing === alert.admission_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                                                Complete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {overdue.length === 0 && pending.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                                <CheckCircle className="w-12 h-12 mb-3 opacity-30" />
                                <p className="text-sm">All assessments are up to date</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </AppShell>
    );
}
