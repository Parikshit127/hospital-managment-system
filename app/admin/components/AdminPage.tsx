'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';

interface AdminPageProps {
    children: React.ReactNode;
    pageTitle?: string;
    pageIcon?: React.ReactNode;
    headerActions?: React.ReactNode;
    onRefresh?: () => void;
    refreshing?: boolean;
}

/**
 * Lightweight page wrapper for admin pages.
 * Replaces AppShell (which rendered an old sidebar) — the admin layout.tsx
 * already provides AdminLayoutShell with the new AdminSidebar.
 */
export function AdminPage({
    children,
    pageTitle,
    pageIcon,
    headerActions,
    onRefresh,
    refreshing,
}: AdminPageProps) {
    return (
        <div className="space-y-6">
            {pageTitle && (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                        {pageIcon && (
                            <div
                                className="p-2.5 rounded-xl text-white shadow-md"
                                style={{
                                    background: 'linear-gradient(135deg, var(--admin-primary), var(--admin-primary-dark))',
                                    boxShadow: '0 4px 12px var(--admin-primary-10)',
                                }}
                            >
                                {pageIcon}
                            </div>
                        )}
                        <div>
                            <h1 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--admin-text)' }}>
                                {pageTitle}
                            </h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {onRefresh && (
                            <button
                                onClick={onRefresh}
                                disabled={refreshing}
                                className="p-2 rounded-xl transition-all duration-200 disabled:opacity-50 hover:bg-gray-100 border border-transparent hover:border-gray-200"
                                style={{ color: 'var(--admin-text-muted)' }}
                            >
                                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                            </button>
                        )}
                        {headerActions}
                    </div>
                </div>
            )}
            {children}
        </div>
    );
}
