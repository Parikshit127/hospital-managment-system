import {
    Activity, Calendar, FlaskConical, CreditCard, LogOut,
    Pill, Heart, FileText, User, MessageSquare, MoreHorizontal, Home
} from 'lucide-react';
import { getPatientSession, patientLogout } from './login/actions';
import Link from 'next/link';
import { PatientBottomNav } from './PatientBottomNav';

export default async function PatientLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getPatientSession();

    if (!session) {
        return <>{children}</>;
    }

    const primaryNav = [
        { label: 'Dashboard', href: '/patient/dashboard', icon: Home },
        { label: 'Appointments', href: '/patient/appointments', icon: Calendar },
        { label: 'Lab Results', href: '/patient/labs', icon: FlaskConical },
        { label: 'Prescriptions', href: '/patient/prescriptions', icon: Pill },
        { label: 'Payments', href: '/patient/payments', icon: CreditCard },
    ];

    const moreNav = [
        { label: 'My Vitals', href: '/patient/vitals', icon: Heart },
        { label: 'Medical Records', href: '/patient/records', icon: FileText },
        { label: 'My Profile', href: '/patient/profile', icon: User },
        { label: 'Feedback', href: '/patient/feedback', icon: MessageSquare },
    ];

    return (
        <div className="min-h-screen bg-[#f8fbf9] font-sans">
            {/* Header */}
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-6">
                            <Link href="/patient/dashboard" className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                                    <Activity className="h-5 w-5" />
                                </div>
                                <div>
                                    <h1 className="font-bold text-gray-900 text-lg leading-none tracking-tight">
                                        {session.organization_name || 'Hospital OS'}
                                    </h1>
                                    <span className="text-[10px] font-bold tracking-widest text-emerald-500 uppercase">
                                        Patient Portal
                                    </span>
                                </div>
                            </Link>

                            {/* Desktop Nav */}
                            <nav className="hidden lg:flex items-center gap-1">
                                {primaryNav.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                        >
                                            <Icon className="h-4 w-4" />
                                            {item.label}
                                        </Link>
                                    );
                                })}
                                {/* More dropdown */}
                                <div className="relative group">
                                    <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition">
                                        <MoreHorizontal className="h-4 w-4" />
                                        More
                                    </button>
                                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl py-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                                        {moreNav.map((item) => {
                                            const Icon = item.icon;
                                            return (
                                                <Link
                                                    key={item.href}
                                                    href={item.href}
                                                    className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 transition"
                                                >
                                                    <Icon className="h-4 w-4" />
                                                    {item.label}
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            </nav>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-semibold text-gray-900 leading-none">{session.name}</p>
                                <p className="text-xs text-gray-500 mt-1">{session.id}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-sm">
                                {session.name?.substring(0, 2).toUpperCase()}
                            </div>
                            <form action={patientLogout}>
                                <button className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Sign Out">
                                    <LogOut className="h-4 w-4" />
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </header>

            <main className="py-8 pb-24 lg:pb-8">
                {children}
            </main>

            {/* Mobile bottom tab bar */}
            <PatientBottomNav />
        </div>
    );
}
