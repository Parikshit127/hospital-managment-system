'use client';

/**
 * GAP 6 — 14-Tab IPD EMR Case Sheet
 * GAP 7 — 24-Hour Case Sheet View
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Activity, Pill, FlaskConical, ClipboardList, Stethoscope,
    FileText, Users, Heart, Utensils, BarChart2, ChevronRight,
    Calendar, Clock, Loader2, Plus, AlertTriangle
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { get24HourCaseSheet, getClinicalOrders, getPhysicianOrders, getActiveMedications, getReferralOrders } from '@/app/actions/ipd-emr-actions';

const TABS = [
    { id: 'treatment', label: 'Treatment Sheet', icon: Pill },
    { id: 'history', label: 'History & Assessment', icon: ClipboardList },
    { id: 'allergies', label: 'Allergies & Risks', icon: AlertTriangle },
    { id: 'diagnosis', label: 'Diagnosis (ICD)', icon: Stethoscope },
    { id: 'clinical_order', label: 'Clinical Order', icon: FlaskConical },
    { id: 'physician_order', label: 'Physician Order', icon: FileText },
    { id: 'progress_notes', label: 'Progress Notes', icon: FileText },
    { id: 'referral', label: 'Referral Order', icon: Users },
    { id: 'active_meds', label: 'Active Medication', icon: Pill },
    { id: 'charts', label: 'Charts', icon: BarChart2 },
    { id: 'lab_results', label: 'Lab Results', icon: FlaskConical },
    { id: 'adhoc', label: 'Ad Hoc Services', icon: Plus },
    { id: 'dietary', label: 'Dietary', icon: Utensils },
    { id: 'other', label: 'Other Activities', icon: Activity },
];

type CaseSheetData = {
    admission: {
        admission_id: string;
        patient: { patient_id: string; full_name: string; age: string; gender: string; blood_group: string | null };
    };
    date: string;
    timeline: Array<{ time: string; type: string; data: unknown }>;
    summary: {
        vitals_count: number;
        ward_rounds_count: number;
        medications_count: number;
        lab_orders_count: number;
        nursing_tasks_count: number;
        diet_plan: unknown;
    };
};

export default function CaseSheetPage() {
    const admissionId = '';
    const initialDate = new Date().toISOString().split('T')[0];
    const [activeTab, setActiveTab] = useState('treatment');
    const [caseSheet, setCaseSheet] = useState<CaseSheetData | null>(null);
    const [clinicalOrders, setClinicalOrders] = useState<unknown[]>([]);
    const [physicianOrders, setPhysicianOrders] = useState<unknown[]>([]);
    const [activeMeds, setActiveMeds] = useState<unknown[]>([]);
    const [referrals, setReferrals] = useState<unknown[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(initialDate);

    const loadData = useCallback(async () => {
        if (!admissionId) return;
        setLoading(true);
        const [csRes, coRes, poRes, amRes] = await Promise.all([
            get24HourCaseSheet(admissionId, selectedDate),
            getClinicalOrders(admissionId),
            getPhysicianOrders(admissionId),
            getActiveMedications(admissionId),
        ]);

        if (csRes.success && csRes.data) setCaseSheet(csRes.data as CaseSheetData);
        if (coRes.success) setClinicalOrders(coRes.data);
        if (poRes.success) setPhysicianOrders(poRes.data);
        if (amRes.success) setActiveMeds(amRes.data);

        if (csRes.success && csRes.data) {
            const patientId = (csRes.data as CaseSheetData).admission.patient.patient_id;
            const refRes = await getReferralOrders(patientId, admissionId);
            if (refRes.success) setReferrals(refRes.data);
        }
        setLoading(false);
    }, [admissionId, selectedDate]);

    useEffect(() => { loadData(); }, [loadData]);

    if (!admissionId) {
        return (
            <AppShell>
                <div className="flex items-center justify-center h-64 text-gray-500">
                    No admission selected. Please open from the IPD admission list.
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell>
            <div className="flex flex-col h-full">
                {/* Header */}
                <div className="bg-white border-b border-gray-200 px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">IPD Case Sheet</h1>
                            {caseSheet && (
                                <p className="text-sm text-gray-500">
                                    {caseSheet.admission.patient.full_name} · {caseSheet.admission.patient.patient_id} · {caseSheet.admission.patient.age}y {caseSheet.admission.patient.gender}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <Calendar className="w-4 h-4" />
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={e => setSelectedDate(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                                />
                            </div>
                            {caseSheet && (
                                <div className="flex gap-3 text-xs">
                                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full">{caseSheet.summary.vitals_count} Vitals</span>
                                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">{caseSheet.summary.ward_rounds_count} Rounds</span>
                                    <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">{caseSheet.summary.lab_orders_count} Labs</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 14 Tabs */}
                <div className="bg-white border-b border-gray-200 overflow-x-auto">
                    <div className="flex min-w-max">
                        {TABS.map(tab => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                                        activeTab === tab.id
                                            ? 'border-blue-600 text-blue-600 bg-blue-50'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-48">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                        </div>
                    ) : (
                        <>
                            {/* Treatment Sheet — 24hr timeline */}
                            {activeTab === 'treatment' && (
                                <div className="space-y-4">
                                    <h2 className="font-semibold text-gray-800">24-Hour Treatment Timeline</h2>
                                    {caseSheet?.timeline.length === 0 ? (
                                        <p className="text-gray-500 text-sm">No activities recorded for {selectedDate}</p>
                                    ) : (
                                        <div className="relative">
                                            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                                            <div className="space-y-3 pl-10">
                                                {caseSheet?.timeline.map((entry, i) => (
                                                    <div key={i} className="relative">
                                                        <div className="absolute -left-6 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                                                        <div className="bg-white border border-gray-200 rounded-lg p-3">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-xs font-medium text-blue-600 uppercase">{entry.type.replace('_', ' ')}</span>
                                                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                                                    <Clock className="w-3 h-3" />
                                                                    {new Date(entry.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans">
                                                                {JSON.stringify(entry.data, null, 2).slice(0, 200)}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Clinical Orders */}
                            {activeTab === 'clinical_order' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h2 className="font-semibold text-gray-800">Clinical Orders</h2>
                                        <span className="text-xs text-gray-500">{clinicalOrders.length} orders</span>
                                    </div>
                                    {clinicalOrders.length === 0 ? (
                                        <p className="text-gray-500 text-sm">No clinical orders placed</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {(clinicalOrders as Array<Record<string, unknown>>).map((order, i) => (
                                                <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <span className="font-medium text-sm capitalize">{order.order_type as string}</span>
                                                            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${order.priority === 'stat' ? 'bg-red-100 text-red-700' : order.priority === 'urgent' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                                                                {order.priority as string}
                                                            </span>
                                                        </div>
                                                        <span className={`text-xs px-2 py-0.5 rounded-full ${order.status === 'completed' ? 'bg-green-100 text-green-700' : order.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                                            {order.status as string}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-1">{new Date(order.ordered_at as string).toLocaleString('en-IN')}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Physician Orders */}
                            {activeTab === 'physician_order' && (
                                <div className="space-y-4">
                                    <h2 className="font-semibold text-gray-800">Physician Orders</h2>
                                    {physicianOrders.length === 0 ? (
                                        <p className="text-gray-500 text-sm">No physician orders</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {(physicianOrders as Array<Record<string, unknown>>).map((order, i) => (
                                                <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-xs font-medium text-purple-600 uppercase">{order.order_category as string}</span>
                                                        <span className="text-xs text-green-600">{order.status as string}</span>
                                                    </div>
                                                    <p className="text-sm text-gray-800">{order.order_text as string}</p>
                                                    {(order.frequency as string | undefined) && <p className="text-xs text-gray-500 mt-1">Frequency: {order.frequency as string}{(order.duration as string | undefined) ? ` · Duration: ${order.duration as string}` : ''}</p>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Active Medications */}
                            {activeTab === 'active_meds' && (
                                <div className="space-y-4">
                                    <h2 className="font-semibold text-gray-800">Active Medications</h2>
                                    {activeMeds.length === 0 ? (
                                        <p className="text-gray-500 text-sm">No active medications</p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {(activeMeds as Array<Record<string, unknown>>).map((med, i) => (
                                                <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
                                                    <div className="flex items-start justify-between">
                                                        <div>
                                                            <p className="font-medium text-sm text-gray-900">{med.medication_name as string}</p>
                                                            <p className="text-xs text-gray-500">{med.dosage as string} · {med.route as string} · {med.frequency as string}</p>
                                                        </div>
                                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{med.status as string}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-400 mt-2">Started: {new Date(med.start_date as string).toLocaleDateString('en-IN')}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Referral Orders */}
                            {activeTab === 'referral' && (
                                <div className="space-y-4">
                                    <h2 className="font-semibold text-gray-800">Referral Orders</h2>
                                    {referrals.length === 0 ? (
                                        <p className="text-gray-500 text-sm">No referral orders</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {(referrals as Array<Record<string, unknown>>).map((ref, i) => (
                                                <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <ChevronRight className="w-4 h-4 text-gray-400" />
                                                            <span className="font-medium text-sm">{ref.referred_to as string}</span>
                                                            {(ref.department as string | undefined) && <span className="text-xs text-gray-500">· {ref.department as string}</span>}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-xs px-2 py-0.5 rounded-full ${ref.priority === 'stat' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{ref.priority as string}</span>
                                                            <span className={`text-xs px-2 py-0.5 rounded-full ${ref.status === 'completed' ? 'bg-green-100 text-green-700' : ref.status === 'accepted' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{ref.status as string}</span>
                                                        </div>
                                                    </div>
                                                    <p className="text-sm text-gray-700">{ref.reason as string}</p>
                                                    <p className="text-xs text-gray-400 mt-1">{new Date(ref.referred_at as string).toLocaleString('en-IN')}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Charts — Vitals Trend */}
                            {activeTab === 'charts' && (
                                <div className="space-y-4">
                                    <h2 className="font-semibold text-gray-800">Vitals Charts</h2>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {[
                                            { label: 'Vitals Recorded', value: caseSheet?.summary.vitals_count || 0, color: 'blue' },
                                            { label: 'Ward Rounds', value: caseSheet?.summary.ward_rounds_count || 0, color: 'green' },
                                            { label: 'Lab Orders', value: caseSheet?.summary.lab_orders_count || 0, color: 'purple' },
                                            { label: 'Nursing Tasks', value: caseSheet?.summary.nursing_tasks_count || 0, color: 'orange' },
                                        ].map(stat => (
                                            <div key={stat.label} className={`bg-${stat.color}-50 border border-${stat.color}-200 rounded-xl p-4 text-center`}>
                                                <div className={`text-3xl font-bold text-${stat.color}-700`}>{stat.value}</div>
                                                <div className={`text-xs text-${stat.color}-600 mt-1`}>{stat.label}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-sm text-gray-500">Full vitals trend charts available in the Vitals module.</p>
                                </div>
                            )}

                            {/* Dietary */}
                            {activeTab === 'dietary' && (
                                <div className="space-y-4">
                                    <h2 className="font-semibold text-gray-800">Dietary Plan</h2>
                                    {caseSheet?.summary.diet_plan ? (
                                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                                            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                                                {JSON.stringify(caseSheet.summary.diet_plan, null, 2)}
                                            </pre>
                                        </div>
                                    ) : (
                                        <p className="text-gray-500 text-sm">No dietary plan assigned</p>
                                    )}
                                </div>
                            )}

                            {/* Default placeholder for other tabs */}
                            {!['treatment', 'clinical_order', 'physician_order', 'active_meds', 'referral', 'charts', 'dietary'].includes(activeTab) && (
                                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                                    <Heart className="w-10 h-10 mb-3 opacity-30" />
                                    <p className="text-sm">{TABS.find(t => t.id === activeTab)?.label} — content loads from respective modules</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </AppShell>
    );
}
