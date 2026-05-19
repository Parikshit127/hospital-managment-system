'use client';

import React, { useState } from 'react';
import { BedGrid } from './BedGrid';
import { createWard, updateWard, bulkAddBeds, toggleWardActive } from '@/app/admin/ipd-setup/actions';
import { Plus, Settings2, Building2, BedDouble, ChevronDown, ChevronUp, Pencil, X, Loader2 } from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';

// All 14 ward types from the document
const WARD_TYPES = [
    { value: 'General',               label: 'General' },
    { value: 'ICU',                   label: 'ICU — Intensive Care Unit' },
    { value: 'NICU',                  label: 'NICU — Neonatal ICU' },
    { value: 'PICU',                  label: 'PICU — Paediatric ICU' },
    { value: 'HDU',                   label: 'HDU — High Dependency Unit' },
    { value: 'CCU',                   label: 'CCU — Cardiac Care Unit' },
    { value: 'MICU',                  label: 'MICU — Medical ICU' },
    { value: 'SICU',                  label: 'SICU — Surgical ICU' },
    { value: 'Isolation',             label: 'Isolation / Infection' },
    { value: 'Burn',                  label: 'Burn Unit' },
    { value: 'Rehab',                 label: 'Rehabilitation' },
    { value: 'Daycare',               label: 'Daycare' },
    { value: 'Emergency Observation', label: 'Emergency Observation' },
    { value: 'Labour Room',           label: 'Labour Room / Maternity' },
];

// All 6 bed categories from the document
const BED_CATEGORIES = [
    { value: 'General',      label: 'General' },
    { value: 'Semi-Private', label: 'Semi-Private' },
    { value: 'Private',      label: 'Private' },
    { value: 'Deluxe',       label: 'Deluxe' },
    { value: 'Suite',        label: 'Suite' },
    { value: 'ICU',          label: 'ICU' },
];

const PRICING_TIERS = [
    { value: 'Base',     label: 'Base Rate' },
    { value: 'Premium',  label: 'Premium (+50%)' },
    { value: 'Critical', label: 'Critical (+100%)' },
];

const inputCls = 'w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500';
const selectCls = 'w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-orange-500';
const labelCls = 'block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5';

const EMPTY_WARD = { ward_name: '', ward_type: 'General', department_id: '', floor_number: '', cost_per_day: '', nursing_charge: '' };
const EMPTY_BEDS = { start_number: '1', end_number: '10', prefix: 'B-', bed_category: 'General', pricing_tier: 'Base', is_isolation: false };

function SectionLabel({ label, badge }: { label: string; badge: 'mandatory' | 'preferred' | 'optional' }) {
    const colors = { mandatory: 'bg-red-50 text-red-600 border-red-200', preferred: 'bg-amber-50 text-amber-600 border-amber-200', optional: 'bg-gray-100 text-gray-500 border-gray-200' };
    return (
        <div className="col-span-2 flex items-center gap-2 pt-2 pb-1 border-b border-gray-100 mb-1">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{label}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors[badge]}`}>{badge}</span>
        </div>
    );
}

function FL({ label, badge, required }: { label: string; badge: 'mandatory' | 'preferred' | 'optional'; required?: boolean }) {
    const dot = { mandatory: 'bg-red-400', preferred: 'bg-amber-400', optional: 'bg-gray-300' };
    return (
        <label className={`${labelCls} flex items-center gap-1.5`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot[badge]}`} />
            {label}{required && <span className="text-red-500 normal-case font-normal ml-0.5">*</span>}
        </label>
    );
}

export function WardManager({ wards, departments, organizationId }: { wards: any[]; departments: any[]; organizationId: string }) {
    const toast = useToast();
    const [expandedWard, setExpandedWard] = useState<number | null>(wards[0]?.ward_id || null);
    const [submitting, setSubmitting] = useState(false);

    // Ward modal
    const [wardModalOpen, setWardModalOpen] = useState(false);
    const [editingWardId, setEditingWardId] = useState<number | null>(null);
    const [wardForm, setWardForm] = useState(EMPTY_WARD);

    // Beds modal
    const [bedsModalOpen, setBedsModalOpen] = useState(false);
    const [activeWardId, setActiveWardId] = useState<number | null>(null);
    const [bedsForm, setBedsForm] = useState(EMPTY_BEDS);

    const setW = (k: string, v: any) => setWardForm(p => ({ ...p, [k]: v }));
    const setB = (k: string, v: any) => setBedsForm(p => ({ ...p, [k]: v }));

    const openCreateWard = () => { setEditingWardId(null); setWardForm(EMPTY_WARD); setWardModalOpen(true); };
    const openEditWard = (ward: any, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingWardId(ward.ward_id);
        setWardForm({
            ward_name: ward.ward_name,
            ward_type: ward.ward_type,
            department_id: ward.department_id ?? '',
            floor_number: ward.floor_number ?? '',
            cost_per_day: ward.cost_per_day != null ? String(ward.cost_per_day) : '',
            nursing_charge: ward.nursing_charge != null ? String(ward.nursing_charge) : '',
        });
        setWardModalOpen(true);
    };

    const handleSaveWard = async () => {
        if (!wardForm.ward_name.trim()) { toast.error('Ward name is required'); return; }
        setSubmitting(true);
        try {
            const payload = {
                ward_name: wardForm.ward_name.trim(),
                ward_type: wardForm.ward_type,
                department_id: wardForm.department_id || undefined,
                floor_number: wardForm.floor_number || undefined,
                cost_per_day: wardForm.cost_per_day ? Number(wardForm.cost_per_day) : 0,
                nursing_charge: wardForm.nursing_charge ? Number(wardForm.nursing_charge) : 0,
            };
            if (editingWardId) {
                await updateWard(editingWardId, payload);
                toast.success('Ward updated');
            } else {
                await createWard(payload);
                toast.success('Ward created');
            }
            setWardModalOpen(false);
        } catch (e: any) {
            toast.error(e.message || 'Failed to save ward');
        }
        setSubmitting(false);
    };

    const handleBulkAdd = async () => {
        if (!activeWardId) return;
        const start = parseInt(bedsForm.start_number);
        const end = parseInt(bedsForm.end_number);
        if (isNaN(start) || isNaN(end) || start > end) { toast.warning('Invalid bed range'); return; }
        setSubmitting(true);
        try {
            await bulkAddBeds({
                ward_id: activeWardId,
                start_number: start,
                end_number: end,
                prefix: bedsForm.prefix,
                bed_category: bedsForm.bed_category,
                pricing_tier: bedsForm.pricing_tier,
                is_isolation: bedsForm.is_isolation,
            });
            toast.success(`${end - start + 1} beds added`);
            setBedsModalOpen(false);
            setBedsForm(EMPTY_BEDS);
        } catch (e: any) {
            toast.error(e.message || 'Failed to add beds');
        }
        setSubmitting(false);
    };

    const handleToggleActive = async (wardId: number, current: boolean, e: React.MouseEvent) => {
        e.stopPropagation();
        await toggleWardActive(wardId, !current);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-black text-gray-800">Hospital Wards</h2>
                    <p className="text-xs text-gray-500 font-medium">Configure wards, floors, charges, and bed capacity.</p>
                </div>
                <button onClick={openCreateWard} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl transition">
                    <Plus className="h-4 w-4" /> New Ward
                </button>
            </div>

            {/* Ward list */}
            <div className="space-y-4">
                {wards.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
                        <Building2 className="mx-auto h-12 w-12 mb-3 opacity-20" />
                        <h3 className="text-sm font-bold">No Wards Configured</h3>
                        <p className="text-xs">Create your first ward to start adding beds.</p>
                    </div>
                ) : wards.map((ward) => {
                    const isExpanded = expandedWard === ward.ward_id;
                    const beds = ward.beds || [];
                    const available = beds.filter((b: any) => b.status === 'Available').length;
                    const occupiedCount = beds.filter((b: any) => b.status === 'Occupied').length;

                    return (
                        <div key={ward.ward_id} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                            <div className={`p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-gray-50/50 border-b border-gray-100' : ''}`}
                                onClick={() => setExpandedWard(isExpanded ? null : ward.ward_id)}>
                                <div className="flex items-center gap-4">
                                    <div className={`p-2.5 rounded-xl ${ward.is_active ? 'bg-orange-50 text-orange-600' : 'bg-gray-100 text-gray-400'}`}>
                                        <Building2 className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-gray-800 flex items-center gap-2">
                                            {ward.ward_name}
                                            {!ward.is_active && <span className="text-[10px] bg-gray-200 text-gray-500 px-2 py-0.5 rounded-md uppercase">Inactive</span>}
                                        </h3>
                                        <p className="text-[11px] text-gray-500 font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                                            <span className="text-violet-600 font-bold bg-violet-50 px-1.5 py-0.5 rounded">{ward.ward_type}</span>
                                            {ward.floor_number && <span>Floor {ward.floor_number}</span>}
                                            {ward.department?.name && <span>• {ward.department.name}</span>}
                                            {ward.cost_per_day > 0 && <span>• ₹{Number(ward.cost_per_day).toLocaleString('en-IN')}/day</span>}
                                            {ward.nursing_charge > 0 && <span>• Nursing ₹{Number(ward.nursing_charge).toLocaleString('en-IN')}/day</span>}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-right hidden sm:block">
                                        <p className="text-xs font-black text-gray-700">{occupiedCount}/{beds.length} Occupied</p>
                                        <p className="text-[10px] text-emerald-500 font-bold">{available} Available</p>
                                    </div>
                                    <button onClick={(e) => openEditWard(ward, e)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-orange-600 transition" title="Edit ward"><Pencil className="h-4 w-4" /></button>
                                    <button onClick={(e) => handleToggleActive(ward.ward_id, ward.is_active, e)}
                                        className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${ward.is_active ? 'bg-white border-rose-200 text-rose-600 hover:bg-rose-50' : 'bg-orange-500 text-white border-teal-600 hover:bg-teal-400'}`}>
                                        {ward.is_active ? 'Deactivate' : 'Activate'}
                                    </button>
                                    {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="p-5">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                            <BedDouble className="h-4 w-4" /> Visual Bed Map
                                        </h4>
                                        <button onClick={() => { setActiveWardId(ward.ward_id); setBedsModalOpen(true); }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-50 transition">
                                            <Plus className="h-3 w-3" /> Bulk Add Beds
                                        </button>
                                    </div>
                                    <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                                        <BedGrid beds={beds} wardName={ward.ward_name} />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* WARD MODAL */}
            {wardModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                            <div>
                                <h2 className="text-base font-bold text-gray-900">{editingWardId ? 'Edit Ward' : 'Create New Ward'}</h2>
                                <p className="text-[10px] text-gray-400 mt-0.5 flex gap-3">
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />Mandatory</span>
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Preferred</span>
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />Optional</span>
                                </p>
                            </div>
                            <button onClick={() => setWardModalOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                <SectionLabel label="Basic Info" badge="mandatory" />
                                <div className="col-span-2">
                                    <FL label="Ward Name" badge="mandatory" required />
                                    <input type="text" value={wardForm.ward_name} onChange={e => setW('ward_name', e.target.value)} placeholder="e.g. General Ward A, ICU-1" className={inputCls} />
                                </div>
                                <div>
                                    <FL label="Ward Type" badge="mandatory" required />
                                    <select value={wardForm.ward_type} onChange={e => setW('ward_type', e.target.value)} className={selectCls}>
                                        {WARD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <FL label="Floor" badge="mandatory" required />
                                    <input type="text" value={wardForm.floor_number} onChange={e => setW('floor_number', e.target.value)} placeholder="e.g. Ground, 1st, 2nd" className={inputCls} />
                                </div>

                                <SectionLabel label="Charges" badge="preferred" />
                                <div>
                                    <FL label="Cost Per Day (₹)" badge="preferred" />
                                    <input type="number" min={0} value={wardForm.cost_per_day} onChange={e => setW('cost_per_day', e.target.value)} placeholder="e.g. 1500" className={inputCls} />
                                </div>
                                <div>
                                    <FL label="Nursing Charge / Day (₹)" badge="preferred" />
                                    <input type="number" min={0} value={wardForm.nursing_charge} onChange={e => setW('nursing_charge', e.target.value)} placeholder="e.g. 500" className={inputCls} />
                                </div>

                                <SectionLabel label="Classification" badge="optional" />
                                <div className="col-span-2">
                                    <FL label="Linked Department" badge="optional" />
                                    <select value={wardForm.department_id} onChange={e => setW('department_id', e.target.value)} className={selectCls}>
                                        <option value="">— None / Hospital Wide —</option>
                                        {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
                            <button onClick={() => setWardModalOpen(false)} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 text-sm font-semibold hover:bg-gray-50 transition">Cancel</button>
                            <button onClick={handleSaveWard} disabled={submitting || !wardForm.ward_name.trim()}
                                className="flex-1 py-2.5 bg-orange-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition flex items-center justify-center gap-2">
                                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                {submitting ? 'Saving…' : editingWardId ? 'Save Changes' : 'Create Ward'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* BEDS MODAL */}
            {bedsModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                            <div>
                                <h2 className="text-base font-bold text-gray-900">Bulk Add Beds</h2>
                                <p className="text-[10px] text-gray-400 mt-0.5 flex gap-3">
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />Mandatory</span>
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Preferred</span>
                                </p>
                            </div>
                            <button onClick={() => setBedsModalOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 space-y-4">
                            <div className="bg-blue-50 text-blue-800 p-3 rounded-xl text-xs flex gap-2">
                                <Settings2 className="h-4 w-4 shrink-0 mt-0.5" />
                                <p>Generates bed IDs from Start to End. Example: Prefix <strong>ICU-</strong> + Range 1–5 = ICU-1, ICU-2 … ICU-5. Max 100 beds at a time.</p>
                            </div>

                            <div>
                                <p className="text-[10px] font-bold text-red-500 uppercase tracking-wide mb-2 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />Bed ID Generation — Mandatory</p>
                                <div className="grid grid-cols-3 gap-3">
                                    <div><label className={labelCls}>Prefix</label><input type="text" value={bedsForm.prefix} onChange={e => setB('prefix', e.target.value)} placeholder="B-" className={inputCls} /></div>
                                    <div><label className={labelCls}>Start No.</label><input type="number" min="1" value={bedsForm.start_number} onChange={e => setB('start_number', e.target.value)} className={inputCls} /></div>
                                    <div><label className={labelCls}>End No.</label><input type="number" min="1" value={bedsForm.end_number} onChange={e => setB('end_number', e.target.value)} className={inputCls} /></div>
                                </div>
                            </div>

                            <div>
                                <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wide mb-2 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Classification — Preferred</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={labelCls}>Bed Category</label>
                                        <select value={bedsForm.bed_category} onChange={e => setB('bed_category', e.target.value)} className={selectCls}>
                                            {BED_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Pricing Tier</label>
                                        <select value={bedsForm.pricing_tier} onChange={e => setB('pricing_tier', e.target.value)} className={selectCls}>
                                            {PRICING_TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                                <input type="checkbox" id="is_isolation" checked={bedsForm.is_isolation}
                                    onChange={e => setB('is_isolation', e.target.checked)}
                                    className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500" />
                                <label htmlFor="is_isolation" className="text-sm font-semibold text-amber-900">
                                    Isolation Beds — for infectious / barrier-nursing patients
                                </label>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
                            <button onClick={() => setBedsModalOpen(false)} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 text-sm font-semibold hover:bg-gray-50 transition">Cancel</button>
                            <button onClick={handleBulkAdd} disabled={submitting}
                                className="flex-1 py-2.5 bg-orange-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition flex items-center justify-center gap-2">
                                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                {submitting ? 'Adding…' : 'Generate Beds'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
