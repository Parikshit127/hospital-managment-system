import { Activity, Calendar, FlaskConical, CreditCard, Home, LogOut } from 'lucide-react';
import { getPatientSession, patientLogout } from './login/actions';
import Link from 'next/link';

export default async function PatientLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getPatientSession();

    // No session — render children raw (login page handles its own UI)
    if (!session) {
        return <>{children}</>;
    }

    const navItems = [
        { label: 'Dashboard', href: '/patient/dashboard', icon: Home },
        { label: 'Appointments', href: '/patient/appointments', icon: Calendar },
        { label: 'Lab Results', href: '/patient/labs', icon: FlaskConical },
        { label: 'Payments', href: '/patient/payments', icon: CreditCard },
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

                            <nav className="hidden md:flex items-center gap-1">
                                {navItems.map((item) => {
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

            {/* Mobile Nav */}
            <nav className="md:hidden bg-white border-b border-gray-100 px-4 py-2 flex gap-1 overflow-x-auto">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition whitespace-nowrap"
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            <main className="py-8">
                {children}
            </main>
        </div>
    );
}
