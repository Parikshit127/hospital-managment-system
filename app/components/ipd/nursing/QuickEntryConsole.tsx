'use client';

import React, { useState } from 'react';
import { Activity, Stethoscope, ArrowLeftRight, Coffee, Send, Loader2, Save } from 'lucide-react';
import { addMedicalNote } from '@/app/actions/ipd-actions';
import { Input } from '@/app/components/ui/Input';
import { Button } from '@/app/components/ui/Button';
import { useToast } from '@/app/components/ui/Toast';

type Tab = 'Vitals' | 'Doctor Round' | 'Nursing Handover' | 'Diet/Meals';

export function QuickEntryConsole({ admissionId, patientName }: { admissionId: string, patientName: string }) {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<Tab>('Vitals');
    const [submitting, setSubmitting] = useState(false);

    // Form states
    const [vitals, setVitals] = useState({ temp: '', bp: '', hr: '', spo2: '' });
    const [doctorNote, setDoctorNote] = useState('');
    const [handoverNote, setHandoverNote] = useState('');
    const [dietNote, setDietNote] = useState('');

    const handleSaveVitals = async () => {
        if (!vitals.temp && !vitals.bp && !vitals.hr && !vitals.spo2) return;
        
        setSubmitting(true);
        const details = `Temp: ${vitals.temp || '--'} °F, BP: ${vitals.bp || '--'} mmHg, HR: ${vitals.hr || '--'} bpm, SpO2: ${vitals.spo2 || '--'}%`;
        
        try {
            await addMedicalNote(admissionId, 'Vitals', details);
            setVitals({ temp: '', bp: '', hr: '', spo2: '' });
            toast.success("Vitals saved successfully");
        } catch (e) {
            console.error(e);
            toast.error("Error saving vitals");
        }
        setSubmitting(false);
    };

    const handleSaveNote = async (type: Tab, content: string, setter: (val: string) => void) => {
        if (!content.trim()) return;
        
        setSubmitting(true);
        try {
            await addMedicalNote(admissionId, type, content);
            setter('');
            toast.success(`${type} saved successfully`);
        } catch (e) {
            console.error(e);
            toast.error(`Error saving ${type}`);
        }
        setSubmitting(false);
    };

    const tabs: { id: Tab, icon: React.ReactNode, label: string }[] = [
        { id: 'Vitals', icon: <Activity className="h-4 w-4" />, label: 'Log Vitals' },
        { id: 'Doctor Round', icon: <Stethoscope className="h-4 w-4" />, label: 'Doctor Round' },
        { id: 'Nursing Handover', icon: <ArrowLeftRight className="h-4 w-4" />, label: 'Handover' },
        { id: 'Diet/Meals', icon: <Coffee className="h-4 w-4" />, label: 'Diet/Meals' },
    ];

    return (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[700px]">
            {/* Console Header */}
            <div className="bg-slate-900 text-white p-5 shrink-0">
                <h2 className="text-xl font-black">Quick Entry Console</h2>
                <p className="text-slate-400 text-xs mt-1 font-medium">Fast action logging for {patientName}</p>
            </div>

            {/* Tabs */}
            <div className="flex bg-slate-50 border-b border-gray-200 p-2 gap-2 shrink-0 overflow-x-auto scrollbar-hide">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-bold rounded-xl transition-all whitespace-nowrap ${
                            activeTab === tab.id 
                            ? 'bg-white text-teal-600 shadow-sm border border-gray-200 ring-1 ring-teal-500/10' 
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="p-6 md:p-8 flex-1 overflow-y-auto bg-slate-50/50">
                
                {/* VITALS TAB */}
                {activeTab === 'Vitals' && (
                    <div className="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="grid grid-cols-2 gap-6">
                            <Input 
                                label="Temperature (°F)" 
                                placeholder="e.g. 98.6"
                                value={vitals.temp}
                                onChange={(e) => setVitals({...vitals, temp: e.target.value})}
                                type="number"
                                step="0.1"
                            />
                            <Input 
                                label="Blood Pressure (mmHg)" 
                                placeholder="e.g. 120/80"
                                value={vitals.bp}
                                onChange={(e) => setVitals({...vitals, bp: e.target.value})}
                            />
                            <Input 
                                label="Heart Rate (bpm)" 
                                placeholder="e.g. 72"
                                value={vitals.hr}
                                onChange={(e) => setVitals({...vitals, hr: e.target.value})}
                                type="number"
                            />
                            <Input 
                                label="SpO2 (%)" 
                                placeholder="e.g. 98"
                                value={vitals.spo2}
                                onChange={(e) => setVitals({...vitals, spo2: e.target.value})}
                                type="number"
                            />
                        </div>
                        
                        <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                            <p className="text-xs text-slate-400 font-medium">Records will be time-stamped automatically.</p>
                            <Button size="lg" onClick={handleSaveVitals} disabled={submitting}>
                                {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
                                Save Vitals
                            </Button>
                        </div>
                    </div>
                )}

                {/* DOCTOR ROUND TAB */}
                {activeTab === 'Doctor Round' && (
                    <div className="max-w-2xl mx-auto h-full flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex-1 bg-white border border-gray-200 rounded-2xl p-2 shadow-inner focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500 transition-all flex flex-col">
                            <textarea 
                                className="w-full h-full p-4 resize-none bg-transparent outline-none text-slate-700 min-h-[300px]"
                                placeholder="Enter clinical notes, new observations, or changes in medication..."
                                value={doctorNote}
                                onChange={(e) => setDoctorNote(e.target.value)}
                            />
                        </div>
                        <div className="mt-6 flex justify-end">
                            <Button size="lg" onClick={() => handleSaveNote('Doctor Round', doctorNote, setDoctorNote)} disabled={submitting || !doctorNote.trim()}>
                                {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Send className="h-5 w-5 mr-2" />}
                                Commit Note
                            </Button>
                        </div>
                    </div>
                )}

                {/* HANDOVER TAB */}
                {activeTab === 'Nursing Handover' && (
                    <div className="max-w-2xl mx-auto h-full flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex-1 bg-emerald-50/30 border border-emerald-100 rounded-2xl p-2 shadow-inner focus-within:ring-2 focus-within:ring-emerald-500 transition-all flex flex-col">
                            <textarea 
                                className="w-full h-full p-4 resize-none bg-transparent outline-none text-slate-700 min-h-[300px]"
                                placeholder="Enter shift handover details, pending tasks, or special instructions for the next shift..."
                                value={handoverNote}
                                onChange={(e) => setHandoverNote(e.target.value)}
                            />
                        </div>
                        <div className="mt-6 flex justify-end">
                            <Button 
                                size="lg" 
                                className="bg-emerald-600 hover:bg-emerald-700 from-emerald-600 to-emerald-700"
                                onClick={() => handleSaveNote('Nursing Handover', handoverNote, setHandoverNote)} 
                                disabled={submitting || !handoverNote.trim()}
                            >
                                {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Send className="h-5 w-5 mr-2" />}
                                Submit Handover
                            </Button>
                        </div>
                    </div>
                )}

                {/* DIET/MEALS TAB */}
                {activeTab === 'Diet/Meals' && (
                    <div className="max-w-2xl mx-auto h-full flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex-1 bg-amber-50/30 border border-amber-100 rounded-2xl p-2 shadow-inner focus-within:ring-2 focus-within:ring-amber-500 transition-all flex flex-col">
                            <textarea 
                                className="w-full h-full p-4 resize-none bg-transparent outline-none text-slate-700 min-h-[300px]"
                                placeholder="Log meals eaten, dietary changes, or fluid intake..."
                                value={dietNote}
                                onChange={(e) => setDietNote(e.target.value)}
                            />
                        </div>
                        <div className="mt-6 flex justify-end">
                            <Button 
                                size="lg" 
                                className="bg-amber-500 hover:bg-amber-600 from-amber-500 to-amber-600 text-white"
                                onClick={() => handleSaveNote('Diet/Meals', dietNote, setDietNote)} 
                                disabled={submitting || !dietNote.trim()}
                            >
                                {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Send className="h-5 w-5 mr-2" />}
                                Log Diet Entry
                            </Button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
