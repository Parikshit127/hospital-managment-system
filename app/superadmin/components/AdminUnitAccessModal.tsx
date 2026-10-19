'use client';

import React, { useState } from 'react';
import { Building2, Loader2, X } from 'lucide-react';
import { setAdminUnitAccess } from '@/app/actions/superadmin-actions';

export interface UnitAccessOrg {
    id: string;
    name: string;
    code: string;
    is_active: boolean;
}

export interface AdminUnitAccess {
    id: string;
    name: string | null;
    username: string;
    homeOrganizationId: string;
    homeOrganizationName: string;
    canAccessAllUnits: boolean;
    unitIds: string[];
}

export default function AdminUnitAccessModal({
    admin,
    orgs,
    onClose,
    onSaved,
}: {
    admin: AdminUnitAccess;
    orgs: UnitAccessOrg[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [allUnits, setAllUnits] = useState(admin.canAccessAllUnits);
    const [selected, setSelected] = useState<Set<string>>(new Set(admin.unitIds));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggle = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        const res = await setAdminUnitAccess(admin.id, allUnits, [...selected]);
        setSaving(false);
        if (res.success) onSaved();
        else setError(res.error || 'Could not save');
    };

    const others = orgs.filter(o => o.id !== admin.homeOrganizationId);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="flex items-start justify-between px-5 pt-5 pb-3">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">Unit access</h2>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">
                            {admin.name || admin.username} <span className="font-mono text-violet-600">@{admin.username}</span>
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="px-5 pb-2 space-y-3">
                    <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-sm">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        <span className="font-bold text-gray-800 flex-1 truncate">{admin.homeOrganizationName}</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Home · always</span>
                    </div>

                    <label className="flex items-center gap-2 text-sm font-bold text-gray-800 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={allUnits}
                            onChange={e => setAllUnits(e.target.checked)}
                            className="h-4 w-4 accent-violet-600"
                        />
                        All units (including ones created later)
                    </label>

                    <div className={`max-h-64 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50 ${allUnits ? 'opacity-40 pointer-events-none' : ''}`}>
                        {others.length === 0 ? (
                            <p className="px-3 py-3 text-xs text-gray-500">No other units exist.</p>
                        ) : others.map(o => (
                            <label key={o.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                                <input
                                    type="checkbox"
                                    checked={allUnits || selected.has(o.id)}
                                    onChange={() => toggle(o.id)}
                                    className="h-4 w-4 accent-violet-600"
                                />
                                <span className="flex-1 truncate text-gray-800">{o.name}</span>
                                {!o.is_active && <span className="text-[10px] font-bold uppercase text-amber-600">Suspended</span>}
                                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{o.code}</span>
                            </label>
                        ))}
                    </div>
                    {error && <p className="text-xs text-red-600">{error}</p>}
                </div>

                <div className="flex justify-end gap-2 px-5 py-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-600 rounded-lg hover:bg-gray-100">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-bold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-60 flex items-center gap-2"
                    >
                        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}
