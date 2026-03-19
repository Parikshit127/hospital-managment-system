'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Home, Calendar, FlaskConical, CreditCard, MoreHorizontal,
    Pill, Heart, FileText, User, MessageSquare, X, Bell, Shield
} from 'lucide-react';

const PRIMARY_TABS = [
    { label: 'Home', href: '/patient/dashboard', icon: Home },
    { label: 'Appointments', href: '/patient/appointments', icon: Calendar },
    { label: 'Labs', href: '/patient/labs', icon: FlaskConical },
    { label: 'Payments', href: '/patient/payments', icon: CreditCard },
];

const MORE_ITEMS = [
    { label: 'Notifications', href: '/patient/notifications', icon: Bell },
    { label: 'Prescriptions', href: '/patient/prescriptions', icon: Pill },
    { label: 'My Vitals', href: '/patient/vitals', icon: Heart },
    { label: 'Medical Records', href: '/patient/records', icon: FileText },
    { label: 'My Profile', href: '/patient/profile', icon: User },
    { label: 'Feedback', href: '/patient/feedback', icon: MessageSquare },
    { label: 'Privacy', href: '/patient/settings/privacy', icon: Shield },
];

export function PatientBottomNav() {
    const pathname = usePathname();
    const [showMore, setShowMore] = useState(false);

    const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
    const isMoreActive = MORE_ITEMS.some(item => isActive(item.href));

    return (
        <>
            {/* More overlay sheet */}
            {showMore && (
                <div className="lg:hidden fixed inset-0 z-[60]" onClick={() => setShowMore(false)}>
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
                    <div
                        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl p-6 pb-8 animate-slide-up"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="font-bold text-gray-900 text-lg">More</h3>
                            <button
                                onClick={() => setShowMore(false)}
                                className="p-2 hover:bg-gray-100 rounded-xl transition"
                            >
                                <X className="h-5 w-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {MORE_ITEMS.map(item => {
                                const Icon = item.icon;
                                const active = isActive(item.href);
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setShowMore(false)}
                                        className={`flex flex-col items-center gap-2 p-4 rounded-2xl transition ${
                                            active
                                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                                : 'bg-gray-50 text-gray-600 hover:bg-emerald-50 hover:text-emerald-600 border border-transparent'
                                        }`}
                                    >
                                        <Icon className="h-6 w-6" />
                                        <span className="text-xs font-bold">{item.label}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom tab bar */}
            <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
                <div className="flex items-center justify-around px-1 py-1.5">
                    {PRIMARY_TABS.map(item => {
                        const Icon = item.icon;
                        const active = isActive(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[56px] ${
                                    active ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'
                                }`}
                            >
                                <Icon className={`h-5 w-5 ${active ? 'text-emerald-600' : ''}`} />
                                <span className={`text-[9px] font-bold ${active ? 'text-emerald-600' : ''}`}>
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                    {/* More button */}
                    <button
                        onClick={() => setShowMore(true)}
                        className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[56px] ${
                            isMoreActive ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'
                        }`}
                    >
                        <MoreHorizontal className="h-5 w-5" />
                        <span className="text-[9px] font-bold">More</span>
                    </button>
                </div>
            </nav>

            <style jsx global>{`
                @keyframes slide-up {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
                .animate-slide-up {
                    animation: slide-up 0.25s ease-out;
                }
                .safe-area-bottom {
                    padding-bottom: env(safe-area-inset-bottom, 0px);
                }
            `}</style>
        </>
    );
}
