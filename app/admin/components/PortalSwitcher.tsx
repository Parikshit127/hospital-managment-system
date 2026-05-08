'use client';

import { useState, useRef, useEffect } from 'react';
import { ExternalLink, ChevronDown, ChevronRight, Loader2, LayoutGrid, X, LogIn } from 'lucide-react';

const PORTALS = [
    { role: 'doctor',           label: 'Doctor',          color: 'bg-blue-500',    dot: 'bg-blue-400',    path: '/doctor/dashboard' },
    { role: 'receptionist',     label: 'Reception',       color: 'bg-teal-500',    dot: 'bg-teal-400',    path: '/reception' },
    { role: 'nurse',            label: 'Nurse',           color: 'bg-pink-500',    dot: 'bg-pink-400',    path: '/nurse/dashboard' },
    { role: 'ipd_manager',      label: 'IPD Manager',     color: 'bg-purple-500',  dot: 'bg-purple-400',  path: '/ipd' },
    { role: 'opd_manager',      label: 'OPD Manager',     color: 'bg-indigo-500',  dot: 'bg-indigo-400',  path: '/opd-manager/dashboard' },
    { role: 'lab_technician',   label: 'Lab',             color: 'bg-amber-500',   dot: 'bg-amber-400',   path: '/lab/technician' },
    { role: 'pharmacist',       label: 'Pharmacy',        color: 'bg-orange-500',  dot: 'bg-orange-400',  path: '/pharmacy/billing' },
    { role: 'finance',          label: 'Finance',         color: 'bg-green-500',   dot: 'bg-green-400',   path: '/finance/dashboard' },
    { role: 'hr',               label: 'HR',              color: 'bg-rose-500',    dot: 'bg-rose-400',    path: '/hr/dashboard' },
    { role: 'coordinator',      label: 'Coordinator',     color: 'bg-cyan-500',    dot: 'bg-cyan-400',    path: '/doctor/pending-approvals' },
];

type StaffUser = {
    id: string;
    name: string | null;
    username: string;
    role: string;
    is_active: boolean;
};

async function fetchStaffByRole(role: string): Promise<StaffUser[]> {
    const res = await fetch(`/api/admin/portal-users?role=${encodeURIComponent(role)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.users || [];
}

export default function PortalSwitcher({ collapsed }: { collapsed: boolean }) {
    const [open, setOpen] = useState(false);
    const [expandedRole, setExpandedRole] = useState<string | null>(null);
    const [users, setUsers] = useState<Record<string, StaffUser[]>>({});
    const [loadingRole, setLoadingRole] = useState<string | null>(null);
    const [impersonating, setImpersonating] = useState<string | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
                setExpandedRole(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleRoleClick = async (role: string) => {
        if (expandedRole === role) { setExpandedRole(null); return; }
        setExpandedRole(role);
        if (!users[role]) {
            setLoadingRole(role);
            const fetched = await fetchStaffByRole(role);
            setUsers(prev => ({ ...prev, [role]: fetched }));
            setLoadingRole(null);
        }
    };

    // Impersonate a specific user — sets their session and opens portal in new tab
    const handleImpersonate = async (userId: string) => {
        setImpersonating(userId);
        try {
            const res = await fetch('/api/admin/impersonate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId }),
            });
            const data = await res.json();
            if (data.success) {
                // Open the portal in a new tab — session cookie is already set
                window.open(data.redirect_url, '_blank');
                setOpen(false);
                setExpandedRole(null);
            } else {
                alert(data.error || 'Failed to access portal');
            }
        } catch {
            alert('Something went wrong');
        }
        setImpersonating(null);
    };

    // Open portal directly without impersonating a specific user
    const handleOpenPortal = (path: string) => {
        window.open(path, '_blank');
        setOpen(false);
        setExpandedRole(null);
    };

    return (
        <div ref={ref} className="relative">
            {/* Trigger Button */}
            <button
                onClick={() => { setOpen(!open); setExpandedRole(null); }}
                title={collapsed ? 'Portal Access' : undefined}
                className={`flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-150 text-gray-300 hover:text-white hover:bg-white/[0.08] ${collapsed ? 'justify-center px-2' : ''}`}
            >
                <LayoutGrid className="h-[16px] w-[16px] shrink-0 text-blue-400" />
                {!collapsed && (
                    <>
                        <span className="truncate flex-1 text-left">Portal Access</span>
                        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </>
                )}
            </button>

            {/* Dropdown Panel */}
            {open && (
                <div
                    className="absolute z-[999] bottom-full mb-2 left-0 w-72 rounded-xl shadow-2xl border border-white/10 overflow-hidden"
                    style={{ backgroundColor: '#1a1f2e' }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                        <div className="flex items-center gap-2">
                            <LayoutGrid className="w-4 h-4 text-blue-400" />
                            <span className="text-sm font-semibold text-white">Portal Access</span>
                        </div>
                        <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <p className="px-4 py-2 text-[11px] text-gray-500 border-b border-white/5">
                        Click a user to log in as them — no password required
                    </p>

                    {/* Portal List */}
                    <div className="max-h-[400px] overflow-y-auto py-1.5">
                        {PORTALS.map(portal => (
                            <div key={portal.role}>
                                {/* Role Row */}
                                <button
                                    onClick={() => handleRoleClick(portal.role)}
                                    className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-white/[0.05] transition-colors group"
                                >
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${portal.dot}`} />
                                    <span className="flex-1 text-left text-sm text-gray-200 group-hover:text-white font-medium">
                                        {portal.label}
                                    </span>
                                    {loadingRole === portal.role ? (
                                        <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                                    ) : (
                                        <ChevronRight className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-150 ${expandedRole === portal.role ? 'rotate-90' : ''}`} />
                                    )}
                                </button>

                                {/* Users Sub-list */}
                                {expandedRole === portal.role && (
                                    <div className="border-t border-b border-white/[0.06]" style={{ backgroundColor: '#141824' }}>

                                        {/* No users registered */}
                                        {users[portal.role]?.length === 0 && (
                                            <>
                                                <p className="px-6 py-2 text-xs text-gray-500 italic">
                                                    No {portal.label.toLowerCase()}s registered
                                                </p>
                                                <button
                                                    onClick={() => handleOpenPortal(portal.path)}
                                                    className="flex items-center gap-2 w-full px-6 py-2 hover:bg-white/[0.05] transition-colors group"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                                    <span className="text-xs text-blue-300 group-hover:text-blue-200">
                                                        Open {portal.label} Portal
                                                    </span>
                                                </button>
                                            </>
                                        )}

                                        {/* Registered users */}
                                        {users[portal.role]?.map(user => (
                                            <button
                                                key={user.id}
                                                onClick={() => user.is_active && handleImpersonate(user.id)}
                                                disabled={!user.is_active || impersonating === user.id}
                                                className={`flex items-center gap-3 w-full px-5 py-2.5 transition-colors group ${
                                                    user.is_active
                                                        ? 'hover:bg-white/[0.06] cursor-pointer'
                                                        : 'opacity-40 cursor-not-allowed'
                                                }`}
                                            >
                                                {/* Avatar */}
                                                <div className={`w-7 h-7 rounded-full ${portal.color} flex items-center justify-center shrink-0 text-white font-bold text-[11px]`}>
                                                    {(user.name || user.username).charAt(0).toUpperCase()}
                                                </div>

                                                {/* Name */}
                                                <div className="flex-1 text-left min-w-0">
                                                    <p className="text-xs text-gray-200 group-hover:text-white font-medium truncate">
                                                        {user.name || user.username}
                                                    </p>
                                                    <p className="text-[10px] text-gray-500 truncate">@{user.username}</p>
                                                </div>

                                                {/* Status / Loading */}
                                                {impersonating === user.id ? (
                                                    <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
                                                ) : !user.is_active ? (
                                                    <span className="text-[10px] text-red-400 shrink-0">Inactive</span>
                                                ) : (
                                                    <LogIn className="w-3.5 h-3.5 text-gray-500 group-hover:text-blue-400 shrink-0 transition-colors" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-2.5 border-t border-white/10 bg-black/20">
                        <p className="text-[10px] text-gray-500 text-center">
                            Session opens in a new tab · Audit logged
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
