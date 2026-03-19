'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, Download, ToggleLeft, ToggleRight, FileText, Clock, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getPrivacySettings, updateConsent, exportMyData } from '@/app/actions/patient-actions';

const CONSENT_INFO: Record<string, { label: string; description: string }> = {
    data_processing: {
        label: 'Data Processing',
        description: 'Allow us to process your health data for treatment, diagnostics, and care coordination.',
    },
    marketing: {
        label: 'Health Communications',
        description: 'Receive health tips, wellness reminders, and promotional messages from the hospital.',
    },
    research: {
        label: 'Anonymised Research',
        description: 'Allow your anonymised data to be used for medical research and improving healthcare.',
    },
};

export default function PrivacySettingsPage() {
    const [consents, setConsents] = useState<Record<string, { granted: boolean; granted_at: string | null; revoked_at: string | null }>>({});
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const [exportDone, setExportDone] = useState(false);

    const loadConsents = useCallback(async () => {
        const res = await getPrivacySettings();
        if (res.success && res.data) {
            setConsents(res.data as Record<string, { granted: boolean; granted_at: string | null; revoked_at: string | null }>);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadConsents(); }, [loadConsents]);

    async function handleToggle(type: string, current: boolean) {
        setToggling(type);
        const res = await updateConsent(type, !current);
        if (res.success) {
            setConsents(prev => ({
                ...prev,
                [type]: {
                    granted: !current,
                    granted_at: !current ? new Date().toISOString() : prev[type]?.granted_at ?? null,
                    revoked_at: current ? new Date().toISOString() : null,
                },
            }));
        }
        setToggling(null);
    }

    async function handleExport() {
        setExporting(true);
        setExportDone(false);
        const res = await exportMyData();
        if (res.success && res.data) {
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `my-health-data-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setExportDone(true);
            setTimeout(() => setExportDone(false), 3000);
        }
        setExporting(false);
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto p-4 pb-24 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Privacy & Data</h1>
                    <p className="text-sm text-gray-500">Manage your consent and data preferences</p>
                </div>
            </div>

            {/* Consent Toggles */}
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
                <div className="px-4 py-3">
                    <h2 className="text-sm font-semibold text-gray-700">Consent Management</h2>
                </div>
                {Object.entries(CONSENT_INFO).map(([type, info]) => {
                    const consent = consents[type];
                    const granted = consent?.granted ?? false;
                    const isToggling = toggling === type;

                    return (
                        <div key={type} className="px-4 py-4 flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900">{info.label}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{info.description}</p>
                                {consent?.granted_at && granted && (
                                    <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        Granted {new Date(consent.granted_at).toLocaleDateString('en-IN')}
                                    </p>
                                )}
                                {consent?.revoked_at && !granted && (
                                    <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        Revoked {new Date(consent.revoked_at).toLocaleDateString('en-IN')}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => handleToggle(type, granted)}
                                disabled={isToggling}
                                className="shrink-0 mt-0.5"
                            >
                                {isToggling ? (
                                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                                ) : granted ? (
                                    <ToggleRight className="w-8 h-8 text-emerald-600" />
                                ) : (
                                    <ToggleLeft className="w-8 h-8 text-gray-300" />
                                )}
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Data Export */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-600" />
                    <h2 className="text-sm font-semibold text-gray-700">Download My Data</h2>
                </div>
                <p className="text-xs text-gray-500">
                    Export all your health records — appointments, lab results, vitals, prescriptions, and invoices — as a JSON file.
                </p>
                <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                    {exporting ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Preparing export...</>
                    ) : exportDone ? (
                        <><CheckCircle2 className="w-4 h-4" /> Downloaded!</>
                    ) : (
                        <><Download className="w-4 h-4" /> Download My Data</>
                    )}
                </button>
            </div>

            {/* Info Note */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800">
                    <p className="font-semibold">Your data rights</p>
                    <p className="mt-0.5">
                        You can revoke consent at any time. Essential data processing for your treatment
                        cannot be disabled as it is required by law. Contact reception for data deletion requests.
                    </p>
                </div>
            </div>
        </div>
    );
}
