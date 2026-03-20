'use client';

import { usePathname } from 'next/navigation';
import SuperAdminSidebar from './SuperAdminSidebar';

export default function SuperAdminLayoutShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLogin = pathname === '/superadmin/login';

    if (isLogin) {
        return <>{children}</>;
    }

    return (
        <div className="flex h-screen">
            <SuperAdminSidebar />
            <main className="flex-1 overflow-y-auto">
                <div className="max-w-[1360px] mx-auto px-5 sm:px-8 lg:px-10 py-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
