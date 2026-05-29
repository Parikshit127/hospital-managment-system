'use client';

import { useState, useEffect, type CSSProperties, type ElementType } from 'react';
import {
    Plug, CreditCard, MessageSquare, Brain, Mail,
    ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle,
    AlertTriangle, Eye, EyeOff, RefreshCw, Save, Info,
    Shield, Send,
} from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import {
    getAdminIntegrationSettings,
    updateAdminIntegrationSettings,
    testAdminIntegrationConnection,
    sendRealTestNotification,
} from '@/app/actions/integration-actions';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type IntegrationStatus = 'connected' | 'not_configured' | 'error';
type ProductionReadiness = {
    requiredOk: boolean;
    missingRequired: string[];
    missingRecommended: string[];
    nodeEnv: string;
};
type IntegrationConfig = Record<string, string | boolean | null | undefined | ProductionReadiness> & {
    production?: ProductionReadiness;
};

interface IntegrationDef {
    key: string;
    name: string;
    description: string;
    icon: ElementType;
    color: string;
    bgColor: string;
    borderColor: string;
    toggleField?: string;
    statusCheck: (cfg: IntegrationConfig | null) => IntegrationStatus;
    fields: FieldDef[];
    hasTestButton?: boolean;
    envNote?: string;
}

interface FieldDef {
    key: string;
    label: string;
    type: 'text' | 'password';
    placeholder?: string;
    masked?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Integration Definitions                                            */
/* ------------------------------------------------------------------ */
const INTEGRATIONS: IntegrationDef[] = [
    {
        key: 'razorpay',
        name: 'Razorpay',
        description: 'Accept online payments via UPI, credit/debit cards, netbanking, and wallets. Power your patient billing with India\'s leading payment gateway.',
        icon: CreditCard,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-500',
        toggleField: 'enable_razorpay',
        statusCheck: (cfg) => {
            if (!cfg?.enable_razorpay) return 'not_configured';
            if (cfg?.razorpay_key_id && cfg?.razorpay_key_secret_configured) return 'connected';
            if (cfg?.razorpay_key_id && !cfg?.razorpay_key_secret_configured) return 'error';
            return 'not_configured';
        },
        fields: [
            { key: 'razorpay_key_id', label: 'Key ID', type: 'text', placeholder: 'rzp_live_xxxxxxxxxx', masked: true },
            { key: 'razorpay_key_secret', label: 'Key Secret', type: 'password', placeholder: 'Enter your Razorpay key secret' },
        ],
        hasTestButton: true,
    },
    {
        key: 'whatsapp',
        name: 'WhatsApp',
        description: 'Send appointment reminders, billing notifications, and lab report alerts to patients via the official Meta Business API.',
        icon: MessageSquare,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-500',
        toggleField: 'enable_whatsapp',
        statusCheck: (cfg) => {
            if (!cfg?.enable_whatsapp) return 'not_configured';
            if (cfg?.whatsapp_phone_id && cfg?.whatsapp_api_token_configured) return 'connected';
            if (cfg?.whatsapp_phone_id && !cfg?.whatsapp_api_token_configured) return 'error';
            return 'not_configured';
        },
        fields: [
            { key: 'whatsapp_phone_id', label: 'Phone Number ID', type: 'text', placeholder: '1234567890' },
            { key: 'whatsapp_api_token', label: 'API Access Token', type: 'password', placeholder: 'Enter your Meta API token' },
        ],
    },
    {
        key: 'openai',
        name: 'OpenAI',
        description: 'Enable AI-powered clinical triage, automated SOAP note generation, and smart patient intake routing using GPT models.',
        icon: Brain,
        color: 'text-violet-600',
        bgColor: 'bg-violet-50',
        borderColor: 'border-violet-500',
        toggleField: 'enable_ai_triage',
        statusCheck: (cfg) => {
            if (!cfg?.enable_ai_triage) return 'not_configured';
            if (cfg?.openai_key_configured) return 'connected';
            return 'not_configured';
        },
        fields: [
            { key: 'openai_key', label: 'API Key', type: 'password', placeholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
        ],
    },
    {
        key: 'smtp',
        name: 'SMTP Email',
        description: 'Configure outbound email for patient communications, invoice delivery, lab reports, and system notifications.',
        icon: Mail,
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-500',
        statusCheck: (cfg) => {
            if (cfg?.smtp_host && cfg?.smtp_user && cfg?.smtp_pass_configured) return 'connected';
            if (cfg?.smtp_host && cfg?.smtp_user && !cfg?.smtp_pass_configured) return 'error';
            return 'not_configured';
        },
        fields: [
            { key: 'smtp_host', label: 'SMTP Host', type: 'text', placeholder: 'smtp.gmail.com' },
            { key: 'smtp_user', label: 'SMTP Username', type: 'text', placeholder: 'alerts@yourhospital.com' },
            { key: 'smtp_pass', label: 'SMTP Password', type: 'password', placeholder: 'Enter SMTP password or app password' },
            { key: 'smtp_port', label: 'SMTP Port', type: 'text', placeholder: '587 (default if empty)' },
            { key: 'smtp_secure', label: 'TLS / SSL Mode', type: 'text', placeholder: 'true or false (default: false)' },
        ],
        hasTestButton: true,
    },
    {
        key: 'sms',
        name: 'SMS Gateway',
        description: 'Send transactional SMS notifications, billing summaries, and patient intake OTP alerts via dynamic REST integration.',
        icon: MessageSquare,
        color: 'text-sky-600',
        bgColor: 'bg-sky-50',
        borderColor: 'border-sky-500',
        statusCheck: (cfg) => {
            if (cfg?.sms_gateway_url && cfg?.sms_api_key_configured) return 'connected';
            if (cfg?.sms_gateway_url && !cfg?.sms_api_key_configured) return 'error';
            return 'not_configured';
        },
        fields: [
            { key: 'sms_gateway_url', label: 'SMS Gateway URL', type: 'text', placeholder: 'https://api.sms-provider.com/v1/send' },
            { key: 'sms_api_key', label: 'API Key / Secret Token', type: 'password', placeholder: 'Enter SMS Gateway API Key' },
            { key: 'sms_sender_id', label: 'Sender ID (Header)', type: 'text', placeholder: 'e.g., AVNHSP' },
            { key: 'sender_phone_number', label: 'Sender Phone Number', type: 'text', placeholder: 'e.g., +91 99999 99999' },
        ],
        hasTestButton: true,
    },
];

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */
function getStatusLabel(status: IntegrationStatus) {
    switch (status) {
        case 'connected': return 'Connected';
        case 'error': return 'Incomplete Config';
        case 'not_configured': return 'Not Configured';
    }
}

function getStatusStyles(status: IntegrationStatus) {
    switch (status) {
        case 'connected':
            return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        case 'error':
            return 'bg-red-100 text-red-700 border-red-200';
        case 'not_configured':
            return 'bg-gray-100 text-gray-500 border-gray-200';
    }
}

function getStatusIcon(status: IntegrationStatus) {
    switch (status) {
        case 'connected': return <CheckCircle2 className="h-3 w-3" />;
        case 'error': return <AlertTriangle className="h-3 w-3" />;
        case 'not_configured': return <XCircle className="h-3 w-3" />;
    }
}

function getCardBorderColor(status: IntegrationStatus) {
    switch (status) {
        case 'connected': return 'border-l-emerald-500';
        case 'error': return 'border-l-red-500';
        case 'not_configured': return 'border-l-gray-300';
    }
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function IntegrationDashboard() {
    const [config, setConfig] = useState<IntegrationConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
    const [savingKey, setSavingKey] = useState<string | null>(null);
    const [toggleSavingKey, setToggleSavingKey] = useState<string | null>(null);
    const [testingKey, setTestingKey] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<Record<string, 'success' | 'failed' | null>>({});
    const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
    const [localFields, setLocalFields] = useState<Record<string, string>>({});
    const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
    const [testLog, setTestLog] = useState<Record<string, string[]>>({});
    const [sendingTest, setSendingTest] = useState<Record<string, boolean>>({});
    const [testTarget, setTestTarget] = useState<Record<string, string>>({});

    /* Load organization config */
    const loadConfig = async () => {
        setLoading(true);
        try {
            const res = await getAdminIntegrationSettings();
            if (res.success && res.data) {
                const data = res.data as IntegrationConfig;
                setConfig(data);
                // Initialize local field state from config
                const fields: Record<string, string> = {};
                INTEGRATIONS.forEach((integ) => {
                    integ.fields.forEach((f) => {
                        const value = data[f.key];
                        fields[f.key] = data[`${f.key}_configured`] ? '' : (typeof value === 'string' ? value : '');
                    });
                });
                setLocalFields(fields);
            }
        } catch (err) {
            console.error('Failed to load integration config:', err);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadConfig();
    }, []);

    /* Toggle expand/collapse */
    const toggleExpand = (key: string) => {
        setExpandedCards((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    /* Toggle field visibility (for masked fields) */
    const toggleFieldVisibility = (fieldKey: string) => {
        setVisibleFields((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
    };

    /* Update local field value */
    const handleFieldChange = (fieldKey: string, value: string) => {
        setLocalFields((prev) => ({ ...prev, [fieldKey]: value }));
    };

    /* Save a single integration's fields */
    const handleSave = async (integration: IntegrationDef) => {
        setSavingKey(integration.key);
        setSaveSuccess(null);
        try {
            const dataToSave: Record<string, string | null> = {};
            integration.fields.forEach((f) => {
                dataToSave[f.key] = localFields[f.key] || null;
            });
            const res = await updateAdminIntegrationSettings(dataToSave);
            if (res.success) {
                await loadConfig();
                setSaveSuccess(integration.key);
                setTimeout(() => setSaveSuccess(null), 3000);
            } else {
                alert(res.error || 'Failed to save integration settings.');
            }
        } catch (err) {
            console.error('Save failed:', err);
            alert('An error occurred while saving. Please try again.');
        }
        setSavingKey(null);
    };

    /* Toggle integration enable/disable */
    const handleToggle = async (integration: IntegrationDef) => {
        if (!integration.toggleField || !config) return;
        const nextValue = !config[integration.toggleField];
        setToggleSavingKey(integration.key);
        try {
            const res = await updateAdminIntegrationSettings({ [integration.toggleField]: nextValue });
            if (res.success) {
                setConfig((prev) => ({ ...(prev || {}), [integration.toggleField!]: nextValue }));
            } else {
                alert(res.error || 'Failed to update toggle.');
            }
        } catch (err) {
            console.error('Toggle failed:', err);
            alert('Unable to update toggle right now.');
        }
        setToggleSavingKey(null);
    };

    /* Test connection */
    const handleTestConnection = async (integration: IntegrationDef) => {
        setTestingKey(integration.key);
        setTestResults((prev) => ({ ...prev, [integration.key]: null }));
        const res = await testAdminIntegrationConnection(integration.key);
        setTestResults((prev) => ({ ...prev, [integration.key]: res.success ? 'success' : 'failed' }));
        if (!res.success && res.error) alert(res.error);
        setTestingKey(null);
    };

    /* Send real test notification sandbox */
    const handleSendTestNotification = async (integrationKey: string) => {
        const target = testTarget[integrationKey]?.trim();
        if (!target) {
            alert('Please enter a recipient email or phone number.');
            return;
        }

        setSendingTest((prev) => ({ ...prev, [integrationKey]: true }));
        setTestLog((prev) => ({
            ...prev,
            [integrationKey]: [
                `[${new Date().toLocaleTimeString()}] 🚀 Initiating outbound live delivery test...`,
                `[${new Date().toLocaleTimeString()}] 🔍 Resolving dynamically configured secrets from database...`,
            ],
        }));

        const channel = integrationKey === 'smtp' ? 'smtp' : (integrationKey === 'whatsapp' ? 'whatsapp' : 'sms');

        try {
            const res = await sendRealTestNotification(channel, target);
            if (res.success) {
                setTestLog((prev) => ({
                    ...prev,
                    [integrationKey]: [
                        ...(prev[integrationKey] || []),
                        `[${new Date().toLocaleTimeString()}] 📡 Channel: ${channel.toUpperCase()}`,
                        `[${new Date().toLocaleTimeString()}] 🟢 Connection verified and handshake successful.`,
                        `[${new Date().toLocaleTimeString()}] ✉️ Dispatching live payload...`,
                        `[${new Date().toLocaleTimeString()}] ✅ SUCCESS: ${res.message || 'Delivered successfully!'}`
                    ],
                }));
            } else {
                setTestLog((prev) => ({
                    ...prev,
                    [integrationKey]: [
                        ...(prev[integrationKey] || []),
                        `[${new Date().toLocaleTimeString()}] 📡 Channel: ${channel.toUpperCase()}`,
                        `[${new Date().toLocaleTimeString()}] 🔴 FAILURE: ${res.error || 'Unknown gateway transmission error'}`
                    ],
                }));
            }
        } catch (err) {
            setTestLog((prev) => ({
                ...prev,
                [integrationKey]: [
                    ...(prev[integrationKey] || []),
                    `[${new Date().toLocaleTimeString()}] 🔴 CRITICAL ERROR: ${err instanceof Error ? err.message : String(err)}`
                ],
            }));
        } finally {
            setSendingTest((prev) => ({ ...prev, [integrationKey]: false }));
        }
    };

    /* Compute KPIs */
    const computeKpis = () => {
        const total = INTEGRATIONS.length;
        let active = 0;
        let inactive = 0;
        let errors = 0;
        INTEGRATIONS.forEach((integ) => {
            const status = integ.statusCheck(config);
            if (status === 'connected') active++;
            else if (status === 'error') errors++;
            else inactive++;
        });
        return { total, active, inactive, errors };
    };

    const kpis = config ? computeKpis() : { total: 0, active: 0, inactive: 0, errors: 0 };

    /* Mask a value for display */
    const maskValue = (val: string) => {
        if (!val || val.length < 8) return val ? '*'.repeat(val.length) : '';
        return val.slice(0, 4) + '*'.repeat(val.length - 8) + val.slice(-4);
    };

    return (
        <AdminPage
            pageTitle="Integration Dashboard"
            pageIcon={<Plug className="h-5 w-5" />}
            onRefresh={loadConfig}
            refreshing={loading}
        >
            <div className="space-y-8">
                {loading ? (
                    <div className="flex items-center justify-center py-32">
                        <div className="flex flex-col items-center gap-4">
                            <Loader2 className="h-10 w-10 animate-spin" style={{ color: 'var(--admin-primary)' }} />
                            <p className="text-gray-400 font-bold text-sm">Loading integration configuration...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* ============== KPI BAR ============== */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Total */}
                            <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:shadow-md transition-all overflow-hidden"
                                 style={{ borderTopColor: 'var(--admin-primary)', borderTopWidth: '2px' }}>
                                <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl transition-all"
                                     style={{ background: 'var(--admin-primary-10)' }} />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Total Integrations</span>
                                    <div className="p-1.5 rounded-lg" style={{ background: 'var(--admin-primary-10)' }}>
                                        <Plug className="h-3.5 w-3.5" style={{ color: 'var(--admin-primary)' }} />
                                    </div>
                                </div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight">{kpis.total}</p>
                                <p className="text-xs font-bold text-gray-400 mt-2">All configured services</p>
                            </div>

                            {/* Active */}
                            <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-emerald-500/30 hover:shadow-md transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Active</span>
                                    <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                    </div>
                                </div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight">{kpis.active}</p>
                                <p className="text-xs font-bold text-emerald-500 mt-2">Fully connected</p>
                            </div>

                            {/* Inactive */}
                            <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-gray-400/30 hover:shadow-md transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-gray-500/5 rounded-full blur-2xl group-hover:bg-gray-500/10 transition-all" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Inactive</span>
                                    <div className="p-1.5 bg-gray-200 rounded-lg">
                                        <XCircle className="h-3.5 w-3.5 text-gray-400" />
                                    </div>
                                </div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight">{kpis.inactive}</p>
                                <p className="text-xs font-bold text-gray-400 mt-2">Awaiting setup</p>
                            </div>

                            {/* Errors */}
                            <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-red-500/30 hover:shadow-md transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-all" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Errors</span>
                                    <div className="p-1.5 bg-red-500/10 rounded-lg">
                                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                                    </div>
                                </div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight">{kpis.errors}</p>
                                <p className="text-xs font-bold text-red-500 mt-2">Need attention</p>
                            </div>
                        </div>

                        {config?.production && (
                            <div className={`flex items-start gap-3 p-4 rounded-2xl border shadow-sm ${
                                config.production.requiredOk
                                    ? 'bg-emerald-50 border-emerald-200'
                                    : 'bg-red-50 border-red-200'
                            }`}>
                                {config.production.requiredOk ? (
                                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                                ) : (
                                    <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                                )}
                                <div>
                                    <p className={`text-xs font-bold ${config.production.requiredOk ? 'text-emerald-800' : 'text-red-800'}`}>
                                        Production readiness: {config.production.requiredOk ? 'core environment is configured' : 'missing required environment'}
                                    </p>
                                    <p className={`text-[11px] font-medium leading-relaxed mt-0.5 ${config.production.requiredOk ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {config.production.requiredOk
                                            ? `Database and app secrets are present. Runtime mode: ${config.production.nodeEnv}.`
                                            : `Missing required keys: ${config.production.missingRequired.join(', ')}.`}
                                        {config.production.missingRecommended?.length > 0
                                            ? ` Recommended: ${config.production.missingRecommended.join(', ')}.`
                                            : ''}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* ============== INTEGRATION CARDS GRID ============== */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {INTEGRATIONS.map((integration) => {
                                const status = integration.statusCheck(config);
                                const isExpanded = expandedCards[integration.key] ?? false;
                                const isSaving = savingKey === integration.key;
                                const isToggling = toggleSavingKey === integration.key;
                                const isTesting = testingKey === integration.key;
                                const testResult = testResults[integration.key];
                                const isEnabled = integration.toggleField ? Boolean(config?.[integration.toggleField]) : true;
                                const Icon = integration.icon;
                                const justSaved = saveSuccess === integration.key;

                                return (
                                    <div
                                        key={integration.key}
                                        className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden border-l-4 transition-all hover:shadow-md ${getCardBorderColor(status)}`}
                                    >
                                        {/* Card Header */}
                                        <div className="p-5">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2.5 rounded-xl ${integration.bgColor}`}>
                                                        <Icon className={`h-5 w-5 ${integration.color}`} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="font-black text-gray-900 text-sm">{integration.name}</h3>
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusStyles(status)}`}>
                                                                {getStatusIcon(status)}
                                                                {getStatusLabel(status)}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 font-medium mt-1 leading-relaxed max-w-md">
                                                            {integration.description}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Toggle Switch */}
                                                {integration.toggleField && (
                                                    <button
                                                        onClick={() => handleToggle(integration)}
                                                        disabled={isToggling}
                                                        className="shrink-0 mt-0.5"
                                                        title={isEnabled ? 'Disable integration' : 'Enable integration'}
                                                    >
                                                        {isToggling ? (
                                                            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                                                        ) : (
                                                            <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${isEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                                                                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                                            </div>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Env Note (for Supabase) */}
                                        {integration.envNote && (
                                            <div className="mx-5 mb-4 p-3 rounded-xl bg-sky-50 border border-sky-200 flex items-start gap-2.5">
                                                <Info className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />
                                                <p className="text-xs text-sky-700 font-medium leading-relaxed">
                                                    {integration.envNote}
                                                </p>
                                            </div>
                                        )}

                                        {/* Expand/Collapse Config Section */}
                                        {integration.fields.length > 0 && (
                                            <>
                                                <button
                                                    onClick={() => toggleExpand(integration.key)}
                                                    className="w-full px-5 py-3 border-t border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors"
                                                >
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                                                        Configuration
                                                    </span>
                                                    {isExpanded ? (
                                                        <ChevronUp className="h-4 w-4 text-gray-400" />
                                                    ) : (
                                                        <ChevronDown className="h-4 w-4 text-gray-400" />
                                                    )}
                                                </button>

                                                {/* Config Form */}
                                                {isExpanded && (
                                                    <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4"
                                                         style={{ background: 'var(--admin-surface, #fafafa)' }}>
                                                        {integration.fields.map((field) => {
                                                            const isMasked = field.masked && !visibleFields[field.key];
                                                            const currentValue = localFields[field.key] || '';
                                                            const displayValue = isMasked && currentValue ? maskValue(currentValue) : currentValue;

                                                            return (
                                                                <div key={field.key}>
                                                                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.12em] mb-1.5">
                                                                        {field.label}
                                                                    </label>
                                                                    <div className="relative">
                                                                        <input
                                                                            type={field.type === 'password' && !visibleFields[field.key] ? 'password' : 'text'}
                                                                            value={isMasked ? displayValue : currentValue}
                                                                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                                                            onFocus={() => {
                                                                                if (field.masked) {
                                                                                    setVisibleFields((prev) => ({ ...prev, [field.key]: true }));
                                                                                }
                                                                            }}
                                                                            placeholder={field.placeholder}
                                                                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 transition-all pr-10"
                                                                            style={{ '--tw-ring-color': 'var(--admin-primary)' } as CSSProperties}
                                                                        />
                                                                        {(field.type === 'password' || field.masked) && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => toggleFieldVisibility(field.key)}
                                                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                                                                title={visibleFields[field.key] ? 'Hide' : 'Show'}
                                                                            >
                                                                                {visibleFields[field.key] ? (
                                                                                    <EyeOff className="h-4 w-4" />
                                                                                ) : (
                                                                                    <Eye className="h-4 w-4" />
                                                                                )}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}

                                                        {/* Action Buttons */}
                                                        <div className="flex items-center gap-3 pt-2">
                                                            <button
                                                                onClick={() => handleSave(integration)}
                                                                disabled={isSaving}
                                                                className="flex items-center gap-2 px-4 py-2.5 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
                                                                style={{ background: 'var(--admin-primary)' }}
                                                            >
                                                                {isSaving ? (
                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                ) : justSaved ? (
                                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                                ) : (
                                                                    <Save className="h-3.5 w-3.5" />
                                                                )}
                                                                {isSaving ? 'Saving...' : justSaved ? 'Saved!' : 'Save Configuration'}
                                                            </button>

                                                            {integration.hasTestButton && (
                                                                <button
                                                                    onClick={() => handleTestConnection(integration)}
                                                                    disabled={isTesting}
                                                                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-all"
                                                                >
                                                                    {isTesting ? (
                                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                    ) : (
                                                                        <RefreshCw className="h-3.5 w-3.5" />
                                                                    )}
                                                                    {isTesting ? 'Testing...' : 'Test Connection'}
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Test Result Feedback */}
                                                        {testResult && (
                                                            <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-bold ${
                                                                testResult === 'success'
                                                                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                                                                    : 'bg-red-50 border border-red-200 text-red-700'
                                                            }`}>
                                                                {testResult === 'success' ? (
                                                                    <CheckCircle2 className="h-4 w-4" />
                                                                ) : (
                                                                    <XCircle className="h-4 w-4" />
                                                                )}
                                                                {testResult === 'success'
                                                                    ? 'Connection test passed. Credentials appear valid.'
                                                                    : 'Connection test failed. Please verify all fields are filled correctly.'}
                                                            </div>
                                                        )}

                                                        {/* OUTBOUND SANDBOX LIVE TESTING */}
                                                        {['smtp', 'whatsapp', 'sms'].includes(integration.key) && (
                                                            <div className="mt-4 pt-4 border-t border-gray-200/60">
                                                                <h4 className="flex items-center gap-1.5 text-xs font-black text-amber-600 uppercase tracking-wider mb-2">
                                                                    <Send className="h-3.5 w-3.5" />
                                                                    Outbound Sandbox Live Testing
                                                                </h4>
                                                                <p className="text-[11px] text-gray-500 font-medium leading-relaxed mb-3">
                                                                    {integration.key === 'smtp' 
                                                                        ? 'Send a real test email to verify correct sender credentials and delivery without editing .env.' 
                                                                        : integration.key === 'whatsapp'
                                                                        ? 'Send a real WhatsApp template message to confirm the API Token and sender configuration.'
                                                                        : 'Dispatch a dynamic SMS message via REST API gateway credentials to check the gateway status.'}
                                                                </p>
                                                                <div className="flex gap-2.5">
                                                                    <input
                                                                        type="text"
                                                                        placeholder={
                                                                            integration.key === 'smtp' 
                                                                                ? "Enter patient or staff email" 
                                                                                : "Enter phone number e.g., +91 99999 99999"
                                                                        }
                                                                        value={testTarget[integration.key] || ''}
                                                                        onChange={(e) => setTestTarget(prev => ({ ...prev, [integration.key]: e.target.value }))}
                                                                        className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleSendTestNotification(integration.key)}
                                                                        disabled={sendingTest[integration.key]}
                                                                        className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50"
                                                                    >
                                                                        {sendingTest[integration.key] ? (
                                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                                        ) : (
                                                                            <Send className="h-3 w-3" />
                                                                        )}
                                                                        Send Test
                                                                    </button>
                                                                </div>
                                                                
                                                                {/* Interactive Console Logs */}
                                                                {testLog[integration.key] && testLog[integration.key].length > 0 && (
                                                                    <div className="mt-3 p-3 bg-gray-900 border border-gray-800 rounded-xl font-mono text-[10px] text-gray-300 leading-normal max-h-40 overflow-y-auto space-y-1 shadow-inner">
                                                                        {testLog[integration.key].map((log, idx) => {
                                                                            let color = 'text-gray-400';
                                                                            if (log.includes('✅') || log.includes('🟢')) color = 'text-emerald-400 font-bold';
                                                                            else if (log.includes('🔴')) color = 'text-red-400 font-bold';
                                                                            else if (log.includes('🚀') || log.includes('📡')) color = 'text-amber-400';
                                                                            return (
                                                                                <div key={idx} className={color}>
                                                                                    {log}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* ============== FOOTER INFO ============== */}
                        <div className="flex items-start gap-3 p-4 rounded-2xl border border-gray-200 bg-white shadow-sm">
                            <Shield className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-bold text-gray-700">Security Notice</p>
                                <p className="text-[11px] text-gray-500 font-medium leading-relaxed mt-0.5">
                                    All API keys and credentials are stored encrypted in your organization&apos;s isolated database.
                                    Credentials are never exposed in client-side code or logs. Only administrators with the
                                    appropriate role can view or modify integration settings.
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </AdminPage>
    );
}
