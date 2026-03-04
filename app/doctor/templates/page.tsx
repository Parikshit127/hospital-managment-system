'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/app/components/layout/Sidebar';
import { FileText, Plus, Search, Edit3, Trash2, CheckCircle2, Copy } from 'lucide-react';

export default function DoctorTemplates() {
    const [session, setSession] = useState<{ id: string; username: string; role: string; name?: string; specialty?: string } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        async function fetchSession() {
            try {
                const res = await fetch('/api/session');
                if (res.ok) {
                    const data = await res.json();
                    setSession(data);
                }
            } catch (e) {
                console.error('Failed to fetch session', e);
            }
        }
        fetchSession();
    }, []);

    // Mock data for templates
    const templates = [
        { id: 1, title: 'Standard General Checkup', type: 'Clinical Note', used: 142, lastUpdated: '2 Days Ago', contentPreview: 'Patient presents with [SYMPTOM]. Vitals stable. Plan: [MEDICATION].' },
        { id: 2, title: 'Viral Fever Protocol', type: 'Prescription/Plan', used: 84, lastUpdated: '1 Week Ago', contentPreview: 'Rx Paracetamol 500mg SOS. Advised rest and hydration.' },
        { id: 3, title: 'Hypertension Follow-up', type: 'Clinical Note', used: 156, lastUpdated: '3 Weeks Ago', contentPreview: 'BP checked [VALUE]. Current medication: [MEDS]. No side effects reported.' },
        { id: 4, title: 'Routine Blood Panel Referral', type: 'Lab Order', used: 210, lastUpdated: '1 Month Ago', contentPreview: 'CBC, Lipid Profile, LFT, KFT required for routine screening.' }
    ];

    const inputCls = "w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400 transition-all shadow-sm";

    return (
        <div className="flex h-[calc(100vh-52px)] bg-gray-50 font-sans text-gray-900 overflow-hidden relative lg:pl-60">
            <Sidebar session={session} />

            <main className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto w-full">
                <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 border border-gray-200 bg-white rounded-xl shadow-sm">
                                    <FileText className="h-6 w-6 text-violet-500" />
                                </div>
                                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Clinical Templates</h1>
                            </div>
                            <p className="text-sm text-gray-500 font-medium">Manage your reusable clinical notes and prescription blocks.</p>
                        </div>
                        <button className="px-5 py-2.5 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-bold rounded-xl hover:from-violet-400 hover:to-indigo-500 transition-all flex items-center gap-2 shadow-lg shadow-violet-500/20 text-sm whitespace-nowrap">
                            <Plus className="h-4 w-4" /> Create Template
                        </button>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-gradient-to-br from-teal-500 to-emerald-600 p-6 rounded-2xl text-white shadow-lg shadow-teal-500/20 flex items-center gap-4">
                            <div className="bg-white/20 p-3 rounded-xl border border-white/20">
                                <FileText className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-teal-100 mb-1">Total Templates</p>
                                <h3 className="text-3xl font-black">{templates.length} Active</h3>
                            </div>
                        </div>
                        <div className="bg-gradient-to-br from-violet-500 to-indigo-600 p-6 rounded-2xl text-white shadow-lg shadow-violet-500/20 flex items-center gap-4">
                            <div className="bg-white/20 p-3 rounded-xl border border-white/20">
                                <CheckCircle2 className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-violet-100 mb-1">Time Saved</p>
                                <h3 className="text-3xl font-black flex items-center gap-2">~14 Hours <span className="text-xs font-medium text-violet-200 bg-white/20 px-2 py-0.5 rounded-lg">This Month</span></h3>
                            </div>
                        </div>
                        <div className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm flex items-center gap-4">
                            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl">
                                <Copy className="h-6 w-6 text-amber-500" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Total Uses</p>
                                <h3 className="text-3xl font-black text-gray-800">{templates.reduce((acc, curr) => acc + curr.used, 0)}</h3>
                            </div>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col mt-6">
                        <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row justify-between gap-4 items-center bg-gray-50/50">
                            <div className="flex items-center gap-3">
                                <h2 className="font-black text-gray-800 flex items-center gap-2 block"><FileText className="h-4 w-4 text-violet-400" /> Template Library</h2>
                            </div>
                            <div className="relative w-full sm:w-80 group">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-violet-400 transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Search templates..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className={`${inputCls} focus:ring-violet-500/20 focus:border-violet-500/30`}
                                />
                            </div>
                        </div>

                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50/30">
                            {templates.filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase())).map((template) => (
                                <div key={template.id} className="bg-white border border-gray-200 p-5 rounded-2xl hover:border-violet-500/30 transition-all shadow-sm group">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h3 className="font-bold text-gray-900 group-hover:text-violet-600 transition-colors text-lg">{template.title}</h3>
                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md mt-1.5 inline-block ${template.type === 'Clinical Note' ? 'bg-teal-500/10 text-teal-600 border border-teal-500/20' :
                                                    template.type === 'Lab Order' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' :
                                                        'bg-violet-500/10 text-violet-600 border border-violet-500/20'
                                                }`}>
                                                {template.type}
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all"><Edit3 className="h-4 w-4" /></button>
                                            <button className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"><Trash2 className="h-4 w-4" /></button>
                                        </div>
                                    </div>
                                    <pre className="text-sm text-gray-500 font-sans mt-3 bg-gray-50 p-3 rounded-xl border border-gray-100 whitespace-pre-wrap leading-relaxed truncate group-hover:bg-violet-50/50 group-hover:border-violet-500/10 transition-colors cursor-text">
                                        {template.contentPreview}
                                    </pre>
                                    <div className="flex justify-between items-center mt-5 pt-4 border-t border-gray-100 text-xs text-gray-400 font-medium">
                                        <span>Used {template.used} times</span>
                                        <span>Updated {template.lastUpdated}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
