'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useBranding } from './ThemeProvider';
import { logout } from '@/app/login/actions';
import { Building2, LogOut, ChevronLeft, ChevronRight, Menu, X, ChevronDown } from 'lucide-react';
import PortalSwitcher from './PortalSwitcher';
import { ADMIN_NAV_SECTIONS } from '@/lib/navigation/admin-nav';

export default function AdminSidebar() {
    const pathname = usePathname();
    const branding = useBranding();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

    useEffect(() => {
        const saved = window.localStorage.getItem('admin-sidebar-collapsed');
        if (saved === 'true') setCollapsed(true);
        const savedSections = window.localStorage.getItem('admin-sidebar-sections');
        if (savedSections) {
            try { setCollapsedSections(new Set(JSON.parse(savedSections))); } catch { /* ignore */ }
        }
    }, []);

    useEffect(() => {
        window.localStorage.setItem('admin-sidebar-collapsed', String(collapsed));
    }, [collapsed]);

    const toggleSection = (title: string) => {
        setCollapsedSections((prev) => {
            const next = new Set(prev);
            next.has(title) ? next.delete(title) : next.add(title);
            window.localStorage.setItem('admin-sidebar-sections', JSON.stringify([...next]));
            return next;
        });
    };

    const isActive = (href: string) => {
        if (href === '/admin/dashboard') return pathname === href || pathname === '/admin';
        if (href === '/admin/settings') return pathname === href;
        if (pathname.startsWith(href)) {
            const rest = pathname.slice(href.length);
            return rest === '' || rest.startsWith('/');
        }
        return false;
    };

    const sidebarContent = (
        <aside
            className={`${collapsed ? 'w-[68px]' : 'w-[260px]'} flex flex-col transition-all duration-300 ease-out h-screen sticky top-0 shrink-0`}
            style={{
                backgroundColor: 'var(--admin-sidebar-bg)',
                borderRight: '1px solid var(--admin-sidebar-border)',
            }}
        >
            {/* Brand */}
            <div
                className="flex items-center gap-3 px-4 h-[60px] shrink-0"
                style={{ borderBottom: '1px solid var(--admin-sidebar-border)' }}
            >
                {/* Axten logo */}
                {collapsed ? (
                    <div className="shrink-0 flex items-center justify-center w-9 h-9">
                        <svg width="36" height="36" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="26" cy="26" r="24" stroke="#ffffff" strokeWidth="2.5"/>
                            <circle cx="26" cy="26" r="19" stroke="#ffffff" strokeWidth="1"/>
                            <rect x="21" y="14" width="10" height="24" rx="2" stroke="#f97316" strokeWidth="2.5" fill="none"/>
                            <rect x="14" y="21" width="24" height="10" rx="2" stroke="#f97316" strokeWidth="2.5" fill="none"/>
                        </svg>
                    </div>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" style={{ height: '36px', width: 'auto', flexShrink: 0 }} aria-label="Axten Hospitals">
                        <text x="10" y="72" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="68" fill="#ffffff" letterSpacing="-2">Axten</text>
                        <rect x="10" y="80" width="60" height="8" fill="#f97316" rx="2"/>
                        <rect x="130" y="80" width="120" height="8" fill="#f97316" rx="2"/>
                        <text x="75" y="89" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="16" fill="#ffffff" letterSpacing="6">HOSPITALS</text>
                    </svg>
                )}
                {!collapsed && (
                    <div className="overflow-hidden">
                        <p className="text-[10px] text-gray-500 tracking-wider font-medium">ADMIN PANEL</p>
                    </div>
                )}
                <button
                    onClick={() => setMobileOpen(false)}
                    className="lg:hidden ml-auto p-1 text-gray-500 hover:text-gray-900 transition-colors"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-5">
                {ADMIN_NAV_SECTIONS.map((section) => {
                    const isSectionCollapsed = section.collapsible && collapsedSections.has(section.title);
                    return (
                        <div key={section.title}>
                            {!collapsed && (
                                section.collapsible ? (
                                    <button
                                        onClick={() => toggleSection(section.title)}
                                        className="flex items-center justify-between w-full px-2.5 mb-1.5 group"
                                    >
                                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-semibold group-hover:text-gray-200 transition-colors">
                                            {section.title}
                                        </p>
                                        <ChevronDown
                                            className={`h-3 w-3 text-gray-400 transition-transform duration-200 ${isSectionCollapsed ? '-rotate-90' : ''}`}
                                        />
                                    </button>
                                ) : (
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-semibold px-2.5 mb-1.5">
                                        {section.title}
                                    </p>
                                )
                            )}
                            {!isSectionCollapsed && (
                                <div className="space-y-0.5">
                                    {section.items.map((item) => {
                                        const Icon = item.icon;
                                        const active = isActive(item.href);
                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={() => setMobileOpen(false)}
                                                title={collapsed ? item.label : undefined}
                                                className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] transition-all duration-150 ${
                                                    active
                                                        ? 'font-semibold text-white'
                                                        : 'font-medium text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'
                                                } ${collapsed ? 'justify-center px-2' : ''}`}
                                                style={active ? {
                                                    backgroundColor: 'var(--admin-primary-20)',
                                                    color: 'var(--admin-primary-light)',
                                                } : undefined}
                                            >
                                                <Icon className={`h-[16px] w-[16px] shrink-0 ${active ? '' : 'opacity-70'}`} />
                                                {!collapsed && <span className="truncate">{item.label}</span>}
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            {/* Bottom: Portal Switcher + Logout + Collapse */}
            <div className="px-2.5 py-3 space-y-1 shrink-0" style={{ borderTop: '1px solid var(--admin-sidebar-border)' }}>
                <PortalSwitcher collapsed={collapsed} />
                <button
                    onClick={() => logout()}
                    title={collapsed ? 'Logout' : undefined}
                    className={`flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-lg text-[13px] font-medium text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-150 ${collapsed ? 'justify-center px-2' : ''}`}
                >
                    <LogOut className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>Logout</span>}
                </button>
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className={`hidden lg:flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-lg text-[13px] font-medium text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all duration-150 ${collapsed ? 'justify-center px-2' : ''}`}
                >
                    {collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronLeft className="h-4 w-4 shrink-0" />}
                    {!collapsed && <span>Collapse</span>}
                </button>
            </div>
        </aside>
    );

    return (
        <>
            {/* Mobile hamburger */}
            <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden fixed top-3 left-3 z-50 p-2 bg-white rounded-xl shadow-md border border-gray-200/60 text-gray-600 hover:bg-gray-50 transition-all"
            >
                <Menu className="h-5 w-5" />
            </button>

            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
                    onClick={() => setMobileOpen(false)}
                    style={{ animation: 'fadeIn 0.15s ease-out' }}
                />
            )}

            {/* Desktop: always visible */}
            <div className="hidden lg:block">
                {sidebarContent}
            </div>

            {/* Mobile: slide-in */}
            <div className={`lg:hidden fixed top-0 left-0 h-screen z-50 transition-transform duration-300 ease-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                {sidebarContent}
            </div>
        </>
    );
}
