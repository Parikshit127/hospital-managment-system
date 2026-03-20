'use client';

import React, { useEffect, useState } from 'react';
import {
    Save, RotateCcw, Banknote, CalendarDays, Clock, Repeat,
    CheckCircle2, AlertCircle, Loader2, MapPin, Fingerprint,
    Timer, Moon,
} from 'lucide-react';
import {
    getModuleConfig,
    updateModuleConfig,
    resetModuleConfig,
} from '@/app/actions/module-config-actions';

// ── Types ──────────────────────────────────────────────────────────────────────
interface HrConfig {
    // Payroll
    pay_cycle: 'monthly' | 'bi_weekly';
    pay_day: number;
    overtime_rate_multiplier: number;
    pf_enabled: boolean;
    pf_percentage: number;
    esi_enabled: boolean;
    professional_tax: boolean;

    // Leave Policy
    annual_leave_quota: number;
    sick_leave_quota: number;
    casual_leave_quota: number;
    carry_forward_enabled: boolean;
    max_carry_forward_days: number;
    leave_approval_workflow: 'direct_manager' | 'hod' | 'hr_head';

    // Attendance
    work_hours_per_day: number;
    grace_period_minutes: number;
    half_day_threshold_hours: number;
    biometric_enabled: boolean;
    geo_fencing_enabled: boolean;

    // Shifts
    default_shift: 'morning' | 'afternoon' | 'night';
    shift_rotation_enabled: boolean;
    break_duration_minutes: number;
}

const DEFAULT_CONFIG: HrConfig = {
    pay_cycle: 'monthly',
    pay_day: 1,
    overtime_rate_multiplier: 1.5,
    pf_enabled: true,
    pf_percentage: 12,
    esi_enabled: false,
    professional_tax: true,

    annual_leave_quota: 21,
    sick_leave_quota: 12,
    casual_leave_quota: 7,
    carry_forward_enabled: true,
    max_carry_forward_days: 5,
    leave_approval_workflow: 'direct_manager',

    work_hours_per_day: 8,
    grace_period_minutes: 15,
    half_day_threshold_hours: 4,
    biometric_enabled: false,
    geo_fencing_enabled: false,

    default_shift: 'morning',
    shift_rotation_enabled: false,
    break_duration_minutes: 60,
};

type TabKey = 'payroll' | 'leave' | 'attendance' | 'shifts';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'payroll', label: 'Payroll', icon: Banknote },
    { key: 'leave', label: 'Leave Policy', icon: CalendarDays },
    { key: 'attendance', label: 'Attendance', icon: Clock },
    { key: 'shifts', label: 'Shifts', icon: Repeat },
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

export function HRSettingsContent() {
    const [config, setConfig] = useState<HrConfig>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [activeTab, setActiveTab] = useState<TabKey>('payroll');
    const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const res = await getModuleConfig('hr');
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

    const updateField = <K extends keyof HrConfig>(key: K, value: HrConfig[K]) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await updateModuleConfig('hr', config as any);
            if (res.success) showAlert('success', 'HR configuration saved successfully.');
            else showAlert('error', res.error || 'Failed to save configuration.');
        } catch { showAlert('error', 'An unexpected error occurred while saving.'); }
        setSaving(false);
    };

    const handleReset = async () => {
        if (!confirm('Reset all HR settings to factory defaults? This cannot be undone.')) return;
        setResetting(true);
        try {
            const res = await resetModuleConfig('hr');
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
                <p className="text-sm font-bold">Loading HR configuration...</p>
            </div>
        );
    }

    const renderPayrollTab = () => (
        <div className="space-y-6">
            <SectionCard icon={Banknote} title="Salary & Pay Cycle" subtitle="Payroll schedule and compensation rules">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <FieldLabel>Pay Cycle</FieldLabel>
                        <select value={config.pay_cycle} onChange={e => updateField('pay_cycle', e.target.value as any)} className={INPUT_CLS}>
                            <option value="monthly">Monthly</option>
                            <option value="bi_weekly">Bi-Weekly</option>
                        </select>
                        <FieldHint>How often employees are paid</FieldHint>
                    </div>
                    <div>
                        <FieldLabel>Pay Day</FieldLabel>
                        <input type="number" min={1} max={28} value={config.pay_day}
                            onChange={e => updateField('pay_day', Math.min(28, Math.max(1, Number(e.target.value))))} className={INPUT_CLS} />
                        <FieldHint>Day of the month salary is disbursed (1-28)</FieldHint>
                    </div>
                    <div>
                        <FieldLabel>Overtime Rate Multiplier</FieldLabel>
                        <input type="number" min={1} max={5} step={0.1} value={config.overtime_rate_multiplier}
                            onChange={e => updateField('overtime_rate_multiplier', Number(e.target.value))} className={INPUT_CLS} />
                        <FieldHint>Multiplier applied to hourly rate for overtime hours (e.g. 1.5x)</FieldHint>
                    </div>
                </div>
            </SectionCard>

            <SectionCard icon={Banknote} title="Statutory Deductions" subtitle="PF, ESI and professional tax settings">
                <div className="space-y-5">
                    <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                        <div>
                            <p className="font-bold text-gray-900 text-sm">Provident Fund (PF)</p>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">Enable provident fund deduction from employee salary</p>
                        </div>
                        <Toggle checked={config.pf_enabled} onChange={v => updateField('pf_enabled', v)} />
                    </div>
                    {config.pf_enabled && (
                        <div className="pl-4 border-l-2 border-gray-200">
                            <FieldLabel>PF Percentage</FieldLabel>
                            <input type="number" min={1} max={100} value={config.pf_percentage}
                                onChange={e => updateField('pf_percentage', Math.min(100, Math.max(1, Number(e.target.value))))} className={INPUT_CLS} />
                            <FieldHint>Percentage of basic salary deducted for PF</FieldHint>
                        </div>
                    )}

                    <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                        <div>
                            <p className="font-bold text-gray-900 text-sm">Employee State Insurance (ESI)</p>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">Enable ESI deduction for eligible employees</p>
                        </div>
                        <Toggle checked={config.esi_enabled} onChange={v => updateField('esi_enabled', v)} />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                        <div>
                            <p className="font-bold text-gray-900 text-sm">Professional Tax</p>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">Enable professional tax deduction as per state rules</p>
                        </div>
                        <Toggle checked={config.professional_tax} onChange={v => updateField('professional_tax', v)} />
                    </div>
                </div>
            </SectionCard>
        </div>
    );

    const renderLeaveTab = () => (
        <div className="space-y-6">
            <SectionCard icon={CalendarDays} title="Leave Quotas" subtitle="Annual leave allocation per employee">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <FieldLabel>Annual Leave Quota</FieldLabel>
                        <input type="number" min={0} max={365} value={config.annual_leave_quota}
                            onChange={e => updateField('annual_leave_quota', Number(e.target.value))} className={INPUT_CLS} />
                        <FieldHint>Total earned/annual leave days per year</FieldHint>
                    </div>
                    <div>
                        <FieldLabel>Sick Leave Quota</FieldLabel>
                        <input type="number" min={0} max={365} value={config.sick_leave_quota}
                            onChange={e => updateField('sick_leave_quota', Number(e.target.value))} className={INPUT_CLS} />
                        <FieldHint>Total sick leave days per year</FieldHint>
                    </div>
                    <div>
                        <FieldLabel>Casual Leave Quota</FieldLabel>
                        <input type="number" min={0} max={365} value={config.casual_leave_quota}
                            onChange={e => updateField('casual_leave_quota', Number(e.target.value))} className={INPUT_CLS} />
                        <FieldHint>Total casual leave days per year</FieldHint>
                    </div>
                </div>
            </SectionCard>

            <SectionCard icon={CalendarDays} title="Carry Forward & Approval" subtitle="Leave policy rules and workflows">
                <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                        <div>
                            <p className="font-bold text-gray-900 text-sm">Allow Leave Carry Forward</p>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">Unused leaves from current year can be carried to the next year</p>
                        </div>
                        <Toggle checked={config.carry_forward_enabled} onChange={v => updateField('carry_forward_enabled', v)} />
                    </div>
                    {config.carry_forward_enabled && (
                        <div className="pl-4 border-l-2 border-gray-200">
                            <FieldLabel>Max Carry Forward Days</FieldLabel>
                            <input type="number" min={0} max={365} value={config.max_carry_forward_days}
                                onChange={e => updateField('max_carry_forward_days', Number(e.target.value))} className={INPUT_CLS} />
                            <FieldHint>Maximum number of leave days that can be carried forward</FieldHint>
                        </div>
                    )}
                    <div>
                        <FieldLabel>Leave Approval Workflow</FieldLabel>
                        <select value={config.leave_approval_workflow} onChange={e => updateField('leave_approval_workflow', e.target.value as any)} className={INPUT_CLS}>
                            <option value="direct_manager">Direct Manager -- Reporting manager approves</option>
                            <option value="hod">Head of Department -- HOD approves all leaves</option>
                            <option value="hr_head">HR Head -- All leaves routed to HR head</option>
                        </select>
                        <FieldHint>Who is responsible for approving leave requests</FieldHint>
                    </div>
                </div>
            </SectionCard>
        </div>
    );

    const renderAttendanceTab = () => (
        <div className="space-y-6">
            <SectionCard icon={Timer} title="Work Hours & Thresholds" subtitle="Daily work time and grace period configuration">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <FieldLabel>Work Hours per Day</FieldLabel>
                        <input type="number" min={1} max={24} value={config.work_hours_per_day}
                            onChange={e => updateField('work_hours_per_day', Math.min(24, Math.max(1, Number(e.target.value))))} className={INPUT_CLS} />
                        <FieldHint>Standard working hours expected per day</FieldHint>
                    </div>
                    <div>
                        <FieldLabel>Grace Period (minutes)</FieldLabel>
                        <input type="number" min={0} max={120} value={config.grace_period_minutes}
                            onChange={e => updateField('grace_period_minutes', Math.min(120, Math.max(0, Number(e.target.value))))} className={INPUT_CLS} />
                        <FieldHint>Late arrival tolerance before marking as late</FieldHint>
                    </div>
                    <div>
                        <FieldLabel>Half Day Threshold (hours)</FieldLabel>
                        <input type="number" min={1} max={12} value={config.half_day_threshold_hours}
                            onChange={e => updateField('half_day_threshold_hours', Math.min(12, Math.max(1, Number(e.target.value))))} className={INPUT_CLS} />
                        <FieldHint>Minimum hours to count as a half day attendance</FieldHint>
                    </div>
                </div>
            </SectionCard>

            <SectionCard icon={Fingerprint} title="Tracking Methods" subtitle="Biometric and geo-fencing settings">
                <div className="space-y-5">
                    <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                        <div>
                            <p className="font-bold text-gray-900 text-sm">Biometric Attendance</p>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">Enable fingerprint or face recognition for check-in/check-out</p>
                        </div>
                        <Toggle checked={config.biometric_enabled} onChange={v => updateField('biometric_enabled', v)} />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                        <div className="flex items-center gap-3">
                            <MapPin className="h-4 w-4 text-gray-400" />
                            <div>
                                <p className="font-bold text-gray-900 text-sm">Geo-Fencing</p>
                                <p className="text-xs text-gray-500 font-medium mt-0.5">Restrict mobile attendance to within hospital premises</p>
                            </div>
                        </div>
                        <Toggle checked={config.geo_fencing_enabled} onChange={v => updateField('geo_fencing_enabled', v)} />
                    </div>
                </div>
            </SectionCard>
        </div>
    );

    const renderShiftsTab = () => (
        <div className="space-y-6">
            <SectionCard icon={Moon} title="Shift Configuration" subtitle="Default shift and rotation settings">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <FieldLabel>Default Shift</FieldLabel>
                        <select value={config.default_shift} onChange={e => updateField('default_shift', e.target.value as any)} className={INPUT_CLS}>
                            <option value="morning">Morning</option>
                            <option value="afternoon">Afternoon</option>
                            <option value="night">Night</option>
                        </select>
                        <FieldHint>Default shift assigned to new employees</FieldHint>
                    </div>
                    <div>
                        <FieldLabel>Break Duration (minutes)</FieldLabel>
                        <input type="number" min={0} max={180} value={config.break_duration_minutes}
                            onChange={e => updateField('break_duration_minutes', Math.min(180, Math.max(0, Number(e.target.value))))} className={INPUT_CLS} />
                        <FieldHint>Total break time allowed per shift</FieldHint>
                    </div>
                    <div className="md:col-span-2">
                        <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                            <div>
                                <p className="font-bold text-gray-900 text-sm">Shift Rotation</p>
                                <p className="text-xs text-gray-500 font-medium mt-0.5">Automatically rotate employee shifts on a periodic schedule</p>
                            </div>
                            <Toggle checked={config.shift_rotation_enabled} onChange={v => updateField('shift_rotation_enabled', v)} />
                        </div>
                    </div>
                </div>
            </SectionCard>
        </div>
    );

    const renderActiveTab = () => {
        switch (activeTab) {
            case 'payroll': return renderPayrollTab();
            case 'leave': return renderLeaveTab();
            case 'attendance': return renderAttendanceTab();
            case 'shifts': return renderShiftsTab();
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
