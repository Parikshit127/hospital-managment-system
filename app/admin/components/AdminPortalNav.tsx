'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, ChevronDown } from 'lucide-react';

/**
 * Admin portal switcher for the admin top bar. Navigates (client-side) to any
 * portal while keeping the admin session — so the admin stays `admin` and can
 * roam between portals without impersonating or logging back in. Once in a
 * portal, the same switcher is available in that portal's sidebar header.
 */

const PORTALS: { label: string; path: string }[] = [
    { label: 'Admin', path: '/admin/dashboard' },
    { label: 'Reception', path: '/reception' },
    { label: 'Doctor', path: '/doctor/dashboard' },
    { label: 'Nurse', path: '/nurse/dashboard' },
    { label: 'IPD', path: '/ipd' },
    { label: 'OPD Manager', path: '/opd-manager/dashboard' },
    { label: 'Lab', path: '/lab/technician' },
    { label: 'Pharmacy', path: '/pharmacy/billing' },
    { label: 'Finance', path: '/finance/dashboard' },
    { label: 'HR', path: '/hr/dashboard' },
    { label: 'Coordinator', path: '/coordinator/dashboard' },
];

export default function AdminPortalNav() {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors"
                title="Switch portal (stays admin)"
            >
                <LayoutGrid className="h-4 w-4 text-violet-500" />
                <span className="hidden sm:inline">Switch Portal</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
                        <p className="px-3 py-2 text-[11px] font-semibold text-gray-500 border-b border-gray-100">
                            Switch Portal
                        </p>
                        <div className="max-h-[60vh] overflow-y-auto py-1">
                            {PORTALS.map(p => (
                                <button
                                    key={p.path}
                                    onClick={() => { setOpen(false); router.push(p.path); }}
                                    className="block w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        <p className="px-3 py-1.5 text-[10px] text-gray-400 border-t border-gray-100">
                            Opens as admin — session unchanged
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}
