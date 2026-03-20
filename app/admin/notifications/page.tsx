'use client';

import React, { useEffect, useState } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import {
    Bell,
    ChevronDown,
    ChevronRight,
    Edit2,
    Loader2,
    Plus,
    Trash2,
    X,
    Zap,
    Sprout,
} from 'lucide-react';
import {
    listAlertRules,
    updateAlertRule,
    createAlertRule,
    deleteAlertRule,
    seedDefaultAlertRules,
    toggleAlertRule,
} from '@/app/actions/alert-actions';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface AlertRule {
    id: string;
    organizationId: string;
    category: string;
    trigger_key: string;
    name: string;
    enabled: boolean;
    channels: string[];
    recipients: { roles?: string[] };
    threshold?: {
        operator?: string;
        value?: number;
        unit?: string;
        description?: string;
    };
    escalation?: {
        after_minutes?: number;
        escalate_to?: string[];
    };
    template?: string | null;
    quiet_hours?: {
        start?: string;
        end?: string;
    } | null;
    created_at: string;
    updated_at: string;
}

type CategoryKey = 'clinical' | 'operational' | 'financial' | 'staff' | 'patient' | 'system';

interface CategoryMeta {
    label: string;
    accent: string;
    bg: string;
    border: string;
    text: string;
    badge: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const CATEGORIES: Record<CategoryKey, CategoryMeta> = {
    clinical: {
        label: 'Clinical',
        accent: 'border-l-red-500',
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-700',
        badge: 'bg-red-100 text-red-700',
    },
    operational: {
        label: 'Operational',
        accent: 'border-l-amber-500',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-700',
        badge: 'bg-amber-100 text-amber-700',
    },
    financial: {
        label: 'Financial',
        accent: 'border-l-emerald-500',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        text: 'text-emerald-700',
        badge: 'bg-emerald-100 text-emerald-700',
    },
    staff: {
        label: 'Staff',
        accent: 'border-l-blue-500',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-700',
        badge: 'bg-blue-100 text-blue-700',
    },
    patient: {
        label: 'Patient',
        accent: 'border-l-violet-500',
        bg: 'bg-violet-50',
        border: 'border-violet-200',
        text: 'text-violet-700',
        badge: 'bg-violet-100 text-violet-700',
    },
    system: {
        label: 'System',
        accent: 'border-l-gray-500',
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        text: 'text-gray-700',
        badge: 'bg-gray-100 text-gray-700',
    },
};

const CATEGORY_ORDER: CategoryKey[] = [
    'clinical',
    'operational',
    'financial',
    'staff',
    'patient',
    'system',
];

const ALL_CHANNELS = ['in_app', 'email', 'sms', 'whatsapp'] as const;

const CHANNEL_STYLES: Record<string, string> = {
    in_app: 'bg-blue-100 text-blue-700',
    email: 'bg-amber-100 text-amber-700',
    sms: 'bg-green-100 text-green-700',
    whatsapp: 'bg-emerald-100 text-emerald-700',
};

const CHANNEL_LABELS: Record<string, string> = {
    in_app: 'In-App',
    email: 'Email',
    sms: 'SMS',
    whatsapp: 'WhatsApp',
};

const ALL_ROLES = [
    'admin',
    'doctor',
    'receptionist',
    'lab_technician',
    'pharmacist',
    'finance',
    'ipd_manager',
    'nurse',
    'opd_manager',
    'hr',
] as const;

const ROLE_LABELS: Record<string, string> = {
    admin: 'Admin',
    doctor: 'Doctor',
    receptionist: 'Receptionist',
    lab_technician: 'Lab Tech',
    pharmacist: 'Pharmacist',
    finance: 'Finance',
    ipd_manager: 'IPD Mgr',
    nurse: 'Nurse',
    opd_manager: 'OPD Mgr',
    hr: 'HR',
};

const OPERATORS = ['>', '<', '=', 'outside_range'] as const;

const OPERATOR_LABELS: Record<string, string> = {
    '>': '> Greater than',
    '<': '< Less than',
    '=': '= Equals',
    outside_range: 'Outside Range',
};

/* ------------------------------------------------------------------ */
/*  Toggle component                                                   */
/* ------------------------------------------------------------------ */
function Toggle({
    checked,
    onChange,
    disabled,
    size = 'md',
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
    size?: 'sm' | 'md';
}) {
    const dims = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
    const knob = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
    const translate = size === 'sm' ? 'translate-x-4' : 'translate-x-5';

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex ${dims} shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--admin-primary)]/30 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                checked ? 'bg-[var(--admin-primary)]' : 'bg-gray-200'
            }`}
        >
            <span
                className={`pointer-events-none inline-block ${knob} transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    checked ? translate : 'translate-x-0'
                }`}
            />
        </button>
    );
}

/* ------------------------------------------------------------------ */
/*  Threshold display helper                                           */
/* ------------------------------------------------------------------ */
function formatThreshold(threshold?: AlertRule['threshold']): string {
    if (!threshold) return '';
    if (threshold.description && !threshold.value) return threshold.description;
    const op = threshold.operator || '';
    const val = threshold.value ?? '';
    const unit = threshold.unit || '';
    if (op && val !== '') return `${op} ${val}${unit ? ' ' + unit : ''}`;
    if (val !== '') return `${val} ${unit}`.trim();
    return threshold.description || '';
}

/* ------------------------------------------------------------------ */
/*  Edit / Create modal form state                                     */
/* ------------------------------------------------------------------ */
interface ModalFormState {
    category: string;
    trigger_key: string;
    name: string;
    enabled: boolean;
    channels: string[];
    roles: string[];
    threshold_operator: string;
    threshold_value: string;
    threshold_unit: string;
    escalation_after_minutes: string;
    escalation_to: string[];
    template: string;
    quiet_start: string;
    quiet_end: string;
}

function ruleToFormState(rule: AlertRule): ModalFormState {
    return {
        category: rule.category,
        trigger_key: rule.trigger_key,
        name: rule.name,
        enabled: rule.enabled,
        channels: Array.isArray(rule.channels) ? [...rule.channels] : [],
        roles: Array.isArray(rule.recipients?.roles) ? [...rule.recipients.roles] : [],
        threshold_operator: rule.threshold?.operator || '',
        threshold_value: rule.threshold?.value !== undefined ? String(rule.threshold.value) : '',
        threshold_unit: rule.threshold?.unit || '',
        escalation_after_minutes: rule.escalation?.after_minutes !== undefined ? String(rule.escalation.after_minutes) : '',
        escalation_to: Array.isArray(rule.escalation?.escalate_to) ? [...rule.escalation.escalate_to] : [],
        template: rule.template || '',
        quiet_start: rule.quiet_hours?.start || '',
        quiet_end: rule.quiet_hours?.end || '',
    };
}

function emptyFormState(): ModalFormState {
    return {
        category: 'operational',
        trigger_key: '',
        name: '',
        enabled: true,
        channels: ['in_app'],
        roles: ['admin'],
        threshold_operator: '>',
        threshold_value: '',
        threshold_unit: '',
        escalation_after_minutes: '',
        escalation_to: [],
        template: '',
        quiet_start: '',
        quiet_end: '',
    };
}

function formStateToPayload(form: ModalFormState) {
    const threshold: Record<string, any> = {};
    if (form.threshold_operator) threshold.operator = form.threshold_operator;
    if (form.threshold_value !== '') threshold.value = Number(form.threshold_value);
    if (form.threshold_unit) threshold.unit = form.threshold_unit;

    const escalation: Record<string, any> | undefined =
        form.escalation_after_minutes || form.escalation_to.length > 0
            ? {
                  ...(form.escalation_after_minutes
                      ? { after_minutes: Number(form.escalation_after_minutes) }
                      : {}),
                  ...(form.escalation_to.length > 0 ? { escalate_to: form.escalation_to } : {}),
              }
            : undefined;

    const quiet_hours: Record<string, any> | undefined =
        form.quiet_start || form.quiet_end
            ? { start: form.quiet_start, end: form.quiet_end }
            : undefined;

    return {
        category: form.category,
        trigger_key: form.trigger_key,
        name: form.name,
        channels: form.channels,
        recipients: { roles: form.roles },
        threshold: Object.keys(threshold).length > 0 ? threshold : undefined,
        escalation,
        template: form.template || undefined,
        quiet_hours,
    };
}

/* ------------------------------------------------------------------ */
/*  Shared style tokens                                                */
/* ------------------------------------------------------------------ */
const labelCls = 'block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2';
const inputCls =
    'w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[var(--admin-primary)]/20 text-sm font-medium outline-none transition-colors';
const cardCls = 'bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden';

/* ------------------------------------------------------------------ */
/*  Main page component                                                */
/* ------------------------------------------------------------------ */
export default function NotificationsPage() {
    const [rules, setRules] = useState<AlertRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [seeding, setSeeding] = useState(false);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
        new Set(CATEGORY_ORDER),
    );

    // Modal
    const [modalMode, setModalMode] = useState<'edit' | 'create' | null>(null);
    const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
    const [form, setForm] = useState<ModalFormState>(emptyFormState());
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);

    /* ---------- load ---------- */
    const loadRules = async () => {
        setLoading(true);
        try {
            const res = await listAlertRules();
            if (res.success && res.data) {
                setRules(res.data as AlertRule[]);
            }
        } catch (err) {
            console.error('Failed to load alert rules', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRules();
    }, []);

    /* ---------- seed ---------- */
    const handleSeed = async () => {
        setSeeding(true);
        try {
            const res = await seedDefaultAlertRules();
            if (res.success) {
                await loadRules();
            }
        } catch (err) {
            console.error('Seed failed', err);
        } finally {
            setSeeding(false);
        }
    };

    /* ---------- toggle ---------- */
    const handleToggle = async (ruleId: string) => {
        try {
            const res = await toggleAlertRule(ruleId);
            if (res.success && res.data) {
                setRules((prev) =>
                    prev.map((r) => (r.id === ruleId ? { ...r, enabled: (res.data as AlertRule).enabled } : r)),
                );
            }
        } catch (err) {
            console.error('Toggle failed', err);
        }
    };

    /* ---------- delete ---------- */
    const handleDelete = async (ruleId: string) => {
        if (!confirm('Are you sure you want to delete this alert rule? This cannot be undone.')) return;
        setDeleting(ruleId);
        try {
            const res = await deleteAlertRule(ruleId);
            if (res.success) {
                setRules((prev) => prev.filter((r) => r.id !== ruleId));
            }
        } catch (err) {
            console.error('Delete failed', err);
        } finally {
            setDeleting(null);
        }
    };

    /* ---------- open modals ---------- */
    const openEdit = (rule: AlertRule) => {
        setEditingRule(rule);
        setForm(ruleToFormState(rule));
        setModalMode('edit');
    };

    const openCreate = () => {
        setEditingRule(null);
        setForm(emptyFormState());
        setModalMode('create');
    };

    const closeModal = () => {
        setModalMode(null);
        setEditingRule(null);
    };

    /* ---------- save ---------- */
    const handleSave = async () => {
        if (!form.name.trim()) {
            alert('Rule name is required.');
            return;
        }
        if (modalMode === 'create' && !form.trigger_key.trim()) {
            alert('Trigger key is required.');
            return;
        }

        setSaving(true);
        try {
            if (modalMode === 'edit' && editingRule) {
                const payload = formStateToPayload(form);
                const { category, trigger_key, name, ...updateData } = payload;
                const res = await updateAlertRule(editingRule.id, updateData);
                if (res.success) {
                    await loadRules();
                    closeModal();
                } else {
                    alert('Failed to update rule.');
                }
            } else if (modalMode === 'create') {
                const payload = formStateToPayload(form);
                const res = await createAlertRule(payload);
                if (res.success) {
                    await loadRules();
                    closeModal();
                } else {
                    alert('Failed to create rule.');
                }
            }
        } catch (err) {
            console.error('Save failed', err);
            alert('An error occurred while saving.');
        } finally {
            setSaving(false);
        }
    };

    /* ---------- form helpers ---------- */
    const toggleFormChannel = (ch: string) => {
        setForm((prev) => ({
            ...prev,
            channels: prev.channels.includes(ch)
                ? prev.channels.filter((c) => c !== ch)
                : [...prev.channels, ch],
        }));
    };

    const toggleFormRole = (role: string) => {
        setForm((prev) => ({
            ...prev,
            roles: prev.roles.includes(role)
                ? prev.roles.filter((r) => r !== role)
                : [...prev.roles, role],
        }));
    };

    const toggleEscalationRole = (role: string) => {
        setForm((prev) => ({
            ...prev,
            escalation_to: prev.escalation_to.includes(role)
                ? prev.escalation_to.filter((r) => r !== role)
                : [...prev.escalation_to, role],
        }));
    };

    /* ---------- accordion ---------- */
    const toggleCategory = (cat: string) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    /* ---------- group rules ---------- */
    const grouped: Record<string, AlertRule[]> = {};
    for (const rule of rules) {
        const cat = rule.category || 'system';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(rule);
    }

    /* ------------------------------------------------------------------ */
    /*  Loading state                                                      */
    /* ------------------------------------------------------------------ */
    if (loading) {
        return (
            <AdminPage pageTitle="Notifications" pageIcon={<Bell className="h-5 w-5" />}>
                <div className="flex items-center justify-center gap-3 p-20 text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="font-medium text-sm">Loading alert rules...</span>
                </div>
            </AdminPage>
        );
    }

    /* ------------------------------------------------------------------ */
    /*  Render                                                             */
    /* ------------------------------------------------------------------ */
    return (
        <AdminPage
            pageTitle="Notification & Alert Rules"
            pageIcon={<Bell className="h-5 w-5" />}
            onRefresh={loadRules}
            refreshing={loading}
        >
            <div className="max-w-5xl mx-auto py-6 pb-12 space-y-6">
                {/* ---- Header card ---- */}
                <div className={cardCls}>
                    <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div
                                className="p-3 rounded-xl"
                                style={{
                                    background: 'var(--admin-primary-10)',
                                    color: 'var(--admin-primary)',
                                }}
                            >
                                <Bell className="h-6 w-6" />
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-gray-900">
                                    Notification & Alert Rules
                                </h1>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-0.5">
                                    Configure when and how the system sends alerts
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {rules.length === 0 && (
                                <button
                                    type="button"
                                    onClick={handleSeed}
                                    disabled={seeding}
                                    className="px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 font-bold rounded-xl text-sm flex items-center gap-2 hover:bg-amber-100 transition-colors disabled:opacity-50"
                                >
                                    {seeding ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Sprout className="h-4 w-4" />
                                    )}
                                    Seed Default Rules
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={openCreate}
                                className="px-4 py-2.5 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-sm transition-colors"
                                style={{ background: 'var(--admin-primary)' }}
                            >
                                <Plus className="h-4 w-4" />
                                New Rule
                            </button>
                        </div>
                    </div>
                </div>

                {/* ---- Empty state ---- */}
                {rules.length === 0 && (
                    <div className="border-2 border-dashed border-gray-200 rounded-3xl p-16 text-center text-gray-500 bg-gray-50/50">
                        <Bell className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                        <h2 className="text-xl font-black text-gray-900 mb-2">
                            No Alert Rules Configured
                        </h2>
                        <p className="text-sm font-medium leading-relaxed max-w-md mx-auto">
                            Use &quot;Seed Default Rules&quot; to load recommended hospital alert
                            configurations, or create custom rules manually.
                        </p>
                    </div>
                )}

                {/* ---- Category accordion sections ---- */}
                {CATEGORY_ORDER.map((catKey) => {
                    const catRules = grouped[catKey];
                    if (!catRules || catRules.length === 0) return null;
                    const meta = CATEGORIES[catKey];
                    const isExpanded = expandedCategories.has(catKey);

                    return (
                        <div
                            key={catKey}
                            className={`${cardCls} border-l-4 ${meta.accent}`}
                        >
                            {/* Category header */}
                            <button
                                type="button"
                                onClick={() => toggleCategory(catKey)}
                                className={`w-full p-5 flex items-center justify-between ${meta.bg} hover:brightness-95 transition-all`}
                            >
                                <div className="flex items-center gap-3">
                                    <span
                                        className={`inline-flex items-center justify-center h-8 w-8 rounded-lg text-sm font-black ${meta.badge}`}
                                    >
                                        {catRules.length}
                                    </span>
                                    <div className="text-left">
                                        <h3 className={`text-sm font-black ${meta.text}`}>
                                            {meta.label}
                                        </h3>
                                        <p className="text-xs font-medium text-gray-500">
                                            {catRules.filter((r) => r.enabled).length} of{' '}
                                            {catRules.length} rules active
                                        </p>
                                    </div>
                                </div>
                                {isExpanded ? (
                                    <ChevronDown className={`h-5 w-5 ${meta.text}`} />
                                ) : (
                                    <ChevronRight className={`h-5 w-5 ${meta.text}`} />
                                )}
                            </button>

                            {/* Rule rows */}
                            {isExpanded && (
                                <div className="divide-y divide-gray-100">
                                    {catRules.map((rule) => (
                                        <div
                                            key={rule.id}
                                            className={`p-4 flex items-center gap-4 hover:bg-gray-50/70 transition-colors ${
                                                !rule.enabled ? 'opacity-60' : ''
                                            }`}
                                        >
                                            {/* Toggle */}
                                            <Toggle
                                                checked={rule.enabled}
                                                onChange={() => handleToggle(rule.id)}
                                                size="sm"
                                            />

                                            {/* Rule info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-sm text-gray-900">
                                                        {rule.name}
                                                    </span>
                                                    <code className="text-[11px] font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                                                        {rule.trigger_key}
                                                    </code>
                                                </div>

                                                {/* Channels + roles + threshold */}
                                                <div className="flex items-center gap-2 flex-wrap mt-1.5">
                                                    {/* Channel badges */}
                                                    {Array.isArray(rule.channels) &&
                                                        rule.channels.map((ch) => (
                                                            <span
                                                                key={ch}
                                                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                                                    CHANNEL_STYLES[ch] ||
                                                                    'bg-gray-100 text-gray-600'
                                                                }`}
                                                            >
                                                                {CHANNEL_LABELS[ch] || ch}
                                                            </span>
                                                        ))}

                                                    {/* Separator */}
                                                    {Array.isArray(rule.recipients?.roles) &&
                                                        rule.recipients.roles.length > 0 && (
                                                            <span className="text-gray-300">|</span>
                                                        )}

                                                    {/* Role tags */}
                                                    {Array.isArray(rule.recipients?.roles) &&
                                                        rule.recipients.roles.map((role) => (
                                                            <span
                                                                key={role}
                                                                className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full"
                                                            >
                                                                {ROLE_LABELS[role] || role}
                                                            </span>
                                                        ))}

                                                    {/* Threshold */}
                                                    {rule.threshold &&
                                                        formatThreshold(rule.threshold) && (
                                                            <>
                                                                <span className="text-gray-300">
                                                                    |
                                                                </span>
                                                                <span className="text-[10px] font-bold text-gray-600 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full">
                                                                    {formatThreshold(
                                                                        rule.threshold,
                                                                    )}
                                                                </span>
                                                            </>
                                                        )}
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => openEdit(rule)}
                                                    className="p-2 text-gray-400 hover:text-[var(--admin-primary)] hover:bg-[var(--admin-primary-10)] rounded-lg transition-colors"
                                                    title="Edit rule"
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(rule.id)}
                                                    disabled={deleting === rule.id}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                                                    title="Delete rule"
                                                >
                                                    {deleting === rule.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-4 w-4" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ================================================================ */}
            {/*  Edit / Create Modal                                             */}
            {/* ================================================================ */}
            {modalMode && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-[5vh] overflow-y-auto">
                    <div
                        className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl my-8"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal header */}
                        <div className="p-6 border-b border-gray-100 bg-gray-50 rounded-t-3xl flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div
                                    className="p-2 rounded-lg"
                                    style={{
                                        background: 'var(--admin-primary-10)',
                                        color: 'var(--admin-primary)',
                                    }}
                                >
                                    {modalMode === 'create' ? (
                                        <Zap className="h-5 w-5" />
                                    ) : (
                                        <Edit2 className="h-5 w-5" />
                                    )}
                                </div>
                                <div>
                                    <h3 className="font-black text-gray-900">
                                        {modalMode === 'create'
                                            ? 'Create Alert Rule'
                                            : 'Edit Alert Rule'}
                                    </h3>
                                    <p className="text-xs font-bold text-gray-500 mt-0.5 uppercase tracking-widest">
                                        {modalMode === 'create'
                                            ? 'Define a new notification trigger'
                                            : editingRule?.name || ''}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Modal body */}
                        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                            {/* Category + Trigger key (create only) */}
                            {modalMode === 'create' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Category *</label>
                                        <select
                                            value={form.category}
                                            onChange={(e) =>
                                                setForm((p) => ({
                                                    ...p,
                                                    category: e.target.value,
                                                }))
                                            }
                                            className={inputCls}
                                        >
                                            {CATEGORY_ORDER.map((cat) => (
                                                <option key={cat} value={cat}>
                                                    {CATEGORIES[cat].label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Trigger Key *</label>
                                        <input
                                            type="text"
                                            value={form.trigger_key}
                                            onChange={(e) =>
                                                setForm((p) => ({
                                                    ...p,
                                                    trigger_key: e.target.value
                                                        .toLowerCase()
                                                        .replace(/\s+/g, '_')
                                                        .replace(/[^a-z0-9_]/g, ''),
                                                }))
                                            }
                                            placeholder="e.g. bed_occupancy_high"
                                            className={`${inputCls} font-mono`}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Name */}
                            <div>
                                <label className={labelCls}>Rule Name *</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) =>
                                        setForm((p) => ({ ...p, name: e.target.value }))
                                    }
                                    readOnly={modalMode === 'edit'}
                                    placeholder="e.g. High Bed Occupancy"
                                    className={`${inputCls} ${
                                        modalMode === 'edit'
                                            ? 'bg-gray-100 cursor-not-allowed text-gray-500'
                                            : ''
                                    }`}
                                />
                                {modalMode === 'edit' && (
                                    <p className="text-[10px] text-gray-400 mt-1 font-bold">
                                        Rule name is read-only for seeded rules
                                    </p>
                                )}
                            </div>

                            {/* Enabled toggle */}
                            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                                <div>
                                    <p className="font-bold text-gray-900 text-sm">Enabled</p>
                                    <p className="text-xs text-gray-500 font-medium">
                                        Toggle this rule on or off
                                    </p>
                                </div>
                                <Toggle
                                    checked={form.enabled}
                                    onChange={(v) => setForm((p) => ({ ...p, enabled: v }))}
                                />
                            </div>

                            {/* Channels */}
                            <div>
                                <label className={labelCls}>Channels</label>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {ALL_CHANNELS.map((ch) => (
                                        <label
                                            key={ch}
                                            className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                                                form.channels.includes(ch)
                                                    ? 'border-[var(--admin-primary)] bg-[var(--admin-primary-10)]'
                                                    : 'border-gray-200 hover:bg-gray-50'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={form.channels.includes(ch)}
                                                onChange={() => toggleFormChannel(ch)}
                                                className="w-4 h-4 rounded border-gray-300"
                                                style={{
                                                    accentColor: 'var(--admin-primary)',
                                                }}
                                            />
                                            <span className="text-sm font-bold text-gray-700">
                                                {CHANNEL_LABELS[ch]}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Recipients */}
                            <div>
                                <label className={labelCls}>Recipient Roles</label>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                    {ALL_ROLES.map((role) => (
                                        <label
                                            key={role}
                                            className={`flex items-center gap-2 p-2.5 border rounded-xl cursor-pointer transition-colors text-xs ${
                                                form.roles.includes(role)
                                                    ? 'border-[var(--admin-primary)] bg-[var(--admin-primary-10)]'
                                                    : 'border-gray-200 hover:bg-gray-50'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={form.roles.includes(role)}
                                                onChange={() => toggleFormRole(role)}
                                                className="w-3.5 h-3.5 rounded border-gray-300"
                                                style={{
                                                    accentColor: 'var(--admin-primary)',
                                                }}
                                            />
                                            <span className="font-bold text-gray-700">
                                                {ROLE_LABELS[role]}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Threshold */}
                            <div>
                                <label className={labelCls}>Threshold Configuration</label>
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                                            Operator
                                        </label>
                                        <select
                                            value={form.threshold_operator}
                                            onChange={(e) =>
                                                setForm((p) => ({
                                                    ...p,
                                                    threshold_operator: e.target.value,
                                                }))
                                            }
                                            className={inputCls}
                                        >
                                            <option value="">None</option>
                                            {OPERATORS.map((op) => (
                                                <option key={op} value={op}>
                                                    {OPERATOR_LABELS[op]}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                                            Value
                                        </label>
                                        <input
                                            type="number"
                                            value={form.threshold_value}
                                            onChange={(e) =>
                                                setForm((p) => ({
                                                    ...p,
                                                    threshold_value: e.target.value,
                                                }))
                                            }
                                            placeholder="e.g. 85"
                                            className={inputCls}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                                            Unit
                                        </label>
                                        <input
                                            type="text"
                                            value={form.threshold_unit}
                                            onChange={(e) =>
                                                setForm((p) => ({
                                                    ...p,
                                                    threshold_unit: e.target.value,
                                                }))
                                            }
                                            placeholder="e.g. %, days"
                                            className={inputCls}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Escalation */}
                            <div>
                                <label className={labelCls}>Escalation</label>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                                                After Minutes
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                value={form.escalation_after_minutes}
                                                onChange={(e) =>
                                                    setForm((p) => ({
                                                        ...p,
                                                        escalation_after_minutes: e.target.value,
                                                    }))
                                                }
                                                placeholder="e.g. 30"
                                                className={inputCls}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                                            Escalate To
                                        </label>
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                            {ALL_ROLES.map((role) => (
                                                <label
                                                    key={role}
                                                    className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors text-xs ${
                                                        form.escalation_to.includes(role)
                                                            ? 'border-amber-400 bg-amber-50'
                                                            : 'border-gray-200 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={form.escalation_to.includes(role)}
                                                        onChange={() =>
                                                            toggleEscalationRole(role)
                                                        }
                                                        className="w-3.5 h-3.5 rounded border-gray-300"
                                                        style={{
                                                            accentColor: 'var(--admin-primary)',
                                                        }}
                                                    />
                                                    <span className="font-bold text-gray-700">
                                                        {ROLE_LABELS[role]}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Message Template */}
                            <div>
                                <label className={labelCls}>Message Template</label>
                                <textarea
                                    rows={3}
                                    value={form.template}
                                    onChange={(e) =>
                                        setForm((p) => ({ ...p, template: e.target.value }))
                                    }
                                    placeholder="Alert: {{rule_name}} triggered. {{details}} at {{timestamp}}"
                                    className={`${inputCls} resize-none font-mono text-xs`}
                                />
                                <p className="text-[10px] text-gray-400 mt-1 font-bold">
                                    Available variables: {'{{rule_name}}'}, {'{{details}}'},{' '}
                                    {'{{timestamp}}'}, {'{{patient_name}}'}, {'{{value}}'},{' '}
                                    {'{{threshold}}'}
                                </p>
                            </div>

                            {/* Quiet Hours */}
                            <div>
                                <label className={labelCls}>Quiet Hours</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                                            Start
                                        </label>
                                        <input
                                            type="time"
                                            value={form.quiet_start}
                                            onChange={(e) =>
                                                setForm((p) => ({
                                                    ...p,
                                                    quiet_start: e.target.value,
                                                }))
                                            }
                                            className={inputCls}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                                            End
                                        </label>
                                        <input
                                            type="time"
                                            value={form.quiet_end}
                                            onChange={(e) =>
                                                setForm((p) => ({
                                                    ...p,
                                                    quiet_end: e.target.value,
                                                }))
                                            }
                                            className={inputCls}
                                        />
                                    </div>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1 font-bold">
                                    Suppress non-critical notifications during these hours
                                </p>
                            </div>
                        </div>

                        {/* Modal footer */}
                        <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-3xl flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={closeModal}
                                disabled={saving}
                                className="px-6 py-3 font-bold text-gray-500 hover:bg-gray-200 rounded-xl transition-colors text-sm disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="px-8 py-3 bg-gray-900 hover:bg-black text-white font-bold rounded-xl shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 text-sm"
                            >
                                {saving ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Zap className="h-4 w-4" />
                                )}
                                {saving
                                    ? 'Saving...'
                                    : modalMode === 'create'
                                    ? 'Create Rule'
                                    : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminPage>
    );
}
