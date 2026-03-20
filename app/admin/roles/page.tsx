'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ShieldCheck, Plus, Loader2, Lock, Copy, Trash2, ArrowLeft,
    CheckSquare, Square, Users, Globe, Building2, User, Layers,
    Save, X, Sprout, ChevronDown, ChevronRight, Search, ToggleLeft,
    ToggleRight, Pencil, ShieldAlert, Eye, FileText, Settings2
} from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import {
    listRoles,
    createRole,
    updateRole,
    deleteRole,
    getPermissionMatrix,
    seedSystemRoles,
    cloneRole,
} from '@/app/actions/role-actions';

/* ─── Types ─── */
interface Permission {
    key: string;
    module: string;
    action: string;
    label: string;
}

interface Role {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    is_system: boolean;
    is_active: boolean;
    permissions: string[];
    data_scope: string;
    user_count: number;
}

/* ─── Constants ─── */
const MODULES = ['opd', 'ipd', 'lab', 'pharmacy', 'finance', 'insurance', 'hr', 'admin', 'reports'];
const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'];

const MODULE_META: Record<string, { label: string; color: string; bg: string }> = {
    opd: { label: 'OPD', color: 'text-teal-700', bg: 'bg-teal-50 border-teal-200' },
    ipd: { label: 'IPD', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
    lab: { label: 'Lab', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
    pharmacy: { label: 'Pharmacy', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
    finance: { label: 'Finance', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' },
    insurance: { label: 'Insurance', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
    hr: { label: 'HR', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
    admin: { label: 'Admin', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' },
    reports: { label: 'Reports', color: 'text-cyan-700', bg: 'bg-cyan-50 border-cyan-200' },
};

const ACTION_META: Record<string, { label: string; icon: React.ReactNode }> = {
    view: { label: 'View', icon: <Eye className="h-3 w-3" /> },
    create: { label: 'Create', icon: <Plus className="h-3 w-3" /> },
    edit: { label: 'Edit', icon: <Pencil className="h-3 w-3" /> },
    delete: { label: 'Delete', icon: <Trash2 className="h-3 w-3" /> },
    approve: { label: 'Approve', icon: <CheckSquare className="h-3 w-3" /> },
    export: { label: 'Export', icon: <FileText className="h-3 w-3" /> },
};

const DATA_SCOPE_META: Record<string, { label: string; icon: React.ReactNode; desc: string }> = {
    own: { label: 'Own', icon: <User className="h-3.5 w-3.5" />, desc: 'Own records only' },
    department: { label: 'Department', icon: <Layers className="h-3.5 w-3.5" />, desc: 'Department records' },
    branch: { label: 'Branch', icon: <Building2 className="h-3.5 w-3.5" />, desc: 'Branch-wide access' },
    organization: { label: 'Organization', icon: <Globe className="h-3.5 w-3.5" />, desc: 'All org data' },
};

/* ─── Slug helper ─── */
function toSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/* ─── Main Page Component ─── */
export default function RolesPermissionsPage() {
    // Global state
    const [roles, setRoles] = useState<Role[]>([]);
    const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // View mode: 'list' or 'matrix'
    const [view, setView] = useState<'list' | 'matrix'>('list');
    const [editingRole, setEditingRole] = useState<Role | null>(null);

    // Matrix editing state
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editDataScope, setEditDataScope] = useState('department');
    const [editPermissions, setEditPermissions] = useState<Set<string>>(new Set());
    const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(MODULES));

    // Modal state (create / clone)
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showCloneModal, setShowCloneModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [cloneSourceId, setCloneSourceId] = useState('');
    const [formName, setFormName] = useState('');
    const [formSlug, setFormSlug] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formDataScope, setFormDataScope] = useState('department');

    // Search
    const [searchQuery, setSearchQuery] = useState('');

    /* ─── Data Loading ─── */
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [rolesRes, permRes] = await Promise.all([listRoles(), getPermissionMatrix()]);
            if (rolesRes.success && rolesRes.data) setRoles(rolesRes.data as Role[]);
            if (permRes.success && permRes.data) setAllPermissions(permRes.data);
        } catch (err) {
            console.error('Load error:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    /* ─── Auto-clear messages ─── */
    useEffect(() => {
        if (error || success) {
            const t = setTimeout(() => { setError(''); setSuccess(''); }, 4000);
            return () => clearTimeout(t);
        }
    }, [error, success]);

    /* ─── Computed: permission matrix by module ─── */
    const permissionsByModule = useMemo(() => {
        const map: Record<string, Permission[]> = {};
        for (const p of allPermissions) {
            if (!map[p.module]) map[p.module] = [];
            map[p.module].push(p);
        }
        return map;
    }, [allPermissions]);

    /* ─── Filtered roles ─── */
    const filteredRoles = useMemo(() => {
        if (!searchQuery.trim()) return roles;
        const q = searchQuery.toLowerCase();
        return roles.filter(r =>
            r.name.toLowerCase().includes(q) ||
            r.slug.toLowerCase().includes(q) ||
            (r.description || '').toLowerCase().includes(q)
        );
    }, [roles, searchQuery]);

    /* ─── Handlers: Seed ─── */
    const handleSeed = async () => {
        setSeeding(true);
        const res = await seedSystemRoles();
        setSeeding(false);
        if (res.success) {
            setSuccess('System roles seeded successfully');
            loadData();
        } else {
            setError(res.error || res.message || 'Failed to seed roles');
        }
    };

    /* ─── Handlers: Create ─── */
    const openCreateModal = () => {
        setFormName('');
        setFormSlug('');
        setFormDescription('');
        setFormDataScope('department');
        setError('');
        setShowCreateModal(true);
    };

    const handleCreate = async () => {
        if (!formName.trim() || !formSlug.trim()) {
            setError('Name and slug are required');
            return;
        }
        setSaving(true);
        const res = await createRole({
            name: formName.trim(),
            slug: formSlug.trim(),
            description: formDescription.trim(),
            data_scope: formDataScope,
            permissions: [],
        });
        setSaving(false);
        if (res.success) {
            setShowCreateModal(false);
            setSuccess('Role created successfully');
            loadData();
        } else {
            setError(res.error || 'Failed to create role');
        }
    };

    /* ─── Handlers: Clone ─── */
    const openCloneModal = (roleId: string) => {
        setCloneSourceId(roleId);
        const source = roles.find(r => r.id === roleId);
        setFormName(source ? `${source.name} (Copy)` : '');
        setFormSlug(source ? `${source.slug}_copy` : '');
        setFormDescription('');
        setFormDataScope(source?.data_scope || 'department');
        setError('');
        setShowCloneModal(true);
    };

    const handleClone = async () => {
        if (!formName.trim() || !formSlug.trim()) {
            setError('Name and slug are required');
            return;
        }
        setSaving(true);
        const res = await cloneRole(cloneSourceId, formName.trim(), formSlug.trim());
        setSaving(false);
        if (res.success) {
            setShowCloneModal(false);
            setSuccess('Role cloned successfully');
            loadData();
        } else {
            setError(res.error || 'Failed to clone role');
        }
    };

    /* ─── Handlers: Delete ─── */
    const handleDelete = async (roleId: string) => {
        setSaving(true);
        const res = await deleteRole(roleId);
        setSaving(false);
        setShowDeleteConfirm(null);
        if (res.success) {
            setSuccess('Role deleted successfully');
            loadData();
        } else {
            setError(res.error || 'Failed to delete role');
        }
    };

    /* ─── Handlers: Open Permission Matrix ─── */
    const openMatrix = (role: Role) => {
        setEditingRole(role);
        setEditName(role.name);
        setEditDescription(role.description || '');
        setEditDataScope(role.data_scope);
        setEditPermissions(new Set(role.permissions || []));
        setExpandedModules(new Set(MODULES));
        setView('matrix');
    };

    const closeMatrix = () => {
        setView('list');
        setEditingRole(null);
    };

    /* ─── Handlers: Permission Toggles ─── */
    const togglePermission = (key: string) => {
        setEditPermissions(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleModuleAll = (mod: string) => {
        const modulePerms = (permissionsByModule[mod] || []).map(p => p.key);
        const allSelected = modulePerms.every(k => editPermissions.has(k));
        setEditPermissions(prev => {
            const next = new Set(prev);
            if (allSelected) {
                modulePerms.forEach(k => next.delete(k));
            } else {
                modulePerms.forEach(k => next.add(k));
            }
            return next;
        });
    };

    const selectAll = () => {
        setEditPermissions(new Set(allPermissions.map(p => p.key)));
    };

    const deselectAll = () => {
        setEditPermissions(new Set());
    };

    const toggleModuleExpand = (mod: string) => {
        setExpandedModules(prev => {
            const next = new Set(prev);
            if (next.has(mod)) next.delete(mod);
            else next.add(mod);
            return next;
        });
    };

    /* ─── Handlers: Save Matrix ─── */
    const handleSaveMatrix = async () => {
        if (!editingRole) return;
        setSaving(true);
        const res = await updateRole(editingRole.id, {
            name: editName.trim() || editingRole.name,
            description: editDescription.trim(),
            data_scope: editDataScope,
            permissions: Array.from(editPermissions),
        });
        setSaving(false);
        if (res.success) {
            setSuccess('Role permissions saved successfully');
            loadData();
            closeMatrix();
        } else {
            setError(res.error || 'Failed to save role');
        }
    };

    /* ─── Computed: Stats for matrix ─── */
    const totalPerms = allPermissions.length;
    const selectedPerms = editPermissions.size;

    /* ─── Render: Header actions ─── */
    const headerActions = view === 'list' ? (
        <div className="flex items-center gap-2">
            {roles.length === 0 && !loading && (
                <button
                    onClick={handleSeed}
                    disabled={seeding}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-all"
                >
                    {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sprout className="h-3.5 w-3.5" />}
                    Seed System Roles
                </button>
            )}
            <button
                onClick={openCreateModal}
                className="flex items-center gap-2 px-4 py-2 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all"
                style={{ background: `linear-gradient(135deg, var(--admin-primary, #0d9488), var(--admin-primary-light, #10b981))` }}
            >
                <Plus className="h-3.5 w-3.5" /> Create Custom Role
            </button>
        </div>
    ) : null;

    /* ──────────────────────────────────────────────────────────────────── */
    /* RENDER                                                             */
    /* ──────────────────────────────────────────────────────────────────── */

    return (
        <AdminPage
            pageTitle="Roles & Permissions"
            pageIcon={<ShieldCheck className="h-5 w-5" />}
            headerActions={headerActions}
            onRefresh={loadData}
            refreshing={loading}
        >
            {/* ─── Toasts ─── */}
            {error && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => setError('')} className="p-0.5 hover:bg-rose-100 rounded"><X className="h-3.5 w-3.5" /></button>
                </div>
            )}
            {success && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium flex items-center justify-between">
                    <span>{success}</span>
                    <button onClick={() => setSuccess('')} className="p-0.5 hover:bg-emerald-100 rounded"><X className="h-3.5 w-3.5" /></button>
                </div>
            )}

            {/* ─── VIEW 1: Role List ─── */}
            {view === 'list' && (
                <div className="space-y-6">
                    {/* Search bar */}
                    {roles.length > 0 && (
                        <div className="relative max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search roles..."
                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-1"
                                style={{ borderColor: searchQuery ? 'var(--admin-primary, #0d9488)' : undefined }}
                            />
                        </div>
                    )}

                    {/* Loading */}
                    {loading && roles.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin mb-3" style={{ color: 'var(--admin-primary, #0d9488)' }} />
                            <p className="text-sm font-medium text-gray-400">Loading roles...</p>
                        </div>
                    )}

                    {/* Empty state */}
                    {!loading && roles.length === 0 && (
                        <div className="border-2 border-dashed border-gray-200 rounded-3xl p-16 text-center bg-gray-50/50">
                            <ShieldAlert className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                            <h2 className="text-xl font-black text-gray-900 mb-2">No Roles Configured</h2>
                            <p className="text-sm font-medium text-gray-500 leading-relaxed max-w-md mx-auto mb-6">
                                Seed system roles to get started with the default hospital roles, or create a custom role from scratch.
                            </p>
                            <button
                                onClick={handleSeed}
                                disabled={seeding}
                                className="inline-flex items-center gap-2 px-6 py-3 text-white text-sm font-bold rounded-xl shadow-md hover:shadow-lg disabled:opacity-50 transition-all"
                                style={{ background: `linear-gradient(135deg, var(--admin-primary, #0d9488), var(--admin-primary-light, #10b981))` }}
                            >
                                {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />}
                                Seed System Roles
                            </button>
                        </div>
                    )}

                    {/* Role Grid */}
                    {filteredRoles.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                            {filteredRoles.map(role => (
                                <RoleCard
                                    key={role.id}
                                    role={role}
                                    onEdit={() => openMatrix(role)}
                                    onClone={() => openCloneModal(role.id)}
                                    onDelete={() => setShowDeleteConfirm(role.id)}
                                />
                            ))}
                        </div>
                    )}

                    {/* No search results */}
                    {!loading && roles.length > 0 && filteredRoles.length === 0 && (
                        <div className="text-center py-12">
                            <Search className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                            <p className="text-sm font-medium text-gray-400">No roles match &quot;{searchQuery}&quot;</p>
                        </div>
                    )}
                </div>
            )}

            {/* ─── VIEW 2: Permission Matrix ─── */}
            {view === 'matrix' && editingRole && (
                <div className="space-y-6">
                    {/* Back + Header */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={closeMatrix}
                            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" /> Back to Roles
                        </button>
                        <div className="flex-1" />
                        <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                            <span className="font-bold" style={{ color: 'var(--admin-primary, #0d9488)' }}>
                                {selectedPerms}
                            </span>
                            <span>of {totalPerms} permissions selected</span>
                        </div>
                    </div>

                    {/* Role Editor Header */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                        <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                            {/* Left: name + description */}
                            <div className="flex-1 space-y-4">
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">
                                        Role Name
                                    </label>
                                    {editingRole.is_system ? (
                                        <div className="flex items-center gap-2">
                                            <Lock className="h-3.5 w-3.5 text-gray-400" />
                                            <span className="text-lg font-black text-gray-900">{editingRole.name}</span>
                                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                                                System
                                            </span>
                                        </div>
                                    ) : (
                                        <input
                                            type="text"
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 font-bold focus:outline-none focus:ring-1"
                                            style={{ '--tw-ring-color': 'var(--admin-primary, #0d9488)' } as React.CSSProperties}
                                        />
                                    )}
                                </div>
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">
                                        Description
                                    </label>
                                    {editingRole.is_system ? (
                                        <p className="text-sm text-gray-500">{editingRole.description || 'No description'}</p>
                                    ) : (
                                        <textarea
                                            value={editDescription}
                                            onChange={e => setEditDescription(e.target.value)}
                                            rows={2}
                                            className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-1 resize-none"
                                            style={{ '--tw-ring-color': 'var(--admin-primary, #0d9488)' } as React.CSSProperties}
                                            placeholder="Describe this role's purpose..."
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Right: data scope + slug */}
                            <div className="lg:w-72 space-y-4">
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">
                                        Slug
                                    </label>
                                    <span className="inline-block px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono text-gray-500">
                                        {editingRole.slug}
                                    </span>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">
                                        Data Scope
                                    </label>
                                    {editingRole.is_system ? (
                                        <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                                            {DATA_SCOPE_META[editingRole.data_scope]?.icon}
                                            <span>{DATA_SCOPE_META[editingRole.data_scope]?.label || editingRole.data_scope}</span>
                                        </div>
                                    ) : (
                                        <select
                                            value={editDataScope}
                                            onChange={e => setEditDataScope(e.target.value)}
                                            className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-1"
                                            style={{ '--tw-ring-color': 'var(--admin-primary, #0d9488)' } as React.CSSProperties}
                                        >
                                            {Object.entries(DATA_SCOPE_META).map(([val, meta]) => (
                                                <option key={val} value={val}>{meta.label} -- {meta.desc}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Master Toggle Bar */}
                    {!editingRole.is_system && (
                        <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-3">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                Permission Matrix
                            </span>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={selectAll}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all hover:shadow-sm"
                                    style={{
                                        color: 'var(--admin-primary, #0d9488)',
                                        background: 'var(--admin-primary-10, rgba(13,148,136,0.1))',
                                    }}
                                >
                                    <CheckSquare className="h-3.5 w-3.5" /> Select All
                                </button>
                                <button
                                    onClick={deselectAll}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 transition-all"
                                >
                                    <Square className="h-3.5 w-3.5" /> Deselect All
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Permission Matrix Table */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                {/* Sticky Header */}
                                <thead>
                                    <tr className="border-b border-gray-200" style={{ background: 'var(--admin-surface, #f8fafc)' }}>
                                        <th className="text-left px-5 py-3.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest sticky left-0 z-10"
                                            style={{ background: 'var(--admin-surface, #f8fafc)', minWidth: 200 }}
                                        >
                                            Module
                                        </th>
                                        {ACTIONS.map(action => (
                                            <th
                                                key={action}
                                                className="text-center px-3 py-3.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest"
                                                style={{ minWidth: 90 }}
                                            >
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="text-gray-400">{ACTION_META[action]?.icon}</span>
                                                    <span>{ACTION_META[action]?.label || action}</span>
                                                </div>
                                            </th>
                                        ))}
                                        {!editingRole.is_system && (
                                            <th className="text-center px-3 py-3.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest" style={{ minWidth: 100 }}>
                                                Module Toggle
                                            </th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {MODULES.map((mod, modIdx) => {
                                        const meta = MODULE_META[mod];
                                        const modulePerms = permissionsByModule[mod] || [];
                                        const modulePermKeys = modulePerms.map(p => p.key);
                                        const selectedInModule = modulePermKeys.filter(k => editPermissions.has(k)).length;
                                        const allInModule = modulePermKeys.length;
                                        const allModuleSelected = allInModule > 0 && selectedInModule === allInModule;
                                        const isExpanded = expandedModules.has(mod);

                                        return (
                                            <React.Fragment key={mod}>
                                                {/* Module Row */}
                                                <tr
                                                    className={`border-b transition-colors ${
                                                        modIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                                                    } hover:bg-gray-50`}
                                                    style={{ borderColor: 'var(--admin-border, #e5e7eb)' }}
                                                >
                                                    {/* Module label cell */}
                                                    <td className="px-5 py-3.5 sticky left-0 z-10"
                                                        style={{ background: modIdx % 2 === 0 ? 'white' : '#fafbfc' }}
                                                    >
                                                        <button
                                                            onClick={() => toggleModuleExpand(mod)}
                                                            className="flex items-center gap-3 w-full group"
                                                        >
                                                            <span className="text-gray-400 group-hover:text-gray-600 transition-colors">
                                                                {isExpanded
                                                                    ? <ChevronDown className="h-3.5 w-3.5" />
                                                                    : <ChevronRight className="h-3.5 w-3.5" />
                                                                }
                                                            </span>
                                                            <span className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-lg border ${meta.bg} ${meta.color}`}>
                                                                {meta.label}
                                                            </span>
                                                            <span className="text-[10px] font-medium text-gray-400">
                                                                {selectedInModule}/{allInModule}
                                                            </span>
                                                        </button>
                                                    </td>

                                                    {/* Action checkboxes */}
                                                    {ACTIONS.map(action => {
                                                        const permKey = `${mod}.${action}`;
                                                        const exists = modulePerms.some(p => p.key === permKey);
                                                        const checked = editPermissions.has(permKey);
                                                        const perm = modulePerms.find(p => p.key === permKey);

                                                        if (!exists) {
                                                            return (
                                                                <td key={action} className="text-center px-3 py-3.5">
                                                                    <div className="flex items-center justify-center">
                                                                        <span className="w-5 h-5 rounded bg-gray-100 border border-gray-200" title="Not applicable" />
                                                                    </div>
                                                                </td>
                                                            );
                                                        }

                                                        return (
                                                            <td key={action} className="text-center px-3 py-3.5">
                                                                <div className="flex items-center justify-center">
                                                                    <label
                                                                        className="relative flex items-center justify-center cursor-pointer"
                                                                        title={perm?.label || permKey}
                                                                    >
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={checked}
                                                                            onChange={() => !editingRole.is_system && togglePermission(permKey)}
                                                                            disabled={editingRole.is_system}
                                                                            className="sr-only peer"
                                                                        />
                                                                        <div
                                                                            className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${
                                                                                checked
                                                                                    ? 'border-transparent shadow-sm'
                                                                                    : 'border-gray-300 bg-white hover:border-gray-400'
                                                                            } ${editingRole.is_system ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                                                                            style={checked ? {
                                                                                background: 'var(--admin-primary, #0d9488)',
                                                                            } : undefined}
                                                                        >
                                                                            {checked && (
                                                                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                                </svg>
                                                                            )}
                                                                        </div>
                                                                    </label>
                                                                </div>
                                                            </td>
                                                        );
                                                    })}

                                                    {/* Module toggle button */}
                                                    {!editingRole.is_system && (
                                                        <td className="text-center px-3 py-3.5">
                                                            <button
                                                                onClick={() => toggleModuleAll(mod)}
                                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all ${
                                                                    allModuleSelected
                                                                        ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                                                        : 'text-white hover:opacity-90'
                                                                }`}
                                                                style={!allModuleSelected ? {
                                                                    background: 'var(--admin-primary, #0d9488)',
                                                                } : undefined}
                                                            >
                                                                {allModuleSelected ? (
                                                                    <><Square className="h-3 w-3" /> Clear</>
                                                                ) : (
                                                                    <><CheckSquare className="h-3 w-3" /> All</>
                                                                )}
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>

                                                {/* Expanded detail rows */}
                                                {isExpanded && modulePerms.map(perm => {
                                                    const checked = editPermissions.has(perm.key);
                                                    return (
                                                        <tr
                                                            key={perm.key}
                                                            className="border-b border-gray-100 bg-gray-50/30"
                                                        >
                                                            <td className="pl-14 pr-5 py-2 sticky left-0 z-10 bg-gray-50/30">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`w-1.5 h-1.5 rounded-full ${checked ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                                                                    <span className="text-xs text-gray-500 font-medium">{perm.label}</span>
                                                                    <span className="text-[10px] font-mono text-gray-300">{perm.key}</span>
                                                                </div>
                                                            </td>
                                                            {ACTIONS.map(action => (
                                                                <td key={action} className="px-3 py-2">
                                                                    {perm.action === action ? (
                                                                        <div className="flex items-center justify-center">
                                                                            <span className={`text-[10px] font-bold ${checked ? 'text-emerald-600' : 'text-gray-300'}`}>
                                                                                {checked ? 'GRANTED' : '--'}
                                                                            </span>
                                                                        </div>
                                                                    ) : (
                                                                        <div />
                                                                    )}
                                                                </td>
                                                            ))}
                                                            {!editingRole.is_system && <td />}
                                                        </tr>
                                                    );
                                                })}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Save bar */}
                    {!editingRole.is_system && (
                        <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-4 sticky bottom-4 z-20">
                            <div className="text-sm text-gray-500">
                                <span className="font-bold" style={{ color: 'var(--admin-primary, #0d9488)' }}>{selectedPerms}</span> permissions selected across{' '}
                                <span className="font-bold">{MODULES.filter(m => (permissionsByModule[m] || []).some(p => editPermissions.has(p.key))).length}</span> modules
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={closeMatrix}
                                    className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveMatrix}
                                    disabled={saving}
                                    className="flex items-center gap-2 px-5 py-2.5 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
                                    style={{ background: `linear-gradient(135deg, var(--admin-primary, #0d9488), var(--admin-primary-light, #10b981))` }}
                                >
                                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                    Save Permissions
                                </button>
                            </div>
                        </div>
                    )}

                    {/* System role notice */}
                    {editingRole.is_system && (
                        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4">
                            <Lock className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <p className="text-xs font-medium text-blue-700">
                                This is a system role. Permissions are read-only and managed by the platform. Clone this role to create a customizable version.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* ──────────── MODALS ──────────── */}

            {/* Create Role Modal */}
            {showCreateModal && (
                <Modal onClose={() => setShowCreateModal(false)} title="Create Custom Role">
                    <div className="space-y-4">
                        {error && (
                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">{error}</div>
                        )}
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Role Name *</label>
                            <input
                                type="text"
                                value={formName}
                                onChange={e => { setFormName(e.target.value); setFormSlug(toSlug(e.target.value)); }}
                                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-1"
                                placeholder="e.g. Billing Clerk"
                                style={{ '--tw-ring-color': 'var(--admin-primary, #0d9488)' } as React.CSSProperties}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Slug *</label>
                            <input
                                type="text"
                                value={formSlug}
                                onChange={e => setFormSlug(toSlug(e.target.value))}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono text-gray-500 focus:outline-none focus:ring-1"
                                placeholder="auto_generated"
                                style={{ '--tw-ring-color': 'var(--admin-primary, #0d9488)' } as React.CSSProperties}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Description</label>
                            <textarea
                                value={formDescription}
                                onChange={e => setFormDescription(e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-1 resize-none"
                                placeholder="Describe the purpose of this role..."
                                style={{ '--tw-ring-color': 'var(--admin-primary, #0d9488)' } as React.CSSProperties}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Data Scope</label>
                            <select
                                value={formDataScope}
                                onChange={e => setFormDataScope(e.target.value)}
                                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-1"
                                style={{ '--tw-ring-color': 'var(--admin-primary, #0d9488)' } as React.CSSProperties}
                            >
                                {Object.entries(DATA_SCOPE_META).map(([val, meta]) => (
                                    <option key={val} value={val}>{meta.label} -- {meta.desc}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2.5 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
                                style={{ background: `linear-gradient(135deg, var(--admin-primary, #0d9488), var(--admin-primary-light, #10b981))` }}
                            >
                                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                Create Role
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Clone Role Modal */}
            {showCloneModal && (
                <Modal onClose={() => setShowCloneModal(false)} title="Clone Role">
                    <div className="space-y-4">
                        {error && (
                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">{error}</div>
                        )}
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-medium">
                            All permissions from the source role will be copied to the new role.
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">New Role Name *</label>
                            <input
                                type="text"
                                value={formName}
                                onChange={e => { setFormName(e.target.value); setFormSlug(toSlug(e.target.value)); }}
                                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-1"
                                placeholder="e.g. Senior Doctor"
                                style={{ '--tw-ring-color': 'var(--admin-primary, #0d9488)' } as React.CSSProperties}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Slug *</label>
                            <input
                                type="text"
                                value={formSlug}
                                onChange={e => setFormSlug(toSlug(e.target.value))}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono text-gray-500 focus:outline-none focus:ring-1"
                                placeholder="auto_generated"
                                style={{ '--tw-ring-color': 'var(--admin-primary, #0d9488)' } as React.CSSProperties}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Description</label>
                            <textarea
                                value={formDescription}
                                onChange={e => setFormDescription(e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-1 resize-none"
                                placeholder="Optional description..."
                                style={{ '--tw-ring-color': 'var(--admin-primary, #0d9488)' } as React.CSSProperties}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Data Scope</label>
                            <select
                                value={formDataScope}
                                onChange={e => setFormDataScope(e.target.value)}
                                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-1"
                                style={{ '--tw-ring-color': 'var(--admin-primary, #0d9488)' } as React.CSSProperties}
                            >
                                {Object.entries(DATA_SCOPE_META).map(([val, meta]) => (
                                    <option key={val} value={val}>{meta.label} -- {meta.desc}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => setShowCloneModal(false)}
                                className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleClone}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2.5 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
                                style={{ background: `linear-gradient(135deg, var(--admin-primary, #0d9488), var(--admin-primary-light, #10b981))` }}
                            >
                                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                                Clone Role
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <Modal onClose={() => setShowDeleteConfirm(null)} title="Delete Role" small>
                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-rose-50 rounded-xl">
                                <Trash2 className="h-5 w-5 text-rose-500" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-900 mb-1">Are you sure?</p>
                                <p className="text-xs text-gray-500">
                                    This will permanently delete the role
                                    <span className="font-bold text-gray-700">
                                        {' '}{roles.find(r => r.id === showDeleteConfirm)?.name}
                                    </span>.
                                    Users assigned to this role will need to be reassigned.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDelete(showDeleteConfirm)}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-rose-500 to-red-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
                            >
                                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                Delete Role
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </AdminPage>
    );
}

/* ──────────────────────────────────────────────────────────────────── */
/* Sub-Components                                                     */
/* ──────────────────────────────────────────────────────────────────── */

/* ─── Role Card ─── */
function RoleCard({
    role,
    onEdit,
    onClone,
    onDelete,
}: {
    role: Role;
    onEdit: () => void;
    onClone: () => void;
    onDelete: () => void;
}) {
    const permCount = (role.permissions || []).length;
    const scopeMeta = DATA_SCOPE_META[role.data_scope];

    return (
        <div
            className={`relative bg-white rounded-2xl border shadow-sm overflow-hidden group transition-all hover:shadow-md ${
                role.is_system
                    ? 'border-blue-200/60 bg-gradient-to-br from-white to-blue-50/30'
                    : 'border-gray-200 hover:border-gray-300'
            }`}
        >
            {/* Top accent bar */}
            <div
                className="h-1 w-full"
                style={{ background: role.is_system
                    ? 'linear-gradient(90deg, #3b82f6, #6366f1)'
                    : `linear-gradient(90deg, var(--admin-primary, #0d9488), var(--admin-primary-light, #10b981))`
                }}
            />

            <div className="p-5">
                {/* Header row */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            {role.is_system && <Lock className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />}
                            <h3 className="text-base font-black text-gray-900 truncate">{role.name}</h3>
                        </div>
                        <span className="text-[11px] font-mono text-gray-400">{role.slug}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        {role.is_system && (
                            <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                                System
                            </span>
                        )}
                    </div>
                </div>

                {/* Description */}
                <p className="text-xs text-gray-500 font-medium mb-4 min-h-[32px] line-clamp-2 leading-relaxed">
                    {role.description || 'No description provided.'}
                </p>

                {/* Badge row */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    {/* Status */}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        role.is_active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-gray-100 text-gray-400 border border-gray-200'
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${role.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                        {role.is_active ? 'Active' : 'Inactive'}
                    </span>

                    {/* User count */}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                        <Users className="h-3 w-3" /> {role.user_count} user{role.user_count !== 1 ? 's' : ''}
                    </span>

                    {/* Data scope */}
                    {scopeMeta && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-violet-50 text-violet-600 border border-violet-200">
                            {scopeMeta.icon} {scopeMeta.label}
                        </span>
                    )}

                    {/* Permission count */}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        <ShieldCheck className="h-3 w-3" /> {permCount} perm{permCount !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    <button
                        onClick={onEdit}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all hover:shadow-sm"
                        style={{
                            color: 'var(--admin-primary, #0d9488)',
                            background: 'var(--admin-primary-10, rgba(13,148,136,0.1))',
                        }}
                    >
                        <Settings2 className="h-3 w-3" />
                        {role.is_system ? 'View Permissions' : 'Edit Permissions'}
                    </button>
                    <button
                        onClick={onClone}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-lg hover:bg-gray-200 transition-all"
                    >
                        <Copy className="h-3 w-3" /> Clone
                    </button>
                    {!role.is_system && (
                        <button
                            onClick={onDelete}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 text-[10px] font-bold rounded-lg hover:bg-rose-100 transition-all ml-auto"
                        >
                            <Trash2 className="h-3 w-3" /> Delete
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── Modal Shell ─── */
function Modal({
    children,
    onClose,
    title,
    small,
}: {
    children: React.ReactNode;
    onClose: () => void;
    title: string;
    small?: boolean;
}) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className={`relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full ${small ? 'max-w-sm' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
                    <h2 className="text-base font-bold text-gray-900">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
}
