'use client';

import { useState, useEffect } from 'react';
import { getOrganizationConfig, updateOrganizationConfig, updateOrganizationBranding } from '@/app/actions/superadmin-actions';
import { Save, AlertCircle, CheckCircle, Loader2, Settings, Palette } from 'lucide-react';

interface ConfigTabProps {
    orgId: string;
}

export default function ConfigTab({ orgId }: ConfigTabProps) {
    const [config, setConfig] = useState<any>(null);
    const [branding, setBranding] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [savingConfig, setSavingConfig] = useState(false);
    const [savingBranding, setSavingBranding] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    async function loadData() {
        setLoading(true);
        const res = await getOrganizationConfig(orgId);
        if (res.success) {
            setConfig(res.data?.config || {
                uhid_prefix: 'AVN', timezone: 'Asia/Kolkata', currency: 'INR',
                date_format: 'DD/MM/YYYY', session_timeout: 15,
                enable_whatsapp: false, enable_razorpay: false, enable_ai_triage: true,
            });
            setBranding(res.data?.branding || {
                primary_color: '#10b981', secondary_color: '#0f172a',
                logo_url: '', portal_title: 'Hospital OS', portal_subtitle: 'Management System', footer_text: '',
            });
        }
        setLoading(false);
    }

    useEffect(() => { loadData(); }, [orgId]);

    async function handleSaveConfig() {
        setSavingConfig(true);
        setError('');
        setSuccess('');
        const res = await updateOrganizationConfig(orgId, config);
        if (res.success) {
            setSuccess('Configuration saved');
            setTimeout(() => setSuccess(''), 3000);
        } else setError(res.error || 'Failed to save');
        setSavingConfig(false);
    }

    async function handleSaveBranding() {
        setSavingBranding(true);
        setError('');
        setSuccess('');
        const res = await updateOrganizationBranding(orgId, branding);
        if (res.success) {
            setSuccess('Branding saved');
            setTimeout(() => setSuccess(''), 3000);
        } else setError(res.error || 'Failed to save');
        setSavingBranding(false);
    }

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            </div>
        );
    }

    const fieldClass = 'w-full px-3 py-2.5 bg-[#161b22] border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none';
    const labelClass = 'block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

    return (
        <div className="space-y-6">
            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}
            {success && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-lg flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 shrink-0" /> {success}
                </div>
            )}

            {/* System Configuration */}
            <div className="bg-white/5 border border-white/5 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Settings className="h-4 w-4 text-violet-400" /> System Configuration
                    </h3>
                    <button onClick={handleSaveConfig} disabled={savingConfig}
                        className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50">
                        <Save className="h-3.5 w-3.5" /> {savingConfig ? 'Saving...' : 'Save Config'}
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <label className={labelClass}>UHID Prefix</label>
                        <input type="text" value={config.uhid_prefix || ''} onChange={e => setConfig({ ...config, uhid_prefix: e.target.value })} className={fieldClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Timezone</label>
                        <select value={config.timezone || 'Asia/Kolkata'} onChange={e => setConfig({ ...config, timezone: e.target.value })} className={fieldClass}>
                            <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                            <option value="UTC">UTC</option>
                            <option value="America/New_York">America/New York (EST)</option>
                            <option value="Europe/London">Europe/London (GMT)</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>Currency</label>
                        <select value={config.currency || 'INR'} onChange={e => setConfig({ ...config, currency: e.target.value })} className={fieldClass}>
                            <option value="INR">INR (Indian Rupee)</option>
                            <option value="USD">USD (US Dollar)</option>
                            <option value="EUR">EUR (Euro)</option>
                            <option value="GBP">GBP (British Pound)</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>Date Format</label>
                        <select value={config.date_format || 'DD/MM/YYYY'} onChange={e => setConfig({ ...config, date_format: e.target.value })} className={fieldClass}>
                            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>Session Timeout (min)</label>
                        <input type="number" min="5" max="480" value={config.session_timeout || 15} onChange={e => setConfig({ ...config, session_timeout: Number(e.target.value) })} className={fieldClass} />
                    </div>
                </div>

                {/* Feature Toggles */}
                <div className="mt-6 pt-4 border-t border-white/5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Feature Toggles</p>
                    <div className="flex flex-wrap gap-4">
                        {[
                            { key: 'enable_ai_triage', label: 'AI Triage Engine' },
                            { key: 'enable_whatsapp', label: 'WhatsApp Notifications' },
                            { key: 'enable_razorpay', label: 'Razorpay Payments' },
                        ].map(feat => (
                            <label key={feat.key} className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={!!config[feat.key]}
                                    onChange={e => setConfig({ ...config, [feat.key]: e.target.checked })}
                                    className="rounded border-gray-600 text-violet-600 focus:ring-violet-500 bg-[#161b22]"
                                />
                                <span className="text-sm text-gray-300">{feat.label}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            {/* Branding */}
            <div className="bg-white/5 border border-white/5 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Palette className="h-4 w-4 text-violet-400" /> Branding
                    </h3>
                    <button onClick={handleSaveBranding} disabled={savingBranding}
                        className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50">
                        <Save className="h-3.5 w-3.5" /> {savingBranding ? 'Saving...' : 'Save Branding'}
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <label className={labelClass}>Portal Title</label>
                        <input type="text" value={branding.portal_title || ''} onChange={e => setBranding({ ...branding, portal_title: e.target.value })} className={fieldClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Portal Subtitle</label>
                        <input type="text" value={branding.portal_subtitle || ''} onChange={e => setBranding({ ...branding, portal_subtitle: e.target.value })} className={fieldClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Logo URL</label>
                        <input type="text" value={branding.logo_url || ''} onChange={e => setBranding({ ...branding, logo_url: e.target.value })} className={fieldClass} placeholder="https://..." />
                    </div>
                    <div>
                        <label className={labelClass}>Primary Color</label>
                        <div className="flex items-center gap-2">
                            <input type="color" value={branding.primary_color || '#10b981'} onChange={e => setBranding({ ...branding, primary_color: e.target.value })}
                                className="w-10 h-10 rounded-lg border border-white/10 cursor-pointer bg-transparent" />
                            <input type="text" value={branding.primary_color || ''} onChange={e => setBranding({ ...branding, primary_color: e.target.value })} className={`${fieldClass} flex-1`} />
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>Secondary Color</label>
                        <div className="flex items-center gap-2">
                            <input type="color" value={branding.secondary_color || '#0f172a'} onChange={e => setBranding({ ...branding, secondary_color: e.target.value })}
                                className="w-10 h-10 rounded-lg border border-white/10 cursor-pointer bg-transparent" />
                            <input type="text" value={branding.secondary_color || ''} onChange={e => setBranding({ ...branding, secondary_color: e.target.value })} className={`${fieldClass} flex-1`} />
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>Footer Text</label>
                        <input type="text" value={branding.footer_text || ''} onChange={e => setBranding({ ...branding, footer_text: e.target.value })} className={fieldClass} />
                    </div>
                </div>

                {/* Preview */}
                <div className="mt-6 pt-4 border-t border-white/5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Preview</p>
                    <div className="rounded-lg overflow-hidden border border-white/10">
                        <div className="h-12 flex items-center px-4 gap-3" style={{ backgroundColor: branding.secondary_color || '#0f172a' }}>
                            <div className="w-7 h-7 rounded-lg" style={{ backgroundColor: branding.primary_color || '#10b981' }} />
                            <div>
                                <p className="text-xs font-bold text-white">{branding.portal_title || 'Hospital OS'}</p>
                                <p className="text-[9px] text-gray-400">{branding.portal_subtitle || 'Management System'}</p>
                            </div>
                        </div>
                        <div className="h-16 bg-[#161b22] flex items-center justify-center">
                            <p className="text-[10px] text-gray-600">{branding.footer_text || 'Footer text preview'}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
