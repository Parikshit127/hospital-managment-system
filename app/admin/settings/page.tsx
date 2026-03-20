'use client';

import React, { useEffect, useState } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { Settings, Save, ShieldAlert, Globe, Clock, Banknote, Smartphone, Cpu } from 'lucide-react';
import { getOrganizationSettings, updateOrganizationSettings } from '@/app/actions/admin-actions';
import { useRouter } from 'next/navigation';

export default function OrgSettingsPage() {
    const [config, setConfig] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const loadData = async () => {
        setLoading(true);
        const res = await getOrganizationSettings();
        if (res.success) setConfig(res.data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleChange = (field: string, value: any) => {
        setConfig((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        // exclude id and relations
        const { id, organizationId, ...dataToSave } = config;
        const res = await updateOrganizationSettings(dataToSave);
        if (res.success) alert('Global Settings successfully applied.');
        else alert('Failed to save settings.');
        setSaving(false);
    };

    if (loading) return <AdminPage pageTitle="Loading"><div className="p-10 text-center text-gray-500 font-medium">Loading organization configuration...</div></AdminPage>;

    return (
        <AdminPage
            pageTitle="Organization Configuration"
            pageIcon={<Settings className="h-5 w-5" />}
        >
            <form onSubmit={handleSave} className="max-w-4xl mx-auto space-y-8 pb-12">

                {/* Core Settings */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-100 p-6 flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg"><Globe className="h-5 w-5" /></div>
                        <div>
                            <h2 className="text-lg font-black text-gray-900">Regional & Core Locales</h2>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">Tenant Scoped Boundaries</p>
                        </div>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">UHID Prefix (Patient IDs)</label>
                            <input required value={config.uhid_prefix} onChange={e => handleChange('uhid_prefix', e.target.value.toUpperCase())} type="text" maxLength={5} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-black tracking-widest uppercase outline-none transition-colors" />
                            <p className="text-[10px] text-gray-400 mt-1 font-bold">e.g. 'AVN' will generate PAT-AVN-1004</p>
                        </div>
                        <div>
                            <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Server Timezone</label>
                            <select required value={config.timezone} onChange={e => handleChange('timezone', e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors">
                                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                                <option value="UTC">UTC (Global)</option>
                                <option value="America/New_York">America/New_York (EST)</option>
                                <option value="Europe/London">Europe/London (GMT)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Default Currency</label>
                            <select required value={config.currency} onChange={e => handleChange('currency', e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors">
                                <option value="INR">INR (₹)</option>
                                <option value="USD">USD ($)</option>
                                <option value="EUR">EUR (€)</option>
                                <option value="GBP">GBP (£)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Auto-Logoff Timeout (Minutes)</label>
                            <input required type="number" min="5" max="120" value={config.session_timeout} onChange={e => handleChange('session_timeout', Number(e.target.value))} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold outline-none transition-colors" />
                        </div>
                    </div>
                </div>

                {/* Feature Flags */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-100 p-6 flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg"><Cpu className="h-5 w-5" /></div>
                        <div>
                            <h2 className="text-lg font-black text-gray-900">Module Integrations</h2>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">Enable 3rd Party Features</p>
                        </div>
                    </div>
                    <div className="p-6 space-y-4">
                        <label className="flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                            <input type="checkbox" checked={config.enable_ai_triage} onChange={e => handleChange('enable_ai_triage', e.target.checked)} className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                            <div>
                                <p className="font-bold text-gray-900 flex items-center gap-2">Enable Open-AI Clinical Summaries <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Premium</span></p>
                                <p className="text-xs text-gray-500 font-medium">Auto-generate SOAP notes from doctor dictations in the Doctor console.</p>
                            </div>
                        </label>

                        <label className="flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                            <input type="checkbox" checked={config.enable_whatsapp} onChange={e => handleChange('enable_whatsapp', e.target.checked)} className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                            <div>
                                <p className="font-bold text-gray-900">Enable WhatsApp Notifications</p>
                                <p className="text-xs text-gray-500 font-medium">Send appointment reminders and billing links to patients via Meta API.</p>
                            </div>
                        </label>
                        {config.enable_whatsapp && (
                            <div className="ml-9 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
                                <div>
                                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Meta Phone ID</label>
                                    <input value={config.whatsapp_phone_id || ''} onChange={e => handleChange('whatsapp_phone_id', e.target.value)} type="text" className="w-full p-3 bg-white border border-gray-200 rounded-xl font-mono text-sm outline-none focus:ring-2" />
                                </div>
                                <div>
                                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Access Token</label>
                                    <input value={config.whatsapp_api_token || ''} onChange={e => handleChange('whatsapp_api_token', e.target.value)} type="password" placeholder="••••••••" className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2" />
                                </div>
                            </div>
                        )}

                        <label className="flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                            <input type="checkbox" checked={config.enable_razorpay} onChange={e => handleChange('enable_razorpay', e.target.checked)} className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                            <div>
                                <p className="font-bold text-gray-900">Enable Payment Gateway (Razorpay)</p>
                                <p className="text-xs text-gray-500 font-medium">Allow online invoice payments via UPI, Credit Card, and Netbanking.</p>
                            </div>
                        </label>
                        {config.enable_razorpay && (
                            <div className="ml-9 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
                                <div>
                                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Key ID</label>
                                    <input value={config.razorpay_key_id || ''} onChange={e => handleChange('razorpay_key_id', e.target.value)} type="text" className="w-full p-3 bg-white border border-gray-200 rounded-xl font-mono text-sm outline-none focus:ring-2" />
                                </div>
                                <div>
                                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Key Secret</label>
                                    <input value={config.razorpay_key_secret || ''} onChange={e => handleChange('razorpay_key_secret', e.target.value)} type="password" placeholder="••••••••" className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2" />
                                </div>
                            </div>
                        )}

                    </div>
                </div>

                {/* Sticky Footer */}
                <div className="fixed bottom-0 left-0 lg:left-64 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-200 flex justify-end gap-4 z-40">
                    <button type="button" onClick={() => loadData()} className="px-6 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors text-sm">Discard Changes</button>
                    <button disabled={saving} type="submit" className="px-8 py-3 bg-gray-900 hover:bg-black text-white font-bold rounded-xl shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 text-sm">
                        <Save className="h-4 w-4" /> {saving ? 'Writing Config...' : 'Save Global Settings'}
                    </button>
                </div>
            </form>
        </AdminPage>
    );
}
