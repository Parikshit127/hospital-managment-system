'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    Activity, Search, Save, Loader2, Heart, Thermometer, Wind,
    HeartPulse, Scale, Ruler, Clock, User, CheckCircle2, X
} from 'lucide-react';
import { recordVitals, getPatientVitals, getWardPatients } from '@/app/actions/nurse-actions';
import { useToast } from '@/app/components/ui/Toast';

export default function NurseVitalsPage() {
    const toast = useToast();
    const [nurseId, setNurseId] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    // Patient search
    const [patients, setPatients] = useState<any[]>([]);
    const [patientSearch, setPatientSearch] = useState('');
    const [showPatientDropdown, setShowPatientDropdown] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<any>(null);

    // Vitals form
    const [bloodPressure, setBloodPressure] = useState('');
    const [heartRate, setHeartRate] = useState('');
    const [temperature, setTemperature] = useState('');
    const [oxygenSat, setOxygenSat] = useState('');
    const [respiratoryRate, setRespiratoryRate] = useState('');
    const [weight, setWeight] = useState('');
    const [height, setHeight] = useState('');
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    // Recent vitals
    const [recentVitals, setRecentVitals] = useState<any[]>([]);
    const [loadingVitals, setLoadingVitals] = useState(false);

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

    const loadPatients = useCallback(async () => {
        setRefreshing(true);
        try {
            const res = await getWardPatients();
            if (res.success) setPatients(res.data || []);
        } catch (e) {
            console.error('Failed to load patients', e);
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadPatients();
    }, [loadPatients]);

    const loadRecentVitals = async (patientId: string) => {
        setLoadingVitals(true);
        try {
            const res = await getPatientVitals(patientId);
            if (res.success) setRecentVitals(res.data || []);
        } catch (e) {
            console.error('Failed to load vitals', e);
        } finally {
            setLoadingVitals(false);
        }
    };

    const handleSelectPatient = (patient: any) => {
        setSelectedPatient(patient);
        setPatientSearch(patient.patientName);
        setShowPatientDropdown(false);
        loadRecentVitals(patient.patientId);
    };

    const clearPatient = () => {
        setSelectedPatient(null);
        setPatientSearch('');
        setRecentVitals([]);
    };

    const resetForm = () => {
        setBloodPressure('');
        setHeartRate('');
        setTemperature('');
        setOxygenSat('');
        setRespiratoryRate('');
        setWeight('');
        setHeight('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPatient || !nurseId) return;

        setSaving(true);
        setSuccessMsg('');
        try {
            const res = await recordVitals({
                patientId: selectedPatient.patientId,
                bloodPressure: bloodPressure || undefined,
                heartRate: heartRate ? Number(heartRate) : undefined,
                temperature: temperature ? Number(temperature) : undefined,
                oxygenSat: oxygenSat ? Number(oxygenSat) : undefined,
                respiratoryRate: respiratoryRate ? Number(respiratoryRate) : undefined,
                weight: weight ? Number(weight) : undefined,
                height: height ? Number(height) : undefined,
                recordedBy: nurseId,
            });
            if (res.success) {
                setSuccessMsg('Vitals recorded successfully.');
                resetForm();
                loadRecentVitals(selectedPatient.patientId);
                setTimeout(() => setSuccessMsg(''), 4000);
            } else {
                toast.error(res.error || 'Failed to record vitals.');
            }
        } catch (e) {
            console.error('Failed to record vitals', e);
            toast.error('An error occurred while recording vitals.');
        } finally {
            setSaving(false);
        }
    };

    const filteredPatients = patients.filter(p =>
        p.patientName?.toLowerCase().includes(patientSearch.toLowerCase())
    );

    const inputCls = "w-full p-3 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400";
    const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1 block mb-1.5";

    return (
        <AppShell
            pageTitle="Record Vitals"
            pageIcon={<Activity className="h-5 w-5" />}
            onRefresh={loadPatients}
            refreshing={refreshing}
        >
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Form Section */}
                <div className="lg:col-span-3">
                    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                        {/* Patient Search */}
                        <div className="p-6 border-b border-gray-200 bg-gray-50/50">
                            <label className={labelCls}>Select Patient</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search admitted patient by name..."
                                    value={patientSearch}
                                    onChange={e => {
                                        setPatientSearch(e.target.value);
                                        setShowPatientDropdown(true);
                                        if (!e.target.value) clearPatient();
                                    }}
                                    onFocus={() => setShowPatientDropdown(true)}
                                    className="w-full pl-9 pr-10 py-3 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400"
                                />
                                {selectedPatient && (
                                    <button
                                        type="button"
                                        onClick={clearPatient}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                                {showPatientDropdown && patientSearch && !selectedPatient && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
                                        {filteredPatients.length > 0 ? filteredPatients.map(p => (
                                            <button
                                                key={p.admissionId}
                                                type="button"
                                                onClick={() => handleSelectPatient(p)}
                                                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3 border-b border-gray-100 last:border-0"
                                            >
                                                <User className="h-4 w-4 text-teal-400 shrink-0" />
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900">{p.patientName}</p>
                                                    <p className="text-[10px] text-gray-400">
                                                        {p.wardName} &middot; Bed {p.bedId || 'N/A'} &middot; {p.diagnosis || 'No diagnosis'}
                                                    </p>
                                                </div>
                                            </button>
                                        )) : (
                                            <div className="px-4 py-6 text-center text-gray-400 text-sm font-medium">No patients found</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {selectedPatient && (
                                <div className="mt-3 bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center gap-3">
                                    <div className="p-2 bg-teal-100 rounded-lg">
                                        <User className="h-4 w-4 text-teal-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-teal-700">{selectedPatient.patientName}</p>
                                        <p className="text-[10px] text-teal-500">
                                            {selectedPatient.wardName} &middot; Bed {selectedPatient.bedId || 'N/A'} &middot; Dr. {selectedPatient.doctorName || 'Unassigned'}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Vital Signs Inputs */}
                        <div className="p-6 space-y-6">
                            {successMsg && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2 text-emerald-700 text-sm font-bold">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                    {successMsg}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* Blood Pressure */}
                                <div>
                                    <label className={labelCls}>
                                        <HeartPulse className="h-3 w-3 inline mr-1 text-rose-400" />
                                        Blood Pressure (mmHg)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 120/80"
                                        value={bloodPressure}
                                        onChange={e => setBloodPressure(e.target.value)}
                                        className={inputCls}
                                    />
                                </div>

                                {/* Heart Rate */}
                                <div>
                                    <label className={labelCls}>
                                        <Heart className="h-3 w-3 inline mr-1 text-pink-400" />
                                        Heart Rate (bpm)
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="e.g. 72"
                                        value={heartRate}
                                        onChange={e => setHeartRate(e.target.value)}
                                        min="0"
                                        max="300"
                                        className={inputCls}
                                    />
                                </div>

                                {/* Temperature */}
                                <div>
                                    <label className={labelCls}>
                                        <Thermometer className="h-3 w-3 inline mr-1 text-orange-400" />
                                        Temperature (C)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        placeholder="e.g. 37.0"
                                        value={temperature}
                                        onChange={e => setTemperature(e.target.value)}
                                        min="30"
                                        max="45"
                                        className={inputCls}
                                    />
                                </div>

                                {/* SpO2 */}
                                <div>
                                    <label className={labelCls}>
                                        <Wind className="h-3 w-3 inline mr-1 text-cyan-400" />
                                        SpO2 (%)
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="e.g. 98"
                                        value={oxygenSat}
                                        onChange={e => setOxygenSat(e.target.value)}
                                        min="0"
                                        max="100"
                                        className={inputCls}
                                    />
                                </div>

                                {/* Respiratory Rate */}
                                <div>
                                    <label className={labelCls}>
                                        <Activity className="h-3 w-3 inline mr-1 text-emerald-400" />
                                        Respiratory Rate (breaths/min)
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="e.g. 16"
                                        value={respiratoryRate}
                                        onChange={e => setRespiratoryRate(e.target.value)}
                                        min="0"
                                        max="60"
                                        className={inputCls}
                                    />
                                </div>

                                {/* Weight */}
                                <div>
                                    <label className={labelCls}>
                                        <Scale className="h-3 w-3 inline mr-1 text-indigo-400" />
                                        Weight (kg)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        placeholder="e.g. 70.5"
                                        value={weight}
                                        onChange={e => setWeight(e.target.value)}
                                        min="0"
                                        className={inputCls}
                                    />
                                </div>

                                {/* Height */}
                                <div className="md:col-span-2">
                                    <label className={labelCls}>
                                        <Ruler className="h-3 w-3 inline mr-1 text-violet-400" />
                                        Height (cm)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        placeholder="e.g. 170"
                                        value={height}
                                        onChange={e => setHeight(e.target.value)}
                                        min="0"
                                        className={inputCls}
                                    />
                                </div>
                            </div>

                            {/* Submit */}
                            <div className="flex justify-end pt-2">
                                <button
                                    type="submit"
                                    disabled={!selectedPatient || saving}
                                    className="px-8 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl hover:from-teal-400 hover:to-emerald-500 flex items-center gap-2 shadow-lg shadow-teal-500/20 disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    Record Vitals
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Recent Vitals Sidebar */}
                <div className="lg:col-span-2">
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden sticky top-24">
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
                            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                <Clock className="h-4 w-4 text-teal-500" /> Recent Vitals
                            </h3>
                            {selectedPatient && (
                                <p className="text-[10px] text-gray-400 mt-0.5">For {selectedPatient.patientName}</p>
                            )}
                        </div>

                        <div className="p-4 max-h-[600px] overflow-y-auto">
                            {!selectedPatient ? (
                                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                    <Activity className="h-10 w-10 text-gray-200 mb-3" />
                                    <p className="text-sm font-bold text-gray-500">Select a Patient</p>
                                    <p className="text-[10px] text-gray-400 mt-1 text-center">Choose a patient to view their recent vitals.</p>
                                </div>
                            ) : loadingVitals ? (
                                <div className="text-center py-12">
                                    <Loader2 className="h-6 w-6 animate-spin text-teal-400 mx-auto" />
                                </div>
                            ) : recentVitals.length === 0 ? (
                                <div className="bg-gray-100 border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm font-bold">
                                    No vitals recorded yet.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {recentVitals.map((v: any, i: number) => (
                                        <div key={v.id || i} className="bg-gray-50 border border-gray-200 rounded-xl p-4 hover:border-teal-500/20 transition-all">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-[10px] font-black text-gray-400 uppercase">
                                                    {v.created_at ? new Date(v.created_at).toLocaleString() : ''}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                {v.blood_pressure && (
                                                    <div className="flex items-center gap-1.5">
                                                        <HeartPulse className="h-3 w-3 text-rose-400" />
                                                        <span className="text-gray-500">BP:</span>
                                                        <span className="font-black text-gray-700">{v.blood_pressure}</span>
                                                    </div>
                                                )}
                                                {v.heart_rate && (
                                                    <div className="flex items-center gap-1.5">
                                                        <Heart className="h-3 w-3 text-pink-400" />
                                                        <span className="text-gray-500">HR:</span>
                                                        <span className="font-black text-gray-700">{v.heart_rate} bpm</span>
                                                    </div>
                                                )}
                                                {v.temperature && (
                                                    <div className="flex items-center gap-1.5">
                                                        <Thermometer className="h-3 w-3 text-orange-400" />
                                                        <span className="text-gray-500">Temp:</span>
                                                        <span className="font-black text-gray-700">{v.temperature}°C</span>
                                                    </div>
                                                )}
                                                {v.oxygen_sat && (
                                                    <div className="flex items-center gap-1.5">
                                                        <Wind className="h-3 w-3 text-cyan-400" />
                                                        <span className="text-gray-500">SpO2:</span>
                                                        <span className="font-black text-gray-700">{v.oxygen_sat}%</span>
                                                    </div>
                                                )}
                                                {v.respiratory_rate && (
                                                    <div className="flex items-center gap-1.5">
                                                        <Activity className="h-3 w-3 text-emerald-400" />
                                                        <span className="text-gray-500">RR:</span>
                                                        <span className="font-black text-gray-700">{v.respiratory_rate}/min</span>
                                                    </div>
                                                )}
                                                {v.weight && (
                                                    <div className="flex items-center gap-1.5">
                                                        <Scale className="h-3 w-3 text-indigo-400" />
                                                        <span className="text-gray-500">Wt:</span>
                                                        <span className="font-black text-gray-700">{v.weight} kg</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
