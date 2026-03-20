'use client';

import AdminSidebar from './AdminSidebar';

export default function AdminLayoutShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-screen" style={{ backgroundColor: 'var(--admin-bg)' }}>
            <AdminSidebar />
            <main className="flex-1 overflow-y-auto">
                <div className="max-w-[1360px] mx-auto px-5 sm:px-8 lg:px-10 py-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
