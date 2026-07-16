'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    User, Stethoscope, ClipboardList, HeartPulse, Shield, FileText,
    Loader2, Save, ArrowLeft,
} from 'lucide-react';
import { getAdmissionFullDetails, updateAdmissionDiagnosis } from '@/app/actions/ipd-actions';
import { fmtIstDateTime } from '@/app/lib/ist';
import { getIPDVitalsHistory, getNursingAssessments } from '@/app/actions/ipd-nursing-actions';
import { VitalsChart } from '@/app/components/ipd/VitalsChart';
import { DischargeSummaryEditor } from '@/app/components/ipd/DischargeSummaryEditor';
import { useToast } from '@/app/components/ui/Toast';

type TabKey = 'profile' | 'diagnosis' | 'clinical' | 'vitals' | 'nursing' | 'discharge';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'profile', label: 'Profile', icon: User },
    { key: 'diagnosis', label: 'Diagnosis', icon: Stethoscope },
    { key: 'clinical', label: 'Clinical', icon: ClipboardList },
    { key: 'vitals', label: 'Vitals', icon: HeartPulse },
    { key: 'nursing', label: 'Nursing', icon: Shield },
    { key: 'discharge', label: 'Discharge Summary', icon: FileText },
];

export default function IpdPatientDetailContent({ admissionId }: { admissionId: string }) {
    const toast = useToast();
    const router = useRouter();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabKey>('profile');

    const [diagnosis, setDiagnosis] = useState('');
    const [primaryIcd, setPrimaryIcd] = useState('');
    const [secondaryDx, setSecondaryDx] = useState('');
    const [savingDiagnosis, setSavingDiagnosis] = useState(false);

    const [vitals, setVitals] = useState<any[]>([]);
    const [loadingVitals, setLoadingVitals] = useState(false);
    const [vitalsLoaded, setVitalsLoaded] = useState(false);

    const [nursingAssessments, setNursingAssessments] = useState<any[]>([]);
    const [loadingNursing, setLoadingNursing] = useState(false);
    const [nursingLoaded, setNursingLoaded] = useState(false);

    const loadDetails = useCallback(async () => {
        setLoading(true);
        const res = await getAdmissionFullDetails(admissionId);
        if (res.success && res.data) {
            setData(res.data);
            setDiagnosis(res.data.diagnosis || '');
            setPrimaryIcd(res.data.primary_diagnosis_icd || '');
            setSecondaryDx(Array.isArray(res.data.secondary_diagnoses) ? res.data.secondary_diagnoses.join(', ') : '');
        } else {
            toast.error((res as any).error || 'IPD admission not found');
            router.replace('/doctor/ipd-patients');
        }
        setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [admissionId]);

    useEffect(() => {
        if (!admissionId) {
            router.replace('/doctor/ipd-patients');
            return;
        }
        loadDetails();
    }, [admissionId, loadDetails, router]);

    useEffect(() => {
        if (activeTab !== 'vitals' || vitalsLoaded) return;
        setLoadingVitals(true);
        getIPDVitalsHistory(admissionId).then((res) => {
            if (res.success) setVitals(res.data as any[]);
            else toast.error('Failed to load vitals');
            setLoadingVitals(false);
            setVitalsLoaded(true);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, admissionId, vitalsLoaded]);

    useEffect(() => {
        if (activeTab !== 'nursing' || nursingLoaded) return;
        setLoadingNursing(true);
        getNursingAssessments(admissionId).then((res) => {
            if (res.success) setNursingAssessments(res.data as any[]);
            else toast.error('Failed to load nursing assessments');
            setLoadingNursing(false);
            setNursingLoaded(true);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, admissionId, nursingLoaded]);

    const handleSaveDiagnosis = async () => {
        setSavingDiagnosis(true);
        try {
            const res = await updateAdmissionDiagnosis({
                admission_id: admissionId,
                diagnosis: diagnosis.trim() || undefined,
                primary_diagnosis_icd: primaryIcd.trim() || undefined,
                secondary_diagnoses: secondaryDx.trim()
                    ? secondaryDx.split(',').map((s) => s.trim()).filter(Boolean)
                    : [],
            });
            if (res.success) {
                toast.success('Diagnosis saved');
                loadDetails();
            } else {
                toast.error(res.error || 'Failed to save diagnosis');
            }
        } finally {
            setSavingDiagnosis(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading patient...
            </div>
        );
    }

    if (!data) return null;

    const inputCls = "w-full p-3 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/30 outline-none font-medium text-gray-900";
    const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] block mb-1.5";

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <button
                onClick={() => router.push('/doctor/ipd-patients')}
                className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-orange-600 mb-4"
            >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to IPD Patients
            </button>

            <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
                <h1 className="text-2xl font-black text-gray-900">{data.patient?.full_name}</h1>
                <div className="flex gap-3 mt-2 text-xs text-gray-500 font-medium flex-wrap">
                    <span className="bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200">{data.patient?.patient_id}</span>
                    {data.patient?.age && <span className="bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200">{data.patient.age}y / {data.patient?.gender || 'N/A'}</span>}
                    <span className="bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200">{data.bed?.wards?.ward_name || 'Ward N/A'} • Bed {data.bed?.bed_id || 'N/A'}</span>
                    <span className="bg-orange-500/10 text-teal-600 px-2 py-0.5 rounded-lg border border-orange-500/20 font-black">{data.status}</span>
                </div>
            </div>

            <div className="flex gap-2 mb-6 border-b border-gray-200 overflow-x-auto">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-wide whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.key ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                        >
                            <Icon className="h-3.5 w-3.5" /> {tab.label}
                        </button>
                    );
                })}
            </div>

            {activeTab === 'profile' && (
                <div className="bg-white border border-gray-200 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <p className={labelCls}>Admission Date</p>
                        <p className="font-bold text-gray-800">{fmtIstDateTime(data.admission_date)}</p>
                    </div>
                    <div>
                        <p className={labelCls}>Attending Doctor</p>
                        <p className="font-bold text-gray-800">{data.doctor_name || 'Not specified'}</p>
                    </div>
                    <div>
                        <p className={labelCls}>Phone</p>
                        <p className="font-bold text-gray-800">{data.patient?.phone || 'N/A'}</p>
                    </div>
                    <div>
                        <p className={labelCls}>Admission Type</p>
                        <p className="font-bold text-gray-800">{data.admission_type || 'N/A'}</p>
                    </div>
                    <div>
                        <p className={labelCls}>Line of Treatment</p>
                        <p className="font-bold text-gray-800">{data.line_of_treatment || 'N/A'}</p>
                    </div>
                    <div>
                        <p className={labelCls}>Code Status</p>
                        <p className="font-bold text-gray-800">{data.code_status || 'N/A'}</p>
                    </div>
                </div>
            )}

            {activeTab === 'diagnosis' && (
                <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 max-w-2xl">
                    <div>
                        <label className={labelCls}>Diagnosis</label>
                        <textarea
                            className={inputCls}
                            rows={3}
                            value={diagnosis}
                            onChange={(e) => setDiagnosis(e.target.value)}
                            placeholder="Working / confirmed diagnosis..."
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Primary ICD Code</label>
                        <input
                            className={inputCls}
                            value={primaryIcd}
                            onChange={(e) => setPrimaryIcd(e.target.value)}
                            placeholder="e.g. J18.9"
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Secondary Diagnoses (comma-separated)</label>
                        <input
                            className={inputCls}
                            value={secondaryDx}
                            onChange={(e) => setSecondaryDx(e.target.value)}
                            placeholder="e.g. Hypertension, Type 2 Diabetes"
                        />
                    </div>
                    <button
                        onClick={handleSaveDiagnosis}
                        disabled={savingDiagnosis}
                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-teal-500/20 disabled:opacity-50"
                    >
                        {savingDiagnosis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Diagnosis
                    </button>
                </div>
            )}

            {activeTab === 'clinical' && (
                <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-2xl p-6">
                        <h3 className="font-black text-gray-700 mb-4 text-sm uppercase tracking-wide">Medical Notes</h3>
                        {data.medical_notes?.length ? (
                            <div className="space-y-3">
                                {data.medical_notes.map((note: any) => (
                                    <div key={note.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs font-black text-teal-600 uppercase">{note.note_type}</span>
                                            <span className="text-[10px] text-gray-400 font-semibold">{new Date(note.created_at).toLocaleString('en-GB')}</span>
                                        </div>
                                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.details}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400">No medical notes recorded.</p>
                        )}
                    </div>

                    <div className="bg-white border border-gray-200 rounded-2xl p-6">
                        <h3 className="font-black text-gray-700 mb-4 text-sm uppercase tracking-wide">Ward Rounds</h3>
                        {data.ward_rounds?.length ? (
                            <div className="space-y-3">
                                {data.ward_rounds.map((round: any) => (
                                    <div key={round.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-black text-teal-600 uppercase">{round.round_type}</span>
                                            <span className="text-[10px] text-gray-400 font-semibold">{new Date(round.created_at).toLocaleString('en-GB')}</span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
                                            {round.subjective && <p><span className="font-bold text-gray-500">S:</span> {round.subjective}</p>}
                                            {round.objective && <p><span className="font-bold text-gray-500">O:</span> {round.objective}</p>}
                                            {round.assessment && <p><span className="font-bold text-gray-500">A:</span> {round.assessment}</p>}
                                            {round.plan && <p><span className="font-bold text-gray-500">P:</span> {round.plan}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400">No ward rounds recorded.</p>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'vitals' && (
                <div className="bg-white border border-gray-200 rounded-2xl p-6">
                    {loadingVitals ? (
                        <div className="flex items-center justify-center py-12 text-gray-400">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading vitals...
                        </div>
                    ) : vitals.length === 0 ? (
                        <p className="text-sm text-gray-400">No vitals recorded yet.</p>
                    ) : (
                        <VitalsChart
                            vitals={vitals.map((v) => ({ ...v, recorded_at: v.created_at }))}
                            mode="vitals"
                        />
                    )}
                </div>
            )}

            {activeTab === 'nursing' && (
                <div className="bg-white border border-gray-200 rounded-2xl p-6">
                    {loadingNursing ? (
                        <div className="flex items-center justify-center py-12 text-gray-400">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading nursing assessments...
                        </div>
                    ) : nursingAssessments.length === 0 ? (
                        <p className="text-sm text-gray-400">No nursing assessments recorded.</p>
                    ) : (
                        <div className="space-y-3">
                            {nursingAssessments.map((a) => (
                                <div key={a.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-black text-teal-600 uppercase">{a.assessment_type}</span>
                                        <span className="text-[10px] text-gray-400 font-semibold">{new Date(a.created_at).toLocaleString('en-GB')}</span>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-600">
                                        <div><span className="font-bold text-gray-400 block">Consciousness</span>{a.consciousness || 'N/A'}</div>
                                        <div><span className="font-bold text-gray-400 block">Pain Score</span>{a.pain_score ?? 'N/A'}</div>
                                        <div><span className="font-bold text-gray-400 block">Fall Risk</span>{a.fall_risk_score ?? 'N/A'}</div>
                                        <div><span className="font-bold text-gray-400 block">Braden Score</span>{a.braden_score ?? 'N/A'}</div>
                                        <div><span className="font-bold text-gray-400 block">Mobility</span>{a.mobility || 'N/A'}</div>
                                        <div><span className="font-bold text-gray-400 block">Continence</span>{a.continence || 'N/A'}</div>
                                        <div><span className="font-bold text-gray-400 block">Nutrition</span>{a.nutrition_screen || 'N/A'}</div>
                                        <div><span className="font-bold text-gray-400 block">Assessed By</span>{a.assessed_by || 'N/A'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'discharge' && (
                <DischargeSummaryEditor admissionId={admissionId} />
            )}
        </div>
    );
}
