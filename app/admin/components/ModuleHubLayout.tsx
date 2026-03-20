'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminPage } from './AdminPage';
import { Power, Loader2 } from 'lucide-react';
import { toggleModule, getModuleConfig } from '@/app/actions/module-config-actions';

interface Tab {
    key: string;
    label: string;
    icon: React.ElementType;
}

interface ModuleHubLayoutProps {
    moduleKey: string;
    moduleTitle: string;
    moduleDescription: string;
    moduleIcon: React.ReactNode;
    tabs: Tab[];
    activeTab: string;
    onTabChange: (tab: string) => void;
    onRefresh?: () => void;
    refreshing?: boolean;
    children: React.ReactNode;
}

function TabParamSync({ tabs, onTabChange }: { tabs: Tab[]; onTabChange: (tab: string) => void }) {
    const searchParams = useSearchParams();
    useEffect(() => {
        const tabParam = searchParams.get('tab');
        if (tabParam && tabs.some(t => t.key === tabParam)) {
            onTabChange(tabParam);
        }
    }, []);
    return null;
}

export function ModuleHubLayout({
    moduleKey,
    moduleTitle,
    moduleDescription,
    moduleIcon,
    tabs,
    activeTab,
    onTabChange,
    onRefresh,
    refreshing,
    children,
}: ModuleHubLayoutProps) {
    const [enabled, setEnabled] = useState(true);
    const [toggling, setToggling] = useState(false);

    // Load module enabled state
    useEffect(() => {
        getModuleConfig(moduleKey).then(res => {
            if (res.success && res.data) {
                setEnabled(res.data.enabled !== false);
            }
        }).catch(() => {});
    }, [moduleKey]);

    const handleToggle = async () => {
        setToggling(true);
        try {
            const res = await toggleModule(moduleKey, !enabled);
            if (res.success) setEnabled(!enabled);
        } catch {}
        setToggling(false);
    };

    const headerActions = (
        <button
            onClick={handleToggle}
            disabled={toggling}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                enabled
                    ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                    : 'text-gray-500 bg-gray-100 border border-gray-200 hover:bg-gray-200'
            }`}
        >
            <Power className="h-3.5 w-3.5" />
            {enabled ? 'Enabled' : 'Disabled'}
        </button>
    );

    return (
        <AdminPage
            pageTitle={moduleTitle}
            pageIcon={moduleIcon}
            onRefresh={onRefresh}
            refreshing={refreshing}
            headerActions={headerActions}
        >
            {/* Sync ?tab= query param */}
            <Suspense fallback={null}>
                <TabParamSync tabs={tabs} onTabChange={onTabChange} />
            </Suspense>

            {/* Module description */}
            <p className="text-sm -mt-4 mb-4" style={{ color: 'var(--admin-text-muted)' }}>
                {moduleDescription}
            </p>

            {/* Tab bar */}
            <div
                className="flex items-center gap-1 border-b mb-6"
                style={{ borderColor: 'var(--admin-border-light)' }}
            >
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => onTabChange(tab.key)}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors relative ${
                                isActive ? '' : 'hover:opacity-80'
                            }`}
                            style={{
                                color: isActive ? 'var(--admin-primary)' : 'var(--admin-text-muted)',
                                borderBottom: isActive ? '2px solid var(--admin-primary)' : '2px solid transparent',
                                marginBottom: '-1px',
                            }}
                        >
                            <Icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab content */}
            {children}
        </AdminPage>
    );
}
