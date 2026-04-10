'use client';

import React, { useState, useEffect } from 'react';
import { FileText, Search, X, Loader2 } from 'lucide-react';
import { getTemplates } from '@/app/actions/doctor-actions';

type Template = {
    id: string;
    title: string;
    type: string;
    contentPreview: string;
    lastUpdated: string;
};

interface TemplatePickerProps {
    doctorId: string;
    filterType?: string;
    onSelect: (content: string, title: string) => void;
    onClose: () => void;
}

export function TemplatePicker({ doctorId, filterType, onSelect, onClose }: TemplatePickerProps) {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        getTemplates(doctorId, filterType).then(r => {
            if (r.success) setTemplates(r.data as Template[]);
            setLoading(false);
        });
    }, [doctorId, filterType]);

    const filtered = templates.filter(t =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.type.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-teal-500" />
                        <h3 className="font-black text-gray-900 text-sm">Apply Template</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Search */}
                <div className="px-5 py-3 border-b border-gray-100">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search templates..."
                            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-teal-500"
                            autoFocus
                        />
                    </div>
                </div>

                {/* List */}
                <div className="overflow-y-auto flex-1 p-3">
                    {loading ? (
                        <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">Loading templates...</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="py-8 text-center text-gray-400">
                            <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm font-medium">
                                {templates.length === 0 ? 'No templates saved yet' : 'No templates match your search'}
                            </p>
                            {templates.length === 0 && (
                                <p className="text-xs mt-1">Create templates in Doctor → Templates</p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {filtered.map(t => {
                                let preview = '';
                                try {
                                    const parsed = JSON.parse(t.contentPreview);
                                    preview = typeof parsed === 'object'
                                        ? Object.values(parsed).filter(Boolean).join(' · ').slice(0, 80)
                                        : String(parsed).slice(0, 80);
                                } catch {
                                    preview = t.contentPreview?.slice(0, 80) || '';
                                }

                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => { onSelect(t.contentPreview, t.title); onClose(); }}
                                        className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-teal-400 hover:bg-teal-50/50 transition-all group"
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-bold text-gray-900 group-hover:text-teal-700">{t.title}</span>
                                            <span className="text-[9px] font-black uppercase tracking-wider text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{t.type}</span>
                                        </div>
                                        {preview && (
                                            <p className="text-xs text-gray-400 truncate">{preview}</p>
                                        )}
                                        <p className="text-[10px] text-gray-300 mt-1">Updated {t.lastUpdated}</p>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
