'use client';

import React, { useEffect, useState } from 'react';
import {
    Save, RotateCcw, Settings2, Clock, Hash,
    ClipboardList, Banknote, CheckCircle2, AlertCircle,
    Monitor, HeartPulse, FileText,
    CreditCard, Loader2,
} from 'lucide-react';
import {
    getModuleConfig,
    updateModuleConfig,
    resetModuleConfig,
} from '@/app/actions/module-config-actions';

// ── Types ──────────────────────────────────────────────────────────────────────
interface OpdConfig {
    slot_duration: number;
    max_patients_per_doctor: number;
    max_wait_minutes: number;
    escalation_threshold: number;
    walk_in_ratio: number;
    token_format: string;
    auto_assign_token: boolean;
    vitals_mandatory: boolean;
    triage_mode: string;
    base_consultation_fee: number;
    followup_discount_pct: number;
    payment_collection: string;
    followup_auto_schedule: boolean;
    prescription_print_format: string;
}

const DEFAULT_CONFIG: OpdConfig = {
    slot_duration: 15,
    max_patients_per_doctor: 30,
    max_wait_minutes: 20,
    escalation_threshold: 30,
    walk_in_ratio: 20,
    token_format: 'numeric',
    auto_assign_token: true,
    vitals_mandatory: true,
    triage_mode: 'manual',
    base_consultation_fee: 500,
    followup_discount_pct: 50,
    payment_collection: 'before',
    followup_auto_schedule: false,
    prescription_print_format: 'standard',
};

type TabKey = 'general' | 'queue' | 'consultation' | 'fees';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'general', label: 'General', icon: Settings2 },
    { key: 'queue', label: 'Queue & Token', icon: Hash },
    { key: 'consultation', label: 'Consultation', icon: ClipboardList },
    { key: 'fees', label: 'Fees', icon: Banknote },
];

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: checked ? 'var(--admin-primary)' : '#d1d5db' }}
        >
            <span
                className="inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform duration-200"
                style={{ transform: checked ? 'translateX(24px)' : 'translateX(4px)' }}
            />
        </button>
    );
}

function SectionCard({ icon: Icon, title, subtitle, children }: {
    icon: React.ElementType; title: string; subtitle: string; children: React.ReactNode;
}) {
    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 p-6 flex items-center gap-3" style={{ backgroundColor: 'var(--admin-primary-10)' }}>
                <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--admin-primary-20)', color: 'var(--admin-primary)' }}>
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <h2 className="text-lg font-black text-gray-900">{title}</h2>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-0.5">{subtitle}</p>
                </div>
            </div>
            <div className="p-6">{children}</div>
        </div>
    );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">{children}</label>;
}

function FieldHint({ children }: { children: React.ReactNode }) {
    return <p className="text-[10px] text-gray-400 mt-1.5 font-bold">{children}</p>;
}

const INPUT_CLS =
    'w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[var(--admin-primary)]/20 text-sm font-medium outline-none transition-colors';

export function OPDSettingsContent() {
    const [config, setConfig] = useState<OpdConfig>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [activeTab, setActiveTab] = useState<TabKey>('general');
    const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const res = await getModuleConfig('opd');
            if (res.success && res.data) {
                setConfig({ ...DEFAULT_CONFIG, ...(res.data.config_json as any) });
            }
        } catch {}
        setLoading(false);
    };

    useEffect(() => { loadConfig(); }, []);

    const showAlert = (type: 'success' | 'error', message: string) => {
        setAlert({ type, message });
        setTimeout(() => setAlert(null), 4000);
    };

    const updateField = <K extends keyof OpdConfig>(key: K, value: OpdConfig[K]) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await updateModuleConfig('opd', config as any);
            if (res.success) showAlert('success', 'OPD configuration saved successfully.');
            else showAlert('error', res.error || 'Failed to save configuration.');
        } catch { showAlert('error', 'An unexpected error occurred while saving.'); }
        setSaving(false);
    };

    const handleReset = async () => {
        if (!confirm('Reset all OPD settings to factory defaults? This cannot be undone.')) return;
        setResetting(true);
        try {
            const res = await resetModuleConfig('opd');
            if (res.success && res.data) {
                setConfig({ ...DEFAULT_CONFIG, ...(res.data.config_json as any) });
                showAlert('success', 'Configuration reset to defaults.');
            } else showAlert('error', res.error || 'Failed to reset configuration.');
        } catch { showAlert('error', 'An unexpected error occurred while resetting.'); }
        setResetting(false);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-gray-400 gap-4">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm font-bold">Loading OPD configuration...</p>
            </div>
        );
    }

    const renderGeneralTab = () => (
        <div className="space-y-6">
            <SectionCard icon={Clock} title="Scheduling & Capacity" subtitle="Appointment slot and patient limits">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <FieldLabel>Default Slot Duration</FieldLabel>
                        <select value={config.slot_duration} onChange={e => updateField('slot_duration', Number(e.target.value))} className={INPUT_CLS}>
                            <option value={10}>10 minutes</option>
                            <option value={15}>15 minutes</option>
                            <option value={20}>20 minutes</option>
                            <option value={30}>30 minutes</option>
                        </select>
                        <FieldHint>Duration of each OPD appointment slot</FieldHint>
                    </div>
                    <div>
                        <FieldLabel>Max Patients per Doctor / Day</FieldLabel>
                        <input type="number" min={1} max={100} value={config.max_patients_per_doctor}
                            onChange={e => updateField('max_patients_per_doctor', Math.min(100, Math.max(1, Number(e.target.value))))} className={INPUT_CLS} />
                        <FieldHint>Upper limit of patients a single doctor can see in one day (1-100)</FieldHint>
                    </div>
                    <div>
                        <FieldLabel>Max Wait Threshold (minutes)</FieldLabel>
                        <input type="number" min={5} max={120} value={config.max_wait_minutes}
                            onChange={e => updateField('max_wait_minutes', Number(e.target.value))} className={INPUT_CLS} />
                        <FieldHint>Alert when patient wait exceeds this threshold</FieldHint>
                    </div>
                    <div>
                        <FieldLabel>Escalation Threshold (minutes)</FieldLabel>
                        <input type="number" min={5} max={180} value={config.escalation_threshold}
                            onChange={e => updateField('escalation_threshold', Number(e.target.value))} className={INPUT_CLS} />
                        <FieldHint>Auto-escalate to supervisor if wait exceeds this</FieldHint>
                    </div>
                    <div>
                        <FieldLabel>Walk-in Reservation %</FieldLabel>
                        <input type="number" min={0} max={100} value={config.walk_in_ratio}
                            onChange={e => updateField('walk_in_ratio', Math.min(100, Math.max(0, Number(e.target.value))))} className={INPUT_CLS} />
                        <FieldHint>Percentage of daily slots reserved for walk-in patients (0-100)</FieldHint>
                    </div>
                </div>
            </SectionCard>
        </div>
    );

    const renderQueueTab = () => (
        <div className="space-y-6">
            <SectionCard icon={Hash} title="Token Configuration" subtitle="Queue token format and automation">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <FieldLabel>Token Format</FieldLabel>
                        <select value={config.token_format} onChange={e => updateField('token_format', e.target.value)} className={INPUT_CLS}>
                            <option value="numeric">Numeric (001, 002, 003...)</option>
                            <option value="alphanumeric">Alphanumeric (OPD-A01, OPD-A02...)</option>
                        </select>
                        <FieldHint>How tokens are numbered for OPD patients</FieldHint>
                    </div>
                    <div>
                        <FieldLabel>Escalation Threshold (minutes)</FieldLabel>
                        <input type="number" min={5} max={180} value={config.escalation_threshold}
                            onChange={e => updateField('escalation_threshold', Number(e.target.value))} className={INPUT_CLS} />
                        <FieldHint>Escalate queue item after this many minutes of inactivity</FieldHint>
                    </div>
                    <div className="md:col-span-2">
                        <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                            <div>
                                <p className="font-bold text-gray-900 text-sm">Auto-Assign Token on Check-in</p>
                                <p className="text-xs text-gray-500 font-medium mt-0.5">Automatically generate and assign a queue token when the patient checks in at the front desk</p>
                            </div>
                            <Toggle checked={config.auto_assign_token} onChange={v => updateField('auto_assign_token', v)} />
                        </div>
                    </div>
                </div>
            </SectionCard>
            <SectionCard icon={Monitor} title="Display Board Configuration" subtitle="Queue display and kiosk settings">
                <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="p-4 rounded-2xl bg-gray-100 mb-4"><Monitor className="h-10 w-10 text-gray-400" /></div>
                    <h3 className="font-bold text-gray-700 text-sm mb-1">Display Board Settings</h3>
                    <p className="text-xs text-gray-500 font-medium max-w-sm">Queue display board and kiosk configuration will be available in a future update.</p>
                    <span className="mt-4 inline-block text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full"
                        style={{ backgroundColor: 'var(--admin-primary-10)', color: 'var(--admin-primary)' }}>Coming Soon</span>
                </div>
            </SectionCard>
        </div>
    );

    const renderConsultationTab = () => (
        <div className="space-y-6">
            <SectionCard icon={HeartPulse} title="Pre-Consultation" subtitle="Vitals and triage configuration">
                <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                        <div>
                            <p className="font-bold text-gray-900 text-sm">Vitals Mandatory Before Consultation</p>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">Require nurses to record vitals before the doctor can begin consultation</p>
                        </div>
                        <Toggle checked={config.vitals_mandatory} onChange={v => updateField('vitals_mandatory', v)} />
                    </div>
                    <div>
                        <FieldLabel>Triage Mode</FieldLabel>
                        <select value={config.triage_mode} onChange={e => updateField('triage_mode', e.target.value)} className={INPUT_CLS}>
                            <option value="manual">Manual -- Staff manually triages patients</option>
                            <option value="ai">AI-Assisted -- System suggests triage level</option>
                            <option value="bypass">Bypass -- Skip triage entirely</option>
                        </select>
                        <FieldHint>Determines how patients are prioritized in the queue</FieldHint>
                    </div>
                </div>
            </SectionCard>
            <SectionCard icon={FileText} title="Post-Consultation" subtitle="Prescription and follow-up settings">
                <div className="space-y-6">
                    <div>
                        <FieldLabel>Prescription Print Format</FieldLabel>
                        <select value={config.prescription_print_format} onChange={e => updateField('prescription_print_format', e.target.value)} className={INPUT_CLS}>
                            <option value="standard">Standard -- Default A4 layout with all fields</option>
                            <option value="compact">Compact -- Condensed single-page format</option>
                            <option value="detailed">Detailed -- Includes diagnosis notes and test references</option>
                        </select>
                        <FieldHint>Layout used when printing prescriptions from the doctor console</FieldHint>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                        <div>
                            <p className="font-bold text-gray-900 text-sm">Follow-up Auto-Schedule</p>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">Automatically create a follow-up appointment when the doctor marks one as needed</p>
                        </div>
                        <Toggle checked={config.followup_auto_schedule} onChange={v => updateField('followup_auto_schedule', v)} />
                    </div>
                </div>
            </SectionCard>
        </div>
    );

    const renderFeesTab = () => (
        <div className="space-y-6">
            <SectionCard icon={CreditCard} title="Consultation Fees" subtitle="Base pricing and discounts">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <FieldLabel>Base Consultation Fee</FieldLabel>
                        <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">$</span>
                            <input type="number" min={0} step={1} value={config.base_consultation_fee}
                                onChange={e => updateField('base_consultation_fee', Number(e.target.value))} className={INPUT_CLS + ' pl-8'} />
                        </div>
                        <FieldHint>Default fee charged per OPD visit (can be overridden per department)</FieldHint>
                    </div>
                    <div>
                        <FieldLabel>Follow-up Discount %</FieldLabel>
                        <div className="relative">
                            <input type="number" min={0} max={100} value={config.followup_discount_pct}
                                onChange={e => updateField('followup_discount_pct', Math.min(100, Math.max(0, Number(e.target.value))))} className={INPUT_CLS + ' pr-10'} />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">%</span>
                        </div>
                        <FieldHint>Discount applied when a patient returns for a follow-up visit (0-100)</FieldHint>
                    </div>
                    <div>
                        <FieldLabel>Payment Collection Point</FieldLabel>
                        <select value={config.payment_collection} onChange={e => updateField('payment_collection', e.target.value)} className={INPUT_CLS}>
                            <option value="before">Before Consultation -- Collect fees at registration</option>
                            <option value="after">After Consultation -- Collect fees post visit</option>
                        </select>
                        <FieldHint>When in the patient workflow should payment be collected</FieldHint>
                    </div>
                </div>
            </SectionCard>
            <SectionCard icon={Banknote} title="Specialty Surcharge" subtitle="Department-specific fee overrides">
                <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="p-4 rounded-2xl bg-gray-100 mb-4"><Banknote className="h-10 w-10 text-gray-400" /></div>
                    <h3 className="font-bold text-gray-700 text-sm mb-1">Specialty-Based Surcharges</h3>
                    <p className="text-xs text-gray-500 font-medium max-w-sm">Configure additional surcharges for specialist consultations. This is managed per-department in the Departments section.</p>
                    <a href="/admin/departments" className="mt-4 inline-block text-xs font-bold px-4 py-2 rounded-xl transition-colors"
                        style={{ backgroundColor: 'var(--admin-primary-10)', color: 'var(--admin-primary)' }}>Go to Departments</a>
                </div>
            </SectionCard>
        </div>
    );

    const renderActiveTab = () => {
        switch (activeTab) {
            case 'general': return renderGeneralTab();
            case 'queue': return renderQueueTab();
            case 'consultation': return renderConsultationTab();
            case 'fees': return renderFeesTab();
            default: return null;
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-28">
            {alert && (
                <div className={`mb-6 flex items-center gap-3 p-4 rounded-xl border text-sm font-bold ${
                    alert.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                    {alert.type === 'success' ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" /> : <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />}
                    {alert.message}
                </div>
            )}

            {/* Sub-tabs for settings sections */}
            <div className="border-b border-gray-200 mb-8">
                <div className="flex gap-0 overflow-x-auto">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;
                        return (
                            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                className="flex items-center gap-2 px-5 py-3.5 text-sm font-bold whitespace-nowrap transition-colors border-b-2 -mb-px"
                                style={isActive ? { borderBottomColor: 'var(--admin-primary)', color: 'var(--admin-primary)' }
                                    : { borderBottomColor: 'transparent', color: '#6b7280' }}>
                                <Icon className="h-4 w-4" />{tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="min-h-[400px]">{renderActiveTab()}</div>

            {/* Save Bar */}
            <div className="sticky bottom-0 mt-8 p-4 bg-white/80 backdrop-blur-md border-t border-gray-200 -mx-4 rounded-b-xl">
                <div className="max-w-4xl mx-auto flex justify-between items-center">
                    <button type="button" onClick={handleReset} disabled={resetting || saving}
                        className="flex items-center gap-2 px-5 py-3 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        {resetting ? 'Resetting...' : 'Reset to Defaults'}
                    </button>
                    <button type="button" onClick={handleSave} disabled={saving || resetting}
                        className="flex items-center gap-2 px-8 py-3 text-white font-bold rounded-xl shadow-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                        style={{ backgroundColor: 'var(--admin-primary)' }}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {saving ? 'Saving...' : 'Save Configuration'}
                    </button>
                </div>
            </div>
        </div>
    );
}
