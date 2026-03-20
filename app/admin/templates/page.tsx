'use client';

import React, { useEffect, useState } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import {
    FileText,
    Plus,
    Edit2,
    Copy,
    Trash2,
    Star,
    ArrowLeft,
    ChevronUp,
    ChevronDown,
    GripVertical,
    Layers,
    Save,
    X,
    Loader2,
    ToggleLeft,
    ToggleRight,
    AlertCircle,
    CheckCircle2,
    Settings2,
    Code2,
    Layout,
} from 'lucide-react';
import {
    listTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    cloneTemplate,
    getTemplateTypes,
} from '@/app/actions/template-actions';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TemplateSection {
    id: string;
    name: string;
    enabled: boolean;
    fields: string[];
}

interface TemplateLayout {
    size: string;
    orientation: string;
    margins: { top: number; right: number; bottom: number; left: number };
}

interface TemplateContentJson {
    sections?: TemplateSection[];
    layout?: TemplateLayout;
    variables?: string[];
}

interface Template {
    id: string;
    type: string;
    name: string;
    content_json: TemplateContentJson;
    is_default: boolean;
    is_active: boolean;
    created_by?: string | null;
    created_at: string;
    updated_at: string;
}

interface TemplateTypeOption {
    key: string;
    label: string;
}

/* ------------------------------------------------------------------ */
/*  Shared UI                                                          */
/* ------------------------------------------------------------------ */

const labelCls = 'block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2';
const inputCls =
    'w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[var(--admin-primary)]/20 text-sm font-medium outline-none transition-colors';
const cardCls = 'bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden';

function Toggle({
    checked,
    onChange,
    disabled,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--admin-primary)]/30 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                checked ? 'bg-[var(--admin-primary)]' : 'bg-gray-200'
            }`}
        >
            <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    checked ? 'translate-x-5' : 'translate-x-0'
                }`}
            />
        </button>
    );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function TemplatesPage() {
    // --- Data ---
    const [templates, setTemplates] = useState<Template[]>([]);
    const [templateTypes, setTemplateTypes] = useState<TemplateTypeOption[]>([]);
    const [activeTab, setActiveTab] = useState<string>('prescription');
    const [loading, setLoading] = useState(true);

    // --- Create modal ---
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [createName, setCreateName] = useState('');
    const [createType, setCreateType] = useState('');
    const [createDefault, setCreateDefault] = useState(false);
    const [creating, setCreating] = useState(false);

    // --- Clone modal ---
    const [cloneModalOpen, setCloneModalOpen] = useState(false);
    const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);
    const [cloneName, setCloneName] = useState('');
    const [cloning, setCloning] = useState(false);

    // --- Edit view ---
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
    const [editName, setEditName] = useState('');
    const [editSections, setEditSections] = useState<TemplateSection[]>([]);
    const [editLayout, setEditLayout] = useState<TemplateLayout>({
        size: 'A4',
        orientation: 'portrait',
        margins: { top: 20, right: 15, bottom: 20, left: 15 },
    });
    const [editVariables, setEditVariables] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    // --- Alert ---
    const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    /* ---------- Load ---------- */

    const loadTemplates = async () => {
        setLoading(true);
        try {
            const types = await getTemplateTypes();
            setTemplateTypes(types);
            if (!activeTab && types.length > 0) {
                setActiveTab(types[0].key);
            }

            const res = await listTemplates();
            if (res.success && res.data) {
                setTemplates(res.data as Template[]);
            }
        } catch (err) {
            console.error('Failed to load templates', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTemplates();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ---------- Helpers ---------- */

    const showAlert = (type: 'success' | 'error', message: string) => {
        setAlert({ type, message });
        setTimeout(() => setAlert(null), 4000);
    };

    const filteredTemplates = templates.filter((t) => t.type === activeTab);

    const typeLabel = (type: string) => {
        const found = templateTypes.find((t) => t.key === type);
        return found?.label || type;
    };

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            });
        } catch {
            return dateStr;
        }
    };

    /* ---------- Create ---------- */

    const openCreateModal = () => {
        setCreateName('');
        setCreateType(activeTab);
        setCreateDefault(false);
        setCreateModalOpen(true);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createName.trim()) return;
        setCreating(true);
        try {
            const res = await createTemplate({
                type: createType,
                name: createName.trim(),
                is_default: createDefault,
            });
            if (res.success) {
                showAlert('success', `Template "${createName}" created successfully.`);
                setCreateModalOpen(false);
                await loadTemplates();
            } else {
                showAlert('error', res.error || 'Failed to create template.');
            }
        } catch {
            showAlert('error', 'An unexpected error occurred.');
        } finally {
            setCreating(false);
        }
    };

    /* ---------- Clone ---------- */

    const openCloneModal = (template: Template) => {
        setCloneSourceId(template.id);
        setCloneName(`${template.name} (Copy)`);
        setCloneModalOpen(true);
    };

    const handleClone = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cloneSourceId || !cloneName.trim()) return;
        setCloning(true);
        try {
            const res = await cloneTemplate(cloneSourceId, cloneName.trim());
            if (res.success) {
                showAlert('success', `Template cloned as "${cloneName}".`);
                setCloneModalOpen(false);
                await loadTemplates();
            } else {
                showAlert('error', res.error || 'Failed to clone template.');
            }
        } catch {
            showAlert('error', 'An unexpected error occurred.');
        } finally {
            setCloning(false);
        }
    };

    /* ---------- Delete ---------- */

    const handleDelete = async (template: Template) => {
        if (!confirm(`Delete template "${template.name}"? This action cannot be undone.`)) return;
        try {
            const res = await deleteTemplate(template.id);
            if (res.success) {
                showAlert('success', `Template "${template.name}" deleted.`);
                await loadTemplates();
            } else {
                showAlert('error', res.error || 'Failed to delete template.');
            }
        } catch {
            showAlert('error', 'An unexpected error occurred.');
        }
    };

    /* ---------- Set Default ---------- */

    const handleSetDefault = async (template: Template) => {
        try {
            const res = await updateTemplate(template.id, { is_default: true });
            if (res.success) {
                showAlert('success', `"${template.name}" is now the default ${typeLabel(template.type)} template.`);
                await loadTemplates();
            } else {
                showAlert('error', res.error || 'Failed to set default.');
            }
        } catch {
            showAlert('error', 'An unexpected error occurred.');
        }
    };

    /* ---------- Toggle Active ---------- */

    const handleToggleActive = async (template: Template) => {
        try {
            const res = await updateTemplate(template.id, { is_active: !template.is_active });
            if (res.success) {
                showAlert('success', `Template "${template.name}" ${template.is_active ? 'deactivated' : 'activated'}.`);
                await loadTemplates();
            } else {
                showAlert('error', res.error || 'Failed to toggle status.');
            }
        } catch {
            showAlert('error', 'An unexpected error occurred.');
        }
    };

    /* ---------- Edit View ---------- */

    const openEditView = (template: Template) => {
        const content = template.content_json || {};
        setEditingTemplate(template);
        setEditName(template.name);
        setEditSections(
            (content.sections || []).map((s: TemplateSection) => ({ ...s }))
        );
        setEditLayout(
            content.layout
                ? { ...content.layout, margins: { ...content.layout.margins } }
                : { size: 'A4', orientation: 'portrait', margins: { top: 20, right: 15, bottom: 20, left: 15 } }
        );
        setEditVariables(content.variables || []);
    };

    const closeEditView = () => {
        setEditingTemplate(null);
    };

    const handleSaveEdit = async () => {
        if (!editingTemplate) return;
        setSaving(true);
        try {
            const contentJson: TemplateContentJson = {
                sections: editSections,
                layout: editLayout,
                variables: editVariables,
            };
            const res = await updateTemplate(editingTemplate.id, {
                name: editName.trim() || editingTemplate.name,
                content_json: contentJson,
            });
            if (res.success) {
                showAlert('success', 'Template saved successfully.');
                setEditingTemplate(null);
                await loadTemplates();
            } else {
                showAlert('error', res.error || 'Failed to save template.');
            }
        } catch {
            showAlert('error', 'An unexpected error occurred.');
        } finally {
            setSaving(false);
        }
    };

    /* Section manipulation */

    const moveSectionUp = (index: number) => {
        if (index <= 0) return;
        setEditSections((prev) => {
            const next = [...prev];
            [next[index - 1], next[index]] = [next[index], next[index - 1]];
            return next;
        });
    };

    const moveSectionDown = (index: number) => {
        setEditSections((prev) => {
            if (index >= prev.length - 1) return prev;
            const next = [...prev];
            [next[index], next[index + 1]] = [next[index + 1], next[index]];
            return next;
        });
    };

    const toggleSectionEnabled = (index: number) => {
        setEditSections((prev) =>
            prev.map((s, i) => (i === index ? { ...s, enabled: !s.enabled } : s))
        );
    };

    const removeSection = (index: number) => {
        if (!confirm('Remove this section from the template?')) return;
        setEditSections((prev) => prev.filter((_, i) => i !== index));
    };

    const addSection = () => {
        const id = `section_${Date.now()}`;
        setEditSections((prev) => [
            ...prev,
            { id, name: 'New Section', enabled: true, fields: [] },
        ]);
    };

    const updateSectionName = (index: number, name: string) => {
        setEditSections((prev) =>
            prev.map((s, i) => (i === index ? { ...s, name } : s))
        );
    };

    /* ---------- Loading state ---------- */

    if (loading) {
        return (
            <AdminPage pageTitle="Document Templates" pageIcon={<FileText className="h-5 w-5" />}>
                <div className="flex flex-col items-center justify-center py-32 text-gray-400 gap-4">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-sm font-bold">Loading templates...</p>
                </div>
            </AdminPage>
        );
    }

    /* ------------------------------------------------------------------ */
    /*  Edit View Render                                                   */
    /* ------------------------------------------------------------------ */

    if (editingTemplate) {
        return (
            <AdminPage pageTitle="Edit Template" pageIcon={<FileText className="h-5 w-5" />}>
                <div className="max-w-4xl mx-auto py-6 pb-28 space-y-6">
                    {/* Alert */}
                    {alert && (
                        <div
                            className={`flex items-center gap-3 p-4 rounded-xl border text-sm font-bold ${
                                alert.type === 'success'
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    : 'bg-red-50 border-red-200 text-red-800'
                            }`}
                        >
                            {alert.type === 'success' ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                            ) : (
                                <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
                            )}
                            {alert.message}
                        </div>
                    )}

                    {/* Back button & header */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={closeEditView}
                            className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors text-gray-500 hover:text-gray-700"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        <div className="flex-1">
                            <h1 className="text-xl font-black text-gray-900">Edit Template</h1>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-0.5">
                                {typeLabel(editingTemplate.type)}
                            </p>
                        </div>
                        <span
                            className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full"
                            style={{ backgroundColor: 'var(--admin-primary-10)', color: 'var(--admin-primary)' }}
                        >
                            {editingTemplate.type.replace(/_/g, ' ')}
                        </span>
                    </div>

                    {/* Template Name */}
                    <div className={cardCls}>
                        <div className="p-6">
                            <label className={labelCls}>Template Name</label>
                            <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className={inputCls}
                                placeholder="Template name"
                            />
                        </div>
                    </div>

                    {/* Sections Editor */}
                    <div className={cardCls}>
                        <div className="bg-gray-50 border-b border-gray-100 p-6 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div
                                    className="p-2 rounded-lg"
                                    style={{ backgroundColor: 'var(--admin-primary-10)', color: 'var(--admin-primary)' }}
                                >
                                    <Layers className="h-5 w-5" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900">Template Sections</h2>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-0.5">
                                        {editSections.length} section{editSections.length !== 1 ? 's' : ''} configured
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={addSection}
                                className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl transition-colors"
                                style={{ backgroundColor: 'var(--admin-primary-10)', color: 'var(--admin-primary)' }}
                            >
                                <Plus className="h-4 w-4" />
                                Add Section
                            </button>
                        </div>

                        <div className="p-6 space-y-3">
                            {editSections.length === 0 && (
                                <div className="text-center py-12 text-gray-400">
                                    <Layers className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                                    <p className="text-sm font-bold text-gray-500">No sections configured</p>
                                    <p className="text-xs text-gray-400 mt-1">Click "Add Section" to get started</p>
                                </div>
                            )}

                            {editSections.map((section, idx) => (
                                <div
                                    key={section.id}
                                    className={`rounded-xl border p-4 transition-colors ${
                                        section.enabled
                                            ? 'bg-gray-50 border-gray-200'
                                            : 'bg-gray-50/50 border-dashed border-gray-200 opacity-60'
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        {/* Drag handle (visual only) */}
                                        <div className="pt-1 text-gray-300 cursor-grab">
                                            <GripVertical className="h-5 w-5" />
                                        </div>

                                        {/* Section body */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-3">
                                                <input
                                                    type="text"
                                                    value={section.name}
                                                    onChange={(e) => updateSectionName(idx, e.target.value)}
                                                    className="text-sm font-black text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[var(--admin-primary)] outline-none transition-colors px-0 py-1 flex-1"
                                                />
                                                <Toggle
                                                    checked={section.enabled}
                                                    onChange={() => toggleSectionEnabled(idx)}
                                                />
                                            </div>

                                            {/* Fields display */}
                                            {section.fields.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {section.fields.map((field) => (
                                                        <span
                                                            key={field}
                                                            className="inline-block text-[10px] font-bold text-gray-500 bg-white border border-gray-200 rounded-md px-2 py-0.5"
                                                        >
                                                            {field}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {section.fields.length === 0 && (
                                                <p className="text-[10px] font-bold text-gray-400 italic">No fields configured</p>
                                            )}
                                        </div>

                                        {/* Reorder & delete buttons */}
                                        <div className="flex flex-col gap-1">
                                            <button
                                                onClick={() => moveSectionUp(idx)}
                                                disabled={idx === 0}
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                title="Move up"
                                            >
                                                <ChevronUp className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => moveSectionDown(idx)}
                                                disabled={idx === editSections.length - 1}
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                title="Move down"
                                            >
                                                <ChevronDown className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => removeSection(idx)}
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                title="Remove section"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Layout Settings */}
                    <div className={cardCls}>
                        <div className="bg-gray-50 border-b border-gray-100 p-6 flex items-center gap-3">
                            <div
                                className="p-2 rounded-lg"
                                style={{ backgroundColor: 'var(--admin-primary-10)', color: 'var(--admin-primary)' }}
                            >
                                <Layout className="h-5 w-5" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-gray-900">Layout Settings</h2>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-0.5">
                                    Page size, orientation & margins
                                </p>
                            </div>
                        </div>

                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className={labelCls}>Page Size</label>
                                <select
                                    value={editLayout.size}
                                    onChange={(e) =>
                                        setEditLayout((prev) => ({ ...prev, size: e.target.value }))
                                    }
                                    className={inputCls}
                                >
                                    <option value="A4">A4 (210 x 297 mm)</option>
                                    <option value="Letter">Letter (8.5 x 11 in)</option>
                                </select>
                            </div>

                            <div>
                                <label className={labelCls}>Orientation</label>
                                <select
                                    value={editLayout.orientation}
                                    onChange={(e) =>
                                        setEditLayout((prev) => ({ ...prev, orientation: e.target.value }))
                                    }
                                    className={inputCls}
                                >
                                    <option value="portrait">Portrait</option>
                                    <option value="landscape">Landscape</option>
                                </select>
                            </div>

                            <div className="md:col-span-2">
                                <label className={labelCls}>Margins (mm)</label>
                                <div className="grid grid-cols-4 gap-4">
                                    {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                                        <div key={side}>
                                            <label className="block text-[10px] font-bold text-gray-400 mb-1 capitalize">
                                                {side}
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={100}
                                                value={editLayout.margins[side]}
                                                onChange={(e) =>
                                                    setEditLayout((prev) => ({
                                                        ...prev,
                                                        margins: {
                                                            ...prev.margins,
                                                            [side]: Number(e.target.value),
                                                        },
                                                    }))
                                                }
                                                className={inputCls}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Variable Reference */}
                    {editVariables.length > 0 && (
                        <div className={cardCls}>
                            <div className="bg-gray-50 border-b border-gray-100 p-6 flex items-center gap-3">
                                <div
                                    className="p-2 rounded-lg"
                                    style={{ backgroundColor: 'var(--admin-primary-10)', color: 'var(--admin-primary)' }}
                                >
                                    <Code2 className="h-5 w-5" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900">Available Variables</h2>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-0.5">
                                        Placeholder variables for this template type
                                    </p>
                                </div>
                            </div>
                            <div className="p-6">
                                <div className="flex flex-wrap gap-2">
                                    {editVariables.map((variable) => (
                                        <span
                                            key={variable}
                                            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border"
                                            style={{
                                                backgroundColor: 'var(--admin-primary-10)',
                                                borderColor: 'var(--admin-primary-light)',
                                                color: 'var(--admin-primary)',
                                            }}
                                        >
                                            <Code2 className="h-3 w-3" />
                                            {variable}
                                        </span>
                                    ))}
                                </div>
                                <p className="text-[10px] text-gray-400 mt-3 font-bold">
                                    Use these placeholders in your template. They will be replaced with actual data when the document is generated.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Sticky save bar */}
                    <div className="fixed bottom-0 left-0 lg:left-64 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-200 z-40">
                        <div className="max-w-4xl mx-auto flex justify-between items-center">
                            <button
                                type="button"
                                onClick={closeEditView}
                                className="flex items-center gap-2 px-5 py-3 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveEdit}
                                disabled={saving}
                                className="flex items-center gap-2 px-8 py-3 text-white font-bold rounded-xl shadow-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                                style={{ backgroundColor: 'var(--admin-primary)' }}
                            >
                                {saving ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="h-4 w-4" />
                                )}
                                {saving ? 'Saving...' : 'Save Template'}
                            </button>
                        </div>
                    </div>
                </div>
            </AdminPage>
        );
    }

    /* ------------------------------------------------------------------ */
    /*  List View Render                                                    */
    /* ------------------------------------------------------------------ */

    return (
        <AdminPage
            pageTitle="Document Templates"
            pageIcon={<FileText className="h-5 w-5" />}
            onRefresh={loadTemplates}
            refreshing={loading}
        >
            <div className="max-w-5xl mx-auto py-6 space-y-6">
                {/* Alert */}
                {alert && (
                    <div
                        className={`flex items-center gap-3 p-4 rounded-xl border text-sm font-bold ${
                            alert.type === 'success'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                    >
                        {alert.type === 'success' ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                        ) : (
                            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
                        )}
                        {alert.message}
                    </div>
                )}

                {/* Page Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div
                            className="p-3 rounded-xl"
                            style={{ backgroundColor: 'var(--admin-primary-10)', color: 'var(--admin-primary)' }}
                        >
                            <FileText className="h-7 w-7" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-gray-900">Document Templates</h1>
                            <p className="text-sm font-medium text-gray-500 mt-0.5">
                                Configure templates for prescriptions, invoices, reports and more
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={openCreateModal}
                        className="flex items-center gap-2 px-5 py-3 text-white font-bold rounded-xl shadow-lg text-sm transition-all hover:opacity-90 self-start"
                        style={{ backgroundColor: 'var(--admin-primary)' }}
                    >
                        <Plus className="h-4 w-4" />
                        Create Template
                    </button>
                </div>

                {/* Tab Bar */}
                <div className="border-b border-gray-200">
                    <div className="flex gap-0 overflow-x-auto">
                        {templateTypes.map((tab) => {
                            const isActive = activeTab === tab.key;
                            const count = templates.filter((t) => t.type === tab.key).length;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className="flex items-center gap-2 px-5 py-3.5 text-sm font-bold whitespace-nowrap transition-colors border-b-2 -mb-px"
                                    style={
                                        isActive
                                            ? {
                                                  borderBottomColor: 'var(--admin-primary)',
                                                  color: 'var(--admin-primary)',
                                              }
                                            : {
                                                  borderBottomColor: 'transparent',
                                                  color: '#6b7280',
                                              }
                                    }
                                >
                                    {tab.label}
                                    {count > 0 && (
                                        <span
                                            className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                                                isActive
                                                    ? ''
                                                    : 'bg-gray-100 text-gray-500'
                                            }`}
                                            style={
                                                isActive
                                                    ? {
                                                          backgroundColor: 'var(--admin-primary-10)',
                                                          color: 'var(--admin-primary)',
                                                      }
                                                    : undefined
                                            }
                                        >
                                            {count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Template Cards Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredTemplates.map((template) => {
                        const sectionCount =
                            (template.content_json as TemplateContentJson)?.sections?.length || 0;
                        return (
                            <div
                                key={template.id}
                                className={`${cardCls} relative group hover:border-[var(--admin-primary-light)] transition-colors ${
                                    !template.is_active ? 'opacity-60' : ''
                                }`}
                            >
                                {/* Top accent bar */}
                                <div
                                    className="absolute top-0 left-0 w-full h-1"
                                    style={{
                                        backgroundColor: template.is_active
                                            ? 'var(--admin-primary)'
                                            : '#d1d5db',
                                    }}
                                />

                                <div className="p-5 pt-6">
                                    {/* Header row */}
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-base font-black text-gray-900 truncate">
                                                {template.name}
                                            </h3>
                                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                                {/* Type badge */}
                                                <span
                                                    className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md"
                                                    style={{
                                                        backgroundColor: 'var(--admin-primary-10)',
                                                        color: 'var(--admin-primary)',
                                                    }}
                                                >
                                                    {typeLabel(template.type)}
                                                </span>

                                                {/* Default badge */}
                                                {template.is_default && (
                                                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700">
                                                        Default
                                                    </span>
                                                )}

                                                {/* Active / Inactive badge */}
                                                <span
                                                    className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md ${
                                                        template.is_active
                                                            ? 'bg-emerald-50 text-emerald-600'
                                                            : 'bg-red-50 text-red-500'
                                                    }`}
                                                >
                                                    {template.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Meta row */}
                                    <div className="flex items-center gap-4 mb-4 text-xs text-gray-400 font-bold">
                                        <span className="flex items-center gap-1">
                                            <Layers className="h-3.5 w-3.5" />
                                            {sectionCount} section{sectionCount !== 1 ? 's' : ''}
                                        </span>
                                        <span>
                                            Created {formatDate(template.created_at)}
                                        </span>
                                    </div>

                                    {/* Actions row */}
                                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                                        <button
                                            onClick={() => openEditView(template)}
                                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-gray-600 hover:text-[var(--admin-primary)] hover:bg-[var(--admin-primary-10)] rounded-lg transition-colors"
                                        >
                                            <Edit2 className="h-3.5 w-3.5" />
                                            Edit
                                        </button>

                                        <button
                                            onClick={() => openCloneModal(template)}
                                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-gray-600 hover:text-[var(--admin-primary)] hover:bg-[var(--admin-primary-10)] rounded-lg transition-colors"
                                        >
                                            <Copy className="h-3.5 w-3.5" />
                                            Clone
                                        </button>

                                        {!template.is_default && (
                                            <button
                                                onClick={() => handleSetDefault(template)}
                                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-gray-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                            >
                                                <Star className="h-3.5 w-3.5" />
                                                Set Default
                                            </button>
                                        )}

                                        <button
                                            onClick={() => handleToggleActive(template)}
                                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                                        >
                                            {template.is_active ? (
                                                <ToggleRight className="h-3.5 w-3.5" />
                                            ) : (
                                                <ToggleLeft className="h-3.5 w-3.5" />
                                            )}
                                            {template.is_active ? 'Deactivate' : 'Activate'}
                                        </button>

                                        <div className="flex-1" />

                                        {!template.is_default && (
                                            <button
                                                onClick={() => handleDelete(template)}
                                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Empty State */}
                {filteredTemplates.length === 0 && (
                    <div className="border-2 border-dashed border-gray-200 rounded-3xl p-16 text-center bg-gray-50/50">
                        <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                        <h2 className="text-xl font-black text-gray-900 mb-2">
                            No {typeLabel(activeTab)} Templates
                        </h2>
                        <p className="text-sm font-medium text-gray-500 leading-relaxed max-w-sm mx-auto mb-6">
                            Create a template to customize how {typeLabel(activeTab).toLowerCase()} documents are generated and printed.
                        </p>
                        <button
                            onClick={openCreateModal}
                            className="inline-flex items-center gap-2 px-6 py-3 text-white font-bold rounded-xl shadow-lg text-sm transition-all hover:opacity-90"
                            style={{ backgroundColor: 'var(--admin-primary)' }}
                        >
                            <Plus className="h-4 w-4" />
                            Create Template
                        </button>
                    </div>
                )}
            </div>

            {/* ---- Create Modal ---- */}
            {createModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleCreate} className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <div>
                                <h3 className="font-black text-gray-900">Create Template</h3>
                                <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-widest">
                                    New Document Template
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setCreateModalOpen(false)}
                                className="text-gray-400 hover:text-gray-900 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className={labelCls}>Template Type *</label>
                                <select
                                    required
                                    value={createType}
                                    onChange={(e) => setCreateType(e.target.value)}
                                    className={inputCls}
                                >
                                    {templateTypes.map((t) => (
                                        <option key={t.key} value={t.key}>
                                            {t.label}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-gray-400 mt-1 font-bold">
                                    Template will be pre-populated with default content for this type.
                                </p>
                            </div>

                            <div>
                                <label className={labelCls}>Template Name *</label>
                                <input
                                    required
                                    type="text"
                                    value={createName}
                                    onChange={(e) => setCreateName(e.target.value)}
                                    className={inputCls}
                                    placeholder="e.g. Standard Prescription Template"
                                />
                            </div>

                            <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                                <div>
                                    <p className="font-bold text-gray-900 text-sm">Set as Default</p>
                                    <p className="text-xs text-gray-500 font-medium mt-0.5">
                                        Use this template by default for {typeLabel(createType).toLowerCase()} documents
                                    </p>
                                </div>
                                <Toggle
                                    checked={createDefault}
                                    onChange={setCreateDefault}
                                />
                            </div>

                            <button
                                disabled={creating}
                                type="submit"
                                className="w-full text-center py-4 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 mt-2 hover:opacity-90"
                                style={{ backgroundColor: 'var(--admin-primary)' }}
                            >
                                {creating ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Creating...
                                    </span>
                                ) : (
                                    'Create Template'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ---- Clone Modal ---- */}
            {cloneModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleClone} className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <div>
                                <h3 className="font-black text-gray-900">Clone Template</h3>
                                <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-widest">
                                    Duplicate existing template
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setCloneModalOpen(false)}
                                className="text-gray-400 hover:text-gray-900 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className={labelCls}>New Template Name *</label>
                                <input
                                    required
                                    type="text"
                                    value={cloneName}
                                    onChange={(e) => setCloneName(e.target.value)}
                                    className={inputCls}
                                    placeholder="Enter name for the cloned template"
                                />
                            </div>

                            <button
                                disabled={cloning}
                                type="submit"
                                className="w-full text-center py-4 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 mt-2 hover:opacity-90"
                                style={{ backgroundColor: 'var(--admin-primary)' }}
                            >
                                {cloning ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Cloning...
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        <Copy className="h-4 w-4" />
                                        Clone Template
                                    </span>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </AdminPage>
    );
}
