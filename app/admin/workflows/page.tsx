'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import {
    Workflow,
    Save,
    Plus,
    Trash2,
    ChevronUp,
    ChevronDown,
    Loader2,
    CheckCircle2,
    AlertCircle,
    RotateCcw,
    UserCog,
    Clock,
    Bell,
    ToggleLeft,
    ToggleRight,
    ClipboardList,
    CalendarCheck,
    Stethoscope,
    FlaskConical,
    BedDouble,
    LogOut,
    CreditCard,
    ShieldCheck,
    GripVertical,
} from 'lucide-react';
import {
    getModuleConfig,
    updateModuleConfig,
} from '@/app/actions/module-config-actions';

// ── Types ──────────────────────────────────────────────────────────────────────

interface WorkflowStep {
    id: string;
    name: string;
    required: boolean;
    approver_role: string;
    sla_minutes: number;
    auto_notification: boolean;
    status_change: string;
    enabled: boolean;
}

interface WorkflowDefinition {
    steps: WorkflowStep[];
}

type WorkflowKey =
    | 'patient_registration'
    | 'appointment_booking'
    | 'opd_consultation'
    | 'lab_order_processing'
    | 'ipd_admission'
    | 'discharge_process'
    | 'billing_payment'
    | 'insurance_claim';

interface WorkflowMeta {
    key: WorkflowKey;
    label: string;
    icon: React.ElementType;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const WORKFLOW_LIST: WorkflowMeta[] = [
    { key: 'patient_registration', label: 'Patient Registration', icon: ClipboardList },
    { key: 'appointment_booking', label: 'Appointment Booking', icon: CalendarCheck },
    { key: 'opd_consultation', label: 'OPD Consultation', icon: Stethoscope },
    { key: 'lab_order_processing', label: 'Lab Order Processing', icon: FlaskConical },
    { key: 'ipd_admission', label: 'IPD Admission', icon: BedDouble },
    { key: 'discharge_process', label: 'Discharge Process', icon: LogOut },
    { key: 'billing_payment', label: 'Billing & Payment', icon: CreditCard },
    { key: 'insurance_claim', label: 'Insurance Claim', icon: ShieldCheck },
];

const APPROVER_ROLES = [
    { value: 'none', label: 'None' },
    { value: 'auto', label: 'Auto (System)' },
    { value: 'admin', label: 'Admin' },
    { value: 'doctor', label: 'Doctor' },
    { value: 'nurse', label: 'Nurse' },
    { value: 'receptionist', label: 'Receptionist' },
    { value: 'finance', label: 'Finance' },
    { value: 'pharmacist', label: 'Pharmacist' },
    { value: 'lab_technician', label: 'Lab Technician' },
    { value: 'insurance_officer', label: 'Insurance Officer' },
];

function makeId(): string {
    return `step_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function makeStep(name: string, required: boolean, approver: string, sla: number, status: string): WorkflowStep {
    return {
        id: makeId(),
        name,
        required,
        approver_role: approver,
        sla_minutes: sla,
        auto_notification: true,
        status_change: status,
        enabled: true,
    };
}

const DEFAULT_WORKFLOWS: Record<WorkflowKey, WorkflowDefinition> = {
    patient_registration: {
        steps: [
            makeStep('Collect Demographics', true, 'none', 5, 'In Progress'),
            makeStep('Verify ID Documents', true, 'receptionist', 3, 'Verifying'),
            makeStep('Generate UHID', true, 'auto', 1, 'UHID Generated'),
            makeStep('Assign Department', true, 'receptionist', 2, 'Completed'),
        ],
    },
    appointment_booking: {
        steps: [
            makeStep('Select Department & Doctor', true, 'none', 3, 'Initiated'),
            makeStep('Choose Time Slot', true, 'none', 2, 'Slot Selected'),
            makeStep('Confirm Appointment', true, 'auto', 1, 'Confirmed'),
            makeStep('Send Notification', false, 'auto', 1, 'Notified'),
        ],
    },
    opd_consultation: {
        steps: [
            makeStep('Patient Check-in', true, 'receptionist', 5, 'Checked In'),
            makeStep('Vitals Recording', true, 'nurse', 10, 'Vitals Recorded'),
            makeStep('Doctor Consultation', true, 'doctor', 20, 'In Consultation'),
            makeStep('Prescription & Orders', true, 'doctor', 10, 'Orders Placed'),
            makeStep('Checkout & Billing', true, 'receptionist', 5, 'Completed'),
        ],
    },
    lab_order_processing: {
        steps: [
            makeStep('Order Received', true, 'auto', 5, 'Received'),
            makeStep('Sample Collection', true, 'lab_technician', 15, 'Collected'),
            makeStep('Sample Transport', false, 'auto', 10, 'In Transit'),
            makeStep('Processing', true, 'lab_technician', 60, 'Processing'),
            makeStep('Quality Check', false, 'lab_technician', 10, 'QC Review'),
            makeStep('Result Entry', true, 'lab_technician', 10, 'Result Entered'),
            makeStep('Pathologist Review', false, 'doctor', 30, 'Under Review'),
            makeStep('Result Release', true, 'auto', 5, 'Released'),
        ],
    },
    ipd_admission: {
        steps: [
            makeStep('Admission Request', true, 'doctor', 10, 'Requested'),
            makeStep('Bed Allocation', true, 'receptionist', 15, 'Bed Assigned'),
            makeStep('Deposit Collection', true, 'finance', 10, 'Deposit Paid'),
            makeStep('Nursing Assessment', true, 'nurse', 20, 'Assessed'),
            makeStep('Admission Confirmation', true, 'admin', 5, 'Admitted'),
        ],
    },
    discharge_process: {
        steps: [
            makeStep('Doctor Clearance', true, 'doctor', 60, 'Doctor Cleared'),
            makeStep('Nursing Handover', true, 'nurse', 30, 'Nursing Complete'),
            makeStep('Pharmacy Clearance', true, 'pharmacist', 15, 'Pharmacy Cleared'),
            makeStep('Billing Finalization', true, 'finance', 30, 'Bill Finalized'),
            makeStep('Discharge Summary Generation', true, 'doctor', 30, 'Summary Ready'),
            makeStep('Patient Feedback', false, 'none', 10, 'Feedback Collected'),
            makeStep('Handover & Exit', true, 'receptionist', 10, 'Discharged'),
        ],
    },
    billing_payment: {
        steps: [
            makeStep('Generate Invoice', true, 'auto', 2, 'Invoice Generated'),
            makeStep('Apply Discounts / Concessions', false, 'finance', 5, 'Discounts Applied'),
            makeStep('Payment Collection', true, 'receptionist', 10, 'Payment Received'),
            makeStep('Receipt Generation', true, 'auto', 1, 'Receipt Issued'),
            makeStep('Ledger Update', true, 'auto', 1, 'Completed'),
        ],
    },
    insurance_claim: {
        steps: [
            makeStep('Pre-Authorization Request', true, 'insurance_officer', 30, 'Pre-Auth Submitted'),
            makeStep('Insurer Approval', true, 'none', 120, 'Awaiting Approval'),
            makeStep('Treatment & Documentation', true, 'doctor', 60, 'Documenting'),
            makeStep('Claim Submission', true, 'insurance_officer', 30, 'Claim Submitted'),
            makeStep('Settlement & Reconciliation', true, 'finance', 60, 'Settled'),
        ],
    },
};

// ── Shared UI ──────────────────────────────────────────────────────────────────

const INPUT_CLS =
    'w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[var(--admin-primary)]/20 text-sm font-medium outline-none transition-colors';

function Toggle({
    checked,
    onChange,
    size = 'md',
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    size?: 'sm' | 'md';
}) {
    const dims = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
    const knob = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';
    const translate = size === 'sm' ? 'translateX(16px)' : 'translateX(20px)';

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex ${dims} shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none`}
            style={{
                backgroundColor: checked ? 'var(--admin-primary)' : '#d1d5db',
            }}
        >
            <span
                className={`pointer-events-none inline-block ${knob} transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                style={{ transform: checked ? translate : 'translateX(0px)' }}
            />
        </button>
    );
}

// ── Page Component ─────────────────────────────────────────────────────────────

export default function WorkflowConfigPage() {
    const [allWorkflows, setAllWorkflows] = useState<Record<WorkflowKey, WorkflowDefinition>>(DEFAULT_WORKFLOWS);
    const [activeKey, setActiveKey] = useState<WorkflowKey>('patient_registration');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // ── Load ──────────────────────────────────────────────────────────────────
    const loadWorkflows = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getModuleConfig('workflows');
            if (res.success && res.data) {
                const saved = res.data.config_json as Record<string, any>;
                // Merge saved data over defaults so new workflow types always appear
                const merged = { ...DEFAULT_WORKFLOWS };
                for (const key of Object.keys(merged) as WorkflowKey[]) {
                    if (saved[key] && Array.isArray(saved[key].steps)) {
                        merged[key] = {
                            steps: saved[key].steps.map((s: any) => ({
                                id: s.id || makeId(),
                                name: s.name || '',
                                required: s.required ?? true,
                                approver_role: s.approver_role || 'none',
                                sla_minutes: s.sla_minutes ?? 10,
                                auto_notification: s.auto_notification ?? true,
                                status_change: s.status_change || '',
                                enabled: s.enabled ?? true,
                            })),
                        };
                    }
                }
                setAllWorkflows(merged);
            }
        } catch (err) {
            console.error('Failed to load workflows', err);
            showAlert('error', 'Failed to load workflow configuration.');
        } finally {
            setLoading(false);
            setDirty(false);
        }
    }, []);

    useEffect(() => {
        loadWorkflows();
    }, [loadWorkflows]);

    // ── Alert ─────────────────────────────────────────────────────────────────
    const showAlert = (type: 'success' | 'error', message: string) => {
        setAlert({ type, message });
        setTimeout(() => setAlert(null), 4000);
    };

    // ── Step mutations ────────────────────────────────────────────────────────
    const currentSteps = allWorkflows[activeKey].steps;

    const updateSteps = (newSteps: WorkflowStep[]) => {
        setAllWorkflows(prev => ({
            ...prev,
            [activeKey]: { steps: newSteps },
        }));
        setDirty(true);
    };

    const updateStep = (stepId: string, patch: Partial<WorkflowStep>) => {
        updateSteps(
            currentSteps.map(s => (s.id === stepId ? { ...s, ...patch } : s)),
        );
    };

    const addStep = () => {
        const newStep: WorkflowStep = {
            id: makeId(),
            name: 'New Step',
            required: true,
            approver_role: 'none',
            sla_minutes: 10,
            auto_notification: true,
            status_change: 'In Progress',
            enabled: true,
        };
        updateSteps([...currentSteps, newStep]);
    };

    const removeStep = (stepId: string) => {
        if (currentSteps.length <= 1) {
            showAlert('error', 'A workflow must have at least one step.');
            return;
        }
        updateSteps(currentSteps.filter(s => s.id !== stepId));
    };

    const moveStep = (stepId: string, direction: 'up' | 'down') => {
        const idx = currentSteps.findIndex(s => s.id === stepId);
        if (idx < 0) return;
        if (direction === 'up' && idx === 0) return;
        if (direction === 'down' && idx === currentSteps.length - 1) return;
        const next = [...currentSteps];
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
        updateSteps(next);
    };

    // ── Save ──────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await updateModuleConfig('workflows', allWorkflows as unknown as Record<string, any>);
            if (res.success) {
                setDirty(false);
                showAlert('success', 'Workflow configuration saved successfully.');
            } else {
                showAlert('error', res.error || 'Failed to save configuration.');
            }
        } catch {
            showAlert('error', 'An unexpected error occurred while saving.');
        } finally {
            setSaving(false);
        }
    };

    // ── Reset ─────────────────────────────────────────────────────────────────
    const handleResetCurrent = () => {
        if (!confirm(`Reset "${WORKFLOW_LIST.find(w => w.key === activeKey)?.label}" to default steps? This cannot be undone until you save.`)) return;
        setAllWorkflows(prev => ({
            ...prev,
            [activeKey]: {
                steps: DEFAULT_WORKFLOWS[activeKey].steps.map(s => ({ ...s, id: makeId() })),
            },
        }));
        setDirty(true);
        showAlert('success', 'Workflow reset to defaults. Save to persist changes.');
    };

    // ── Loading state ─────────────────────────────────────────────────────────
    if (loading) {
        return (
            <AdminPage pageTitle="Workflow Configuration" pageIcon={<Workflow className="h-5 w-5" />}>
                <div className="flex flex-col items-center justify-center py-32 text-gray-400 gap-4">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-sm font-bold">Loading workflow configuration...</p>
                </div>
            </AdminPage>
        );
    }

    const activeMeta = WORKFLOW_LIST.find(w => w.key === activeKey)!;
    const ActiveIcon = activeMeta.icon;

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <AdminPage
            pageTitle="Workflow Configuration"
            pageIcon={<Workflow className="h-5 w-5" />}
            onRefresh={loadWorkflows}
            refreshing={loading}
        >
            <div className="max-w-[1200px] mx-auto pb-28">

                {/* Alert Banner */}
                {alert && (
                    <div
                        className={`mb-6 flex items-center gap-3 p-4 rounded-xl border text-sm font-bold ${
                            alert.type === 'success'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                    >
                        {alert.type === 'success' ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                        ) : (
                            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
                        )}
                        {alert.message}
                    </div>
                )}

                {/* Page Header */}
                <div className="flex items-center gap-4 mb-8">
                    <div
                        className="p-3 rounded-xl"
                        style={{ backgroundColor: 'var(--admin-primary-10)', color: 'var(--admin-primary)' }}
                    >
                        <Workflow className="h-7 w-7" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900">Workflow Configuration</h1>
                        <p className="text-sm font-medium text-gray-500 mt-0.5">
                            Define and customize step-based workflows for hospital operations
                        </p>
                    </div>
                </div>

                {/* Main Layout: Sidebar + Editor */}
                <div className="flex gap-6 min-h-[600px]">

                    {/* ── Sidebar ── */}
                    <div className="w-72 shrink-0">
                        <div className="bg-gray-900 rounded-2xl overflow-hidden shadow-lg sticky top-24">
                            <div className="p-4 border-b border-gray-700">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                    Workflow Types
                                </p>
                            </div>
                            <nav className="p-2 space-y-1">
                                {WORKFLOW_LIST.map(wf => {
                                    const Icon = wf.icon;
                                    const isActive = activeKey === wf.key;
                                    const stepCount = allWorkflows[wf.key].steps.length;
                                    return (
                                        <button
                                            key={wf.key}
                                            type="button"
                                            onClick={() => setActiveKey(wf.key)}
                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                                                isActive
                                                    ? 'text-white shadow-md'
                                                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                                            }`}
                                            style={
                                                isActive
                                                    ? { backgroundColor: 'var(--admin-primary)' }
                                                    : undefined
                                            }
                                        >
                                            <Icon className="h-4 w-4 shrink-0" />
                                            <span className="text-sm font-bold truncate flex-1">{wf.label}</span>
                                            <span
                                                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                                    isActive
                                                        ? 'bg-white/20 text-white'
                                                        : 'bg-gray-700 text-gray-400'
                                                }`}
                                            >
                                                {stepCount}
                                            </span>
                                        </button>
                                    );
                                })}
                            </nav>
                        </div>
                    </div>

                    {/* ── Workflow Editor ── */}
                    <div className="flex-1 min-w-0">

                        {/* Editor Header */}
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
                            <div
                                className="p-5 flex items-center justify-between"
                                style={{ backgroundColor: 'var(--admin-primary-10)' }}
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className="p-2 rounded-lg"
                                        style={{ backgroundColor: 'var(--admin-primary)', color: 'white' }}
                                    >
                                        <ActiveIcon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black text-gray-900">{activeMeta.label}</h2>
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-0.5">
                                            {currentSteps.length} step{currentSteps.length !== 1 ? 's' : ''} configured
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleResetCurrent}
                                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 hover:bg-white rounded-lg transition-colors"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    Reset to Defaults
                                </button>
                            </div>
                        </div>

                        {/* Step Pipeline */}
                        <div className="relative">
                            {currentSteps.map((step, idx) => (
                                <div key={step.id} className="relative">
                                    {/* Connector Line */}
                                    {idx > 0 && (
                                        <div className="flex justify-start pl-[27px]">
                                            <div
                                                className="w-px h-6"
                                                style={{
                                                    borderLeft: '2px dashed #d1d5db',
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* Step Card */}
                                    <div
                                        className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
                                            step.enabled
                                                ? 'border-gray-200'
                                                : 'border-gray-200 opacity-50'
                                        }`}
                                        style={{
                                            borderLeftWidth: '4px',
                                            borderLeftColor: step.enabled ? 'var(--admin-primary)' : '#d1d5db',
                                        }}
                                    >
                                        <div className="p-5">
                                            {/* Step Header Row */}
                                            <div className="flex items-start gap-4">
                                                {/* Step Number */}
                                                <div
                                                    className="flex items-center justify-center h-10 w-10 rounded-full shrink-0 text-white font-black text-sm"
                                                    style={{
                                                        backgroundColor: step.enabled ? 'var(--admin-primary)' : '#9ca3af',
                                                    }}
                                                >
                                                    {idx + 1}
                                                </div>

                                                {/* Step Name + Controls */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <input
                                                            type="text"
                                                            value={step.name}
                                                            onChange={e => updateStep(step.id, { name: e.target.value })}
                                                            className="flex-1 text-base font-bold text-gray-900 bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-[var(--admin-primary)] outline-none py-1 transition-colors"
                                                            placeholder="Step name..."
                                                        />

                                                        {/* Move & Delete Controls */}
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => moveStep(step.id, 'up')}
                                                                disabled={idx === 0}
                                                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                                                title="Move Up"
                                                            >
                                                                <ChevronUp className="h-4 w-4" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => moveStep(step.id, 'down')}
                                                                disabled={idx === currentSteps.length - 1}
                                                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                                                title="Move Down"
                                                            >
                                                                <ChevronDown className="h-4 w-4" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeStep(step.id)}
                                                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                                title="Remove Step"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Step Configuration Grid */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                                        {/* Approver Role */}
                                                        <div>
                                                            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1.5">
                                                                <UserCog className="h-3 w-3" />
                                                                Approver Role
                                                            </label>
                                                            <select
                                                                value={step.approver_role}
                                                                onChange={e => updateStep(step.id, { approver_role: e.target.value })}
                                                                className={INPUT_CLS}
                                                            >
                                                                {APPROVER_ROLES.map(r => (
                                                                    <option key={r.value} value={r.value}>{r.label}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        {/* SLA Time */}
                                                        <div>
                                                            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1.5">
                                                                <Clock className="h-3 w-3" />
                                                                SLA Time (minutes)
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                max={1440}
                                                                value={step.sla_minutes}
                                                                onChange={e => updateStep(step.id, { sla_minutes: Math.max(1, Number(e.target.value)) })}
                                                                className={INPUT_CLS}
                                                            />
                                                        </div>

                                                        {/* Status Change */}
                                                        <div>
                                                            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1.5">
                                                                <GripVertical className="h-3 w-3" />
                                                                Status Change
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={step.status_change}
                                                                onChange={e => updateStep(step.id, { status_change: e.target.value })}
                                                                placeholder="e.g. In Progress"
                                                                className={INPUT_CLS}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Toggle Row */}
                                                    <div className="flex flex-wrap items-center gap-6 mt-4 pt-4 border-t border-gray-100">
                                                        {/* Required */}
                                                        <div className="flex items-center gap-2.5">
                                                            <Toggle
                                                                checked={step.required}
                                                                onChange={v => updateStep(step.id, { required: v })}
                                                                size="sm"
                                                            />
                                                            <span className="text-xs font-bold text-gray-600">Required</span>
                                                        </div>

                                                        {/* Auto-Notification */}
                                                        <div className="flex items-center gap-2.5">
                                                            <Toggle
                                                                checked={step.auto_notification}
                                                                onChange={v => updateStep(step.id, { auto_notification: v })}
                                                                size="sm"
                                                            />
                                                            <span className="flex items-center gap-1 text-xs font-bold text-gray-600">
                                                                <Bell className="h-3 w-3" />
                                                                Auto-Notification
                                                            </span>
                                                        </div>

                                                        {/* Enabled */}
                                                        <div className="flex items-center gap-2.5">
                                                            <Toggle
                                                                checked={step.enabled}
                                                                onChange={v => updateStep(step.id, { enabled: v })}
                                                                size="sm"
                                                            />
                                                            <span className="flex items-center gap-1 text-xs font-bold text-gray-600">
                                                                {step.enabled ? (
                                                                    <ToggleRight className="h-3 w-3" />
                                                                ) : (
                                                                    <ToggleLeft className="h-3 w-3" />
                                                                )}
                                                                Enabled
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Connector to Add Button */}
                            {currentSteps.length > 0 && (
                                <div className="flex justify-start pl-[27px]">
                                    <div
                                        className="w-px h-6"
                                        style={{
                                            borderLeft: '2px dashed #d1d5db',
                                        }}
                                    />
                                </div>
                            )}

                            {/* Add Step Button */}
                            <button
                                type="button"
                                onClick={addStep}
                                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-all font-bold text-sm"
                            >
                                <Plus className="h-5 w-5" />
                                Add Step
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sticky Save Bar */}
            <div className="fixed bottom-0 left-0 lg:left-64 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-200 z-40">
                <div className="max-w-[1200px] mx-auto flex justify-between items-center">
                    <div className="text-xs font-bold text-gray-400">
                        {dirty ? (
                            <span className="text-amber-600">You have unsaved changes</span>
                        ) : (
                            <span>All changes saved</span>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || !dirty}
                        className="flex items-center gap-2 px-8 py-3 text-white font-bold rounded-xl shadow-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                        style={{ backgroundColor: 'var(--admin-primary)' }}
                    >
                        {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        {saving ? 'Saving...' : 'Save Configuration'}
                    </button>
                </div>
            </div>
        </AdminPage>
    );
}
