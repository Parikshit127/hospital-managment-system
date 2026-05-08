'use client';

import { useState, useRef, useEffect } from 'react';
import { ExternalLink, ChevronDown, ChevronRight, Loader2, LayoutGrid, X } from 'lucide-react';

// Portal definitions — role → label, path, color
const PORTALS = [
    { role: 'doctor',           label: 'Doctor',          path: '/doctor/dashboard',         color: 'bg-blue-500',    dot: 'bg-blue-400' },
    { role: 'receptionist',     label: 'Reception',       path: '/reception/dashboard',      color: 'bg-teal-500',    dot: 'bg-teal-400' },
    { role: 'nurse',            label: 'Nurse',           path: '/nurse/dashboard',          color: 'bg-pink-500',    dot: 'bg-pink-400' },
    { role: 'ipd_manager',      label: 'IPD Manager',     path: '/ipd',                      color: 'bg-purple-500',  dot: 'bg-purple-400' },
    { role: 'opd_manager',      label: 'OPD Manager',     path: '/opd-manager/dashboard',    color: 'bg-indigo-500',  dot: 'bg-indigo-400' },
    { role: 'lab_technician',   label: 'Lab',             path: '/lab/dashboard',            color: 'bg-amber-500',   dot: 'bg-amber-400' },
    { role: 'pharmacist',       label: 'Pharmacy',        path: '/pharmacy/dashboard',       color: 'bg-orange-500',  dot: 'bg-orange-400' },
    { role: 'finance',          label: 'Finance',         path: '/finance/dashboard',        color: 'bg-green-500',   dot: 'bg-green-400' },
    { role: 'hr',               label: 'HR',              path: '/hr/dashboard',             color: 'bg-rose-500',    dot: 'bg-rose-400' },
    { role: 'coordinator',      label: 'Coordinator',     path: '/doctor/pending-approvals', color: 'bg-cyan-500',    dot: 'bg-cyan-400' },
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
    const [loading, setLoading] = useState<string | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    // Close on outside click
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
        if (expandedRole === role) {
            setExpandedRole(null);
            return;
        }
        setExpandedRole(role);
        if (!users[role]) {
            setLoading(role);
            const fetched = await fetchStaffByRole(role);
            setUsers(prev => ({ ...prev, [role]: fetched }));
            setLoading(null);
        }
    };

    const openPortal = (path: string) => {
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
                    style={{ backgroundColor: '#1e2433' }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                        <div className="flex items-center gap-2">
                            <LayoutGrid className="w-4 h-4 text-blue-400" />
                            <span className="text-sm font-semibold text-white">Portal Access</span>
                        </div>
                        <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Portal List */}
                    <div className="max-h-[420px] overflow-y-auto py-2">
                        {PORTALS.map(portal => (
                            <div key={portal.role}>
                                {/* Role Row */}
                                <button
                                    onClick={() => handleRoleClick(portal.role)}
                                    className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-white/[0.06] transition-colors group"
                                >
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${portal.dot}`} />
                                    <span className="flex-1 text-left text-sm text-gray-200 group-hover:text-white font-medium">
                                        {portal.label}
                                    </span>
                                    {loading === portal.role ? (
                                        <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                                    ) : (
                                        <ChevronRight className={`w-3.5 h-3.5 text-gray-500 transition-transform ${expandedRole === portal.role ? 'rotate-90' : ''}`} />
                                    )}
                                </button>

                                {/* Users Sub-list */}
                                {expandedRole === portal.role && (
                                    <div className="bg-black/20 border-t border-b border-white/5">
                                        {/* Open portal directly (no user) */}
                                        <button
                                            onClick={() => openPortal(portal.path)}
                                            className="flex items-center gap-3 w-full px-6 py-2 hover:bg-white/[0.06] transition-colors group"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                            <span className="text-xs text-blue-300 group-hover:text-blue-200">
                                                Open {portal.label} Portal
                                            </span>
                                        </button>

                                        {/* Registered users */}
                                        {users[portal.role]?.length === 0 ? (
                                            <p className="px-6 py-2 text-xs text-gray-500 italic">No {portal.label.toLowerCase()}s registered</p>
                                        ) : (
                                            users[portal.role]?.map(user => (
                                                <button
                                                    key={user.id}
                                                    onClick={() => openPortal(`${portal.path}?user_id=${user.id}`)}
                                                    className="flex items-center gap-3 w-full px-6 py-2 hover:bg-white/[0.06] transition-colors group"
                                                >
                                                    <div className={`w-6 h-6 rounded-full ${portal.color} flex items-center justify-center shrink-0`}>
                                                        <span className="text-[10px] font-bold text-white">
                                                            {(user.name || user.username).charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 text-left min-w-0">
                                                        <p className="text-xs text-gray-200 group-hover:text-white font-medium truncate">
                                                            {user.name || user.username}
                                                        </p>
                                                        <p className="text-[10px] text-gray-500 truncate">@{user.username}</p>
                                                    </div>
                                                    {!user.is_active && (
                                                        <span className="text-[10px] text-red-400 shrink-0">Inactive</span>
                                                    )}
                                                    <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-gray-300 shrink-0" />
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-2.5 border-t border-white/10">
                        <p className="text-[10px] text-gray-500 text-center">Opens portal in a new tab</p>
                    </div>
                </div>
            )}
        </div>
    );
}
