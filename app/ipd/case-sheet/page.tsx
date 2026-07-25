'use client';

/**
 * GAP 6 — 14-Tab IPD EMR Case Sheet
 * GAP 7 — 24-Hour Case Sheet View
 */

import React, { useState, useEffect, useCallback } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import {
    Activity, Pill, FlaskConical, ClipboardList, Stethoscope,
    FileText, Users, Heart, Utensils, BarChart2, ChevronRight,
    Calendar, Clock, Loader2, Plus, AlertTriangle
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    get24HourCaseSheet, getClinicalOrders, getPhysicianOrders, getActiveMedications,
    getReferralOrders, addActiveMedication, createClinicalOrder, createPhysicianOrder,
} from '@/app/actions/ipd-emr-actions';
import { createNursingTask } from '@/app/actions/ipd-actions';

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
    { id: 'nursing_tasks', label: 'Nursing Tasks', icon: ClipboardList },
];

type CaseSheetData = {
    admission: {
        admission_id: string;
        patient: { patient_id: string; full_name: string; age: string; gender: string; blood_group: string | null };
    };
    date: string;
    timeline: Array<{ time: string; type: string; data: unknown }>;
    nursingTasks?: any[];
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
    // admissionId comes from URL query param: /ipd/case-sheet?admission_id=XXX
    const [admissionId, setAdmissionId] = useState('');
    const [initialDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('admission_id') || '';
        setAdmissionId(id);
    }, []);
    const [activeTab, setActiveTab] = useState('treatment');
    const [caseSheet, setCaseSheet] = useState<CaseSheetData | null>(null);
    const [clinicalOrders, setClinicalOrders] = useState<unknown[]>([]);
    const [physicianOrders, setPhysicianOrders] = useState<unknown[]>([]);
    const [activeMeds, setActiveMeds] = useState<unknown[]>([]);
    const [referrals, setReferrals] = useState<unknown[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(initialDate);

    const [doctorName, setDoctorName] = useState('Doctor');
    useEffect(() => {
        fetch('/api/session')
            .then(r => r.json())
            .then(data => {
                if (data?.name || data?.username) {
                    setDoctorName(data.name || data.username);
                }
            })
            .catch(() => {});
    }, []);

    // Prescribe form states
    const [showPrescribeForm, setShowPrescribeForm] = useState(false);
    const [medName, setMedName] = useState('');
    const [medDosage, setMedDosage] = useState('');
    const [medRoute, setMedRoute] = useState('Oral');
    const [medFreq, setMedFreq] = useState('OD');
    const [medEndDate, setMedEndDate] = useState('');
    const [savingMed, setSavingMed] = useState(false);

    // Nursing Task form states
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [taskType, setTaskType] = useState('Vitals');
    const [taskDesc, setTaskDesc] = useState('');
    const [taskTime, setTaskTime] = useState('');
    const [savingTask, setSavingTask] = useState(false);

    const handlePrescribeMed = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!medName.trim() || !medDosage.trim()) return;
        setSavingMed(true);
        const res = await addActiveMedication({
            admission_id: admissionId,
            patient_id: caseSheet?.admission.patient.patient_id || '',
            medication_name: medName.trim(),
            dosage: medDosage.trim(),
            route: medRoute,
            frequency: medFreq,
            prescribed_by: doctorName,
            end_date: medEndDate || undefined
        });
        setSavingMed(false);
        if (res.success) {
            setMedName('');
            setMedDosage('');
            setMedRoute('Oral');
            setMedFreq('OD');
            setMedEndDate('');
            setShowPrescribeForm(false);
            loadData();
        } else {
            alert(res.error || 'Failed to prescribe medication');
        }
    };

    // ── Clinical order (lab / radiology / procedure / consultation) ──────────
    const [showOrderForm, setShowOrderForm] = useState(false);
    const [orderType, setOrderType] = useState<'lab' | 'radiology' | 'procedure' | 'consultation'>('lab');
    const [orderName, setOrderName] = useState('');
    const [orderPriority, setOrderPriority] = useState<'routine' | 'urgent' | 'stat'>('routine');
    const [orderNote, setOrderNote] = useState('');
    const [savingOrder, setSavingOrder] = useState(false);

    const handleCreateOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orderName.trim()) return;
        setSavingOrder(true);
        const res = await createClinicalOrder({
            admission_id: admissionId,
            patient_id: caseSheet?.admission.patient.patient_id || '',
            order_type: orderType,
            order_details: { name: orderName.trim(), note: orderNote.trim() || undefined },
            priority: orderPriority,
        });
        setSavingOrder(false);
        if (res.success) {
            setOrderName(''); setOrderNote(''); setOrderPriority('routine');
            setShowOrderForm(false);
            loadData();
            const extra = (res as { labBarcode?: string | null }).labBarcode;
            alert(`Order placed. A nursing task has been raised${extra ? `, and the test is on the lab worklist (${extra})` : ''}.`);
        } else {
            alert(res.error || 'Failed to place order');
        }
    };

    // ── Physician order (diet / activity / monitoring) ───────────────────────
    const [showPhysForm, setShowPhysForm] = useState(false);
    const [physCategory, setPhysCategory] = useState<'diet' | 'activity' | 'monitoring' | 'other'>('monitoring');
    const [physText, setPhysText] = useState('');
    const [physFreq, setPhysFreq] = useState('');
    const [savingPhys, setSavingPhys] = useState(false);

    const handleCreatePhysOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!physText.trim()) return;
        setSavingPhys(true);
        const res = await createPhysicianOrder({
            admission_id: admissionId,
            patient_id: caseSheet?.admission.patient.patient_id || '',
            order_category: physCategory,
            order_text: physText.trim(),
            frequency: physFreq.trim() || undefined,
        });
        setSavingPhys(false);
        if (res.success) {
            setPhysText(''); setPhysFreq('');
            setShowPhysForm(false);
            loadData();
        } else {
            alert(res.error || 'Failed to place order');
        }
    };

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!taskDesc.trim() || !taskTime) return;
        setSavingTask(true);
        const res = await createNursingTask({
            admission_id: admissionId,
            task_type: taskType,
            description: taskDesc.trim(),
            scheduled_at: taskTime
        });
        setSavingTask(false);
        if (res.success) {
            setTaskDesc('');
            setTaskTime('');
            setTaskType('Vitals');
            setShowTaskForm(false);
            loadData();
        } else {
            alert(res.error || 'Failed to create nursing task');
        }
    };

    const loadData = useCallback(async () => {
        if (!admissionId) return;
        setLoading(true);        const [csRes, coRes, poRes, amRes] = await Promise.all([
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
                                <DateField
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

                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-48">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                        </div>
                    ) : (
                        <>
                            {activeTab === 'treatment' && (
                                <div className="space-y-4">
                                    <h2 className="font-semibold text-gray-800">24-Hour Treatment Timeline</h2>
                                    {caseSheet?.timeline.length === 0 ? (
                                        <p className="text-gray-500 text-sm">No activities recorded for {selectedDate.split('-').reverse().join('-')}</p>
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

                            {activeTab === 'clinical_order' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h2 className="font-semibold text-gray-800">Clinical Orders</h2>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs text-gray-500">{clinicalOrders.length} orders</span>
                                            <button
                                                onClick={() => setShowOrderForm(!showOrderForm)}
                                                className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                                            >
                                                {showOrderForm ? 'Cancel' : 'Place Order'}
                                            </button>
                                        </div>
                                    </div>

                                    {showOrderForm && (
                                        <form onSubmit={handleCreateOrder} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm max-w-2xl">
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Type</label>
                                                    <select value={orderType} onChange={e => setOrderType(e.target.value as typeof orderType)}
                                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                                                        <option value="lab">Lab test</option>
                                                        <option value="radiology">Radiology / imaging</option>
                                                        <option value="procedure">Procedure</option>
                                                        <option value="consultation">Consultation</option>
                                                    </select>
                                                </div>
                                                <div className="sm:col-span-2">
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                                                        {orderType === 'consultation' ? 'Specialty / doctor' : 'Test or procedure'}
                                                    </label>
                                                    <input value={orderName} onChange={e => setOrderName(e.target.value)}
                                                        placeholder={orderType === 'lab' ? 'e.g. CBC, Serum Creatinine' : 'e.g. Chest X-ray PA view'}
                                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Priority</label>
                                                    <select value={orderPriority} onChange={e => setOrderPriority(e.target.value as typeof orderPriority)}
                                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                                                        <option value="routine">Routine</option>
                                                        <option value="urgent">Urgent</option>
                                                        <option value="stat">STAT</option>
                                                    </select>
                                                </div>
                                                <div className="sm:col-span-2">
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Clinical note (optional)</label>
                                                    <input value={orderNote} onChange={e => setOrderNote(e.target.value)}
                                                        placeholder="Indication / instructions for the ward"
                                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                                                </div>
                                            </div>
                                            <p className="text-[11px] text-gray-500">
                                                Placing this raises a nursing task on the ward{orderType === 'lab' ? ', and puts the test on the laboratory worklist' : ''}.
                                            </p>
                                            <button type="submit" disabled={savingOrder || !orderName.trim()}
                                                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg disabled:opacity-50">
                                                {savingOrder ? 'Placing…' : 'Place order'}
                                            </button>
                                        </form>
                                    )}

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

                            {activeTab === 'physician_order' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h2 className="font-semibold text-gray-800">Physician Orders</h2>
                                        <button
                                            onClick={() => setShowPhysForm(!showPhysForm)}
                                            className="px-3 py-1.5 text-xs font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
                                        >
                                            {showPhysForm ? 'Cancel' : 'Add Order'}
                                        </button>
                                    </div>

                                    {showPhysForm && (
                                        <form onSubmit={handleCreatePhysOrder} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm max-w-2xl">
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Category</label>
                                                    <select value={physCategory} onChange={e => setPhysCategory(e.target.value as typeof physCategory)}
                                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                                                        <option value="monitoring">Monitoring</option>
                                                        <option value="diet">Diet</option>
                                                        <option value="activity">Activity / mobility</option>
                                                        <option value="other">Other</option>
                                                    </select>
                                                </div>
                                                <div className="sm:col-span-2">
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Instruction</label>
                                                    <input value={physText} onChange={e => setPhysText(e.target.value)}
                                                        placeholder="e.g. Strict input–output charting; hourly urine output"
                                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Frequency (optional)</label>
                                                <input value={physFreq} onChange={e => setPhysFreq(e.target.value)}
                                                    placeholder="e.g. 4 hourly"
                                                    className="w-full max-w-xs border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                                            </div>
                                            <p className="text-[11px] text-gray-500">Raises a nursing task the ward can see and close.</p>
                                            <button type="submit" disabled={savingPhys || !physText.trim()}
                                                className="px-4 py-2 text-xs font-bold text-white bg-purple-600 rounded-lg disabled:opacity-50">
                                                {savingPhys ? 'Saving…' : 'Add order'}
                                            </button>
                                        </form>
                                    )}

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

                            {activeTab === 'active_meds' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h2 className="font-semibold text-gray-800">Active Medications</h2>
                                        <button
                                            onClick={() => setShowPrescribeForm(!showPrescribeForm)}
                                            className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                                        >
                                            {showPrescribeForm ? "Cancel" : "Prescribe Medication"}
                                        </button>
                                    </div>

                                    {showPrescribeForm && (
                                        <form onSubmit={handlePrescribeMed} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm max-w-xl">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">Prescribe New Medication</h3>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Medication Name</label>
                                                    <input
                                                        required
                                                        type="text"
                                                        value={medName}
                                                        onChange={e => setMedName(e.target.value)}
                                                        placeholder="e.g. Paracetamol"
                                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 bg-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Dosage</label>
                                                    <input
                                                        required
                                                        type="text"
                                                        value={medDosage}
                                                        onChange={e => setMedDosage(e.target.value)}
                                                        placeholder="e.g. 500mg or 1 Tab"
                                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 bg-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Route</label>
                                                    <select
                                                        value={medRoute}
                                                        onChange={e => setMedRoute(e.target.value)}
                                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 bg-white"
                                                    >
                                                        <option value="Oral">Oral</option>
                                                        <option value="IV">IV</option>
                                                        <option value="IM">IM</option>
                                                        <option value="Subcutaneous">Subcutaneous</option>
                                                        <option value="Topical">Topical</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Frequency</label>
                                                    <select
                                                        value={medFreq}
                                                        onChange={e => setMedFreq(e.target.value)}
                                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 bg-white"
                                                    >
                                                        <option value="OD">OD (Once Daily)</option>
                                                        <option value="BD">BD (Twice Daily)</option>
                                                        <option value="TDS">TDS (Three Times Daily)</option>
                                                        <option value="QID">QID (Four Times Daily)</option>
                                                        <option value="PRN">PRN (As Needed)</option>
                                                    </select>
                                                </div>
                                                <div className="col-span-2">
                                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">End Date (Optional)</label>
                                                    <input
                                                        type="date"
                                                        value={medEndDate}
                                                        onChange={e => setMedEndDate(e.target.value)}
                                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 bg-white"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-2 pt-1">
                                                <button
                                                    type="submit"
                                                    disabled={savingMed}
                                                    className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                                                >
                                                    {savingMed ? "Prescribing..." : "Prescribe"}
                                                </button>
                                            </div>
                                        </form>
                                    )}

                                    {activeMeds.length === 0 ? (
                                        <p className="text-gray-500 text-sm">No active medications</p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {(activeMeds as Array<Record<string, unknown>>).map((med, i) => (
                                                <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                                                    <div className="flex items-start justify-between">
                                                        <div>
                                                            <p className="font-semibold text-sm text-gray-900">{med.medication_name as string}</p>
                                                            <p className="text-xs text-gray-500 mt-0.5">{med.dosage as string} · {med.route as string} · {med.frequency as string}</p>
                                                        </div>
                                                        <span className="text-xs bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full font-bold">{med.status as string}</span>
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
                                                        <span>Started: {new Date(med.start_date as string).toLocaleDateString('en-GB')}</span>
                                                        <span className="font-semibold text-gray-500">Dr. {med.prescribed_by as string}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'nursing_tasks' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h2 className="font-semibold text-gray-800">Nursing Tasks</h2>
                                        <button
                                            onClick={() => setShowTaskForm(!showTaskForm)}
                                            className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                                        >
                                            {showTaskForm ? "Cancel" : "Create & Assign Task"}
                                        </button>
                                    </div>

                                    {showTaskForm && (
                                        <form onSubmit={handleCreateTask} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm max-w-xl">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">Assign New Nursing Task</h3>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Task Type</label>
                                                    <select
                                                        value={taskType}
                                                        onChange={e => setTaskType(e.target.value)}
                                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 bg-white"
                                                    >
                                                        <option value="Vitals">Vitals (BP, Temp, etc.)</option>
                                                        <option value="Medication">Medication Administration</option>
                                                        <option value="Dressing">Wound Dressing / Care</option>
                                                        <option value="Sample Collection">Lab Sample Collection</option>
                                                        <option value="General">General / Other Care</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Scheduled Date & Time</label>
                                                    <input
                                                        required
                                                        type="datetime-local"
                                                        value={taskTime}
                                                        onChange={e => setTaskTime(e.target.value)}
                                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 bg-white"
                                                    />
                                                </div>
                                                <div className="col-span-2">
                                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Description / Instructions</label>
                                                    <textarea
                                                        required
                                                        rows={2}
                                                        value={taskDesc}
                                                        onChange={e => setTaskDesc(e.target.value)}
                                                        placeholder="e.g. Check temperature every 4 hours or administer nebulizer"
                                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 resize-none font-sans bg-white"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-2 pt-1">
                                                <button
                                                    type="submit"
                                                    disabled={savingTask}
                                                    className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                                                >
                                                    {savingTask ? "Assigning..." : "Assign Task"}
                                                </button>
                                            </div>
                                        </form>
                                    )}

                                    {!caseSheet?.nursingTasks || caseSheet.nursingTasks.length === 0 ? (
                                        <p className="text-gray-500 text-sm">No nursing tasks scheduled for this day</p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {(caseSheet.nursingTasks as Array<Record<string, any>>).map((task, i) => {
                                                const isCompleted = task.status === 'completed' || task.status === 'Completed';
                                                return (
                                                    <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-between gap-2 shadow-sm">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                                                    {task.task_type || 'General'}
                                                                </span>
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isCompleted ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                                                    {task.status || 'Pending'}
                                                                </span>
                                                            </div>
                                                            <p className="text-sm text-gray-800 mt-2 font-semibold">{task.description}</p>
                                                        </div>
                                                        <div className="text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                                                            <span>Scheduled: {new Date(task.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                                                            {task.completed_at && <span>Completed: {new Date(task.completed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

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

                            {!['treatment', 'clinical_order', 'physician_order', 'active_meds', 'referral', 'charts', 'dietary', 'nursing_tasks'].includes(activeTab) && (
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
