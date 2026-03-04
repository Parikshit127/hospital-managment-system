'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard, Calendar, FileText, Activity, User
} from 'lucide-react';

interface BottomNavItem {
    label: string;
    href: string;
    icon: React.ReactNode;
}

const PATIENT_NAV: BottomNavItem[] = [
    { label: 'Home', href: '/patient/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
    { label: 'Appointments', href: '/patient/appointments/book', icon: <Calendar className="h-5 w-5" /> },
    { label: 'Records', href: '/patient/records', icon: <FileText className="h-5 w-5" /> },
    { label: 'Vitals', href: '/patient/vitals', icon: <Activity className="h-5 w-5" /> },
    { label: 'Profile', href: '/patient/profile', icon: <User className="h-5 w-5" /> },
];

interface BottomNavBarProps {
    role?: string;
}

export function BottomNavBar({ role = 'patient' }: BottomNavBarProps) {
    const pathname = usePathname();

    // Only show for patient portal on mobile
    if (role !== 'patient') return null;

    const navItems = PATIENT_NAV;

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
            <div className="flex items-center justify-around px-2 py-1">
                {navItems.map(item => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                        <Link key={item.href} href={item.href}
                            className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors min-w-[56px] ${
                                isActive
                                    ? 'text-teal-600'
                                    : 'text-gray-400 hover:text-gray-600'
                            }`}>
                            <span className={isActive ? 'text-teal-600' : 'text-gray-400'}>{item.icon}</span>
                            <span className={`text-[9px] font-bold ${isActive ? 'text-teal-600' : 'text-gray-400'}`}>
                                {item.label}
                            </span>
                            {isActive && (
                                <div className="absolute bottom-1 h-0.5 w-8 bg-teal-500 rounded-full" />
                            )}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
