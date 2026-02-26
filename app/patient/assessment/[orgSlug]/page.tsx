'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
    Heart, ArrowRight, Loader2, CheckCircle2, AlertTriangle,
    Shield, Stethoscope, FlaskConical, Activity
} from 'lucide-react';

const QUESTIONS = [
    {
        id: 'symptoms',
        question: 'What symptoms are you experiencing?',
        type: 'text' as const,
        placeholder: 'E.g., headache, fever, cough, body aches…',
    },
    {
        id: 'duration',
        question: 'How long have you had these symptoms?',
        type: 'choice' as const,
        options: ['Less than 24 hours', '1-3 days', '3-7 days', 'More than a week', 'More than a month'],
    },
    {
        id: 'severity',
        question: 'How would you rate the severity?',
        type: 'choice' as const,
        options: ['Mild — manageable', 'Moderate — affecting daily activities', 'Severe — significant pain/discomfort', 'Critical — needs immediate attention'],
    },
    {
        id: 'history',
        question: 'Do you have any existing medical conditions?',
        type: 'text' as const,
        placeholder: 'E.g., diabetes, hypertension, asthma, or "None"',
    },
    {
        id: 'medications',
        question: 'Are you currently taking any medications?',
        type: 'text' as const,
        placeholder: 'List current medications or "None"',
    },
    {
        id: 'allergies',
        question: 'Do you have any known allergies?',
        type: 'text' as const,
        placeholder: 'Drug or food allergies, or "None"',
    },
];

interface Result {
    summary: string;
    riskLevel: string;
    recommendedTests: string[];
    recommendedSpecialties: string[];
}

export default function AssessmentPage() {
    const params = useParams();
    const orgSlug = params.orgSlug as string;

    const [step, setStep] = useState(-1); // -1 = intro
    const [sessionToken, setSessionToken] = useState('');
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [currentAnswer, setCurrentAnswer] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<Result | null>(null);
    const [orgInfo, setOrgInfo] = useState<{ id: string; name: string } | null>(null);
    const [initError, setInitError] = useState('');

    useEffect(() => {
        loadOrg();
    }, [orgSlug]);

    async function loadOrg() {
        try {
            const res = await fetch(`/api/org-lookup?slug=${orgSlug}`);
            const data = await res.json();
            if (data.success) {
                setOrgInfo(data.data);
            } else {
                setInitError('Hospital not found. Please check the link.');
            }
        } catch {
            setInitError('Unable to load. Please try again.');
        }
    }

    async function handleStart() {
        if (!orgInfo) return;
        setLoading(true);
        try {
            const { startAssessment } = await import('../actions');
            const res = await startAssessment(orgInfo.id);
            if (res.success && res.data) {
                setSessionToken(res.data.sessionToken);
                setStep(0);
            }
        } finally {
            setLoading(false);
        }
    }

    async function handleNext() {
        if (!currentAnswer.trim()) return;
        const q = QUESTIONS[step];

        setLoading(true);
        try {
            const { submitAssessmentStep } = await import('../actions');
            await submitAssessmentStep(sessionToken, {
                question: q.question,
                answer: currentAnswer,
            });

            setAnswers({ ...answers, [q.id]: currentAnswer });
            setCurrentAnswer('');

            if (step < QUESTIONS.length - 1) {
                setStep(step + 1);
            } else {
                // Complete
                const { completeAssessment } = await import('../actions');
                const res = await completeAssessment(sessionToken);
                if (res.success && res.data) {
                    setResult(res.data);
                    setStep(QUESTIONS.length); // results screen
                }
            }
        } finally {
            setLoading(false);
        }
    }

    const riskColors: Record<string, { bg: string; text: string; border: string }> = {
        LOW: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
        MODERATE: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
        HIGH: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
        CRITICAL: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
    };

    // Error state
    if (initError) {
        return (
            <div className="min-h-screen bg-[#f8fbf9] flex items-center justify-center p-4">
                <div className="text-center">
                    <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
                    <p className="text-gray-700 font-semibold">{initError}</p>
                </div>
            </div>
        );
    }

    // Intro screen
    if (step === -1) {
        return (
            <div className="min-h-screen bg-[#f8fbf9] flex items-center justify-center p-4">
                <div className="max-w-md w-full text-center">
                    <div className="w-20 h-20 bg-emerald-500 rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-xl shadow-emerald-500/20">
                        <Heart className="h-10 w-10 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">
                        {orgInfo ? orgInfo.name : 'Health Assessment'}
                    </h1>
                    <p className="text-gray-500 text-sm mb-8">
                        Answer a few quick questions about your symptoms. Our AI will provide a preliminary health assessment and recommend next steps.
                    </p>
                    <button
                        onClick={handleStart}
                        disabled={loading || !orgInfo}
                        className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-2xl transition shadow-xl shadow-emerald-500/20 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Activity className="h-5 w-5" />}
                        {loading ? 'Starting…' : 'Start Assessment'}
                    </button>
                    <p className="mt-6 text-xs text-gray-400">
                        This is not a medical diagnosis. Always consult a healthcare professional.
                    </p>
                </div>
            </div>
        );
    }

    // Results screen
    if (result) {
        const risk = riskColors[result.riskLevel] || riskColors.MODERATE;
        return (
            <div className="min-h-screen bg-[#f8fbf9] p-4 py-10">
                <div className="max-w-lg mx-auto space-y-6">
                    <div className="text-center mb-8">
                        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-gray-900">Assessment Complete</h1>
                        <p className="text-sm text-gray-500 mt-1">{orgInfo?.name}</p>
                    </div>

                    {/* Risk Level */}
                    <div className={`${risk.bg} border ${risk.border} rounded-2xl p-6 text-center`}>
                        <Shield className={`h-8 w-8 ${risk.text} mx-auto mb-2`} />
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Risk Level</p>
                        <p className={`text-2xl font-black ${risk.text}`}>{result.riskLevel}</p>
                    </div>

                    {/* Summary */}
                    <div className="bg-white border border-gray-100 rounded-2xl p-6">
                        <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                            <Activity className="h-5 w-5 text-emerald-500" /> Summary
                        </h3>
                        <p className="text-sm text-gray-600 leading-relaxed">{result.summary}</p>
                    </div>

                    {/* Recommended Tests */}
                    {result.recommendedTests.length > 0 && (
                        <div className="bg-white border border-gray-100 rounded-2xl p-6">
                            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                                <FlaskConical className="h-5 w-5 text-purple-500" /> Recommended Tests
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {result.recommendedTests.map((t, i) => (
                                    <span key={i} className="bg-purple-50 text-purple-700 border border-purple-100 text-xs font-semibold px-3 py-1.5 rounded-lg">
                                        {t}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Recommended Specialties */}
                    {result.recommendedSpecialties.length > 0 && (
                        <div className="bg-white border border-gray-100 rounded-2xl p-6">
                            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                                <Stethoscope className="h-5 w-5 text-blue-500" /> Recommended Specialists
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {result.recommendedSpecialties.map((s, i) => (
                                    <span key={i} className="bg-blue-50 text-blue-700 border border-blue-100 text-xs font-semibold px-3 py-1.5 rounded-lg">
                                        {s}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* CTA */}
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
                        <p className="text-sm text-emerald-800 font-semibold mb-2">
                            Want to book an appointment?
                        </p>
                        <p className="text-xs text-emerald-600 mb-4">
                            {orgInfo?.name && `Contact ${orgInfo.name} to schedule a consultation.`}
                        </p>
                        <a
                            href="/patient/login"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white font-bold rounded-xl text-sm hover:bg-emerald-600 transition"
                        >
                            Sign in to Patient Portal <ArrowRight className="h-4 w-4" />
                        </a>
                    </div>

                    <p className="text-center text-[10px] text-gray-400 mt-4">
                        This AI assessment is for informational purposes only and does not constitute medical advice.
                    </p>
                </div>
            </div>
        );
    }

    // Question flow
    const q = QUESTIONS[step];
    const progress = ((step + 1) / QUESTIONS.length) * 100;

    return (
        <div className="min-h-screen bg-[#f8fbf9] flex items-center justify-center p-4">
            <div className="max-w-md w-full">
                {/* Progress */}
                <div className="mb-8">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                        <span>{orgInfo?.name}</span>
                        <span>{step + 1} of {QUESTIONS.length}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {/* Question */}
                <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm">
                    <h2 className="text-lg font-bold text-gray-900 mb-6">{q.question}</h2>

                    {q.type === 'text' ? (
                        <textarea
                            value={currentAnswer}
                            onChange={(e) => setCurrentAnswer(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10 transition-all outline-none text-sm resize-none"
                            rows={4}
                            placeholder={q.placeholder}
                            autoFocus
                        />
                    ) : (
                        <div className="space-y-2">
                            {q.options?.map((opt) => (
                                <button
                                    key={opt}
                                    onClick={() => setCurrentAnswer(opt)}
                                    className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm font-medium transition ${
                                        currentAnswer === opt
                                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                            : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-emerald-200'
                                    }`}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    )}

                    <button
                        onClick={handleNext}
                        disabled={!currentAnswer.trim() || loading}
                        className="w-full mt-6 flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {step === QUESTIONS.length - 1 ? 'Analyzing…' : 'Saving…'}
                            </>
                        ) : (
                            <>
                                {step === QUESTIONS.length - 1 ? 'Get Results' : 'Next'}
                                <ArrowRight className="h-4 w-4" />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
