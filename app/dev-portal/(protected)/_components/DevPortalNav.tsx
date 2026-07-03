'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Ticket, Radio, FileText, ShieldCheck, LogOut } from 'lucide-react';
import { devPortalLogout } from '../actions';

const NAV_ITEMS = [
    { href: '/dev-portal/tickets', label: 'Tickets', icon: Ticket, devAdminOnly: false },
    { href: '/dev-portal/broadcasts', label: 'Broadcasts', icon: Radio, devAdminOnly: true },
    { href: '/dev-portal/releases', label: 'Releases', icon: FileText, devAdminOnly: true },
    { href: '/dev-portal/audit', label: 'Audit', icon: ShieldCheck, devAdminOnly: true },
];

export function DevPortalNav({
    username,
    roleLabel,
    isDevAdmin,
}: {
    username: string;
    roleLabel: string;
    isDevAdmin: boolean;
}) {
    const pathname = usePathname();

    // Developers (non-Dev-Admins) only get the Tickets link; the restricted
    // tools are hidden from the nav (server-side redirects back them up).
    const navItems = NAV_ITEMS.filter((item) => isDevAdmin || !item.devAdminOnly);

    return (
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#0b1120] text-slate-200">
            <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-6 py-3">
                {/* Brand */}
                <div className="flex items-center gap-2.5 shrink-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 font-mono text-sm font-bold text-emerald-400">
                        {'</>'}
                    </div>
                    <div className="leading-tight">
                        <p className="text-sm font-bold text-white">Developer Portal</p>
                        <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-400/70">Internal</p>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex items-center gap-1">
                    {navItems.map(({ href, label, icon: Icon }) => {
                        const active = pathname === href || pathname.startsWith(href + '/');
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                                    active
                                        ? 'bg-emerald-500/15 text-emerald-300'
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                }`}
                            >
                                <Icon className="h-4 w-4" />
                                {label}
                            </Link>
                        );
                    })}
                </nav>

                {/* User + logout */}
                <div className="ml-auto flex items-center gap-3">
                    <div className="text-right leading-tight">
                        <p className="text-sm font-semibold text-slate-200">{username}</p>
                        <p className="text-[10px] uppercase tracking-wider text-emerald-400/70">{roleLabel}</p>
                    </div>
                    <form action={devPortalLogout}>
                        <button
                            type="submit"
                            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:border-red-500/40 hover:text-red-300"
                        >
                            <LogOut className="h-3.5 w-3.5" />
                            Logout
                        </button>
                    </form>
                </div>
            </div>
        </header>
    );
}
