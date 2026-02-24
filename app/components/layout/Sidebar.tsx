'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard, Users, Shield, KeyRound, Stethoscope, UserPlus, Brain,
    FlaskConical, Pill, Bed, DollarSign, FileText, Activity, Menu, X,
    LogOut, HeartPulse, ClipboardList, ShieldCheck, ChevronLeft
} from 'lucide-react';

interface NavItem {
    label: string;
    href: string;
    icon: React.ReactNode;
}

const NAV_BY_ROLE: Record<string, NavItem[]> = {
    admin: [
        { label: 'Dashboard', href: '/admin/dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
        { label: 'OPD Overview', href: '/opd', icon: <ClipboardList className="h-4 w-4" /> },
        { label: 'Reception', href: '/reception', icon: <UserPlus className="h-4 w-4" /> },
        { label: 'Doctor Console', href: '/doctor/dashboard', icon: <Stethoscope className="h-4 w-4" /> },
        { label: 'Lab Orders', href: '/lab/technician', icon: <FlaskConical className="h-4 w-4" /> },
        { label: 'Pharmacy', href: '/pharmacy/billing', icon: <Pill className="h-4 w-4" /> },
        { label: 'IPD Management', href: '/ipd', icon: <Bed className="h-4 w-4" /> },
        { label: 'Finance', href: '/finance/dashboard', icon: <DollarSign className="h-4 w-4" /> },
        { label: 'Insurance', href: '/insurance', icon: <ShieldCheck className="h-4 w-4" /> },
        { label: 'Discharge', href: '/discharge/admin', icon: <FileText className="h-4 w-4" /> },
        { label: 'Audit Log', href: '/admin/audit', icon: <Activity className="h-4 w-4" /> },
        { label: 'MFA Setup', href: '/admin/mfa-setup', icon: <KeyRound className="h-4 w-4" /> },
    ],
    doctor: [
        { label: 'My Patients', href: '/doctor/dashboard', icon: <Stethoscope className="h-4 w-4" /> },
    ],
    receptionist: [
        { label: 'Patient List', href: '/reception', icon: <Users className="h-4 w-4" /> },
        { label: 'Register Patient', href: '/reception/register', icon: <UserPlus className="h-4 w-4" /> },
        { label: 'AI Triage', href: '/reception/triage', icon: <Brain className="h-4 w-4" /> },
        { label: 'OPD Overview', href: '/opd', icon: <ClipboardList className="h-4 w-4" /> },
    ],
    lab_technician: [
        { label: 'Lab Orders', href: '/lab/technician', icon: <FlaskConical className="h-4 w-4" /> },
    ],
    pharmacist: [
        { label: 'Pharmacy', href: '/pharmacy/billing', icon: <Pill className="h-4 w-4" /> },
    ],
    finance: [
        { label: 'Finance Dashboard', href: '/finance/dashboard', icon: <DollarSign className="h-4 w-4" /> },
        { label: 'Insurance', href: '/insurance', icon: <ShieldCheck className="h-4 w-4" /> },
    ],
    ipd_manager: [
        { label: 'IPD Dashboard', href: '/ipd', icon: <Bed className="h-4 w-4" /> },
        { label: 'Bed Matrix', href: '/ipd/bed-matrix', icon: <LayoutDashboard className="h-4 w-4" /> },
        { label: 'Discharge', href: '/discharge/admin', icon: <FileText className="h-4 w-4" /> },
    ],
};

interface SidebarProps {
    session: { id: string; username: string; role: string; name?: string; specialty?: string } | null;
}

export function Sidebar({ session }: SidebarProps) {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    const navItems = session ? NAV_BY_ROLE[session.role] || [] : [];

    const roleLabelMap: Record<string, string> = {
        admin: 'Administrator',
        doctor: 'Doctor',
        receptionist: 'Receptionist',
        lab_technician: 'Lab Technician',
        pharmacist: 'Pharmacist',
        finance: 'Finance',
        ipd_manager: 'IPD Manager',
    };

    return (
        <>
            {/* Mobile hamburger */}
            <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden fixed top-3 left-3 z-50 p-2 bg-white rounded-lg shadow-md border border-gray-200 text-gray-600"
            >
                <Menu className="h-5 w-5" />
            </button>

            {/* Mobile overlay */}
            {mobileOpen && (
                <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} />
            )}

            {/* Sidebar */}
            <aside
                className={`fixed top-0 left-0 h-screen bg-[var(--ink)] text-white z-50 flex flex-col transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'
                    } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
            >
                {/* Header */}
                <div className={`flex items-center gap-3 px-4 py-4 border-b border-white/10 ${collapsed ? 'justify-center' : ''}`}>
                    <div className="bg-gradient-to-br from-teal-500 to-emerald-600 p-2 rounded-xl shrink-0">
                        <HeartPulse className="h-5 w-5 text-white" />
                    </div>
                    {!collapsed && (
                        <div className="min-w-0">
                            <h1 className="text-sm font-black tracking-tight truncate">Hospital OS</h1>
                            <p className="text-[10px] text-teal-400/80">Management System</p>
                        </div>
                    )}
                    <button
                        onClick={() => { setCollapsed(!collapsed); setMobileOpen(false); }}
                        className={`p-1 rounded hover:bg-white/10 text-white/50 transition-colors ${collapsed ? 'mx-auto mt-2' : 'ml-auto'} hidden lg:block`}
                    >
                        <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
                    </button>
                    <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1 text-slate-400">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive
                                        ? 'bg-teal-500/20 text-teal-400'
                                        : 'text-white/60 hover:bg-white/5 hover:text-white'
                                    } ${collapsed ? 'justify-center px-2' : ''}`}
                                title={collapsed ? item.label : undefined}
                            >
                                <span className={isActive ? 'text-teal-400' : 'text-white/50'}>{item.icon}</span>
                                {!collapsed && <span className="truncate">{item.label}</span>}
                            </Link>
                        );
                    })}
                </nav>

                {/* User info + Logout */}
                <div className={`border-t border-white/10 px-3 py-3 ${collapsed ? 'text-center' : ''}`}>
                    {!collapsed && session && (
                        <div className="mb-2">
                            <p className="text-xs font-bold text-white truncate">{session.name || session.username}</p>
                            <p className="text-[10px] text-white/50">{roleLabelMap[session.role] || session.role}</p>
                            {session.specialty && (
                                <p className="text-[10px] text-teal-400">{session.specialty}</p>
                            )}
                        </div>
                    )}
                    <Link
                        href="/login"
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/60 hover:bg-white/10 hover:text-white transition-all ${collapsed ? 'justify-center px-2' : ''}`}
                    >
                        <LogOut className="h-4 w-4" />
                        {!collapsed && <span>Logout</span>}
                    </Link>
                </div>
            </aside>
        </>
    );
}
