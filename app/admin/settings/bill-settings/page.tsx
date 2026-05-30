'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import {
    Receipt, Save, Upload, Image, Palette, FileText, Building2,
    Eye, Loader2, CheckCircle2, AlertCircle, Trash2,
} from 'lucide-react';
import {
    getOrganizationBranding,
    updateOrganizationBranding,
    getHospitalBillingInfo,
    updateHospitalBillingInfo,
} from '@/app/actions/admin-actions';
import {
    listTemplates,
    updateTemplate,
    createTemplate,
    getDefaultTemplate,
} from '@/app/actions/template-actions';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Tab = 'branding' | 'gst' | 'content' | 'layout';

interface TemplateSection {
    id: string;
    name: string;
    enabled: boolean;
    fields: string[];
}

/* ------------------------------------------------------------------ */
/*  Shared UI                                                          */
/* ------------------------------------------------------------------ */

const labelCls = 'block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2';
const inputCls = 'w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 text-sm font-medium outline-none transition-colors';
const cardCls = 'bg-white rounded-2xl border border-gray-200 shadow-sm p-6';
const btnPrimary = 'inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-gray-300'}`}
        >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
    );
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
    useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
    return (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold ${type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
            {type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {message}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function BillSettingsPage() {
    const [activeTab, setActiveTab] = useState<Tab>('branding');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Branding state
    const [branding, setBranding] = useState<any>(null);
    // Billing info state
    const [billingInfo, setBillingInfo] = useState<any>(null);
    // Templates state
    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedType, setSelectedType] = useState('invoice');

    // Image upload states
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingLetterhead, setUploadingLetterhead] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        const [brandRes, billRes, templRes] = await Promise.all([
            getOrganizationBranding(),
            getHospitalBillingInfo(),
            listTemplates(),
        ]);
        if (brandRes.success) setBranding(brandRes.data);
        if (billRes.success) setBillingInfo(billRes.data);
        if (templRes.success) setTemplates(templRes.data || []);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });

    /* ── Branding save ── */
    const saveBranding = async () => {
        setSaving(true);
        const { id, organizationId, organization, ...data } = branding;
        const res = await updateOrganizationBranding(data);
        if (res.success) showToast('Branding settings saved');
        else showToast('Failed to save branding', 'error');
        setSaving(false);
    };

    /* ── Billing info save ── */
    const saveBillingInfo = async () => {
        setSaving(true);
        const res = await updateHospitalBillingInfo({
            organization_gstin: billingInfo.organization_gstin || '',
            gst_state_code: billingInfo.gst_state_code || '',
            registration_number: billingInfo.registration_number || '',
            phone: billingInfo.phone || '',
            email: billingInfo.email || '',
            address: billingInfo.address || '',
        });
        if (res.success) showToast('Billing info saved');
        else showToast('Failed to save billing info', 'error');
        setSaving(false);
    };

    /* ── Image upload ── */
    const handleImageUpload = async (file: File, type: 'logo' | 'letterhead') => {
        const setUploading = type === 'logo' ? setUploadingLogo : setUploadingLetterhead;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('type', type);
            const res = await fetch('/api/upload/branding', { method: 'POST', body: fd });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);

            const field = type === 'logo' ? 'logo_url' : 'letterhead_url';
            setBranding((prev: any) => ({ ...prev, [field]: json.key }));

            // Auto-save branding with the new key
            await updateOrganizationBranding({ [field]: json.key });
            showToast(`${type === 'logo' ? 'Logo' : 'Letterhead'} uploaded`);
        } catch (err: any) {
            showToast(err.message || 'Upload failed', 'error');
        }
        setUploading(false);
    };

    const removeImage = async (type: 'logo' | 'letterhead') => {
        const field = type === 'logo' ? 'logo_url' : 'letterhead_url';
        setBranding((prev: any) => ({ ...prev, [field]: null }));
        await updateOrganizationBranding({ [field]: null });
        showToast(`${type === 'logo' ? 'Logo' : 'Letterhead'} removed`);
    };

    /* ── Template section toggle ── */
    const getActiveTemplate = () => templates.find((t: any) => t.type === selectedType && t.is_default);

    const toggleSection = async (sectionId: string, enabled: boolean) => {
        let template = getActiveTemplate();

        if (!template) {
            // Create default template for this type
            const defaults = await getDefaultTemplate(selectedType);
            const res = await createTemplate({
                type: selectedType,
                name: `Default ${selectedType.split('_').map((w: string) => w[0].toUpperCase() + w.slice(1)).join(' ')}`,
                content_json: defaults,
                is_default: true,
            });
            if (!res.success) { showToast('Failed to create template', 'error'); return; }
            template = res.data;
            setTemplates((prev) => [...prev, template]);
        }

        const content = template.content_json as any;
        const sections = (content.sections || []).map((s: TemplateSection) =>
            s.id === sectionId ? { ...s, enabled } : s
        );
        const newContent = { ...content, sections };

        const res = await updateTemplate(template.id, { content_json: newContent });
        if (res.success) {
            setTemplates((prev) => prev.map((t: any) => t.id === template.id ? { ...t, content_json: newContent } : t));
            showToast(`Section ${enabled ? 'enabled' : 'disabled'}`);
        } else {
            showToast('Failed to update template', 'error');
        }
    };

    /* ── Render ── */

    if (loading) {
        return (
            <AdminPage pageTitle="Bill Settings">
                <div className="flex items-center justify-center p-20 text-gray-500">
                    <Loader2 className="h-6 w-6 animate-spin mr-3" /> Loading bill settings...
                </div>
            </AdminPage>
        );
    }

    const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
        { key: 'branding', label: 'Letterhead & Branding', icon: <Image className="h-4 w-4" /> },
        { key: 'gst', label: 'Hospital & GST', icon: <Building2 className="h-4 w-4" /> },
        { key: 'content', label: 'Bill Content', icon: <FileText className="h-4 w-4" /> },
        { key: 'layout', label: 'Bill Layout', icon: <Receipt className="h-4 w-4" /> },
    ];

    const TEMPLATE_TYPES = [
        { key: 'invoice', label: 'Tax Invoice' },
        { key: 'discharge_summary', label: 'Discharge Summary' },
        { key: 'prescription', label: 'Prescription' },
        { key: 'lab_report', label: 'Lab Report' },
        { key: 'consent_form', label: 'Consent Form' },
        { key: 'referral', label: 'Referral Letter' },
        { key: 'medical_certificate', label: 'Medical Certificate' },
    ];

    const activeTemplate = getActiveTemplate();
    const activeSections: TemplateSection[] = (activeTemplate?.content_json as any)?.sections || [];

    return (
        <AdminPage
            pageTitle="Bill Settings"
            pageIcon={<Receipt className="h-5 w-5" />}
        >
            <div className="max-w-5xl mx-auto pb-12">
                {/* Tab Bar */}
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-8">
                    {TABS.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
                                activeTab === tab.key
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab.icon}
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* ─── Tab 1: Letterhead & Branding ─── */}
                {activeTab === 'branding' && branding && (
                    <div className="space-y-6">
                        {/* Letterhead Upload */}
                        <div className={cardCls}>
                            <h3 className="text-sm font-black text-gray-900 mb-1">Letterhead Image</h3>
                            <p className="text-xs text-gray-500 mb-4">Full-page A4 background image for bills. This appears behind the bill content as header and footer.</p>

                            <div className="flex items-start gap-6">
                                <div className="flex-1">
                                    <label className={`flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${uploadingLetterhead ? 'border-emerald-300 bg-emerald-50' : 'border-gray-300 hover:border-emerald-400 hover:bg-emerald-50/50'}`}>
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            className="hidden"
                                            onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'letterhead')}
                                            disabled={uploadingLetterhead}
                                        />
                                        {uploadingLetterhead ? (
                                            <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
                                        ) : (
                                            <>
                                                <Upload className="h-8 w-8 text-gray-400 mb-2" />
                                                <span className="text-xs text-gray-500 font-semibold">Click to upload letterhead</span>
                                                <span className="text-[10px] text-gray-400 mt-1">JPEG, PNG, WebP (max 5MB)</span>
                                            </>
                                        )}
                                    </label>
                                </div>
                                {branding.letterhead_url && (
                                    <div className="relative group">
                                        <div className="w-32 h-40 bg-gray-100 rounded-xl border overflow-hidden">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={`/api/files?key=${encodeURIComponent(branding.letterhead_url)}`} alt="Letterhead" className="w-full h-full object-contain" />
                                        </div>
                                        <button
                                            onClick={() => removeImage('letterhead')}
                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Logo Upload */}
                        <div className={cardCls}>
                            <h3 className="text-sm font-black text-gray-900 mb-1">Hospital Logo</h3>
                            <p className="text-xs text-gray-500 mb-4">Used in bills that don&apos;t use a full-page letterhead (inline header style).</p>

                            <div className="flex items-start gap-6">
                                <div className="flex-1">
                                    <label className={`flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${uploadingLogo ? 'border-emerald-300 bg-emerald-50' : 'border-gray-300 hover:border-emerald-400 hover:bg-emerald-50/50'}`}>
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            className="hidden"
                                            onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'logo')}
                                            disabled={uploadingLogo}
                                        />
                                        {uploadingLogo ? (
                                            <Loader2 className="h-6 w-6 text-emerald-500 animate-spin" />
                                        ) : (
                                            <>
                                                <Upload className="h-6 w-6 text-gray-400 mb-2" />
                                                <span className="text-xs text-gray-500 font-semibold">Click to upload logo</span>
                                            </>
                                        )}
                                    </label>
                                </div>
                                {branding.logo_url && (
                                    <div className="relative group">
                                        <div className="w-24 h-24 bg-gray-100 rounded-xl border overflow-hidden flex items-center justify-center">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={`/api/files?key=${encodeURIComponent(branding.logo_url)}`} alt="Logo" className="max-w-full max-h-full object-contain" />
                                        </div>
                                        <button
                                            onClick={() => removeImage('logo')}
                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Accent Color + Spacers */}
                        <div className={cardCls}>
                            <h3 className="text-sm font-black text-gray-900 mb-4">Bill Appearance</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label className={labelCls}>Accent Color</label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="color"
                                            value={branding.accent_color || '#1e3a6e'}
                                            onChange={(e) => setBranding((p: any) => ({ ...p, accent_color: e.target.value }))}
                                            className="h-10 w-14 rounded-lg border border-gray-200 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={branding.accent_color || '#1e3a6e'}
                                            onChange={(e) => setBranding((p: any) => ({ ...p, accent_color: e.target.value }))}
                                            className={inputCls}
                                            placeholder="#1e3a6e"
                                        />
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-1">Used for headings, borders, and table headers in bills</p>
                                </div>
                                <div>
                                    <label className={labelCls}>Header Height (px)</label>
                                    <input
                                        type="number"
                                        value={branding.header_height ?? 130}
                                        onChange={(e) => setBranding((p: any) => ({ ...p, header_height: parseInt(e.target.value) || 130 }))}
                                        className={inputCls}
                                        min={0}
                                        max={300}
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1">Space reserved for letterhead header area</p>
                                </div>
                                <div>
                                    <label className={labelCls}>Footer Height (px)</label>
                                    <input
                                        type="number"
                                        value={branding.footer_height ?? 80}
                                        onChange={(e) => setBranding((p: any) => ({ ...p, footer_height: parseInt(e.target.value) || 80 }))}
                                        className={inputCls}
                                        min={0}
                                        max={200}
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1">Space reserved for letterhead footer area</p>
                                </div>
                            </div>
                        </div>

                        {/* Tagline */}
                        <div className={cardCls}>
                            <label className={labelCls}>Hospital Tagline</label>
                            <input
                                type="text"
                                value={branding.tagline || ''}
                                onChange={(e) => setBranding((p: any) => ({ ...p, tagline: e.target.value }))}
                                className={inputCls}
                                placeholder="e.g. A Unit of TAH Global Healthcare Pvt. Ltd."
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Shown below hospital name on bills without letterhead image</p>
                        </div>

                        {/* Letterhead Preview */}
                        <div className={cardCls}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-black text-gray-900">Preview</h3>
                                <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                    <Eye className="h-3 w-3" /> Live Preview
                                </div>
                            </div>
                            <div className="border-2 border-gray-100 rounded-xl overflow-hidden bg-white relative" style={{ height: 280 }}>
                                {branding.letterhead_url && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={`/api/files?key=${encodeURIComponent(branding.letterhead_url)}`}
                                        alt=""
                                        className="absolute inset-0 w-full h-full object-fill opacity-30"
                                    />
                                )}
                                <div className="relative h-full flex flex-col">
                                    <div
                                        className="border-b-2 border-dashed border-emerald-300 flex items-center justify-center"
                                        style={{ height: `${Math.min((branding.header_height ?? 130) / 3, 60)}px` }}
                                    >
                                        <span className="text-[9px] text-emerald-500 font-bold">HEADER AREA ({branding.header_height ?? 130}px)</span>
                                    </div>
                                    <div className="flex-1 flex items-center justify-center">
                                        <div className="text-center">
                                            <div className="text-xs text-gray-400 font-bold mb-1">Bill Content Area</div>
                                            <div className="text-[9px] text-gray-300">Charges, totals, patient info...</div>
                                        </div>
                                    </div>
                                    <div
                                        className="border-t-2 border-dashed border-orange-300 flex items-center justify-center"
                                        style={{ height: `${Math.min((branding.footer_height ?? 80) / 3, 40)}px` }}
                                    >
                                        <span className="text-[9px] text-orange-500 font-bold">FOOTER AREA ({branding.footer_height ?? 80}px)</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button onClick={saveBranding} disabled={saving} className={btnPrimary}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Save Branding
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── Tab 2: Hospital & GST Details ─── */}
                {activeTab === 'gst' && billingInfo && (
                    <div className="space-y-6">
                        <div className={cardCls}>
                            <h3 className="text-sm font-black text-gray-900 mb-4">Hospital Identity</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className={labelCls}>Hospital Name</label>
                                    <input type="text" value={billingInfo.name || ''} disabled className={`${inputCls} bg-gray-100 text-gray-500 cursor-not-allowed`} />
                                    <p className="text-[10px] text-gray-400 mt-1">Set by super admin during hospital creation</p>
                                </div>
                                <div>
                                    <label className={labelCls}>Address</label>
                                    <input
                                        type="text"
                                        value={billingInfo.address || ''}
                                        onChange={(e) => setBillingInfo((p: any) => ({ ...p, address: e.target.value }))}
                                        className={inputCls}
                                        placeholder="Full hospital address"
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Phone</label>
                                    <input
                                        type="text"
                                        value={billingInfo.phone || ''}
                                        onChange={(e) => setBillingInfo((p: any) => ({ ...p, phone: e.target.value }))}
                                        className={inputCls}
                                        placeholder="+91 ..."
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Email</label>
                                    <input
                                        type="email"
                                        value={billingInfo.email || ''}
                                        onChange={(e) => setBillingInfo((p: any) => ({ ...p, email: e.target.value }))}
                                        className={inputCls}
                                        placeholder="billing@hospital.com"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={cardCls}>
                            <h3 className="text-sm font-black text-gray-900 mb-4">GST & Registration</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label className={labelCls}>GSTIN</label>
                                    <input
                                        type="text"
                                        value={billingInfo.organization_gstin || ''}
                                        onChange={(e) => setBillingInfo((p: any) => ({ ...p, organization_gstin: e.target.value.toUpperCase() }))}
                                        className={inputCls}
                                        placeholder="22AAAAA0000A1Z5"
                                        maxLength={15}
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>GST State Code</label>
                                    <input
                                        type="text"
                                        value={billingInfo.gst_state_code || ''}
                                        onChange={(e) => setBillingInfo((p: any) => ({ ...p, gst_state_code: e.target.value }))}
                                        className={inputCls}
                                        placeholder="29"
                                        maxLength={2}
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Registration / License No.</label>
                                    <input
                                        type="text"
                                        value={billingInfo.registration_number || ''}
                                        onChange={(e) => setBillingInfo((p: any) => ({ ...p, registration_number: e.target.value }))}
                                        className={inputCls}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button onClick={saveBillingInfo} disabled={saving} className={btnPrimary}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Save Billing Info
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── Tab 3: Bill Content Settings ─── */}
                {activeTab === 'content' && branding && (
                    <div className="space-y-6">
                        <div className={cardCls}>
                            <h3 className="text-sm font-black text-gray-900 mb-4">Terms & Conditions</h3>
                            <textarea
                                value={branding.terms_conditions || ''}
                                onChange={(e) => setBranding((p: any) => ({ ...p, terms_conditions: e.target.value }))}
                                className={`${inputCls} h-32 resize-y`}
                                placeholder="Payment due on receipt. Subject to local jurisdiction."
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Appears at the bottom of all bills</p>
                        </div>

                        <div className={cardCls}>
                            <h3 className="text-sm font-black text-gray-900 mb-4">Signature Block</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className={labelCls}>Signature Title</label>
                                    <input
                                        type="text"
                                        value={branding.signature_title || ''}
                                        onChange={(e) => setBranding((p: any) => ({ ...p, signature_title: e.target.value }))}
                                        className={inputCls}
                                        placeholder="Authorized Signatory"
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Signature Name</label>
                                    <input
                                        type="text"
                                        value={branding.signature_name || ''}
                                        onChange={(e) => setBranding((p: any) => ({ ...p, signature_name: e.target.value }))}
                                        className={inputCls}
                                        placeholder="For Hospital Name"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={cardCls}>
                            <h3 className="text-sm font-black text-gray-900 mb-4">Footer</h3>
                            <label className={labelCls}>Footer Text</label>
                            <input
                                type="text"
                                value={branding.footer_text || ''}
                                onChange={(e) => setBranding((p: any) => ({ ...p, footer_text: e.target.value }))}
                                className={inputCls}
                                placeholder="Small print text at the very bottom of bills"
                            />
                        </div>

                        <div className="flex justify-end">
                            <button onClick={saveBranding} disabled={saving} className={btnPrimary}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Save Content Settings
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── Tab 4: Bill Layout (per document type) ─── */}
                {activeTab === 'layout' && (
                    <div className="space-y-6">
                        <div className={cardCls}>
                            <h3 className="text-sm font-black text-gray-900 mb-4">Bill Section Visibility</h3>
                            <p className="text-xs text-gray-500 mb-4">Toggle which sections appear on each document type. Changes apply immediately.</p>

                            <div className="mb-6">
                                <label className={labelCls}>Document Type</label>
                                <select
                                    value={selectedType}
                                    onChange={(e) => setSelectedType(e.target.value)}
                                    className={inputCls}
                                >
                                    {TEMPLATE_TYPES.map((t) => (
                                        <option key={t.key} value={t.key}>{t.label}</option>
                                    ))}
                                </select>
                            </div>

                            {activeSections.length > 0 ? (
                                <div className="space-y-3">
                                    {activeSections.map((section) => (
                                        <div
                                            key={section.id}
                                            className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                                                section.enabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'
                                            }`}
                                        >
                                            <div>
                                                <div className={`text-sm font-bold ${section.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                                                    {section.name}
                                                </div>
                                                <div className="text-[10px] text-gray-400 mt-0.5">
                                                    Fields: {section.fields.join(', ')}
                                                </div>
                                            </div>
                                            <Toggle
                                                checked={section.enabled}
                                                onChange={(v) => toggleSection(section.id, v)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12 text-gray-400">
                                    <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm font-semibold">No template configured for this type</p>
                                    <p className="text-xs mt-1">A default template will be created when you toggle a section.</p>
                                    <button
                                        onClick={() => toggleSection('header', true)}
                                        className="mt-4 text-xs text-emerald-600 font-bold hover:underline"
                                    >
                                        Create default template
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Preview Button */}
                        <div className={cardCls}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-black text-gray-900">Preview Bill</h3>
                                    <p className="text-xs text-gray-500 mt-1">See how a sample bill looks with current settings</p>
                                </div>
                                <button
                                    onClick={() => window.open(`/api/bill-preview?type=${selectedType}`, '_blank')}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors"
                                >
                                    <Eye className="h-4 w-4" />
                                    Preview
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </AdminPage>
    );
}
