'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { superAdminLogout } from '@/app/actions/superadmin-actions';
import {
    LayoutDashboard, Building2, Plus, LineChart, Users, Clock, CreditCard,
    ShieldCheck, LogOut, ChevronLeft, ChevronRight,
} from 'lucide-react';

const NAV_SECTIONS = [
    {
        title: 'Overview',
        items: [
            { label: 'Dashboard', href: '/superadmin', icon: LayoutDashboard },
        ],
    },
    {
        title: 'Tenants',
        items: [
            { label: 'Organizations', href: '/superadmin/organizations', icon: Building2 },
            { label: 'New Hospital', href: '/superadmin/organizations/new', icon: Plus },
        ],
    },
    {
        title: 'Platform',
        items: [
            { label: 'Analytics', href: '/superadmin/analytics', icon: LineChart },
            { label: 'Global Users', href: '/superadmin/users', icon: Users },
            { label: 'Audit Log', href: '/superadmin/audit-log', icon: Clock },
        ],
    },
    {
        title: 'Settings',
        items: [
            { label: 'Plans', href: '/superadmin/plans', icon: CreditCard },
        ],
    },
];

export default function SuperAdminSidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);

    const isActive = (href: string) => {
        if (href === '/superadmin') return pathname === href;
        return pathname.startsWith(href);
    };

    return (
        <aside className={`${collapsed ? 'w-[68px]' : 'w-[260px]'} flex flex-col bg-[#0c0f1a] border-r border-white/[0.06] transition-all duration-300 ease-out h-screen sticky top-0`}>
            {/* Brand */}
            <div className="flex items-center gap-3 px-4 h-[60px] border-b border-white/[0.06] shrink-0">
                <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-1.5 rounded-lg shrink-0 shadow-md shadow-violet-500/20">
                    <ShieldCheck className="h-5 w-5 text-white" />
                </div>
                {!collapsed && (
                    <div className="overflow-hidden">
                        <p className="text-[13px] font-bold text-white truncate tracking-tight">Hospital OS</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Platform Admin</p>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-5">
                {NAV_SECTIONS.map((section) => (
                    <div key={section.title}>
                        {!collapsed && (
                            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-semibold px-2.5 mb-1.5">
                                {section.title}
                            </p>
                        )}
                        <div className="space-y-0.5">
                            {section.items.map((item) => {
                                const Icon = item.icon;
                                const active = isActive(item.href);
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        title={collapsed ? item.label : undefined}
                                        className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-150 ${
                                            active
                                                ? 'bg-violet-500/15 text-violet-400'
                                                : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
                                        } ${collapsed ? 'justify-center px-2' : ''}`}
                                    >
                                        <Icon className={`h-4 w-4 shrink-0 ${active ? '' : 'opacity-70'}`} />
                                        {!collapsed && <span className="truncate">{item.label}</span>}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* Bottom: Logout + Collapse */}
            <div className="border-t border-white/[0.06] px-2.5 py-3 space-y-1 shrink-0">
                <form action={superAdminLogout}>
                    <button
                        type="submit"
                        title={collapsed ? 'Logout' : undefined}
                        className={`flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-lg text-[13px] font-medium text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-150 ${collapsed ? 'justify-center px-2' : ''}`}
                    >
                        <LogOut className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>Logout</span>}
                    </button>
                </form>
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className={`flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-lg text-[13px] font-medium text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all duration-150 ${collapsed ? 'justify-center px-2' : ''}`}
                >
                    {collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronLeft className="h-4 w-4 shrink-0" />}
                    {!collapsed && <span>Collapse</span>}
                </button>
            </div>
        </aside>
    );
}
