'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LifeBuoy, Plus, BookOpen, Bell, LayoutDashboard } from 'lucide-react';
import { HELP_CENTER_TABS, helpCenterTabHref, normalizeTab, type HelpCenterTab } from '@/app/help-center/routes';
import { TicketTable } from './TicketTable';
import { RaiseTicketForm } from './RaiseTicketForm';
import { ReleaseNotesPanel } from './ReleaseNotesPanel';
import { NotificationsPanel } from './NotificationsPanel';

// Consolidated Help Center — a single tabbed page (PRD v3 Addendum §4) that
// relocates the four v2 §3.2 tabs (Track Status, Raise Ticket, Release Notes,
// Notifications) behind one route. The active tab is URL-driven (?tab=…) so tab
// switches are shareable/deep-linkable and the legacy sub-route redirect aliases
// can point straight at a tab.

const TAB_META: Record<HelpCenterTab, { label: string; icon: React.ReactNode }> = {
    'track': { label: 'Track Status', icon: <LifeBuoy className="h-4 w-4" /> },
    'raise': { label: 'Raise Ticket', icon: <Plus className="h-4 w-4" /> },
    'release-notes': { label: 'Release Notes', icon: <BookOpen className="h-4 w-4" /> },
    'notifications': { label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
};

export function HelpCenterTabs({ userId, dashboardHref }: { userId: string; dashboardHref: string }) {
    const searchParams = useSearchParams();
    const activeTab = normalizeTab(searchParams.get('tab'));

    return (
        <div className="flex flex-col min-h-screen bg-[var(--background)]">
            {/* Tab bar */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex h-12 items-center justify-between gap-4">
                        <div className="flex h-full gap-6 overflow-x-auto">
                            {HELP_CENTER_TABS.map((tab) => {
                                const active = tab === activeTab;
                                return (
                                    <Link
                                        key={tab}
                                        href={helpCenterTabHref(tab)}
                                        scroll={false}
                                        aria-current={active ? 'page' : undefined}
                                        className={`inline-flex items-center gap-2 border-b-2 px-1 text-sm font-medium whitespace-nowrap transition-colors ${
                                            active
                                                ? 'border-primary-500 text-primary-600'
                                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                        }`}
                                    >
                                        {TAB_META[tab].icon}
                                        {TAB_META[tab].label}
                                    </Link>
                                );
                            })}
                        </div>

                        {/* Standalone page (no app sidebar) — give users a way back to their dashboard. */}
                        <Link
                            href={dashboardHref}
                            className="inline-flex items-center gap-1.5 shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                        >
                            <LayoutDashboard className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Go to Dashboard</span>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Active panel */}
            <div className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
                {activeTab === 'track' && <TicketTable userId={userId} />}
                {activeTab === 'raise' && <RaiseTicketForm />}
                {activeTab === 'release-notes' && <ReleaseNotesPanel />}
                {activeTab === 'notifications' && <NotificationsPanel userId={userId} />}
            </div>
        </div>
    );
}
