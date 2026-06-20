'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Menu,
    X,
    LayoutGrid,
    Stethoscope,
    UserRound,
    HeartPulse,
    BedDouble,
    ListChecks,
    FlaskConical,
    Pill,
    Wallet,
    Briefcase,
    ClipboardList,
    ShieldCheck,
} from 'lucide-react';

/**
 * Global, admin-only portal launcher.
 *
 * A floating ☰ pinned to the top-left, visible in every portal ONLY when the
 * logged-in staff member is an admin. Selecting a portal NAVIGATES there
 * (client-side) while keeping the admin session intact — so an admin can hop
 * between portals freely and stays `admin` the whole time (no logout/login,
 * no impersonation). Mounted once in the root layout, it persists across
 * client navigations.
 */

type PortalLink = {
    label: string;
    path: string;
    icon: typeof Menu;
    dot: string;
};

const PORTALS: PortalLink[] = [
    { label: 'Admin Dashboard', path: '/admin/dashboard', icon: ShieldCheck, dot: 'bg-violet-400' },
    { label: 'Reception', path: '/reception', icon: UserRound, dot: 'bg-orange-400' },
    { label: 'Doctor', path: '/doctor/dashboard', icon: Stethoscope, dot: 'bg-blue-400' },
    { label: 'Nurse', path: '/nurse/dashboard', icon: HeartPulse, dot: 'bg-pink-400' },
    { label: 'IPD', path: '/ipd', icon: BedDouble, dot: 'bg-purple-400' },
    { label: 'OPD Manager', path: '/opd-manager/dashboard', icon: ListChecks, dot: 'bg-indigo-400' },
    { label: 'Lab', path: '/lab/technician', icon: FlaskConical, dot: 'bg-amber-400' },
    { label: 'Pharmacy', path: '/pharmacy/billing', icon: Pill, dot: 'bg-teal-400' },
    { label: 'Finance', path: '/finance/dashboard', icon: Wallet, dot: 'bg-green-400' },
    { label: 'HR', path: '/hr/dashboard', icon: Briefcase, dot: 'bg-rose-400' },
    { label: 'Coordinator', path: '/coordinator/dashboard', icon: ClipboardList, dot: 'bg-cyan-400' },
];

export default function AdminPortalLauncher() {
    const [isAdmin, setIsAdmin] = useState(false);
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const ref = useRef<HTMLDivElement>(null);

    // Only show for an admin staff session.
    useEffect(() => {
        let cancelled = false;
        fetch('/api/session')
            .then(r => (r.ok ? r.json() : null))
            .then(s => {
                if (!cancelled && s?.role === 'admin') setIsAdmin(true);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    // Close on outside click / Escape.
    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    if (!isAdmin) return null;

    const go = (path: string) => {
        setOpen(false);
        router.push(path);
    };

    return (
        <div ref={ref} className="fixed top-2 left-2 z-[1000] print:hidden">
            <button
                onClick={() => setOpen(o => !o)}
                title="Switch portal (admin)"
                aria-label="Switch portal"
                className="flex items-center justify-center h-9 w-9 rounded-lg bg-gray-900/90 text-white shadow-lg ring-1 ring-white/10 backdrop-blur hover:bg-gray-900 transition"
            >
                {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>

            {open && (
                <div className="absolute top-11 left-0 w-60 rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-gray-50">
                        <LayoutGrid className="h-4 w-4 text-violet-500" />
                        <span className="text-sm font-semibold text-gray-800">Switch Portal</span>
                        <span className="ml-auto text-[10px] font-medium text-gray-400 uppercase tracking-wide">Admin</span>
                    </div>
                    <div className="max-h-[70vh] overflow-y-auto py-1">
                        {PORTALS.map(p => {
                            const Icon = p.icon;
                            return (
                                <button
                                    key={p.path}
                                    onClick={() => go(p.path)}
                                    className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-gray-50 transition group"
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.dot}`} />
                                    <Icon className="h-4 w-4 text-gray-400 group-hover:text-gray-600 shrink-0" />
                                    <span className="text-sm text-gray-700 group-hover:text-gray-900 font-medium">
                                        {p.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="px-3 py-2 text-[10px] text-gray-400 border-t border-gray-100">
                        Opens as admin — your session stays the same.
                    </p>
                </div>
            )}
        </div>
    );
}
