'use client';

import React from 'react';
import {
    Brain, Shield, Activity, Stethoscope, Clipboard, Zap, FileText,
    User, Loader2, AlertTriangle, FlaskConical,
    HeartPulse, Heart, Thermometer, Wind
} from 'lucide-react';

interface TriageTabProps {
    triageData: any;
    loadingTriage: boolean;
    onProceedToNotes: () => void;
}

export function TriageTab({ triageData, loadingTriage, onProceedToNotes }: TriageTabProps) {
    if (loadingTriage) {
        return <div className="text-center py-16 text-gray-400 font-bold flex flex-col items-center gap-3"><Loader2 className="h-8 w-8 animate-spin text-teal-400" />Loading AI Assessment...</div>;
    }

    if (!triageData) {
        return (
            <div className="bg-gray-100 border border-dashed border-gray-300 rounded-2xl p-12 text-center">
                <Brain className="h-12 w-12 text-gray-200 mx-auto mb-4" />
                <h3 className="font-black text-gray-500 text-lg mb-1">No AI Assessment Found</h3>
                <p className="text-gray-400 text-sm font-medium">This patient was registered without AI triage. Proceed to Clinical Notes.</p>
            </div>
        );
    }

    const summary = triageData.clinicalSummary || '';
    const sections = [
        { key: 'SUBJECTIVE', icon: <User className="h-4 w-4" />, color: 'teal', label: 'Subjective — History of Present Illness' },
        { key: 'OBJECTIVE', icon: <Activity className="h-4 w-4" />, color: 'cyan', label: 'Objective — Examination & Vitals' },
        { key: 'ASSESSMENT', icon: <Stethoscope className="h-4 w-4" />, color: 'violet', label: 'Assessment — Clinical Impression' },
        { key: 'PLAN', icon: <Clipboard className="h-4 w-4" />, color: 'amber', label: 'Plan — Investigations & Management' },
        { key: 'IMMEDIATE ACTIONS', icon: <Zap className="h-4 w-4" />, color: 'rose', label: 'Immediate Actions Required' },
        { key: 'CLINICAL REASONING', icon: <Brain className="h-4 w-4" />, color: 'emerald', label: 'Clinical Reasoning' },
    ];

    const parsed: Record<string, string> = {};
    let currentKey = '';
    summary.split('\n').forEach((line: string) => {
        const trimmed = line.trim();
        const matchedSection = sections.find(s => trimmed.toUpperCase().startsWith(s.key + ':') || trimmed.toUpperCase() === s.key);
        if (matchedSection) {
            currentKey = matchedSection.key;
            const afterColon = trimmed.substring(trimmed.indexOf(':') + 1).trim();
            parsed[currentKey] = afterColon ? afterColon + '\n' : '';
        } else if (currentKey && trimmed) {
            parsed[currentKey] = (parsed[currentKey] || '') + trimmed + '\n';
        }
    });

    const hasParsed = Object.keys(parsed).length > 0;
    const colorMap: Record<string, string> = { teal: 'border-teal-500/20 bg-teal-500/[0.03]', cyan: 'border-cyan-500/20 bg-cyan-500/[0.03]', violet: 'border-violet-500/20 bg-violet-500/[0.03]', amber: 'border-amber-500/20 bg-amber-500/[0.03]', rose: 'border-rose-500/20 bg-rose-500/[0.03]', emerald: 'border-emerald-500/20 bg-emerald-500/[0.03]' };
    const textColorMap: Record<string, string> = { teal: 'text-teal-400', cyan: 'text-cyan-400', violet: 'text-violet-400', amber: 'text-amber-400', rose: 'text-rose-400', emerald: 'text-emerald-400' };

    return (
        <div className="max-w-4xl space-y-6">
            {/* Triage Level Banner */}
            <div className={`rounded-2xl p-5 border flex items-center justify-between ${triageData.triageLevel === 'Emergency' ? 'bg-red-500/5 border-red-500/20' : triageData.triageLevel === 'Urgent' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${triageData.triageLevel === 'Emergency' ? 'bg-red-500/10' : triageData.triageLevel === 'Urgent' ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
                        <Shield className={`h-6 w-6 ${triageData.triageLevel === 'Emergency' ? 'text-red-400' : triageData.triageLevel === 'Urgent' ? 'text-amber-400' : 'text-emerald-400'}`} />
                    </div>
                    <div>
                        <span className={`text-[10px] font-black uppercase tracking-[0.2em] block ${triageData.triageLevel === 'Emergency' ? 'text-red-400/60' : triageData.triageLevel === 'Urgent' ? 'text-amber-400/60' : 'text-emerald-400/60'}`}>Triage Level</span>
                        <span className={`text-xl font-black ${triageData.triageLevel === 'Emergency' ? 'text-red-400' : triageData.triageLevel === 'Urgent' ? 'text-amber-400' : 'text-emerald-400'}`}>{triageData.triageLevel}</span>
                    </div>
                </div>
                <div className="text-right">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Department</span>
                    <span className="text-sm font-black text-gray-700">{triageData.recommendedDepartment}</span>
                    <span className="text-[10px] text-gray-300 block mt-0.5">{triageData.triageDate ? new Date(triageData.triageDate).toLocaleString() : ''}</span>
                </div>
            </div>

            {/* Vitals Row */}
            {triageData.vitals && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center hover:border-teal-500/20 transition-all">
                        <HeartPulse className="h-5 w-5 text-rose-400 mx-auto mb-2" />
                        <span className="text-[10px] font-black text-gray-400 uppercase block">Blood Pressure</span>
                        <span className="text-lg font-black text-gray-700">{triageData.vitals.bloodPressure || 'N/A'}</span>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center hover:border-teal-500/20 transition-all">
                        <Heart className="h-5 w-5 text-pink-400 mx-auto mb-2" />
                        <span className="text-[10px] font-black text-gray-400 uppercase block">Heart Rate</span>
                        <span className="text-lg font-black text-gray-700">{triageData.vitals.heartRate ? `${triageData.vitals.heartRate} BPM` : 'N/A'}</span>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center hover:border-teal-500/20 transition-all">
                        <Thermometer className="h-5 w-5 text-orange-400 mx-auto mb-2" />
                        <span className="text-[10px] font-black text-gray-400 uppercase block">Temperature</span>
                        <span className="text-lg font-black text-gray-700">{triageData.vitals.temperature ? `${triageData.vitals.temperature}°C` : 'N/A'}</span>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center hover:border-teal-500/20 transition-all">
                        <Wind className="h-5 w-5 text-cyan-400 mx-auto mb-2" />
                        <span className="text-[10px] font-black text-gray-400 uppercase block">SpO2</span>
                        <span className="text-lg font-black text-gray-700">{triageData.vitals.oxygenSat ? `${triageData.vitals.oxygenSat}%` : 'N/A'}</span>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                    <h4 className="font-black text-gray-500 text-xs uppercase tracking-wider mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-teal-400" /> Reported Symptoms</h4>
                    <div className="flex flex-wrap gap-2">
                        {triageData.symptoms?.map((s: string, i: number) => (
                            <span key={i} className="bg-teal-500/10 text-teal-400 border border-teal-500/20 text-xs font-bold px-3 py-1.5 rounded-lg">{s}</span>
                        ))}
                    </div>
                    <div className="mt-3 text-xs text-gray-400"><span className="font-bold">Duration:</span> {triageData.duration || 'Not specified'} &middot; <span className="font-bold">Severity:</span> {triageData.severity || 'N/A'}</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                    <h4 className="font-black text-gray-500 text-xs uppercase tracking-wider mb-3 flex items-center gap-2"><Zap className="h-4 w-4 text-violet-400" /> Possible Conditions</h4>
                    <div className="space-y-2">
                        {triageData.possibleConditions?.map((c: string, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-sm text-gray-500"><div className="h-1.5 w-1.5 rounded-full bg-violet-400 shrink-0" />{c}</div>
                        ))}
                    </div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                    <h4 className="font-black text-gray-500 text-xs uppercase tracking-wider mb-3 flex items-center gap-2"><FlaskConical className="h-4 w-4 text-amber-400" /> Recommended Tests</h4>
                    <div className="flex flex-wrap gap-2">
                        {triageData.recommendedTests?.map((t: string, i: number) => (
                            <span key={i} className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold px-3 py-1.5 rounded-lg">{t}</span>
                        ))}
                    </div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                    <h4 className="font-black text-gray-500 text-xs uppercase tracking-wider mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-cyan-400" /> Medical History</h4>
                    <div className="space-y-2 text-sm text-gray-500">
                        <div><span className="font-bold text-gray-400 text-xs">PMH: </span>{triageData.pastMedicalHistory || 'None reported'}</div>
                        <div><span className="font-bold text-gray-400 text-xs">Medications: </span>{triageData.currentMedications || 'None'}</div>
                        <div><span className="font-bold text-gray-400 text-xs">Allergies: </span>{triageData.allergies || 'NKDA'}</div>
                    </div>
                </div>
            </div>

            {triageData.riskAlerts?.length > 0 && (
                <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-5">
                    <h4 className="font-black text-rose-400/80 text-xs uppercase tracking-wider mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Risk Alerts</h4>
                    <div className="space-y-2">
                        {triageData.riskAlerts.map((a: string, i: number) => (
                            <div key={i} className="text-sm text-rose-300/70 font-medium">{a}</div>
                        ))}
                    </div>
                </div>
            )}

            {/* Clinical Summary */}
            <div className="space-y-4">
                <h4 className="font-black text-gray-500 text-xs uppercase tracking-[0.15em] flex items-center gap-2"><Brain className="h-4 w-4 text-teal-400" /> AI Clinical Assessment — Detailed Report</h4>
                {!hasParsed ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
                        <pre className="text-sm text-gray-500 whitespace-pre-wrap leading-relaxed font-sans">{summary}</pre>
                    </div>
                ) : sections.filter(s => parsed[s.key]).map(section => (
                    <div key={section.key} className={`border rounded-xl p-5 ${colorMap[section.color]} transition-all hover:border-opacity-40`}>
                        <div className={`flex items-center gap-2 mb-3 ${textColorMap[section.color]}`}>
                            {section.icon}
                            <span className="font-black text-xs uppercase tracking-wider">{section.label}</span>
                        </div>
                        <div className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">{parsed[section.key]?.trim()}</div>
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-[11px] text-gray-400 font-medium max-w-lg">This is an AI-assisted clinical assessment. All findings should be verified through physical examination and diagnostic confirmation.</p>
                <button onClick={onProceedToNotes} className="px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl hover:from-teal-400 hover:to-emerald-500 flex items-center gap-2 shadow-lg shadow-teal-500/20 shrink-0 ml-4">
                    <FileText className="h-4 w-4" /> Proceed to Clinical Notes
                </button>
            </div>
        </div>
    );
}
