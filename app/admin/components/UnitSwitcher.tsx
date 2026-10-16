'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react';
import { getSwitchableUnits, switchUnit, type SwitchableUnit } from '@/app/actions/unit-switch-actions';

export default function UnitSwitcher({ currentUnitName }: { currentUnitName?: string }) {
    const [open, setOpen] = useState(false);
    const [units, setUnits] = useState<SwitchableUnit[] | null>(null);
    const [switchingId, setSwitchingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggle = async () => {
        const next = !open;
        setOpen(next);
        setError(null);
        if (next) setUnits(await getSwitchableUnits());
    };

    const handleSwitch = async (unit: SwitchableUnit) => {
        if (unit.isCurrent || switchingId) return;
        setSwitchingId(unit.id);
        setError(null);
        const res = await switchUnit(unit.id);
        if (res.success) {
            // Hard navigation: every server-rendered, org-scoped view and the branding must reload.
            window.location.href = '/admin/dashboard';
        } else {
            setError(res.error || 'Could not switch unit');
            setSwitchingId(null);
        }
    };

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={toggle}
                title="Switch unit"
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-semibold text-gray-700 hover:bg-gray-100 transition-colors max-w-[220px]"
                style={{ border: '1px solid var(--admin-border)' }}
            >
                <Building2 className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                <span className="truncate">{currentUnitName || 'Select unit'}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            </button>

            {open && (
                <div
                    className="absolute right-0 mt-2 w-72 rounded-xl bg-white shadow-lg z-50 overflow-hidden"
                    style={{ border: '1px solid var(--admin-border)' }}
                >
                    <p className="px-3 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Switch unit
                    </p>
                    <div className="max-h-72 overflow-y-auto pb-1">
                        {units === null ? (
                            <div className="flex justify-center py-4">
                                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                            </div>
                        ) : units.length === 0 ? (
                            <p className="px-3 py-3 text-[12px] text-gray-500">No units available</p>
                        ) : (
                            units.map(unit => (
                                <button
                                    key={unit.id}
                                    type="button"
                                    disabled={unit.isCurrent || !!switchingId}
                                    onClick={() => handleSwitch(unit)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-gray-50 disabled:cursor-default disabled:hover:bg-transparent"
                                >
                                    <span className={`flex-1 truncate ${unit.isCurrent ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                                        {unit.name}
                                    </span>
                                    {switchingId === unit.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                                    ) : unit.isCurrent ? (
                                        <Check className="h-3.5 w-3.5 text-green-600" />
                                    ) : null}
                                </button>
                            ))
                        )}
                    </div>
                    {error && <p className="px-3 py-2 text-[11px] text-red-600 border-t border-gray-100">{error}</p>}
                </div>
            )}
        </div>
    );
}
