'use client';

import React from 'react';
import { Users, Search, Plus, Brain } from 'lucide-react';

interface PatientQueueProps {
    queue: any[];
    activePatient: any;
    setActivePatient: (p: any) => void;
    searchTerm: string;
    setSearchTerm: (s: string) => void;
    viewMode: 'my' | 'all';
    setViewMode: (v: 'my' | 'all') => void;
    loading: boolean;
    isSubmitting: boolean;
    onWalkinClick: () => void;
}

export function PatientQueue({ queue, activePatient, setActivePatient, searchTerm, setSearchTerm, viewMode, setViewMode, loading, isSubmitting, onWalkinClick }: PatientQueueProps) {
    const filteredQueue = queue.filter(p =>
        p.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.digital_id && p.digital_id.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const getStatusStyle = (status?: string) => {
        switch (status?.toLowerCase()) {
            case 'in progress': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            case 'completed': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'cancelled': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
            case 'admitted': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
            default: return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
        }
    };

    return (
        <aside className="w-80 flex flex-col border-r border-gray-200 bg-white">
            <div className="p-5 border-b border-gray-200">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-gray-500 flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-teal-400" /> Patient Queue</h3>
                    <span className="bg-teal-500/10 text-teal-400 text-[10px] px-2.5 py-1 rounded-lg font-black border border-teal-500/20">{filteredQueue.length}</span>
                </div>
                <div className="flex mb-3 bg-gray-100 rounded-lg p-0.5">
                    <button onClick={() => setViewMode('my')} className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-all ${viewMode === 'my' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>My Patients</button>
                    <button onClick={() => setViewMode('all')} className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-all ${viewMode === 'all' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>All Patients</button>
                </div>
                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300 group-focus-within:text-teal-400 transition-colors" />
                    <input type="text" placeholder="Search patient..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none transition-all placeholder:text-gray-400 font-medium text-gray-900" />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {loading ? <div className="text-center p-8 text-gray-400 animate-pulse font-bold">Loading queue...</div> : (
                    filteredQueue.length === 0 ? (
                        <div className="text-center p-12 text-gray-400 text-sm flex flex-col items-center gap-2"><Users className="h-8 w-8 text-gray-200" />No patients found</div>
                    ) : filteredQueue.map((p) => (
                        <div key={p.patient_id} onClick={isSubmitting ? undefined : () => setActivePatient(p)}
                            className={`p-4 rounded-xl cursor-pointer transition-all border group ${activePatient?.patient_id === p.patient_id ? 'bg-teal-500/10 border-teal-500/30 ring-1 ring-teal-500/30' : 'bg-gray-50 hover:bg-gray-100 border-gray-200 hover:border-teal-500/20'} ${isSubmitting ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex justify-between items-start mb-1">
                                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${getStatusStyle(p.status)}`}>{p.status || 'Pending'}</span>
                                <span className="text-[10px] text-gray-300 font-mono">#{p.digital_id ? p.digital_id : p.patient_id.slice(0, 4)}</span>
                            </div>
                            <h4 className="font-bold text-sm truncate text-gray-700 group-hover:text-teal-400 transition-colors">{p.full_name}</h4>
                            <div className="flex gap-2 mt-1 items-center">
                                <span className="text-[10px] text-gray-400">{p.age ? `${p.age}y` : ''}{p.gender ? ` / ${p.gender}` : ''}</span>
                                <span className="text-[10px] text-gray-200">&bull;</span>
                                <span className="text-[10px] text-gray-400">{p.department || 'General'}</span>
                            </div>
                            {p.reason_for_visit && (
                                <p className="text-[10px] text-teal-400/50 mt-1.5 truncate flex items-center gap-1"><Brain className="h-3 w-3 shrink-0" />{p.reason_for_visit}</p>
                            )}
                        </div>
                    ))
                )}
            </div>
            <div className="p-4 border-t border-gray-200">
                <button onClick={onWalkinClick} disabled={isSubmitting} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 font-bold hover:bg-gray-100 hover:text-teal-400 hover:border-teal-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                    <Plus className="h-4 w-4" /> Add Walk-in
                </button>
            </div>
        </aside>
    );
}
