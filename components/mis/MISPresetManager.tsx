'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Bookmark, BookmarkPlus, Loader2, Save, Trash2, X, Share2, AlertCircle } from 'lucide-react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

interface MISPresetManagerProps {
    reportId: string;
    currentFilters: Record<string, string>;
}

export function MISPresetManager({ reportId, currentFilters }: MISPresetManagerProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [presets, setPresets] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [presetName, setPresetName] = useState('');
    const [isShared, setIsShared] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!reportId) return;
        fetch(`/api/mis/presets?report_id=${reportId}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.data) {
                    setPresets(data.data);
                }
                setIsLoading(false);
            })
            .catch(() => setIsLoading(false));
    }, [reportId]);

    const applyPreset = (preset: any) => {
        const params = new URLSearchParams(searchParams.toString());
        const filters = preset.filters_json || {};
        
        // Clear existing supported filter keys
        const allKeys = ['startDate', 'endDate', 'doctor', 'department_id', 'bill_type', 'status', 'store_id'];
        allKeys.forEach(k => params.delete(k));

        // Apply new keys
        Object.entries(filters).forEach(([k, v]) => {
            if (v) params.set(k, String(v));
        });

        startTransition(() => {
            router.push(`${pathname}?${params.toString()}`, { scroll: false });
        });
    };

    const handleSave = async () => {
        if (!presetName.trim()) {
            setErrorMsg('Preset name is required.');
            return;
        }
        setIsSaving(true);
        setErrorMsg('');

        try {
            const cleanFilters = Object.fromEntries(
                Object.entries(currentFilters).filter(([_, v]) => v !== '')
            );

            const res = await fetch('/api/mis/presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    report_id: reportId,
                    name: presetName.trim(),
                    filters_json: cleanFilters,
                    is_shared: isShared
                })
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to save preset');

            setPresets([json.data, ...presets]);
            setShowSaveModal(false);
            setPresetName('');
            setIsShared(false);
        } catch (e: any) {
            setErrorMsg(e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this preset?')) return;

        try {
            const res = await fetch(`/api/mis/presets/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            setPresets(presets.filter(p => p.id !== id));
        } catch (error) {
            console.error(error);
        }
    };

    const hasFilters = Object.values(currentFilters).some(v => v !== '');

    return (
        <div className="relative flex items-center gap-2">
            {/* Dropdown for presets */}
            <div className="relative group">
                <button
                    suppressHydrationWarning
                    className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-stone-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    aria-label="Load preset"
                >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : <Bookmark className="h-4 w-4 text-emerald-600" />}
                    Presets
                </button>
                <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 shadow-xl rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Saved Presets</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                        {presets.length === 0 ? (
                            <div className="px-4 py-6 text-center text-sm text-gray-400 font-medium">
                                No presets found.
                            </div>
                        ) : (
                            presets.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => applyPreset(p)}
                                    className="w-full text-left px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center justify-between group/item"
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        {p.is_shared && <Share2 className="h-3 w-3 text-indigo-400 shrink-0" />}
                                        <span className="truncate">{p.name}</span>
                                    </div>
                                    <Trash2
                                        className="h-3.5 w-3.5 text-gray-300 hover:text-rose-500 opacity-0 group-hover/item:opacity-100 transition-all shrink-0"
                                        onClick={(e) => handleDelete(e, p.id)}
                                    />
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <button
                suppressHydrationWarning
                onClick={() => setShowSaveModal(true)}
                disabled={!hasFilters || isPending}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
                title={hasFilters ? "Save current filters as preset" : "Set some filters first"}
                aria-label="Save current filters as preset"
            >
                <BookmarkPlus className="h-4 w-4" />
                Save
            </button>

            {/* Save Modal */}
            {showSaveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                                <Save className="h-4 w-4 text-emerald-600" /> Save Preset
                            </h3>
                            <button onClick={() => setShowSaveModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {errorMsg && (
                                <div className="p-3 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>{errorMsg}</span>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Preset Name</label>
                                <input
                                    type="text"
                                    value={presetName}
                                    onChange={e => setPresetName(e.target.value)}
                                    placeholder="e.g. Monthly OP Summary"
                                    className="w-full text-sm font-semibold text-stone-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                                    autoFocus
                                />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isShared}
                                    onChange={e => setIsShared(e.target.checked)}
                                    className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                                />
                                <span className="text-sm font-medium text-stone-700">Share with my organization</span>
                            </label>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setShowSaveModal(false)}
                                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-colors disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Save Preset
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
