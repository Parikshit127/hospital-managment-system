'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Building2, Save, Type, Palette, LayoutTemplate } from 'lucide-react';
import { getOrganizationBranding, updateOrganizationBranding } from '@/app/actions/admin-actions';

export default function BrandingPage() {
    const [branding, setBranding] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const loadData = async () => {
        setLoading(true);
        const res = await getOrganizationBranding();
        if (res.success) setBranding(res.data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleChange = (field: string, value: string) => {
        setBranding((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        const { id, organizationId, ...dataToSave } = branding;
        const res = await updateOrganizationBranding(dataToSave);
        if (res.success) alert('Branding updated. (Requires hard refresh to see across portal)');
        else alert('Failed to save branding.');
        setSaving(false);
    };

    if (loading) return <AppShell pageTitle="Loading"><div className="p-10 text-center text-gray-500 font-medium">Loading asset definitions...</div></AppShell>;

    return (
        <AppShell
            pageTitle="Portal Branding"
            pageIcon={<Building2 className="h-5 w-5" />}
        >
            <form onSubmit={handleSave} className="max-w-4xl mx-auto space-y-8 pb-12">

                {/* Live Preview Panel */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 overflow-hidden relative group">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest absolute top-4 right-4 bg-gray-100 px-3 py-1 rounded-full border border-gray-200">Live Preview Container</p>

                    <div className="border-[4px] border-gray-100 rounded-2xl mt-8 overflow-hidden bg-gray-50 relative h-[250px] shadow-inner group-hover:border-indigo-100 transition-colors">
                        <div className="absolute top-0 left-0 w-48 h-full bg-slate-900 shadow-2xl z-10 p-4 transition-colors" style={{ backgroundColor: branding.secondary_color || '#0f172a' }}>
                            <div className="flex items-center gap-2 border-b border-white/10 pb-4 mb-4">
                                {branding.logo_url ? (
                                    <img src={branding.logo_url} alt="Logo" className="w-8 h-8 rounded-lg object-cover bg-white" />
                                ) : (
                                    <div className="w-8 h-8 rounded-lg shadow-sm flex items-center justify-center shrink-0" style={{ backgroundColor: branding.primary_color || '#10b981' }}>
                                        <Building2 className="h-4 w-4 text-white" />
                                    </div>
                                )}
                                <span className="text-white font-black text-xs truncate leading-tight tracking-wider">{branding.portal_title}</span>
                            </div>
                            <div className="space-y-3">
                                <div className="h-3 w-3/4 rounded-full bg-white/10"></div>
                                <div className="h-3 w-full rounded-full bg-white/10"></div>
                                <div className="h-3 w-5/6 rounded-full bg-white/20" style={{ backgroundColor: branding.primary_color }}></div>
                                <div className="h-3 w-2/3 rounded-full bg-white/10 mt-8"></div>
                            </div>
                        </div>

                        <div className="absolute top-0 left-48 right-0 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-0 shadow-sm">
                            <p className="text-sm font-black text-gray-900 tracking-wide">{branding.portal_subtitle}</p>
                            <div className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white shadow-sm"></div>
                        </div>
                    </div>
                </div>

                {/* Typography & Assets */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="bg-gray-50 border-b border-gray-100 p-6 flex items-center gap-3">
                            <div className="p-2 bg-slate-100 text-slate-700 rounded-lg"><Type className="h-5 w-5" /></div>
                            <h2 className="text-lg font-black text-gray-900">Typography</h2>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Portal Title (Main Header)</label>
                                <input value={branding.portal_title} onChange={e => handleChange('portal_title', e.target.value)} type="text" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold outline-none transition-colors" />
                            </div>
                            <div>
                                <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Portal Subtitle (Tagline / Nav)</label>
                                <input value={branding.portal_subtitle} onChange={e => handleChange('portal_subtitle', e.target.value)} type="text" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors" />
                            </div>
                            <div>
                                <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Footer Copyright Text</label>
                                <input value={branding.footer_text || ''} onChange={e => handleChange('footer_text', e.target.value)} type="text" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors" placeholder="© 2026 Hospital OS. All rights reserved." />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="bg-gray-50 border-b border-gray-100 p-6 flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg"><Palette className="h-5 w-5" /></div>
                            <h2 className="text-lg font-black text-gray-900">Color Palette & Media</h2>
                        </div>
                        <div className="p-6 space-y-6 flex-1">
                            <div className="flex gap-6 items-center">
                                <div className="flex-1">
                                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2 flex items-center gap-2">Primary Action Color</label>
                                    <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-xl border border-gray-200">
                                        <input type="color" value={branding.primary_color} onChange={e => handleChange('primary_color', e.target.value)} className="w-10 h-10 rounded border-0 cursor-pointer bg-transparent" />
                                        <input type="text" value={branding.primary_color} onChange={e => handleChange('primary_color', e.target.value)} className="bg-transparent border-0 outline-none w-full font-mono text-sm uppercase tracking-widest font-bold text-gray-700" />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2 flex items-center gap-2">Sidebar / Nav Theme</label>
                                    <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-xl border border-gray-200">
                                        <input type="color" value={branding.secondary_color} onChange={e => handleChange('secondary_color', e.target.value)} className="w-10 h-10 rounded border-0 cursor-pointer bg-transparent" />
                                        <input type="text" value={branding.secondary_color} onChange={e => handleChange('secondary_color', e.target.value)} className="bg-transparent border-0 outline-none w-full font-mono text-sm uppercase tracking-widest font-bold text-gray-700" />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Hospital Logo Asset URL</label>
                                <div className="flex gap-2">
                                    <input value={branding.logo_url || ''} onChange={e => handleChange('logo_url', e.target.value)} type="url" placeholder="https://res.cloudinary.com/..." className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors" />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-2 font-bold uppercase tracking-wider">Leave blank to use default SVG iconography.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sticky Footer */}
                <div className="fixed bottom-0 left-0 lg:left-64 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-200 flex justify-end gap-4 z-40">
                    <button type="button" onClick={() => loadData()} className="px-6 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors text-sm">Discard</button>
                    <button disabled={saving} type="submit" className="px-8 py-3 bg-gray-900 hover:bg-black text-white font-bold rounded-xl shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 text-sm">
                        <Save className="h-4 w-4" /> {saving ? 'Compiling Assets...' : 'Save Branding Identity'}
                    </button>
                </div>

            </form>
        </AppShell>
    );
}
