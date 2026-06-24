'use client';

import React, { useState, useEffect } from 'react';
import { X, Clock, Mail, FileSpreadsheet, Loader2, Save, CalendarDays, AlertCircle, List, Trash2, CalendarRange } from 'lucide-react';
import { saveSchedule } from '@/app/actions/mis-report-actions';

interface MISScheduleModalProps {
    reportId: string;
    currentFilters: Record<string, string>;
    onClose: () => void;
}

export function MISScheduleModal({ reportId, currentFilters, onClose }: MISScheduleModalProps) {
    const [frequency, setFrequency] = useState('daily');
    const [specificDate, setSpecificDate] = useState('');
    const [time, setTime] = useState('08:00');
    const [recipients, setRecipients] = useState('');
    const [format, setFormat] = useState('excel');
    const [channel, setChannel] = useState('email');
    
    const [presets, setPresets] = useState<any[]>([]);
    const [selectedPresetId, setSelectedPresetId] = useState('');
    
    const [isSaving, setIsSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');
    const [schedules, setSchedules] = useState<any[]>([]);
    const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);

    useEffect(() => {
        fetch(`/api/mis/presets?report_id=${reportId}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.data) {
                    setPresets(data.data);
                }
            })
            .catch(() => {});
            
        if (activeTab === 'manage') {
            loadSchedules();
        }
    }, [reportId, activeTab]);

    const loadSchedules = () => {
        setIsLoadingSchedules(true);
        fetch(`/api/mis/schedules?report_id=${reportId}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.data) {
                    setSchedules(data.data);
                }
                setIsLoadingSchedules(false);
            })
            .catch(() => setIsLoadingSchedules(false));
    };

    const handleDeleteSchedule = async (id: string) => {
        if (!confirm('Are you sure you want to delete this schedule?')) return;
        try {
            const res = await fetch(`/api/mis/schedules/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete schedule');
            setSchedules(schedules.filter(s => s.id !== id));
        } catch (e: any) {
            alert(e.message || 'Error deleting schedule');
        }
    };

    const handleSave = async () => {
        setErrorMsg('');
        if (!recipients.trim()) {
            setErrorMsg('Please enter at least one recipient email.');
            return;
        }

        const emailList = recipients.split(',').map(e => e.trim()).filter(Boolean);

        // Convert frequency + time to cron expression
        const [hour, minute] = time.split(':');
        let cronSpec = `${minute} ${hour} * * *`; // daily
        if (frequency === 'weekly') {
            cronSpec = `${minute} ${hour} * * 1`; // every Monday
        } else if (frequency === 'monthly') {
            cronSpec = `${minute} ${hour} 1 * *`; // 1st of every month
        } else if (frequency === 'once') {
            if (!specificDate) {
                setErrorMsg('Please select a specific date for the one-time schedule.');
                return;
            }
            const dateObj = new Date(specificDate);
            if (isNaN(dateObj.getTime())) {
                setErrorMsg('Invalid date selected.');
                return;
            }
            const day = dateObj.getDate();
            const month = dateObj.getMonth() + 1;
            cronSpec = `${minute} ${hour} ${day} ${month} *`;
        }

        setIsSaving(true);
        try {
            const cleanFilters = Object.fromEntries(
                Object.entries(currentFilters).filter(([_, v]) => v !== '')
            );

            await saveSchedule({
                report_id: reportId,
                preset_id: selectedPresetId || undefined,
                filters_json: selectedPresetId ? null : cleanFilters,
                cron_spec: cronSpec,
                format,
                recipients_json: JSON.stringify(emailList),
                channel
            });

            onClose();
        } catch (e: any) {
            setErrorMsg(e.message || 'Failed to save schedule');
        } finally {
            setIsSaving(false);
        }
    };

    const renderManageSchedules = () => {
        if (isLoadingSchedules) {
            return (
                <div className="py-12 flex justify-center items-center">
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                </div>
            );
        }

        if (schedules.length === 0) {
            return (
                <div className="py-12 text-center text-sm font-semibold text-gray-400">
                    No active schedules found.
                </div>
            );
        }

        return (
            <div className="space-y-3">
                {schedules.map(schedule => {
                    const recips = JSON.parse(schedule.recipients_json || '[]');
                    return (
                        <div key={schedule.id} className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-start justify-between gap-3">
                            <div>
                                <div className="text-sm font-bold text-stone-800 flex items-center gap-2">
                                    <Clock className="h-3.5 w-3.5 text-emerald-600" />
                                    {schedule.cron_spec}
                                </div>
                                <div className="text-xs font-semibold text-gray-500 mt-1">
                                    {schedule.format.toUpperCase()} via {schedule.channel}
                                </div>
                                <div className="text-xs text-gray-400 mt-1 truncate max-w-[280px]">
                                    To: {recips.join(', ')}
                                </div>
                                {schedule.report_presets && (
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full inline-block mt-2">
                                        Preset: {schedule.report_presets.name}
                                    </div>
                                )}
                            </div>
                            <button 
                                onClick={() => handleDeleteSchedule(schedule.id)}
                                className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Delete Schedule"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex bg-gray-100 p-1 rounded-xl">
                        <button
                            onClick={() => setActiveTab('create')}
                            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-bold rounded-lg transition-colors ${activeTab === 'create' ? 'bg-white text-stone-900 shadow-sm' : 'text-gray-500 hover:text-stone-700'}`}
                        >
                            <Clock className="h-4 w-4" /> Create
                        </button>
                        <button
                            onClick={() => setActiveTab('manage')}
                            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-bold rounded-lg transition-colors ${activeTab === 'manage' ? 'bg-white text-stone-900 shadow-sm' : 'text-gray-500 hover:text-stone-700'}`}
                        >
                            <List className="h-4 w-4" /> Manage
                        </button>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                
                <div className="p-6 space-y-5">
                    {activeTab === 'manage' ? renderManageSchedules() : (
                        <>
                            {errorMsg && (
                                <div className="p-3 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>{errorMsg}</span>
                                </div>
                            )}

                            {/* Filters Source */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Filters to Apply</label>
                                <select
                                    value={selectedPresetId}
                                    onChange={(e) => setSelectedPresetId(e.target.value)}
                                    className="w-full text-sm font-semibold text-stone-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 cursor-pointer"
                                >
                                    <option value="">Use current active filters</option>
                                    {presets.map(p => (
                                        <option key={p.id} value={p.id}>Preset: {p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Frequency */}
                                <div className={frequency === 'once' ? "col-span-2" : "col-span-1"}>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                                        <CalendarDays className="h-3.5 w-3.5" /> Frequency
                                    </label>
                                    <select
                                        value={frequency}
                                        onChange={(e) => setFrequency(e.target.value)}
                                        className="w-full text-sm font-semibold text-stone-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none appearance-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 cursor-pointer bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 20 20%22><path stroke=%22%236b7280%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%221.5%22 d=%22M6 8l4 4 4-4%22/></svg>')] bg-no-repeat bg-[right_10px_center] bg-[length:16px] pr-8"
                                    >
                                        <option value="once">Once (Specific Date)</option>
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly (Monday)</option>
                                        <option value="monthly">Monthly (1st)</option>
                                    </select>
                                </div>

                                {/* Conditional Date */}
                                {frequency === 'once' && (
                                    <div className="col-span-1">
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                                            <CalendarRange className="h-3.5 w-3.5" /> Date
                                        </label>
                                        <div className="relative group">
                                            <input
                                                type="date"
                                                value={specificDate}
                                                onChange={(e) => setSpecificDate(e.target.value)}
                                                onClick={(e) => {
                                                    try { e.currentTarget.showPicker(); } catch {}
                                                }}
                                                className="w-full text-sm font-semibold text-stone-900 bg-gray-50 hover:bg-white border border-gray-200 rounded-xl pl-10 pr-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all duration-200 shadow-sm hover:border-emerald-300 cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-datetime-edit]:py-0"
                                            />
                                            <CalendarRange className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/70 group-hover:text-emerald-600 transition-colors pointer-events-none" />
                                        </div>
                                    </div>
                                )}

                                {/* Time */}
                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                                        <Clock className="h-3.5 w-3.5" /> Time
                                    </label>
                                    <div className="relative group">
                                        <input
                                            type="time"
                                            value={time}
                                            onChange={(e) => setTime(e.target.value)}
                                            onClick={(e) => {
                                                try { e.currentTarget.showPicker(); } catch {}
                                            }}
                                            className="w-full text-sm font-semibold text-stone-900 bg-gray-50 hover:bg-white border border-gray-200 rounded-xl pl-10 pr-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all duration-200 shadow-sm hover:border-emerald-300 cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:inset-0"
                                        />
                                        <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/70 group-hover:text-emerald-600 transition-colors pointer-events-none" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Format */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                                        <FileSpreadsheet className="h-3.5 w-3.5" /> Format
                                    </label>
                                    <select
                                        value={format}
                                        onChange={(e) => setFormat(e.target.value)}
                                        className="w-full text-sm font-semibold text-stone-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 cursor-pointer"
                                    >
                                        <option value="excel">Excel (.xlsx)</option>
                                        <option value="pdf">PDF Report</option>
                                    </select>
                                </div>

                                {/* Channel */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Channel</label>
                                    <select
                                        value={channel}
                                        onChange={(e) => setChannel(e.target.value)}
                                        className="w-full text-sm font-semibold text-stone-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 cursor-pointer"
                                    >
                                        <option value="email">Email</option>
                                        <option value="whatsapp">WhatsApp (Coming Soon)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Recipients */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                                    <Mail className="h-3.5 w-3.5" /> Recipients
                                </label>
                                <textarea
                                    value={recipients}
                                    onChange={(e) => setRecipients(e.target.value)}
                                    placeholder="director@hospital.com, finance@hospital.com"
                                    className="w-full text-sm font-semibold text-stone-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 h-20 resize-none"
                                />
                                <p className="text-[11px] text-gray-400 mt-1 font-medium">Separate multiple emails with commas.</p>
                            </div>
                        </>
                    )}
                </div>
                
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                    >
                        {activeTab === 'manage' ? 'Close' : 'Cancel'}
                    </button>
                    {activeTab === 'create' && (
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-colors disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save Schedule
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
