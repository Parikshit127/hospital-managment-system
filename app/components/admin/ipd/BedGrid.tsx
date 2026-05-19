'use client';

import React, { useState } from 'react';
import { BedDouble, Wrench, X, Loader2, ShieldAlert } from 'lucide-react';
import { updateBedStatus } from '@/app/admin/ipd-setup/actions';

const STATUS_OPTIONS = [
    { value: 'Available',   label: 'Available',   color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
    { value: 'Occupied',    label: 'Occupied',    color: 'bg-violet-100  text-violet-700  border-violet-300'  },
    { value: 'Maintenance', label: 'Maintenance', color: 'bg-amber-100   text-amber-700   border-amber-300'   },
    { value: 'Cleaning',    label: 'Cleaning',    color: 'bg-blue-100    text-blue-700    border-blue-300'    },
    { value: 'Reserved',    label: 'Reserved',    color: 'bg-orange-100  text-orange-700  border-orange-300'  },
    { value: 'Blocked',     label: 'Blocked',     color: 'bg-gray-200    text-gray-600    border-gray-400'    },
];

const BED_CATEGORIES = ['General', 'Semi-Private', 'Private', 'Deluxe', 'Suite', 'ICU'];
const PRICING_TIERS  = ['Base', 'Premium', 'Critical'];

const inputCls  = 'w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500';
const selectCls = 'w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-teal-500';
const labelCls  = 'block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5';

function getStatusStyle(status: string) {
    return STATUS_OPTIONS.find(s => s.value === status)?.color
        ?? 'bg-gray-100 text-gray-600 border-gray-300';
}

export function BedGrid({ beds, wardName }: { beds: any[]; wardName: string }) {
    const [editBed, setEditBed]     = useState<any | null>(null);
    const [saving,  setSaving]      = useState(false);
    const [editForm, setEditForm]   = useState({ status: '', bed_category: '', pricing_tier: '', is_isolation: false });

    const openEdit = (bed: any, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditBed(bed);
        setEditForm({
            status:       bed.status       ?? 'Available',
            bed_category: bed.bed_category ?? 'General',
            pricing_tier: bed.pricing_tier ?? 'Base',
            is_isolation: bed.is_isolation ?? false,
        });
    };

    const handleSave = async () => {
        if (!editBed) return;
        setSaving(true);
        try {
            await updateBedStatus(editBed.bed_id, editForm.status, editForm.bed_category, editForm.pricing_tier);
            setEditBed(null);
        } catch (e) {
            console.error('Failed to update bed', e);
        }
        setSaving(false);
    };

    if (!beds || beds.length === 0) {
        return (
            <div className="py-8 flex flex-col items-center justify-center text-gray-400 border border-dashed border-gray-200 rounded-xl">
                <BedDouble className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">No beds configured yet</p>
                <p className="text-xs mt-1">Use "Bulk Add Beds" to generate beds for this ward.</p>
            </div>
        );
    }

    const counts = STATUS_OPTIONS.map(s => ({ ...s, count: beds.filter(b => b.status === s.value).length })).filter(s => s.count > 0);

    return (
        <div className="space-y-4">
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-gray-500">
                {counts.map(s => (
                    <div key={s.value} className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full border ${s.color}`} />
                        {s.count} {s.label}
                    </div>
                ))}
                <span className="ml-auto text-[10px] text-gray-400 italic">Click a bed to edit</span>
            </div>

            {/* Bed grid */}
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2.5">
                {beds.map((bed) => {
                    const prefixToStrip = `${bed.organizationId}-${bed.ward_id}-`;
                    const label = bed.bed_id.startsWith(prefixToStrip)
                        ? bed.bed_id.slice(prefixToStrip.length)
                        : bed.bed_id;

                    return (
                        <button
                            key={bed.bed_id}
                            onClick={(e) => openEdit(bed, e)}
                            className={`relative group flex flex-col items-center justify-center p-2.5 rounded-xl border-2 transition-all duration-150 hover:scale-105 hover:shadow-md ${getStatusStyle(bed.status)}`}
                            title={`${label} — ${bed.status}${bed.bed_category ? ` | ${bed.bed_category}` : ''}${bed.is_isolation ? ' | Isolation' : ''}`}
                        >
                            <BedDouble className="h-5 w-5 mb-1 opacity-80" />
                            <span className="text-[9px] font-black uppercase tracking-wider truncate w-full text-center leading-tight">
                                {label}
                            </span>

                            {/* Isolation indicator */}
                            {bed.is_isolation && (
                                <ShieldAlert className="absolute top-1 right-1 h-2.5 w-2.5 text-red-500" aria-label="Isolation bed" />
                            )}

                            {/* Category badge */}
                            {bed.bed_category && (
                                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[7px] font-bold bg-white text-gray-500 px-1 border rounded shadow-sm whitespace-nowrap">
                                    {bed.bed_category.slice(0, 4)}
                                </span>
                            )}

                            {/* Edit hint on hover */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                                <Wrench className="h-3.5 w-3.5" />
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Edit Bed Modal */}
            {editBed && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <div>
                                <h3 className="font-bold text-gray-900 text-sm">Edit Bed</h3>
                                <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
                                    {editBed.bed_id.startsWith(`${editBed.organizationId}-${editBed.ward_id}-`)
                                        ? editBed.bed_id.slice(`${editBed.organizationId}-${editBed.ward_id}-`.length)
                                        : editBed.bed_id}
                                    {' '}— {wardName}
                                </p>
                            </div>
                            <button onClick={() => setEditBed(null)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* Status */}
                            <div>
                                <label className={labelCls}>Status</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {STATUS_OPTIONS.map(s => (
                                        <button key={s.value} type="button"
                                            onClick={() => setEditForm(p => ({ ...p, status: s.value }))}
                                            className={`py-1.5 px-2 rounded-lg border-2 text-[10px] font-bold transition-all ${
                                                editForm.status === s.value
                                                    ? `${s.color} border-current scale-105 shadow-sm`
                                                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                                            }`}>
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Bed Category */}
                            <div>
                                <label className={labelCls}>Bed Category</label>
                                <select value={editForm.bed_category}
                                    onChange={e => setEditForm(p => ({ ...p, bed_category: e.target.value }))}
                                    className={selectCls}>
                                    {BED_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            {/* Pricing Tier */}
                            <div>
                                <label className={labelCls}>Pricing Tier</label>
                                <select value={editForm.pricing_tier}
                                    onChange={e => setEditForm(p => ({ ...p, pricing_tier: e.target.value }))}
                                    className={selectCls}>
                                    {PRICING_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>

                            {/* Isolation */}
                            <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
                                <input type="checkbox" id="bed_isolation"
                                    checked={editForm.is_isolation}
                                    onChange={e => setEditForm(p => ({ ...p, is_isolation: e.target.checked }))}
                                    className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500" />
                                <label htmlFor="bed_isolation" className="text-sm font-semibold text-red-900 flex items-center gap-1.5">
                                    <ShieldAlert className="h-3.5 w-3.5" /> Isolation Bed
                                </label>
                            </div>
                        </div>

                        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
                            <button onClick={() => setEditBed(null)}
                                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 text-sm font-semibold hover:bg-gray-50 transition">
                                Cancel
                            </button>
                            <button onClick={handleSave} disabled={saving}
                                className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition flex items-center justify-center gap-2">
                                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                                {saving ? 'Saving…' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
