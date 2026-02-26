'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { superAdminLogout } from '@/app/actions/superadmin-actions';
import {
    LayoutDashboard, Building2, LogOut, ShieldCheck, Plus
} from 'lucide-react';

interface ShellProps {
    session: { id: string; email: string; name: string };
    children: React.ReactNode;
}

const NAV_ITEMS = [
    { label: 'Dashboard', href: '/superadmin', icon: LayoutDashboard },
    { label: 'Organizations', href: '/superadmin/organizations', icon: Building2 },
];

export default function SuperAdminShell({ session, children }: ShellProps) {
    const pathname = usePathname();

    return (
        <div className="min-h-screen flex flex-col">
            {/* Top Nav */}
            <header className="sticky top-0 z-40 bg-[#0d1117]/80 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <Link href="/superadmin" className="flex items-center gap-2.5">
                            <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-1.5 rounded-lg">
                                <ShieldCheck className="h-5 w-5 text-white" />
                            </div>
                            <span className="text-sm font-bold text-white hidden sm:block">Hospital OS Platform</span>
                        </Link>

                        <nav className="flex items-center gap-1">
                            {NAV_ITEMS.map((item) => {
                                const Icon = item.icon;
                                const isActive = pathname === item.href || (item.href !== '/superadmin' && pathname.startsWith(item.href));
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                                            isActive
                                                ? 'bg-violet-500/15 text-violet-400'
                                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        <Icon className="h-4 w-4" />
                                        <span className="hidden sm:block">{item.label}</span>
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>

                    <div className="flex items-center gap-3">
                        <Link
                            href="/superadmin/organizations/new"
                            className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition"
                        >
                            <Plus className="h-4 w-4" />
                            <span className="hidden sm:block">New Hospital</span>
                        </Link>

                        <div className="flex items-center gap-2 pl-3 border-l border-white/10">
                            <div className="text-right hidden sm:block">
                                <p className="text-xs font-medium text-white">{session.name}</p>
                                <p className="text-[10px] text-gray-500">{session.email}</p>
                            </div>
                            <form action={superAdminLogout}>
                                <button
                                    type="submit"
                                    className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition"
                                    title="Logout"
                                >
                                    <LogOut className="h-4 w-4" />
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main */}
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
            </main>
        </div>
    );
}
