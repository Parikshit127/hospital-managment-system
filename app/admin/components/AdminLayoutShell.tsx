'use client';

import AdminSidebar from './AdminSidebar';
import Topbar from './Topbar';
import { AdminPortalContext } from './AdminPortalContext';

interface AdminLayoutShellProps {
    children: React.ReactNode;
    userName?: string;
    userRole?: string;
}

export default function AdminLayoutShell({ children, userName, userRole }: AdminLayoutShellProps) {
    return (
        <AdminPortalContext.Provider value={true}>
            <div className="flex h-screen" style={{ backgroundColor: 'var(--admin-bg)' }}>
                <AdminSidebar />
                <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                    <Topbar userName={userName} userRole={userRole} />
                    <main className="flex-1 overflow-y-auto">
                        <div className="max-w-[1360px] mx-auto px-5 sm:px-8 lg:px-10 py-8">
                            {children}
                        </div>
                    </main>
                </div>
            </div>
        </AdminPortalContext.Provider>
    );
}
