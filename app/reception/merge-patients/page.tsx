'use client';

/**
 * GAP 1 — UHID Merging / Unmerging
 * Reception staff can merge two patient records.
 * Secondary UHID becomes child of Primary.
 */

import React, { useState } from 'react';
import { Search, GitMerge, Unlink, AlertTriangle, CheckCircle, User, Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { mergePatients, unmergePatient, searchMergeablePatients } from '@/app/actions/uhid-merge-actions';

type PatientResult = {
    patient_id: string;
    full_name: string;
    phone: string | null;
    age: string | null;
    gender: string | null;
    date_of_birth: string | null;
};

export default function MergePatientsPage() {
    const { showToast } = useToast();
    const [primaryQuery, setPrimaryQuery] = useState('');
    const [secondaryQuery, setSecondaryQuery] = useState('');
    const [primaryResults, setPrimaryResults] = useState<PatientResult[]>([]);
    const [secondaryResults, setSecondaryResults] = useState<PatientResult[]>([]);
    const [selectedPrimary, setSelectedPrimary] = useState<PatientResult | null>(null);
    const [selectedSecondary, setSelectedSecondary] = useState<PatientResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [unmergeId, setUnmergeId] = useState('');

    const searchPatients = async (query: string, type: 'primary' | 'secondary') => {
        if (query.length < 2) return;
        const res = await searchMergeablePatients(query);
        if (res.success) {
            if (type === 'primary') setPrimaryResults(res.data);
            else setSecondaryResults(res.data);
        }
    };

    const handleMerge = async () => {
        if (!selectedPrimary || !selectedSecondary) {
            showToast('Select both primary and secondary patients', 'error');
            return;
        }
        setLoading(true);
        const res = await mergePatients(selectedPrimary.patient_id, selectedSecondary.patient_id, 'reception');
        setLoading(false);
        if (res.success) {
            showToast(res.message || 'Patients merged successfully', 'success');
            setSelectedPrimary(null);
            setSelectedSecondary(null);
            setPrimaryQuery('');
            setSecondaryQuery('');
        } else {
            showToast(res.error || 'Merge failed', 'error');
        }
    };

    const handleUnmerge = async () => {
        if (!unmergeId.trim()) return;
        setLoading(true);
        const res = await unmergePatient(unmergeId.trim(), 'reception');
        setLoading(false);
        if (res.success) {
            showToast(res.message || 'Patient unmerged', 'success');
            setUnmergeId('');
        } else {
            showToast(res.error || 'Unmerge failed', 'error');
        }
    };

    return (
        <AppShell>
            <div className="max-w-4xl mx-auto p-6 space-y-6">
                <div className="flex items-center gap-3">
                    <GitMerge className="w-7 h-7 text-blue-600" />
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">UHID Merge / Unmerge</h1>
                        <p className="text-sm text-gray-500">Merge duplicate patient records under a single primary UHID</p>
                    </div>
                </div>

                {/* Merge Section */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
                    <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                        <GitMerge className="w-4 h-4" /> Merge Patients
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Primary Patient */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Primary Patient (will be kept)</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                <input
                                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Search by name, UHID, phone..."
                                    value={primaryQuery}
                                    onChange={e => {
                                        setPrimaryQuery(e.target.value);
                                        searchPatients(e.target.value, 'primary');
                                    }}
                                />
                            </div>
                            {primaryResults.length > 0 && !selectedPrimary && (
                                <div className="border border-gray-200 rounded-lg divide-y max-h-48 overflow-y-auto">
                                    {primaryResults.map(p => (
                                        <button
                                            key={p.patient_id}
                                            onClick={() => { setSelectedPrimary(p); setPrimaryResults([]); setPrimaryQuery(p.full_name); }}
                                            className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm"
                                        >
                                            <div className="font-medium">{p.full_name}</div>
                                            <div className="text-gray-500 text-xs">{p.patient_id} · {p.age}y · {p.gender}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {selectedPrimary && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-blue-600 shrink-0" />
                                    <div>
                                        <div className="font-medium text-blue-800 text-sm">{selectedPrimary.full_name}</div>
                                        <div className="text-blue-600 text-xs">{selectedPrimary.patient_id}</div>
                                    </div>
                                    <button onClick={() => { setSelectedPrimary(null); setPrimaryQuery(''); }} className="ml-auto text-blue-400 hover:text-blue-600 text-xs">Clear</button>
                                </div>
                            )}
                        </div>

                        {/* Secondary Patient */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Secondary Patient (will be merged into primary)</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                <input
                                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Search by name, UHID, phone..."
                                    value={secondaryQuery}
                                    onChange={e => {
                                        setSecondaryQuery(e.target.value);
                                        searchPatients(e.target.value, 'secondary');
                                    }}
                                />
                            </div>
                            {secondaryResults.length > 0 && !selectedSecondary && (
                                <div className="border border-gray-200 rounded-lg divide-y max-h-48 overflow-y-auto">
                                    {secondaryResults.map(p => (
                                        <button
                                            key={p.patient_id}
                                            onClick={() => { setSelectedSecondary(p); setSecondaryResults([]); setSecondaryQuery(p.full_name); }}
                                            className="w-full text-left px-3 py-2 hover:bg-orange-50 text-sm"
                                        >
                                            <div className="font-medium">{p.full_name}</div>
                                            <div className="text-gray-500 text-xs">{p.patient_id} · {p.age}y · {p.gender}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {selectedSecondary && (
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-2">
                                    <User className="w-4 h-4 text-orange-600 shrink-0" />
                                    <div>
                                        <div className="font-medium text-orange-800 text-sm">{selectedSecondary.full_name}</div>
                                        <div className="text-orange-600 text-xs">{selectedSecondary.patient_id}</div>
                                    </div>
                                    <button onClick={() => { setSelectedSecondary(null); setSecondaryQuery(''); }} className="ml-auto text-orange-400 hover:text-orange-600 text-xs">Clear</button>
                                </div>
                            )}
                        </div>
                    </div>

                    {selectedPrimary && selectedSecondary && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div className="text-sm text-amber-800">
                                <strong>{selectedSecondary.full_name}</strong> ({selectedSecondary.patient_id}) will become a secondary record under <strong>{selectedPrimary.full_name}</strong> ({selectedPrimary.patient_id}). All documents from both UHIDs will remain searchable. This action can be undone.
                            </div>
                        </div>
                    )}

                    <button
                        onClick={handleMerge}
                        disabled={!selectedPrimary || !selectedSecondary || loading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
                        Merge Patients
                    </button>
                </div>

                {/* Unmerge Section */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                    <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                        <Unlink className="w-4 h-4" /> Unmerge Patient
                    </h2>
                    <p className="text-sm text-gray-500">Enter the secondary UHID to restore it as an independent record.</p>
                    <div className="flex gap-3">
                        <input
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
                            placeholder="Enter secondary UHID (e.g. AVN-2026-00042)"
                            value={unmergeId}
                            onChange={e => setUnmergeId(e.target.value)}
                        />
                        <button
                            onClick={handleUnmerge}
                            disabled={!unmergeId.trim() || loading}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
                            Unmerge
                        </button>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
