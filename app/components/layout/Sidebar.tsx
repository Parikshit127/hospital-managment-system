'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/login/actions';
import {
    LayoutDashboard, Users, KeyRound, Stethoscope, UserPlus, Brain,
    FlaskConical, Pill, Bed, DollarSign, FileText, Activity, Menu, X,
    LogOut, HeartPulse, ClipboardList, ShieldCheck, ChevronLeft, Building2,
    CalendarDays, ListOrdered, MonitorPlay, CalendarClock,
    FileStack, UserCheck, BarChart3, Package, ShoppingCart, Truck, RotateCcw,
    BedDouble, UtensilsCrossed, ClipboardCheck, PieChart,
    Syringe, ScrollText, CalendarPlus, MessageSquare, Settings, LayoutGrid, Wallet, Undo2, CreditCard, Banknote,
    Clock, ArrowLeftRight, Briefcase, CalendarCheck, Timer
} from 'lucide-react';

interface NavItem {
    label: string;
    href: string;
    icon: React.ReactNode;
}

const NAV_BY_ROLE: Record<string, NavItem[]> = {
    admin: [
        { label: 'Dashboard', href: '/admin/dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
        { label: 'Departments', href: '/admin/departments', icon: <LayoutGrid className="h-4 w-4" /> },
        { label: 'Staff Management', href: '/admin/staff', icon: <Users className="h-4 w-4" /> },
        { label: 'OPD Overview', href: '/opd', icon: <ClipboardList className="h-4 w-4" /> },
        { label: 'Reception', href: '/reception', icon: <UserPlus className="h-4 w-4" /> },
        { label: 'Doctor Console', href: '/admin/doctors', icon: <Stethoscope className="h-4 w-4" /> },
        { label: 'Lab Orders', href: '/lab/technician', icon: <FlaskConical className="h-4 w-4" /> },
        { label: 'Pharmacy', href: '/pharmacy/billing', icon: <Pill className="h-4 w-4" /> },
        { label: 'IPD Management', href: '/ipd', icon: <Bed className="h-4 w-4" /> },
        { label: 'Finance', href: '/finance/dashboard', icon: <DollarSign className="h-4 w-4" /> },
        { label: 'Discharge', href: '/discharge/admin', icon: <FileText className="h-4 w-4" /> },
        { label: 'Reports Hub', href: '/admin/reports', icon: <BarChart3 className="h-4 w-4" /> },
        { label: 'Org Settings', href: '/admin/settings', icon: <Settings className="h-4 w-4" /> },
        { label: 'Branding', href: '/admin/settings/branding', icon: <Building2 className="h-4 w-4" /> },
        { label: 'Audit Log', href: '/admin/audit', icon: <Activity className="h-4 w-4" /> },
    ],
    doctor: [
        { label: 'My Patients', href: '/doctor/dashboard', icon: <Stethoscope className="h-4 w-4" /> },
        { label: 'Schedule', href: '/doctor/schedule', icon: <CalendarClock className="h-4 w-4" /> },
        { label: 'Templates', href: '/doctor/templates', icon: <FileStack className="h-4 w-4" /> },
        { label: 'Follow-Ups', href: '/doctor/follow-ups', icon: <UserCheck className="h-4 w-4" /> },
    ],
    receptionist: [
        { label: 'Patient List', href: '/reception', icon: <Users className="h-4 w-4" /> },
        { label: 'Register Patient', href: '/reception/register', icon: <UserPlus className="h-4 w-4" /> },
        { label: 'Appointments', href: '/reception/appointments', icon: <CalendarDays className="h-4 w-4" /> },
        { label: 'Queue Management', href: '/reception/queue', icon: <ListOrdered className="h-4 w-4" /> },
        { label: 'Token Display', href: '/reception/token-display', icon: <MonitorPlay className="h-4 w-4" /> },
        { label: 'AI Triage', href: '/reception/triage', icon: <Brain className="h-4 w-4" /> },
        { label: 'OPD Overview', href: '/opd', icon: <ClipboardList className="h-4 w-4" /> },
    ],
    lab_technician: [
        { label: 'Dashboard', href: '/lab/dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
        { label: 'Worklist', href: '/lab/worklist', icon: <ClipboardCheck className="h-4 w-4" /> },
        { label: 'Lab Orders', href: '/lab/technician', icon: <FlaskConical className="h-4 w-4" /> },
        { label: 'Inventory', href: '/lab/inventory', icon: <Package className="h-4 w-4" /> },
        { label: 'Reports', href: '/lab/reports', icon: <BarChart3 className="h-4 w-4" /> },
    ],
    pharmacist: [
        { label: 'Dashboard', href: '/pharmacy/dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
        { label: 'Orders', href: '/pharmacy/orders', icon: <ScrollText className="h-4 w-4" /> },
        { label: 'Dispensing', href: '/pharmacy/billing', icon: <Pill className="h-4 w-4" /> },
        { label: 'Inventory', href: '/pharmacy/inventory', icon: <Package className="h-4 w-4" /> },
        { label: 'Purchase Orders', href: '/pharmacy/purchase-orders', icon: <ShoppingCart className="h-4 w-4" /> },
        { label: 'Suppliers', href: '/pharmacy/suppliers', icon: <Truck className="h-4 w-4" /> },
        { label: 'Returns', href: '/pharmacy/returns', icon: <RotateCcw className="h-4 w-4" /> },
        { label: 'Reports', href: '/pharmacy/reports', icon: <BarChart3 className="h-4 w-4" /> },
    ],
    finance: [
        { label: 'Finance Dashboard', href: '/finance/dashboard', icon: <DollarSign className="h-4 w-4" /> },
        { label: 'All Invoices', href: '/finance/invoices', icon: <FileText className="h-4 w-4" /> },
        { label: 'Payment Ledger', href: '/finance/payments', icon: <CreditCard className="h-4 w-4" /> },
        { label: 'Cash Closure', href: '/finance/cash-closure', icon: <Wallet className="h-4 w-4" /> },
        { label: 'Refund Processing', href: '/finance/refunds', icon: <Undo2 className="h-4 w-4" /> },
        { label: 'TPA / Insurance', href: '/insurance', icon: <ShieldCheck className="h-4 w-4" /> },
        { label: 'Financial Reports', href: '/finance/reports', icon: <BarChart3 className="h-4 w-4" /> },
    ],
    ipd_manager: [
        { label: 'IPD Dashboard', href: '/ipd', icon: <Bed className="h-4 w-4" /> },
        { label: 'Bed Matrix', href: '/ipd/bed-matrix', icon: <BedDouble className="h-4 w-4" /> },
        { label: 'Transfer', href: '/ipd/transfer', icon: <RotateCcw className="h-4 w-4" /> },
        { label: 'Nursing Station', href: '/ipd/nursing-station', icon: <Syringe className="h-4 w-4" /> },
        { label: 'Diet Plans', href: '/ipd/diet', icon: <UtensilsCrossed className="h-4 w-4" /> },
        { label: 'Ward Rounds', href: '/ipd/ward-rounds', icon: <ClipboardCheck className="h-4 w-4" /> },
        { label: 'Census', href: '/ipd/census', icon: <PieChart className="h-4 w-4" /> },
        { label: 'Discharge', href: '/discharge/admin', icon: <FileText className="h-4 w-4" /> },
    ],
    patient: [
        { label: 'Patient Dashboard', href: '/patient/dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
        { label: 'My Profile', href: '/patient/profile', icon: <Users className="h-4 w-4" /> },
        { label: 'Book Appointment', href: '/patient/appointments/book', icon: <CalendarPlus className="h-4 w-4" /> },
        { label: 'Prescriptions', href: '/patient/prescriptions', icon: <Pill className="h-4 w-4" /> },
        { label: 'Medical Records', href: '/patient/records', icon: <FileText className="h-4 w-4" /> },
        { label: 'My Vitals', href: '/patient/vitals', icon: <Activity className="h-4 w-4" /> },
        { label: 'Provide Feedback', href: '/patient/feedback', icon: <MessageSquare className="h-4 w-4" /> },
    ],
    nurse: [
        { label: 'Dashboard', href: '/nurse/dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
        { label: 'My Patients', href: '/nurse/patients', icon: <Users className="h-4 w-4" /> },
        { label: 'Vitals', href: '/nurse/vitals', icon: <Activity className="h-4 w-4" /> },
        { label: 'Medications', href: '/nurse/medications', icon: <Syringe className="h-4 w-4" /> },
        { label: 'Tasks', href: '/nurse/tasks', icon: <ClipboardCheck className="h-4 w-4" /> },
        { label: 'Handover', href: '/nurse/handover', icon: <ArrowLeftRight className="h-4 w-4" /> },
    ],
    opd_manager: [
        { label: 'Dashboard', href: '/opd-manager/dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
        { label: 'Live Queues', href: '/opd-manager/queues', icon: <ListOrdered className="h-4 w-4" /> },
        { label: 'Doctors', href: '/opd-manager/doctors', icon: <Stethoscope className="h-4 w-4" /> },
        { label: 'Appointments', href: '/opd-manager/appointments', icon: <CalendarCheck className="h-4 w-4" /> },
        { label: 'Reports', href: '/opd-manager/reports', icon: <BarChart3 className="h-4 w-4" /> },
    ],
    hr: [
        { label: 'Dashboard', href: '/hr/dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
        { label: 'Employees', href: '/hr/employees', icon: <Briefcase className="h-4 w-4" /> },
        { label: 'Attendance', href: '/hr/attendance', icon: <Clock className="h-4 w-4" /> },
        { label: 'Leave', href: '/hr/leave', icon: <CalendarDays className="h-4 w-4" /> },
        { label: 'Shifts', href: '/hr/shifts', icon: <Timer className="h-4 w-4" /> },
        { label: 'Reports', href: '/hr/reports', icon: <BarChart3 className="h-4 w-4" /> },
    ],
};

interface SidebarProps {
    session: {
        id: string;
        username: string;
        role: string;
        name?: string;
        specialty?: string;
        organization_name?: string;
        organization_slug?: string;
    } | null;
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
        patient: 'Patient Portal',
        nurse: 'Nurse',
        opd_manager: 'OPD Manager',
        hr: 'HR Manager',
    };

    const orgName = session?.organization_name || 'Hospital OS';

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
                {/* Header — shows organization name */}
                <div className={`flex items-center gap-3 px-4 py-4 border-b border-white/10 ${collapsed ? 'justify-center' : ''}`}>
                    <div className="bg-gradient-to-br from-teal-500 to-emerald-600 p-2 rounded-xl shrink-0">
                        <HeartPulse className="h-5 w-5 text-white" />
                    </div>
                    {!collapsed && (
                        <div className="min-w-0">
                            <h1 className="text-sm font-black tracking-tight truncate">{orgName}</h1>
                            <p className="text-[10px] text-teal-400/80 flex items-center gap-1">
                                <Building2 className="h-2.5 w-2.5" />
                                Management System
                            </p>
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
                    <button
                        onClick={() => logout()}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/60 hover:bg-white/10 hover:text-white transition-all ${collapsed ? 'justify-center px-2' : ''}`}
                    >
                        <LogOut className="h-4 w-4" />
                        {!collapsed && <span>Logout</span>}
                    </button>
                </div>
            </aside>
        </>
    );
}
