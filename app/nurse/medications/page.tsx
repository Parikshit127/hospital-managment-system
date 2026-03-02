'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    Pill, Search, CheckCircle2, Clock, Loader2, User,
    AlertTriangle, XCircle, Filter, Syringe
} from 'lucide-react';
import {
    getMedicationSchedule, administerMedication, updateMedicationStatus
} from '@/app/actions/nurse-actions';

export default function NurseMedicationsPage() {
    const [nurseId, setNurseId] = useState('');
    const [medications, setMedications] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterMode, setFilterMode] = useState<'due' | 'all'>('due');
    const [actionLoading, setActionLoading] = useState<number | null>(null);

    useEffect(() => {
        async function fetchSession() {
            try {
                const res = await fetch('/api/session');
                if (res.ok) {
                    const data = await res.json();
                    setNurseId(data.id || '');
                }
            } catch (e) {
                console.error('Failed to fetch session', e);
            }
        }
        fetchSession();
    }, []);

    const loadMedications = useCallback(async () => {
        setRefreshing(true);
        try {
            const res = await getMedicationSchedule(undefined, filterMode);
            if (res.success) setMedications(res.data || []);
        } catch (e) {
            console.error('Failed to load medications', e);
        } finally {
            setRefreshing(false);
            setLoading(false);
        }
    }, [filterMode]);

    useEffect(() => {
        setLoading(true);
        loadMedications();
    }, [loadMedications]);

    const handleAdminister = async (medId: number) => {
        if (!nurseId) return;
        setActionLoading(medId);
        try {
            const res = await administerMedication(medId, nurseId);
            if (res.success) {
                await loadMedications();
            } else {
                alert(res.error || 'Failed to administer medication.');
            }
        } catch (e) {
            console.error('Administer error', e);
            alert('An error occurred.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleStatusUpdate = async (medId: number, status: string) => {
        setActionLoading(medId);
        try {
            const res = await updateMedicationStatus(medId, status);
            if (res.success) {
                await loadMedications();
            } else {
                alert(res.error || 'Failed to update status.');
            }
        } catch (e) {
            console.error('Status update error', e);
            alert('An error occurred.');
        } finally {
            setActionLoading(null);
        }
    };

    const filteredMedications = medications.filter(m => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            m.patientName?.toLowerCase().includes(q) ||
            m.medication_name?.toLowerCase().includes(q) ||
            m.route?.toLowerCase().includes(q)
        );
    });

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'Scheduled': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'Administered': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'Held': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'Refused': return 'bg-rose-100 text-rose-800 border-rose-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'Scheduled': return <Clock className="h-3 w-3" />;
            case 'Administered': return <CheckCircle2 className="h-3 w-3" />;
            case 'Held': return <AlertTriangle className="h-3 w-3" />;
            case 'Refused': return <XCircle className="h-3 w-3" />;
            default: return null;
        }
    };

    const scheduledCount = medications.filter(m => m.status === 'Scheduled').length;

    return (
        <AppShell
            pageTitle="Medication Administration"
            pageIcon={<Pill className="h-5 w-5" />}
            onRefresh={loadMedications}
            refreshing={refreshing}
            headerActions={
                <div className="flex items-center gap-2">
                    {scheduledCount > 0 && (
                        <span className="bg-amber-50 text-amber-600 text-[10px] font-black px-2.5 py-1 rounded-lg border border-amber-200">
                            {scheduledCount} DUE
                        </span>
                    )}
                </div>
            }
        >
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                {/* Header Controls */}
                <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 justify-between bg-gray-50/50">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search patient, medication, route..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400" />
                        {(['due', 'all'] as const).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setFilterMode(mode)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filterMode === mode
                                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                                    }`}
                            >
                                {mode === 'due' ? 'Due Now' : 'All'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Patient</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Medication</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Dose</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Route</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Scheduled Time</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-teal-400 mx-auto" />
                                    </td>
                                </tr>
                            ) : filteredMedications.length > 0 ? (
                                filteredMedications.map((med: any) => {
                                    const isScheduled = med.status === 'Scheduled';
                                    const isLoading = actionLoading === med.id;

                                    return (
                                        <tr key={med.id} className={`hover:bg-gray-50 transition-colors ${isScheduled ? '' : 'opacity-70'}`}>
                                            <td className="px-6 py-4 font-bold text-gray-900">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-7 w-7 bg-teal-50 rounded-lg flex items-center justify-center shrink-0">
                                                        <User className="h-3.5 w-3.5 text-teal-500" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-sm">{med.patientName}</p>
                                                        <p className="text-[10px] text-gray-400 font-mono">#{med.patientId?.slice(0, 8)}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <Pill className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                                                    <span className="font-bold text-gray-700">{med.medication_name || 'N/A'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-gray-600">{med.dosage || 'N/A'}</td>
                                            <td className="px-6 py-4">
                                                <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200">
                                                    {med.route || 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 text-xs">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {med.scheduled_time ? new Date(med.scheduled_time).toLocaleString() : 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${getStatusStyle(med.status)}`}>
                                                    {getStatusIcon(med.status)}
                                                    {med.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {isScheduled ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleAdminister(med.id)}
                                                            disabled={isLoading}
                                                            className="inline-flex items-center gap-1 text-white font-bold text-xs bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 px-3 py-1.5 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                                                        >
                                                            {isLoading ? (
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                            ) : (
                                                                <Syringe className="h-3 w-3" />
                                                            )}
                                                            Administer
                                                        </button>
                                                        <button
                                                            onClick={() => handleStatusUpdate(med.id, 'Held')}
                                                            disabled={isLoading}
                                                            className="inline-flex items-center gap-1 text-blue-600 font-bold text-xs bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors border border-blue-200 disabled:opacity-50"
                                                        >
                                                            Hold
                                                        </button>
                                                        <button
                                                            onClick={() => handleStatusUpdate(med.id, 'Refused')}
                                                            disabled={isLoading}
                                                            className="inline-flex items-center gap-1 text-rose-600 font-bold text-xs bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg transition-colors border border-rose-200 disabled:opacity-50"
                                                        >
                                                            Refused
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 font-bold text-xs">
                                                        {med.status === 'Administered' && med.administered_at
                                                            ? `Given at ${new Date(med.administered_at).toLocaleTimeString()}`
                                                            : med.status
                                                        }
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                                        <Pill className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                                        <p className="font-medium">
                                            {filterMode === 'due'
                                                ? 'No medications due at this time.'
                                                : 'No medication records found.'
                                            }
                                        </p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </AppShell>
    );
}
