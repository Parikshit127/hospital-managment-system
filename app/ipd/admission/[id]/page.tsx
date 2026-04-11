'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
    User, Bed, Clock, ClipboardEdit, Utensils, MoveRight, Stethoscope,
    FileText, CheckCircle2, Pencil, Receipt, AlertTriangle,
    Loader2, Plus, X, DollarSign, Activity, LogOut, HeartPulse,
    ArrowLeftRight, CreditCard, TrendingUp, CalendarDays,
    ShieldAlert, Info, ChevronRight
} from 'lucide-react';
import {
    getAdmissionFullDetails, createNursingTask, changeAdmissionDoctor,
    recordWardRound, assignDietPlan, addMedicalNote, getWardsWithBeds, transferPatient,
    updateAdmissionDiagnosis
} from '@/app/actions/ipd-actions';
import { generateInterimBill, postChargeToIpdBill } from '@/app/actions/ipd-finance-actions';
import { useToast } from '@/app/components/ui/Toast';
import {
    setExpectedDischargeDate, markFitForDischarge,
    getIPDVitalsHistory, recordIPDVitals,
    requestConsultation, getAdmissionConsultants,
    getPreDischargeChecklist,
    getAdmissionPreAuths,
    submitTPAClaim, recordTPAQuery, recordTPASettlement,
} from '@/app/actions/ipd-nursing-actions';
import { NEWSScoreBadge } from '@/app/components/ipd/NEWSScoreBadge';
import { PreDischargeChecklist } from '@/app/components/ipd/PreDischargeChecklist';

const TABS = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'clinical', label: 'Clinical', icon: Stethoscope },
    { id: 'nursing', label: 'Nursing', icon: HeartPulse },
    { id: 'vitals', label: 'Vitals', icon: Activity },
    { id: 'diet', label: 'Diet', icon: Utensils },
    { id: 'billing', label: 'Billing', icon: Receipt },
    { id: 'discharge', label: 'Discharge', icon: LogOut },
];

const DIET_TYPES = ['Normal', 'Soft', 'Liquid', 'NPO', 'Diabetic', 'Renal', 'Cardiac'];

export default function AdmissionDetailPage() {
    const toast = useToast();
    const params = useParams();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    // Doctor change
    const [showDoctorForm, setShowDoctorForm] = useState(false);
    const [newDoctorName, setNewDoctorName] = useState('');
    const [savingDoctor, setSavingDoctor] = useState(false);

    // Nursing task
    const [taskType, setTaskType] = useState('Vitals');
    const [taskDesc, setTaskDesc] = useState('');
    const [taskTime, setTaskTime] = useState('');
    const [savingTask, setSavingTask] = useState(false);

    // Clinical classification
    const [showDiagnosisForm, setShowDiagnosisForm] = useState(false);
    const [diagIcd, setDiagIcd] = useState('');
    const [diagPatientClass, setDiagPatientClass] = useState('');
    const [diagIsolationType, setDiagIsolationType] = useState('');
    const [diagDischargeType, setDiagDischargeType] = useState('');
    const [savingDiag, setSavingDiag] = useState(false);

    // Ward round
    const [roundObs, setRoundObs] = useState('');
    const [roundPlan, setRoundPlan] = useState('');
    const [roundFee, setRoundFee] = useState('');
    const [savingRound, setSavingRound] = useState(false);
    const [soapMode, setSoapMode] = useState(false);
    const [roundType, setRoundType] = useState('Attending');
    const [roundSubjective, setRoundSubjective] = useState('');
    const [roundObjective, setRoundObjective] = useState('');
    const [roundAssessment, setRoundAssessment] = useState('');
    const [roundPlanSoap, setRoundPlanSoap] = useState('');
    const [roundEscalation, setRoundEscalation] = useState(false);
    const [roundNextReview, setRoundNextReview] = useState('');

    // Medical note
    const [noteType, setNoteType] = useState('Progress Note');
    const [noteDetails, setNoteDetails] = useState('');
    const [savingNote, setSavingNote] = useState(false);

    // Diet
    const [dietType, setDietType] = useState('Normal');
    const [dietInstructions, setDietInstructions] = useState('');
    const [savingDiet, setSavingDiet] = useState(false);
    const [dietCalories, setDietCalories] = useState('');
    const [dietFluidRestriction, setDietFluidRestriction] = useState('');
    const [dietReligious, setDietReligious] = useState('');
    const [dietTexture, setDietTexture] = useState('Normal');
    const [dietFeedingRoute, setDietFeedingRoute] = useState('Oral');

    // Billing
    const [bill, setBill] = useState<any>(null);
    const [loadingBill, setLoadingBill] = useState(false);
    const [chargeDesc, setChargeDesc] = useState('');
    const [chargeQty, setChargeQty] = useState('1');
    const [chargeRate, setChargeRate] = useState('');
    const [chargeCategory, setChargeCategory] = useState('Miscellaneous');
    const [postingCharge, setPostingCharge] = useState(false);

    // Transfer
    const [showTransfer, setShowTransfer] = useState(false);
    const [availableWards, setAvailableWards] = useState<any[]>([]);
    const [loadingWards, setLoadingWards] = useState(false);
    const [transferWard, setTransferWard] = useState('');
    const [transferBed, setTransferBed] = useState('');
    const [transferReason, setTransferReason] = useState('');
    const [transferring, setTransferring] = useState(false);

    // EDD + vitals
    const [eddValue, setEddValue] = useState('');
    const [savingEdd, setSavingEdd] = useState(false);
    const [vitalsHistory, setVitalsHistory] = useState<any[]>([]);
    const [vitalsLoaded, setVitalsLoaded] = useState(false);
    const [vitalsForm, setVitalsForm] = useState({
        bp_systolic: '', bp_diastolic: '', heart_rate: '', temperature: '',
        respiratory_rate: '', spo2: '', pain_score: '', consciousness: 'Alert',
        blood_sugar: '', urine_output_ml: '', recorded_by: '',
    });
    const [savingVitals, setSavingVitals] = useState(false);
    const [showVitalsForm, setShowVitalsForm] = useState(false);

    // Consultants
    const [consultants, setConsultants] = useState<any[]>([]);
    const [showConsultForm, setShowConsultForm] = useState(false);
    const [consultName, setConsultName] = useState('');
    const [consultSpecialty, setConsultSpecialty] = useState('');

    // Pre-discharge checklist
    const [dischargeChecklist, setDischargeChecklist] = useState<any[]>([]);

    // TPA / pre-auth
    const [preauths, setPreauths] = useState<any[]>([]);
    const [consultNotes, setConsultNotes] = useState('');
    const [savingConsult, setSavingConsult] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await getAdmissionFullDetails(params.id as string);
        if (res.success) setData(res.data);
        setLoading(false);
    }, [params.id]);

    const loadChecklist = useCallback(async () => {
        const res = await getPreDischargeChecklist(params.id as string);
        if (res.success && res.data) setDischargeChecklist(res.data.checklist);
    }, [params.id]);

    useEffect(() => { loadData(); }, [loadData]);
    useEffect(() => {
        if (activeTab === 'discharge') loadChecklist();
    }, [activeTab, loadChecklist]);

    const loadBill = useCallback(async () => {
        if (bill) return;
        setLoadingBill(true);
        const res = await generateInterimBill(params.id as string);
        if (res.success) setBill(res.data);
        else toast.error('Failed to load bill');
        setLoadingBill(false);
    }, [params.id, bill]);

    useEffect(() => {
        if (activeTab === 'billing') loadBill();
    }, [activeTab, loadBill]);

    useEffect(() => {
        if (activeTab === 'vitals' && !vitalsLoaded && params.id) {
            getIPDVitalsHistory(params.id as string).then(res => {
                if (res.success) setVitalsHistory((res.data as any[]).reverse());
                setVitalsLoaded(true);
            });
            getAdmissionConsultants(params.id as string).then(res => {
                if (res.success) setConsultants(res.data as any[]);
            });
            getAdmissionPreAuths(params.id as string).then(res => {
                if (res.success) setPreauths(res.data as any[]);
            });
        }
    }, [activeTab, vitalsLoaded, params.id]);

    const handleSaveEdd = async () => {
        if (!eddValue) return;
        setSavingEdd(true);
        await setExpectedDischargeDate(data.admission_id, eddValue);
        setSavingEdd(false);
        setEddValue('');
        loadData();
    };

    const handleSaveVitals = async () => {
        setSavingVitals(true);
        const res = await recordIPDVitals({
            admission_id: data.admission_id,
            patient_id: data.patient_id,
            bp_systolic: vitalsForm.bp_systolic ? Number(vitalsForm.bp_systolic) : undefined,
            bp_diastolic: vitalsForm.bp_diastolic ? Number(vitalsForm.bp_diastolic) : undefined,
            heart_rate: vitalsForm.heart_rate ? Number(vitalsForm.heart_rate) : undefined,
            temperature: vitalsForm.temperature ? Number(vitalsForm.temperature) : undefined,
            respiratory_rate: vitalsForm.respiratory_rate ? Number(vitalsForm.respiratory_rate) : undefined,
            spo2: vitalsForm.spo2 ? Number(vitalsForm.spo2) : undefined,
            pain_score: vitalsForm.pain_score ? Number(vitalsForm.pain_score) : undefined,
            consciousness: vitalsForm.consciousness,
            blood_sugar: vitalsForm.blood_sugar ? Number(vitalsForm.blood_sugar) : undefined,
            urine_output_ml: vitalsForm.urine_output_ml ? Number(vitalsForm.urine_output_ml) : undefined,
            recorded_by: vitalsForm.recorded_by,
        });
        setSavingVitals(false);
        if (res.success) {
            toast.success('Vitals recorded');
            setShowVitalsForm(false);
            setVitalsLoaded(false); // force reload
            setVitalsForm({ bp_systolic: '', bp_diastolic: '', heart_rate: '', temperature: '', respiratory_rate: '', spo2: '', pain_score: '', consciousness: 'Alert', blood_sugar: '', urine_output_ml: '', recorded_by: '' });
        } else {
            toast.error('Failed to record vitals');
        }
    };

    const handleAddConsultant = async () => {
        if (!consultName.trim()) return;
        setSavingConsult(true);
        await requestConsultation({ admission_id: data.admission_id, doctor_name: consultName, specialty: consultSpecialty, notes: consultNotes });
        setSavingConsult(false);
        setShowConsultForm(false);
        setConsultName(''); setConsultSpecialty(''); setConsultNotes('');
        getAdmissionConsultants(data.admission_id).then(res => { if (res.success) setConsultants(res.data as any[]); });
    };

    const handleSaveDiagnosis = async () => {
        setSavingDiag(true);
        const res = await updateAdmissionDiagnosis({
            admission_id: data.admission_id,
            primary_diagnosis_icd: diagIcd || undefined,
            patient_class: diagPatientClass || undefined,
            isolation_type: diagIsolationType || undefined,
            discharge_type: diagDischargeType || undefined,
        });
        setSavingDiag(false);
        if (res.success) {
            toast.success('Clinical classification updated');
            setShowDiagnosisForm(false);
            loadData();
        } else {
            toast.error(res.error || 'Failed');
        }
    };

    const openTransfer = async () => {
        setShowTransfer(true);
        setLoadingWards(true);
        const res = await getWardsWithBeds();
        if (res.success) setAvailableWards(res.data || []);
        setLoadingWards(false);
    };

    const handleTransfer = async () => {
        if (!transferBed) { toast.error('Select a bed'); return; }
        setTransferring(true);
        const res = await transferPatient({
            admission_id: data.admission_id,
            to_bed_id: transferBed,
            reason: transferReason || 'Manual transfer',
        });
        setTransferring(false);
        if (res.success) {
            toast.success('Patient transferred');
            setShowTransfer(false);
            setTransferWard(''); setTransferBed(''); setTransferReason('');
            loadData();
        } else {
            toast.error(res.error || 'Transfer failed');
        }
    };

    const handleChangeDoctor = async () => {
        const trimmed = newDoctorName.trim();
        if (!trimmed) { toast.error('Enter doctor name'); return; }
        setSavingDoctor(true);
        const res = await changeAdmissionDoctor(data.admission_id, trimmed);
        setSavingDoctor(false);
        if (res.success) {
            toast.success(`Doctor changed to Dr. ${trimmed}`);
            setShowDoctorForm(false);
            setNewDoctorName('');
            loadData();
        } else {
            toast.error(res.error || 'Failed');
        }
    };

    const handleAddTask = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setSavingTask(true);
        const res = await createNursingTask({
            admission_id: data.admission_id,
            task_type: taskType,
            description: taskDesc,
            scheduled_at: taskTime,
        });
        setSavingTask(false);
        if (res.success) {
            toast.success('Task created');
            setTaskType('Vitals'); setTaskDesc(''); setTaskTime('');
            loadData();
        } else {
            toast.error('Failed to create task');
        }
    };

    const handleRecordRound = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        const hasContent = soapMode ? (roundSubjective.trim() || roundObjective.trim()) : roundObs.trim();
        if (!hasContent) { toast.error('Enter observations or SOAP notes'); return; }
        setSavingRound(true);
        const res = await recordWardRound({
            admission_id: data.admission_id,
            ...(soapMode ? {
                subjective: roundSubjective,
                objective: roundObjective,
                assessment: roundAssessment,
                plan: roundPlanSoap,
                escalation_required: roundEscalation,
                next_review_in_hours: roundNextReview ? Number(roundNextReview) : undefined,
            } : {
                observations: roundObs,
                plan_changes: roundPlan,
            }),
            round_type: roundType,
            visit_fee: roundFee ? Number(roundFee) : 0,
        });
        setSavingRound(false);
        if (res.success) {
            toast.success('Ward round recorded');
            setRoundObs(''); setRoundPlan(''); setRoundFee('');
            setRoundSubjective(''); setRoundObjective(''); setRoundAssessment('');
            setRoundPlanSoap(''); setRoundEscalation(false); setRoundNextReview('');
            loadData();
            setBill(null);
        } else {
            toast.error(res.error || 'Failed');
        }
    };

    const handleAddNote = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!noteDetails.trim()) { toast.error('Enter note details'); return; }
        setSavingNote(true);
        const res = await addMedicalNote(data.admission_id, noteType, noteDetails);
        setSavingNote(false);
        if (res.success) {
            toast.success('Note added');
            setNoteDetails('');
            loadData();
        } else {
            toast.error('Failed');
        }
    };

    const handleAssignDiet = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setSavingDiet(true);
        const res = await assignDietPlan({
            admission_id: data.admission_id,
            diet_type: dietType,
            instructions: dietInstructions,
            calorie_target: dietCalories ? Number(dietCalories) : undefined,
            fluid_restriction_ml: dietFluidRestriction ? Number(dietFluidRestriction) : undefined,
            religious_restrictions: dietReligious || undefined,
            texture_modification: dietTexture !== 'Normal' ? dietTexture : undefined,
            feeding_route: dietFeedingRoute !== 'Oral' ? dietFeedingRoute : undefined,
        });
        setSavingDiet(false);
        if (res.success) {
            toast.success('Diet plan assigned');
            setDietInstructions('');
            loadData();
        } else {
            toast.error('Failed');
        }
    };

    const handlePostCharge = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!chargeDesc.trim() || !chargeRate) { toast.error('Fill description and rate'); return; }
        setPostingCharge(true);
        const res = await postChargeToIpdBill({
            admission_id: data.admission_id,
            source_module: 'manual',
            description: chargeDesc,
            quantity: Number(chargeQty) || 1,
            unit_price: Number(chargeRate),
            service_category: chargeCategory,
        });
        setPostingCharge(false);
        if (res.success) {
            toast.success('Charge posted');
            setChargeDesc(''); setChargeQty('1'); setChargeRate(''); setChargeCategory('Miscellaneous');
            setBill(null); // reset bill cache so it reloads
            loadBill();
        } else {
            toast.error(res.error || 'Failed');
        }
    };

    if (loading) return (
        <AppShell pageTitle="Loading">
            <div className="flex items-center justify-center h-64 gap-3 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm font-medium">Loading patient record...</span>
            </div>
        </AppShell>
    );
    if (!data) return (
        <AppShell pageTitle="Not Found">
            <div className="flex flex-col items-center justify-center h-64 gap-3">
                <ShieldAlert className="h-10 w-10 text-rose-300" />
                <p className="text-sm font-bold text-rose-500">Admission not found.</p>
            </div>
        </AppShell>
    );

    const daysAdmitted = Math.max(1, Math.ceil(
        (new Date().getTime() - new Date(data.admission_date).getTime()) / (1000 * 60 * 60 * 24)
    ));
    const wardCostPerDay = Number(data.bed?.wards?.cost_per_day || 0);
    const estimatedBedCost = daysAdmitted * wardCostPerDay;
    const activeDiet = data.diet_plans?.find((d: any) => d.is_active);

    // Timeline merged and sorted
    const timelineEvents = [
        ...(data.ward_rounds || []).map((r: any) => ({ ...r, _type: 'ward_round', _date: new Date(r.created_at) })),
        ...(data.bed_transfers || []).map((t: any) => ({ ...t, _type: 'transfer', _date: new Date(t.created_at) })),
        ...(data.medical_notes || []).map((n: any) => ({ ...n, _type: 'note', _date: new Date(n.created_at) })),
    ].sort((a, b) => b._date.getTime() - a._date.getTime());

    const currentWardBeds = availableWards
        .find((w: any) => w.ward_id.toString() === transferWard)
        ?.beds?.filter((b: any) => b.status === 'Available') || [];

    // Group bill items by category
    const billItemsByCategory: Record<string, any[]> = {};
    if (bill?.items) {
        for (const item of bill.items) {
            const cat = item.service_category || item.department || 'Miscellaneous';
            if (!billItemsByCategory[cat]) billItemsByCategory[cat] = [];
            billItemsByCategory[cat].push(item);
        }
    }

    return (
        <AppShell
            pageTitle="IPD Patient Chart"
            pageIcon={<Bed className="h-5 w-5" />}
        >
            <div className="max-w-6xl mx-auto space-y-4">

                {/* ── Header Card ── */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-teal-500 rounded-l-2xl" />
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="pl-2">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-xl font-black text-gray-900">{data.patient?.full_name}</h2>
                                <span className={`text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider font-black ${
                                    data.status === 'Admitted'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-gray-100 text-gray-600'
                                }`}>{data.status}</span>
                                {data.status === 'Admitted' && (
                                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-bold flex items-center gap-1">
                                        <CalendarDays className="h-3 w-3" /> Day {daysAdmitted}
                                    </span>
                                )}
                                {data.news_score_latest != null && (
                                    <NEWSScoreBadge score={data.news_score_latest} size="sm" />
                                )}
                                {data.expected_discharge_date && (
                                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold flex items-center gap-1 ${new Date(data.expected_discharge_date) < new Date() ? 'bg-red-50 text-red-600' : 'bg-violet-50 text-violet-700'}`}>
                                        <CalendarDays className="h-3 w-3" />
                                        EDD: {new Date(data.expected_discharge_date).toLocaleDateString()}
                                    </span>
                                )}
                            </div>
                            <div className="mt-2 text-xs font-medium text-gray-500 flex flex-wrap gap-x-5 gap-y-1.5">
                                <span className="flex items-center gap-1.5">
                                    <User className="h-3.5 w-3.5 text-gray-400" />
                                    {data.patient?.age} yrs • {data.patient?.gender}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Bed className="h-3.5 w-3.5 text-indigo-400" />
                                    {data.bed?.wards?.ward_name || 'Unassigned'} · {data.bed_id || 'No bed'}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Stethoscope className="h-3.5 w-3.5 text-violet-400" />
                                    Dr. {data.doctor_name}
                                    {data.status === 'Admitted' && !showDoctorForm && (
                                        <button
                                            onClick={() => { setNewDoctorName(data.doctor_name || ''); setShowDoctorForm(true); }}
                                            className="ml-0.5 p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-teal-600"
                                        >
                                            <Pencil className="h-3 w-3" />
                                        </button>
                                    )}
                                </span>
                                {data.patient?.phone && (
                                    <span className="flex items-center gap-1.5">
                                        <Info className="h-3.5 w-3.5 text-gray-400" />
                                        {data.patient.phone}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                            {data.status === 'Admitted' && (
                                <>
                                    <button
                                        onClick={openTransfer}
                                        className="flex items-center gap-1.5 px-3 py-2 border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-xl hover:bg-indigo-100 transition-colors"
                                    >
                                        <ArrowLeftRight className="h-3.5 w-3.5" /> Transfer Bed
                                    </button>
                                    <Link href={`/ipd/discharge-settlement/${data.admission_id}`}>
                                        <button className="flex items-center gap-1.5 px-3 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl transition-colors shadow-sm">
                                            <LogOut className="h-3.5 w-3.5" /> Discharge
                                        </button>
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Change Doctor Inline */}
                    {showDoctorForm && (
                        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-3 pl-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">New Doctor:</label>
                            <input
                                type="text"
                                value={newDoctorName}
                                onChange={e => setNewDoctorName(e.target.value)}
                                placeholder="Enter doctor name"
                                className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 w-52"
                                autoFocus
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleChangeDoctor();
                                    if (e.key === 'Escape') { setShowDoctorForm(false); setNewDoctorName(''); }
                                }}
                            />
                            <button
                                onClick={handleChangeDoctor}
                                disabled={savingDoctor}
                                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
                            >
                                {savingDoctor ? 'Saving...' : 'Save'}
                            </button>
                            <button
                                onClick={() => { setShowDoctorForm(false); setNewDoctorName(''); }}
                                className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-lg"
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Tab Nav ── */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="flex border-b border-gray-200 overflow-x-auto">
                        {TABS.map(tab => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold whitespace-nowrap transition-colors border-b-2 ${
                                        activeTab === tab.id
                                            ? 'border-teal-500 text-teal-700 bg-teal-50/50'
                                            : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                                    }`}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="p-6">

                        {/* ════════════════════════════ OVERVIEW ════════════════════════════ */}
                        {activeTab === 'overview' && (
                            <div className="space-y-6">
                                {/* Stats Row */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <StatCard label="Days Admitted" value={`${daysAdmitted} day${daysAdmitted !== 1 ? 's' : ''}`} icon={<CalendarDays className="h-4 w-4 text-blue-500" />} color="blue" />
                                    <StatCard label="Ward / Bed" value={data.bed?.wards?.ward_name || 'Unassigned'} sub={data.bed_id || '—'} icon={<Bed className="h-4 w-4 text-indigo-500" />} color="indigo" />
                                    <StatCard label="Est. Bed Cost" value={`₹${estimatedBedCost.toLocaleString()}`} sub={wardCostPerDay ? `₹${wardCostPerDay}/day` : 'Rate not set'} icon={<TrendingUp className="h-4 w-4 text-teal-500" />} color="teal" />
                                    <StatCard label="Nursing Tasks" value={`${data.nursing_tasks?.filter((t: any) => t.status === 'Completed').length || 0} / ${data.nursing_tasks?.length || 0}`} sub="completed" icon={<HeartPulse className="h-4 w-4 text-purple-500" />} color="purple" />
                                </div>

                                {/* Admission Details */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-3">
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Admission Details</h4>
                                        <DetailRow label="Admitted" value={new Date(data.admission_date).toLocaleString()} />
                                        <DetailRow label="Diagnosis" value={data.diagnosis} />
                                        <DetailRow label="Type" value={data.admission_type || '—'} />
                                        <DetailRow label="Treatment" value={data.line_of_treatment || '—'} />
                                        {data.surgery_requested && <DetailRow label="Surgery" value={data.surgery_requested} />}
                                        {data.discharge_date && <DetailRow label="Discharged" value={new Date(data.discharge_date).toLocaleString()} />}
                                    </div>
                                    <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-3">
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Patient Details</h4>
                                        <DetailRow label="Patient ID" value={data.patient_id} mono />
                                        <DetailRow label="Name" value={data.patient?.full_name} />
                                        <DetailRow label="Age / Gender" value={`${data.patient?.age} yrs • ${data.patient?.gender}`} />
                                        <DetailRow label="Phone" value={data.patient?.phone || '—'} />
                                        {data.case_is_rta && <div className="flex items-center gap-2 pt-1"><AlertTriangle className="h-4 w-4 text-amber-500" /><span className="text-xs font-bold text-amber-700">Road Traffic Accident Case</span></div>}
                                        {data.case_fir_number && <DetailRow label="FIR No." value={data.case_fir_number} />}
                                        {data.past_ailments && <DetailRow label="Past Ailments" value={data.past_ailments} />}
                                    </div>
                                </div>

                                {/* Clinical Classification */}
                                <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Clinical Classification</h4>
                                        {data.status === 'Admitted' && (
                                            <button onClick={() => setShowDiagnosisForm(v => !v)}
                                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50">
                                                {showDiagnosisForm ? 'Cancel' : 'Edit'}
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <DetailRow label="Primary ICD-10" value={data.primary_diagnosis_icd || 'Not set'} />
                                        <DetailRow label="Patient Class" value={data.patient_class || 'General'} />
                                        <DetailRow label="Isolation" value={data.isolation_type || 'None'} />
                                    </div>
                                    {showDiagnosisForm && data.status === 'Admitted' && (
                                        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                                            <p className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Update Clinical Classification</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-500">Primary ICD-10</label>
                                                    <input value={diagIcd} onChange={e => setDiagIcd(e.target.value)} placeholder="e.g. J18.9"
                                                        className="w-full mt-1 text-xs border border-indigo-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-500">Patient Class</label>
                                                    <select value={diagPatientClass} onChange={e => setDiagPatientClass(e.target.value)}
                                                        className="w-full mt-1 text-xs border border-indigo-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                                                        <option value="">— Select —</option>
                                                        {['General', 'SemiPrivate', 'Private', 'Suite', 'ICU', 'NICU', 'PICU'].map(c => <option key={c}>{c}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-500">Isolation Type</label>
                                                    <select value={diagIsolationType} onChange={e => setDiagIsolationType(e.target.value)}
                                                        className="w-full mt-1 text-xs border border-indigo-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                                                        <option value="">None</option>
                                                        {['Contact', 'Droplet', 'Airborne', 'Reverse'].map(c => <option key={c}>{c}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-500">Discharge Type (planned)</label>
                                                    <select value={diagDischargeType} onChange={e => setDiagDischargeType(e.target.value)}
                                                        className="w-full mt-1 text-xs border border-indigo-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                                                        <option value="">— Select —</option>
                                                        {['Normal', 'LAMA', 'DAMA', 'Absconded', 'Death', 'Transfer'].map(c => <option key={c}>{c}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={handleSaveDiagnosis} disabled={savingDiag}
                                                    className="flex-1 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg disabled:opacity-50">
                                                    {savingDiag ? 'Saving…' : 'Save'}
                                                </button>
                                                <button onClick={() => setShowDiagnosisForm(false)}
                                                    className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg">
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Active Diet Quick View */}
                                {activeDiet && (
                                    <div className="flex items-center gap-3 p-4 bg-orange-50 border border-orange-100 rounded-xl">
                                        <Utensils className="h-5 w-5 text-orange-500 shrink-0" />
                                        <div>
                                            <p className="text-xs font-black text-orange-700 uppercase tracking-wide">Active Diet: {activeDiet.diet_type}</p>
                                            {activeDiet.instructions && <p className="text-xs text-orange-600 mt-0.5">{activeDiet.instructions}</p>}
                                        </div>
                                    </div>
                                )}

                                {/* Quick Links */}
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {[
                                        { label: 'Nursing Station', href: `/ipd/nursing-station/${data.admission_id}`, icon: HeartPulse },
                                        { label: 'Discharge Settlement', href: `/ipd/discharge-settlement/${data.admission_id}`, icon: LogOut },
                                        { label: 'Ward Rounds', href: `/ipd/ward-rounds`, icon: Stethoscope },
                                    ].map(link => {
                                        const Icon = link.icon;
                                        return (
                                            <Link key={link.href} href={link.href}>
                                                <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:border-teal-300 hover:bg-teal-50/50 transition-colors cursor-pointer group">
                                                    <Icon className="h-4 w-4 text-gray-400 group-hover:text-teal-600" />
                                                    <span className="text-xs font-bold text-gray-600 group-hover:text-teal-700">{link.label}</span>
                                                    <ChevronRight className="h-3.5 w-3.5 text-gray-300 ml-auto group-hover:text-teal-500" />
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ════════════════════════════ CLINICAL ════════════════════════════ */}
                        {activeTab === 'clinical' && (
                            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                                {/* Left: Timeline */}
                                <div className="lg:col-span-3 space-y-1">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <Clock className="h-3.5 w-3.5 text-teal-500" /> Clinical Timeline
                                    </h3>
                                    <div className="relative border-l-2 border-gray-100 ml-3 space-y-6 pl-6">
                                        {timelineEvents.length === 0 && (
                                            <p className="text-xs text-gray-400 py-4">No clinical events recorded.</p>
                                        )}
                                        {timelineEvents.map((event: any, i: number) => {
                                            if (event._type === 'ward_round') return (
                                                <div key={`wr-${event.id}`} className="relative">
                                                    <span className="absolute -left-[35px] bg-blue-100 rounded-full p-1.5 border-4 border-white shadow-sm">
                                                        <Stethoscope className="h-3.5 w-3.5 text-blue-600" />
                                                    </span>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase">{event._date.toLocaleString()}</p>
                                                    <div className="bg-blue-50/50 rounded-xl p-4 mt-1 border border-blue-100">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Ward Round</p>
                                                            {event.round_type && event.round_type !== 'Attending' && (
                                                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full">{event.round_type}</span>
                                                            )}
                                                            {event.escalation_required && (
                                                                <span className="text-[9px] font-black px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full">⚠ Escalation</span>
                                                            )}
                                                        </div>
                                                        {event.subjective ? (
                                                            <div className="space-y-1 text-xs">
                                                                {event.subjective && <p><span className="font-bold text-blue-500">S: </span><span className="text-gray-700">{event.subjective}</span></p>}
                                                                {event.objective && <p><span className="font-bold text-green-600">O: </span><span className="text-gray-700">{event.objective}</span></p>}
                                                                {event.assessment && <p><span className="font-bold text-orange-500">A: </span><span className="text-gray-700">{event.assessment}</span></p>}
                                                                {event.plan && <p><span className="font-bold text-purple-600">P: </span><span className="text-gray-700">{event.plan}</span></p>}
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <p className="text-xs text-gray-700"><span className="font-bold text-gray-400">Obs: </span>{event.observations}</p>
                                                                {event.plan_changes && <p className="text-xs text-gray-700 mt-1"><span className="font-bold text-gray-400">Plan: </span>{event.plan_changes}</p>}
                                                            </>
                                                        )}
                                                        {Number(event.visit_fee) > 0 && <p className="text-[10px] text-blue-600 font-bold mt-1.5">Fee: ₹{Number(event.visit_fee).toLocaleString()}</p>}
                                                    </div>
                                                </div>
                                            );
                                            if (event._type === 'transfer') return (
                                                <div key={`tr-${event.id}`} className="relative">
                                                    <span className="absolute -left-[35px] bg-amber-100 rounded-full p-1.5 border-4 border-white shadow-sm">
                                                        <MoveRight className="h-3.5 w-3.5 text-amber-600" />
                                                    </span>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase">{event._date.toLocaleString()}</p>
                                                    <div className="bg-amber-50/50 rounded-xl p-3 mt-1 border border-amber-100 text-xs">
                                                        Transferred: <strong className="text-amber-700">{event.from_bed_id}</strong> → <strong className="text-amber-700">{event.to_bed_id}</strong>
                                                        {event.reason && <span className="block text-gray-400 mt-0.5 italic">"{event.reason}"</span>}
                                                    </div>
                                                </div>
                                            );
                                            if (event._type === 'note') return (
                                                <div key={`note-${event.note_id || i}`} className="relative">
                                                    <span className="absolute -left-[35px] bg-gray-100 rounded-full p-1.5 border-4 border-white shadow-sm">
                                                        <FileText className="h-3.5 w-3.5 text-gray-500" />
                                                    </span>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase">{event._date.toLocaleString()}</p>
                                                    <div className="bg-white rounded-xl p-3 mt-1 border border-gray-200 text-xs shadow-sm">
                                                        <span className="text-[10px] uppercase font-black text-teal-600 block mb-1">{event.note_type || 'Note'}</span>
                                                        {event.details}
                                                    </div>
                                                </div>
                                            );
                                            return null;
                                        })}
                                        <div className="relative">
                                            <span className="absolute -left-[35px] bg-emerald-100 rounded-full p-1.5 border-4 border-white shadow-sm">
                                                <ChevronsDown className="h-3.5 w-3.5 text-emerald-600" />
                                            </span>
                                            <p className="text-[10px] font-bold text-emerald-600 uppercase">Admission Initiated · {new Date(data.admission_date).toLocaleString()}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Forms */}
                                <div className="lg:col-span-2 space-y-5">
                                    {/* Record Ward Round */}
                                    {data.status === 'Admitted' && (
                                        <form onSubmit={handleRecordRound} className="bg-blue-50 border border-blue-100 rounded-xl p-5 space-y-3">
                                            <h4 className="text-[10px] font-black text-blue-700 uppercase tracking-widest flex items-center gap-2">
                                                <Stethoscope className="h-3.5 w-3.5" /> Record Ward Round
                                            </h4>
                                            {/* Round type + SOAP toggle */}
                                            <div className="flex items-center gap-3">
                                                <select value={roundType} onChange={e => setRoundType(e.target.value)}
                                                    className="text-xs border border-blue-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                                                    {['Attending', 'Consulting', 'Nursing', 'Specialist'].map(t => <option key={t}>{t}</option>)}
                                                </select>
                                                <label className="flex items-center gap-1.5 text-xs cursor-pointer font-semibold text-blue-700">
                                                    <input type="checkbox" checked={soapMode} onChange={e => setSoapMode(e.target.checked)} className="rounded" />
                                                    SOAP Mode
                                                </label>
                                            </div>
                                            {soapMode ? (
                                                <div className="space-y-2">
                                                    <textarea rows={2} placeholder="S — Subjective (patient-reported symptoms, pain score)"
                                                        className="w-full text-xs p-2.5 bg-white border border-blue-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                        value={roundSubjective} onChange={e => setRoundSubjective(e.target.value)} />
                                                    <textarea rows={2} placeholder="O — Objective (exam findings, vitals summary)"
                                                        className="w-full text-xs p-2.5 bg-white border border-blue-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                        value={roundObjective} onChange={e => setRoundObjective(e.target.value)} />
                                                    <textarea rows={2} placeholder="A — Assessment (diagnosis update, differential)"
                                                        className="w-full text-xs p-2.5 bg-white border border-blue-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                        value={roundAssessment} onChange={e => setRoundAssessment(e.target.value)} />
                                                    <textarea rows={2} placeholder="P — Plan (treatment changes, orders)"
                                                        className="w-full text-xs p-2.5 bg-white border border-blue-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                        value={roundPlanSoap} onChange={e => setRoundPlanSoap(e.target.value)} />
                                                    <div className="flex items-center gap-3">
                                                        <input type="number" min={1} max={48} placeholder="Review in (hours)"
                                                            className="text-xs border border-blue-200 rounded-lg px-2 py-1.5 w-36 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                            value={roundNextReview} onChange={e => setRoundNextReview(e.target.value)} />
                                                        <label className="flex items-center gap-1.5 text-xs text-red-600 cursor-pointer font-semibold">
                                                            <input type="checkbox" checked={roundEscalation} onChange={e => setRoundEscalation(e.target.checked)} />
                                                            Escalation Required
                                                        </label>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <textarea rows={3} placeholder="Observations (symptoms, vitals, findings)..."
                                                        className="w-full text-xs p-2.5 bg-white border border-blue-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                        value={roundObs} onChange={e => setRoundObs(e.target.value)} />
                                                    <textarea rows={2} placeholder="Assessment & Plan (optional)..."
                                                        className="w-full text-xs p-2.5 bg-white border border-blue-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                        value={roundPlan} onChange={e => setRoundPlan(e.target.value)} />
                                                </div>
                                            )}
                                            <div className="flex gap-2 items-center">
                                                <input type="number" value={roundFee} onChange={e => setRoundFee(e.target.value)}
                                                    placeholder="Visit fee (₹)"
                                                    className="flex-1 text-xs p-2.5 bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
                                                <button type="submit" disabled={savingRound}
                                                    className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors">
                                                    {savingRound ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                                    Record
                                                </button>
                                            </div>
                                        </form>
                                    )}

                                    {/* Add Medical Note */}
                                    {data.status === 'Admitted' && (
                                        <form onSubmit={handleAddNote} className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
                                            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                                <FileText className="h-3.5 w-3.5" /> Add Clinical Note
                                            </h4>
                                            <select
                                                value={noteType}
                                                onChange={e => setNoteType(e.target.value)}
                                                className="w-full text-xs p-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
                                            >
                                                {['Progress Note', 'Consultation Note', 'Procedure Note', 'Discharge Note', 'Other'].map(t => (
                                                    <option key={t}>{t}</option>
                                                ))}
                                            </select>
                                            <textarea
                                                required
                                                value={noteDetails}
                                                onChange={e => setNoteDetails(e.target.value)}
                                                placeholder="Note details..."
                                                className="w-full text-xs p-2.5 bg-white border border-gray-200 rounded-lg h-20 resize-none focus:outline-none focus:ring-2 focus:ring-teal-400"
                                            />
                                            <button
                                                type="submit"
                                                disabled={savingNote}
                                                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
                                            >
                                                {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                                Add Note
                                            </button>
                                        </form>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ════════════════════════════ NURSING ════════════════════════════ */}
                        {activeTab === 'nursing' && (
                            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                                {/* Task List */}
                                <div className="lg:col-span-3 space-y-3">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <ClipboardEdit className="h-3.5 w-3.5 text-purple-500" /> Nursing Orders
                                    </h3>
                                    {data.nursing_tasks?.length > 0 ? (
                                        data.nursing_tasks.map((t: any) => (
                                            <div key={t.id} className={`p-4 border rounded-xl flex items-start gap-3 ${t.status === 'Completed' ? 'border-gray-100 bg-gray-50/50' : 'border-purple-100 bg-purple-50/30'}`}>
                                                {t.status === 'Completed'
                                                    ? <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                                                    : <Clock className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" />
                                                }
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm font-bold ${t.status === 'Completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                                        {t.description}
                                                    </p>
                                                    <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase">
                                                        {t.task_type} · {new Date(t.scheduled_at).toLocaleString()}
                                                    </p>
                                                    {t.status !== 'Completed' && (
                                                        <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold uppercase">{t.status}</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-12 text-center text-gray-400">
                                            <ClipboardEdit className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                            <p className="text-xs font-medium">No nursing tasks yet</p>
                                        </div>
                                    )}
                                </div>

                                {/* Add Task Form */}
                                {data.status === 'Admitted' && (
                                    <div className="lg:col-span-2">
                                        <form onSubmit={handleAddTask} className="bg-purple-50 border border-purple-100 rounded-xl p-5 space-y-3">
                                            <h4 className="text-[10px] font-black text-purple-700 uppercase tracking-widest flex items-center gap-2">
                                                <Plus className="h-3.5 w-3.5" /> Dispatch New Task
                                            </h4>
                                            <select
                                                value={taskType}
                                                onChange={e => setTaskType(e.target.value)}
                                                className="w-full text-xs p-2.5 bg-white border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
                                            >
                                                {['Vitals', 'Medication', 'Procedure Prep', 'Hygiene', 'Observation'].map(t => (
                                                    <option key={t}>{t}</option>
                                                ))}
                                            </select>
                                            <input
                                                type="datetime-local"
                                                required
                                                value={taskTime}
                                                onChange={e => setTaskTime(e.target.value)}
                                                className="w-full text-xs p-2.5 bg-white border border-purple-200 rounded-lg text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-400"
                                            />
                                            <textarea
                                                required
                                                value={taskDesc}
                                                onChange={e => setTaskDesc(e.target.value)}
                                                placeholder="Task instructions / specs..."
                                                className="w-full text-xs p-2.5 bg-white border border-purple-200 rounded-lg h-20 resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
                                            />
                                            <button
                                                type="submit"
                                                disabled={savingTask}
                                                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
                                            >
                                                {savingTask ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                                Order Task
                                            </button>
                                        </form>

                                        <div className="mt-4 p-4 border border-teal-100 bg-teal-50 rounded-xl text-center">
                                            <Link href={`/ipd/nursing-station/${data.admission_id}`} className="text-xs font-bold text-teal-700 hover:underline flex items-center justify-center gap-1">
                                                Open Full Nursing Workspace <ChevronRight className="h-3.5 w-3.5" />
                                            </Link>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ════════════════════════════ VITALS ════════════════════════════ */}
                        {activeTab === 'vitals' && (
                            <div className="space-y-6">
                                {/* EDD setter */}
                                <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex flex-wrap items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-violet-700">Expected Discharge Date (EDD)</p>
                                        <p className="text-[10px] text-violet-500 mt-0.5">
                                            {data.expected_discharge_date
                                                ? `Currently: ${new Date(data.expected_discharge_date).toLocaleDateString()}`
                                                : 'Not set — set within 24h of admission'}
                                        </p>
                                    </div>
                                    <input type="date" value={eddValue} onChange={e => setEddValue(e.target.value)}
                                        className="border border-violet-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-500 bg-white" />
                                    <button onClick={handleSaveEdd} disabled={savingEdd || !eddValue}
                                        className="px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors">
                                        {savingEdd ? 'Saving...' : 'Set EDD'}
                                    </button>
                                </div>

                                {/* Vitals entry */}
                                <div className="flex justify-end">
                                    <button onClick={() => setShowVitalsForm(v => !v)}
                                        className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 transition-colors">
                                        <Plus className="h-4 w-4" /> Record Vitals
                                    </button>
                                </div>

                                {showVitalsForm && (
                                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
                                        <h3 className="font-bold text-gray-900 text-sm">New Vitals Entry</h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                            {[
                                                { key: 'bp_systolic', label: 'Systolic BP', placeholder: '120' },
                                                { key: 'bp_diastolic', label: 'Diastolic BP', placeholder: '80' },
                                                { key: 'heart_rate', label: 'Heart Rate', placeholder: '72' },
                                                { key: 'temperature', label: 'Temp (°C)', placeholder: '37.0' },
                                                { key: 'respiratory_rate', label: 'RR (/min)', placeholder: '16' },
                                                { key: 'spo2', label: 'SpO2 (%)', placeholder: '98' },
                                                { key: 'pain_score', label: 'Pain (0-10)', placeholder: '0' },
                                                { key: 'blood_sugar', label: 'Blood Sugar', placeholder: 'mg/dL' },
                                                { key: 'urine_output_ml', label: 'Urine (ml)', placeholder: 'ml' },
                                            ].map(({ key, label, placeholder }) => (
                                                <div key={key}>
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">{label}</label>
                                                    <input type="number" value={(vitalsForm as any)[key]} placeholder={placeholder}
                                                        onChange={e => setVitalsForm(f => ({ ...f, [key]: e.target.value }))}
                                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400" />
                                                </div>
                                            ))}
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Consciousness</label>
                                                <select value={vitalsForm.consciousness} onChange={e => setVitalsForm(f => ({ ...f, consciousness: e.target.value }))}
                                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400">
                                                    {['Alert', 'Voice', 'Pain', 'Unresponsive'].map(c => <option key={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Recorded By</label>
                                                <input type="text" value={vitalsForm.recorded_by} placeholder="Nurse name"
                                                    onChange={e => setVitalsForm(f => ({ ...f, recorded_by: e.target.value }))}
                                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400" />
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <button onClick={handleSaveVitals} disabled={savingVitals}
                                                className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 disabled:opacity-60 transition-colors">
                                                {savingVitals ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save Vitals
                                            </button>
                                            <button onClick={() => setShowVitalsForm(false)} className="px-4 py-2 text-gray-500 text-sm font-bold hover:bg-gray-100 rounded-xl">Cancel</button>
                                        </div>
                                    </div>
                                )}

                                {/* Vitals history table */}
                                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                        <h3 className="font-bold text-gray-900 text-sm">Vitals History</h3>
                                        <span className="text-xs text-gray-400">{vitalsHistory.length} entries</span>
                                    </div>
                                    {vitalsHistory.length === 0 ? (
                                        <p className="text-center text-gray-400 text-sm py-10">No vitals recorded. Click "Record Vitals" to add.</p>
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
                                                    {vitalsHistory.map((v: any) => (
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
                                                                <NEWSScoreBadge score={v.news_score ?? 0} level={v.news_level} size="sm" />
                                                            </td>
                                                            <td className="px-4 py-3 text-xs text-gray-400">{v.recorded_by ?? '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>

                                {/* Consulting Doctors */}
                                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                        <h3 className="font-bold text-gray-900 text-sm">Consulting Doctors</h3>
                                        <button onClick={() => setShowConsultForm(v => !v)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-bold rounded-xl hover:bg-teal-700 transition-colors">
                                            <Plus className="h-3 w-3" /> Request Consult
                                        </button>
                                    </div>
                                    {showConsultForm && (
                                        <div className="p-4 border-b border-gray-100 bg-teal-50 space-y-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Doctor Name</label>
                                                    <input type="text" value={consultName} onChange={e => setConsultName(e.target.value)} placeholder="Dr. Name"
                                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Specialty</label>
                                                    <input type="text" value={consultSpecialty} onChange={e => setConsultSpecialty(e.target.value)} placeholder="e.g. Cardiology"
                                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white" />
                                                </div>
                                            </div>
                                            <input type="text" value={consultNotes} onChange={e => setConsultNotes(e.target.value)} placeholder="Reason for consultation"
                                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white" />
                                            <div className="flex gap-2">
                                                <button onClick={handleAddConsultant} disabled={savingConsult}
                                                    className="px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-xl hover:bg-teal-700 disabled:opacity-60 transition-colors">
                                                    {savingConsult ? 'Saving...' : 'Request'}
                                                </button>
                                                <button onClick={() => setShowConsultForm(false)} className="px-3 py-2 text-gray-500 text-xs font-bold hover:bg-gray-100 rounded-xl">Cancel</button>
                                            </div>
                                        </div>
                                    )}
                                    <div className="divide-y divide-gray-50">
                                        {consultants.length === 0 ? (
                                            <p className="text-center text-gray-400 text-xs py-8">No consultations requested</p>
                                        ) : consultants.map((c: any) => (
                                            <div key={c.id} className="px-5 py-3 flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900">Dr. {c.doctor_name}</p>
                                                    <p className="text-xs text-gray-400">{c.specialty ?? 'General'} · {new Date(c.consulted_at).toLocaleDateString()}</p>
                                                    {c.notes && <p className="text-xs text-gray-500 mt-0.5 italic">{c.notes}</p>}
                                                </div>
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${c.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                                    {c.status}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* TPA / Insurance Pre-Auth Lifecycle */}
                                {preauths.length > 0 && (
                                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                                        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                                            <h3 className="font-bold text-gray-900 text-sm">TPA / Insurance</h3>
                                        </div>
                                        <div className="divide-y divide-gray-100">
                                            {preauths.map((pa: any) => (
                                                <div key={pa.id} className="px-5 py-4 space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <p className="text-xs font-black text-gray-800">{pa.tpa_name}</p>
                                                            <p className="text-[10px] text-gray-400">{pa.submission_type} · {new Date(pa.submitted_at ?? pa.created_at).toLocaleDateString()}</p>
                                                            <p className="text-[10px] text-gray-600 mt-0.5">
                                                                Requested: ₹{Number(pa.requested_amount).toLocaleString('en-IN')}
                                                                {pa.approved_amount ? ` · Approved: ₹${Number(pa.approved_amount).toLocaleString('en-IN')}` : ''}
                                                            </p>
                                                        </div>
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                                            pa.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                                                            pa.status === 'Denied' ? 'bg-red-100 text-red-700' :
                                                            pa.status === 'Settled' ? 'bg-blue-100 text-blue-700' :
                                                            pa.status === 'Claimed' ? 'bg-purple-100 text-purple-700' :
                                                            pa.status === 'Query' || pa.status === 'QueryResponded' ? 'bg-amber-100 text-amber-700' :
                                                            'bg-gray-100 text-gray-600'
                                                        }`}>{pa.status}</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {pa.status === 'Approved' && (
                                                            <button onClick={async () => {
                                                                const amount = prompt('Enter final claimed amount (₹):');
                                                                if (!amount) return;
                                                                await submitTPAClaim(pa.id, { final_claimed_amount: Number(amount) });
                                                                getAdmissionPreAuths(data.admission_id).then(r => { if (r.success) setPreauths(r.data as any[]); });
                                                            }} className="text-[10px] font-bold px-2.5 py-1 bg-purple-600 text-white rounded-lg">
                                                                Submit Claim
                                                            </button>
                                                        )}
                                                        {(pa.status === 'Submitted' || pa.status === 'Claimed' || pa.status === 'QueryResponded') && (
                                                            <button onClick={async () => {
                                                                const q = prompt('Enter TPA query / note:');
                                                                if (!q) return;
                                                                await recordTPAQuery(pa.id, { query_text: q });
                                                                getAdmissionPreAuths(data.admission_id).then(r => { if (r.success) setPreauths(r.data as any[]); });
                                                            }} className="text-[10px] font-bold px-2.5 py-1 bg-amber-600 text-white rounded-lg">
                                                                Log Query
                                                            </button>
                                                        )}
                                                        {pa.status === 'Claimed' && (
                                                            <button onClick={async () => {
                                                                const amount = prompt('Enter settlement amount (₹):');
                                                                if (!amount) return;
                                                                await recordTPASettlement(pa.id, { settled_amount: Number(amount), settlement_date: new Date().toISOString() });
                                                                getAdmissionPreAuths(data.admission_id).then(r => { if (r.success) setPreauths(r.data as any[]); });
                                                            }} className="text-[10px] font-bold px-2.5 py-1 bg-emerald-600 text-white rounded-lg">
                                                                Record Settlement
                                                            </button>
                                                        )}
                                                    </div>
                                                    {pa.notes && (
                                                        <details className="text-[10px] text-gray-500">
                                                            <summary className="cursor-pointer font-semibold text-gray-600">History</summary>
                                                            <pre className="mt-1 whitespace-pre-wrap font-mono text-[9px] bg-gray-50 p-2 rounded">{pa.notes}</pre>
                                                        </details>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ════════════════════════════ DIET ════════════════════════════ */}
                        {activeTab === 'diet' && (
                            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                                {/* Diet History */}
                                <div className="lg:col-span-3 space-y-3">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <Utensils className="h-3.5 w-3.5 text-orange-500" /> Diet History
                                    </h3>
                                    {data.diet_plans?.length > 0 ? (
                                        [...data.diet_plans].reverse().map((d: any) => (
                                            <div key={d.id} className={`p-4 border rounded-xl ${d.is_active ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-gray-50/50'}`}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <p className={`text-sm font-black ${d.is_active ? 'text-orange-700' : 'text-gray-400'}`}>{d.diet_type}</p>
                                                    {d.is_active && <span className="text-[10px] px-2 py-0.5 bg-orange-200 text-orange-800 rounded-full font-bold uppercase">Active</span>}
                                                </div>
                                                {d.instructions && <p className="text-xs text-gray-600">{d.instructions}</p>}
                                                {(d.feeding_route || d.texture_modification || d.calorie_target || d.fluid_restriction_ml) && (
                                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                        {d.feeding_route && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">Route: {d.feeding_route}</span>}
                                                        {d.texture_modification && <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">Texture: {d.texture_modification}</span>}
                                                        {d.calorie_target && <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">{d.calorie_target} kcal</span>}
                                                        {d.fluid_restriction_ml && <span className="text-[10px] px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded font-medium">Fluid: {d.fluid_restriction_ml} ml/day</span>}
                                                    </div>
                                                )}
                                                <p className="text-[10px] text-gray-400 mt-1.5">{new Date(d.created_at).toLocaleString()}</p>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-12 text-center text-gray-400">
                                            <Utensils className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                            <p className="text-xs font-medium">No diet plans assigned yet</p>
                                        </div>
                                    )}
                                </div>

                                {/* Assign Diet */}
                                {data.status === 'Admitted' && (
                                    <div className="lg:col-span-2">
                                        <form onSubmit={handleAssignDiet} className="bg-orange-50 border border-orange-100 rounded-xl p-5 space-y-3">
                                            <h4 className="text-[10px] font-black text-orange-700 uppercase tracking-widest flex items-center gap-2">
                                                <Utensils className="h-3.5 w-3.5" /> Assign Diet Plan
                                            </h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                {DIET_TYPES.map(type => (
                                                    <button
                                                        key={type}
                                                        type="button"
                                                        onClick={() => setDietType(type)}
                                                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                                                            dietType === type
                                                                ? 'bg-orange-500 text-white shadow-sm'
                                                                : 'bg-white border border-orange-200 text-orange-700 hover:bg-orange-100'
                                                        }`}
                                                    >
                                                        {type}
                                                    </button>
                                                ))}
                                            </div>
                                            <textarea
                                                value={dietInstructions}
                                                onChange={e => setDietInstructions(e.target.value)}
                                                placeholder="Special instructions (optional)..."
                                                className="w-full text-xs p-2.5 bg-white border border-orange-200 rounded-lg h-20 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                                            />
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Feeding Route</label>
                                                    <select value={dietFeedingRoute} onChange={e => setDietFeedingRoute(e.target.value)}
                                                        className="w-full mt-1 text-xs border border-green-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-400">
                                                        {['Oral', 'NGTube', 'PEG', 'TPN', 'NPO'].map(r => <option key={r}>{r}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Texture</label>
                                                    <select value={dietTexture} onChange={e => setDietTexture(e.target.value)}
                                                        className="w-full mt-1 text-xs border border-green-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-400">
                                                        {['Normal', 'Soft', 'Minced', 'Pureed'].map(t => <option key={t}>{t}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Calorie Target (kcal)</label>
                                                    <input type="number" min={0} value={dietCalories} onChange={e => setDietCalories(e.target.value)}
                                                        placeholder="e.g. 1800"
                                                        className="w-full mt-1 text-xs border border-green-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-400" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Fluid Restriction (ml/day)</label>
                                                    <input type="number" min={0} value={dietFluidRestriction} onChange={e => setDietFluidRestriction(e.target.value)}
                                                        placeholder="e.g. 1500 (blank = none)"
                                                        className="w-full mt-1 text-xs border border-green-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-400" />
                                                </div>
                                                <div className="col-span-2">
                                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Religious / Dietary Restrictions</label>
                                                    <input value={dietReligious} onChange={e => setDietReligious(e.target.value)}
                                                        placeholder="e.g. Vegetarian, Halal, Kosher"
                                                        className="w-full mt-1 text-xs border border-green-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-400" />
                                                </div>
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={savingDiet}
                                                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
                                            >
                                                {savingDiet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                                Assign {dietType} Diet
                                            </button>
                                        </form>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ════════════════════════════ BILLING ════════════════════════════ */}
                        {activeTab === 'billing' && (
                            <div className="space-y-6">
                                {loadingBill ? (
                                    <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        <span className="text-sm">Loading bill...</span>
                                    </div>
                                ) : bill ? (
                                    <>
                                        {/* Bill Summary */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <StatCard label="Total Charges" value={`₹${bill.invoice.total_amount.toLocaleString()}`} icon={<Receipt className="h-4 w-4 text-gray-500" />} color="gray" />
                                            <StatCard label="Paid" value={`₹${bill.invoice.paid_amount.toLocaleString()}`} icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} color="green" />
                                            <StatCard label="Discount" value={`₹${bill.invoice.total_discount.toLocaleString()}`} icon={<TrendingUp className="h-4 w-4 text-blue-500" />} color="blue" />
                                            <StatCard
                                                label="Balance Due"
                                                value={`₹${bill.invoice.balance_due.toLocaleString()}`}
                                                icon={<DollarSign className="h-4 w-4 text-rose-500" />}
                                                color={bill.invoice.balance_due > 0 ? 'red' : 'green'}
                                            />
                                        </div>

                                        {/* Invoice Number + Days */}
                                        <div className="flex items-center justify-between px-1">
                                            <p className="text-xs font-bold text-gray-500">
                                                Invoice: <span className="font-mono text-gray-800">{bill.invoice.invoice_number}</span>
                                                &nbsp;·&nbsp; Days: {bill.admission.days_admitted}
                                            </p>
                                            <button
                                                onClick={() => { setBill(null); loadBill(); }}
                                                className="text-[10px] text-teal-600 font-bold hover:underline"
                                            >
                                                Refresh
                                            </button>
                                        </div>

                                        {/* Line Items by Category */}
                                        {Object.keys(billItemsByCategory).length > 0 ? (
                                            <div className="space-y-4">
                                                {Object.entries(billItemsByCategory).map(([cat, items]) => (
                                                    <div key={cat} className="border border-gray-200 rounded-xl overflow-hidden">
                                                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                                                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{cat}</p>
                                                        </div>
                                                        <div className="divide-y divide-gray-100">
                                                            {items.map((item: any) => (
                                                                <div key={item.id} className="px-4 py-3 flex items-center justify-between text-xs">
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="font-medium text-gray-800 truncate">{item.description}</p>
                                                                        <p className="text-gray-400 mt-0.5">
                                                                            {item.quantity} × ₹{item.unit_price.toLocaleString()}
                                                                            {Number(item.discount) > 0 && <span className="text-emerald-600"> − ₹{Number(item.discount).toLocaleString()} disc</span>}
                                                                        </p>
                                                                    </div>
                                                                    <p className="font-black text-gray-900 ml-4">₹{item.net_price.toLocaleString()}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-400 text-center py-4">No charges posted yet.</p>
                                        )}

                                        {/* Payments */}
                                        {bill.payments?.length > 0 && (
                                            <div className="border border-gray-200 rounded-xl overflow-hidden">
                                                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Payments Received</p>
                                                </div>
                                                <div className="divide-y divide-gray-100">
                                                    {bill.payments.map((p: any) => (
                                                        <div key={p.receipt_number} className="px-4 py-3 flex items-center justify-between text-xs">
                                                            <div>
                                                                <p className="font-medium text-gray-700">{p.payment_method}</p>
                                                                <p className="text-gray-400 font-mono">{p.receipt_number}</p>
                                                            </div>
                                                            <p className="font-black text-emerald-700">₹{p.amount.toLocaleString()}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Deposits */}
                                        {bill.deposits?.length > 0 && (
                                            <div className="flex items-center gap-2 p-3 bg-teal-50 border border-teal-100 rounded-xl text-xs">
                                                <CreditCard className="h-4 w-4 text-teal-500 shrink-0" />
                                                <span className="text-teal-700 font-bold">
                                                    Deposit available: ₹{bill.deposits.reduce((s: number, d: any) => s + Number(d.available_amount), 0).toLocaleString()}
                                                </span>
                                            </div>
                                        )}

                                        {/* Go to Full Settlement */}
                                        <Link href={`/ipd/discharge-settlement/${data.admission_id}`}>
                                            <div className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-rose-200 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer">
                                                <LogOut className="h-4 w-4" /> Open Discharge & Full Settlement
                                            </div>
                                        </Link>
                                    </>
                                ) : (
                                    <div className="py-12 text-center text-gray-400">
                                        <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                        <p className="text-xs font-medium">No active invoice found</p>
                                    </div>
                                )}

                                {/* Manual Charge Posting */}
                                {data.status === 'Admitted' && (
                                    <div className="border-t border-gray-200 pt-6">
                                        <form onSubmit={handlePostCharge} className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
                                            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                                <Plus className="h-3.5 w-3.5" /> Post Manual Charge
                                            </h4>
                                            <div className="grid grid-cols-2 gap-3">
                                                <input
                                                    type="text"
                                                    required
                                                    value={chargeDesc}
                                                    onChange={e => setChargeDesc(e.target.value)}
                                                    placeholder="Description"
                                                    className="col-span-2 text-xs p-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
                                                />
                                                <input
                                                    type="number"
                                                    required
                                                    min="0"
                                                    value={chargeRate}
                                                    onChange={e => setChargeRate(e.target.value)}
                                                    placeholder="Unit Rate (₹)"
                                                    className="text-xs p-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
                                                />
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={chargeQty}
                                                    onChange={e => setChargeQty(e.target.value)}
                                                    placeholder="Qty"
                                                    className="text-xs p-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
                                                />
                                                <select
                                                    value={chargeCategory}
                                                    onChange={e => setChargeCategory(e.target.value)}
                                                    className="col-span-2 text-xs p-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
                                                >
                                                    {['Miscellaneous', 'Pharmacy', 'Lab', 'Radiology', 'Procedure', 'DoctorVisit', 'Room', 'Nursing'].map(c => (
                                                        <option key={c}>{c}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={postingCharge}
                                                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
                                            >
                                                {postingCharge ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />}
                                                Post Charge
                                            </button>
                                        </form>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ════════════════════════════ DISCHARGE ════════════════════════════ */}
                        {activeTab === 'discharge' && (
                            <div className="max-w-lg mx-auto space-y-6 py-4">
                                {data.status === 'Admitted' ? (
                                    <>
                                        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center space-y-4">
                                            <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center mx-auto">
                                                <LogOut className="h-7 w-7 text-rose-500" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-black text-gray-900">Ready to Discharge?</h3>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {data.patient?.full_name} has been admitted for {daysAdmitted} day{daysAdmitted !== 1 ? 's' : ''}.
                                                    Complete billing, apply deposits, and finalize the discharge bill.
                                                </p>
                                            </div>
                                            <Link href={`/ipd/discharge-settlement/${data.admission_id}`}>
                                                <button className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-xl text-sm transition-colors shadow-md flex items-center justify-center gap-2">
                                                    <LogOut className="h-4 w-4" /> Open Discharge & Settlement
                                                </button>
                                            </Link>
                                        </div>
                                        <div className="space-y-2">
                                            <PreDischargeChecklist
                                                admissionId={data.admission_id}
                                                items={dischargeChecklist}
                                                onUpdate={loadChecklist}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center space-y-3">
                                        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
                                        <h3 className="text-base font-black text-gray-900">Patient Discharged</h3>
                                        <p className="text-xs text-gray-500">
                                            Discharged on {data.discharge_date ? new Date(data.discharge_date).toLocaleString() : 'N/A'}
                                        </p>
                                        <Link href={`/api/discharge/${data.admission_id}/bill`} target="_blank">
                                            <button className="mt-2 flex items-center justify-center gap-2 w-full py-2.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl transition-colors">
                                                <Receipt className="h-4 w-4" /> View Discharge Bill
                                            </button>
                                        </Link>
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </div>
            </div>

            {/* ── Transfer Modal ── */}
            {showTransfer && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white border border-gray-200 shadow-xl rounded-2xl w-full max-w-md p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                                <ArrowLeftRight className="h-4 w-4 text-indigo-500" /> Transfer / Change Bed
                            </h3>
                            <button onClick={() => setShowTransfer(false)} className="text-gray-400 hover:text-gray-900">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs">
                            <p className="font-bold text-gray-700">{data.patient?.full_name}</p>
                            <p className="text-gray-500 mt-0.5">Current: {data.bed?.wards?.ward_name || '—'} / {data.bed_id || 'Unassigned'}</p>
                        </div>
                        {loadingWards ? (
                            <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 text-indigo-500 animate-spin" /></div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">New Ward</label>
                                    <select
                                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm"
                                        value={transferWard}
                                        onChange={e => { setTransferWard(e.target.value); setTransferBed(''); }}
                                    >
                                        <option value="">Select Ward</option>
                                        {availableWards.map((w: any) => (
                                            <option key={w.ward_id} value={w.ward_id}>{w.ward_name} ({w.available} free)</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">New Bed</label>
                                    <select
                                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm"
                                        value={transferBed}
                                        onChange={e => setTransferBed(e.target.value)}
                                        disabled={!transferWard || currentWardBeds.length === 0}
                                    >
                                        <option value="">{!transferWard ? 'Select ward first' : currentWardBeds.length === 0 ? 'No beds available' : 'Select Bed'}</option>
                                        {currentWardBeds.map((b: any) => (
                                            <option key={b.bed_id} value={b.bed_id}>{b.bed_id}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Reason (optional)</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm"
                                        placeholder="e.g. Condition improved, patient request..."
                                        value={transferReason}
                                        onChange={e => setTransferReason(e.target.value)}
                                    />
                                </div>
                                <button
                                    onClick={handleTransfer}
                                    disabled={transferring || !transferBed}
                                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                                >
                                    {transferring && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Confirm Transfer
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </AppShell>
    );
}

// ── Sub-components ──

function StatCard({ label, value, sub, icon, color }: { label: string; value: string; sub?: string; icon: React.ReactNode; color: string }) {
    const colors: Record<string, string> = {
        blue: 'bg-blue-50 border-blue-100',
        indigo: 'bg-indigo-50 border-indigo-100',
        teal: 'bg-teal-50 border-teal-100',
        purple: 'bg-purple-50 border-purple-100',
        green: 'bg-emerald-50 border-emerald-100',
        red: 'bg-rose-50 border-rose-100',
        gray: 'bg-gray-50 border-gray-200',
    };
    return (
        <div className={`rounded-xl border p-4 ${colors[color] || colors.gray}`}>
            <div className="flex items-center gap-2 mb-2">{icon}<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p></div>
            <p className="text-lg font-black text-gray-900">{value}</p>
            {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
    );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex justify-between items-start gap-4">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide shrink-0">{label}</span>
            <span className={`text-xs font-medium text-gray-800 text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
        </div>
    );
}

const ChevronsDown = ({ className }: { className?: string }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7 6 5 5 5-5" /><path d="m7 13 5 5 5-5" />
    </svg>
);
