'use client';

import AdminSidebar from './AdminSidebar';
import Topbar from './Topbar';
import { AdminPortalContext } from './AdminPortalContext';

interface AdminLayoutShellProps {
    children: React.ReactNode;
    userName?: string;
    userRole?: string;
    userId?: string;
    organizationId?: string;
}

export default function AdminLayoutShell({ children, userName, userRole, userId, organizationId }: AdminLayoutShellProps) {
    return (
        <AdminPortalContext.Provider value={true}>
            <div
                className="flex h-screen relative print:block print:h-auto print:overflow-visible"
                style={{ backgroundColor: 'var(--admin-bg)' }}
            >
                {/* Global Ambient Background — decorative, never printed */}
                <div className="blob b1 print:hidden" />
                <div className="blob b2 print:hidden" />
                <div className="blob b3 print:hidden" />
                <div className="grid-bg print:hidden" />

                {/* Sidebar + topbar are web chrome — hidden when printing */}
                <div className="contents print:hidden">
                    <AdminSidebar />
                </div>
                <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative z-10 print:overflow-visible">
                    <div className="print:hidden">
                        <Topbar userName={userName} userRole={userRole} userId={userId} organizationId={organizationId} />
                    </div>
                    <main className="flex-1 overflow-y-auto print:overflow-visible">
                        <div className="max-w-[1360px] mx-auto px-5 sm:px-8 lg:px-10 py-8 print:max-w-none print:p-0">
                            {children}
                        </div>
                    </main>
                </div>
            </div>
        </AdminPortalContext.Provider>
    );
}
