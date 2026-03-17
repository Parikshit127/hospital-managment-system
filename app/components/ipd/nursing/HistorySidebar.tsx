'use client';

import React from 'react';
import { Activity, Thermometer, UserRound, ArrowLeftRight, Clock, Coffee, ShieldAlert } from 'lucide-react';

export function HistorySidebar({ notes }: { notes: any[] }) {
    
    if (!notes || notes.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                <div className="p-4 bg-gray-50 rounded-full mb-4">
                    <Clock className="h-8 w-8 text-gray-300" />
                </div>
                <h4 className="text-sm font-black text-gray-700">No History Yet</h4>
                <p className="text-xs text-gray-400 mt-2 font-medium">Record vitals or nursing notes to start building the patient's timeline.</p>
            </div>
        );
    }

    const getIcon = (type: string) => {
        switch (type) {
            case 'Vitals': return <Thermometer className="h-4 w-4" />;
            case 'Doctor Round': return <UserRound className="h-4 w-4" />;
            case 'Nursing Handover': return <ArrowLeftRight className="h-4 w-4" />;
            case 'Diet/Meals': return <Coffee className="h-4 w-4" />;
            default: return <Activity className="h-4 w-4" />;
        }
    };

    const getColor = (type: string) => {
        switch (type) {
            case 'Vitals': return 'bg-rose-50 border-rose-200 text-rose-600';
            case 'Doctor Round': return 'bg-indigo-50 border-indigo-200 text-indigo-600';
            case 'Nursing Handover': return 'bg-emerald-50 border-emerald-200 text-emerald-600';
            case 'Diet/Meals': return 'bg-amber-50 border-amber-200 text-amber-600';
            default: return 'bg-gray-50 border-gray-200 text-gray-600';
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="p-5 border-b border-gray-200 bg-gray-50/50 backdrop-blur-sm sticky top-0 z-10">
                <h3 className="text-sm font-black text-gray-800 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-teal-500" /> 
                    Patient Timeline History
                </h3>
            </div>
            
            <div className="p-5 flex-1 relative">
                {/* Timeline Axis Line */}
                <div className="absolute left-[33px] top-6 bottom-6 w-[2px] bg-gray-100 rounded-full"></div>
                
                <div className="space-y-6 relative z-10">
                    {notes.map((note, index) => {
                        const date = new Date(note.created_at);
                        const isToday = date.toDateString() === new Date().toDateString();
                        
                        return (
                            <div key={note.id || index} className="flex gap-4 group">
                                <div className={`w-8 h-8 rounded-full border-2 shrink-0 flex items-center justify-center mt-0.5 shadow-sm transition-transform group-hover:scale-110 ${getColor(note.note_type)}`}>
                                    {getIcon(note.note_type)}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-start justify-between mb-1">
                                        <h4 className="text-sm font-bold text-gray-800">{note.note_type}</h4>
                                        <div className="text-right shrink-0">
                                            <p className="text-[10px] font-bold text-gray-400">
                                                {isToday ? 'Today' : date.toLocaleDateString()}
                                            </p>
                                            <p className="text-[9px] font-black text-gray-500 tracking-wider">
                                                {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 border border-gray-100 p-3 rounded-xl rounded-tl-sm text-xs text-gray-600 leading-relaxed shadow-sm">
                                        {note.details}
                                    </div>
                                    <div className="mt-2 text-[10px] font-bold text-gray-400 flex items-center gap-1">
                                        <UserRound className="h-3 w-3" /> Recorded by System / Staff
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                
                {notes.length >= 10 && (
                    <div className="mt-8 text-center pb-4">
                        <button className="text-[11px] font-black tracking-widest text-teal-600 hover:text-teal-700 bg-teal-50 hover:bg-teal-100 px-4 py-2 rounded-full transition-colors uppercase">
                            Load Older History
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
