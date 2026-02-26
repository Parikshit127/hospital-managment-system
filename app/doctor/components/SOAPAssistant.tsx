'use client';

import { useState } from 'react';
import { Sparkles, Loader2, Tag, X, Brain } from 'lucide-react';
import VoiceRecorder from './VoiceRecorder';

interface SOAPAssistantProps {
    patientId: string;
    soapS: string;
    soapO: string;
    soapA: string;
    soapP: string;
    diagnosis: string;
    onUpdate: (field: 'soapS' | 'soapO' | 'soapA' | 'soapP' | 'diagnosis', value: string) => void;
    disabled?: boolean;
}

export default function SOAPAssistant({
    patientId, soapS, soapO, soapA, soapP, diagnosis, onUpdate, disabled,
}: SOAPAssistantProps) {
    const [generating, setGenerating] = useState(false);
    const [icd10Suggestions, setIcd10Suggestions] = useState<Array<{ code: string; description: string; confidence: number }>>([]);
    const [loadingICD, setLoadingICD] = useState(false);
    const [rawInput, setRawInput] = useState('');
    const [showRawInput, setShowRawInput] = useState(false);
    const [preBrief, setPreBrief] = useState('');
    const [loadingBrief, setLoadingBrief] = useState(false);
    const [showBrief, setShowBrief] = useState(false);

    async function handleGenerateSOAP() {
        const text = rawInput || [soapS, soapO, soapA, soapP].filter(Boolean).join('\n');
        if (!text.trim()) {
            alert('Enter some notes or use voice recording first.');
            return;
        }

        setGenerating(true);
        try {
            const { generateAISOAPNote } = await import('@/app/actions/doctor-actions');
            const result = await generateAISOAPNote(text, patientId);
            if (result.success && result.data) {
                onUpdate('soapS', result.data.subjective);
                onUpdate('soapO', result.data.objective);
                onUpdate('soapA', result.data.assessment);
                onUpdate('soapP', result.data.plan);
                setRawInput('');
                setShowRawInput(false);
            } else {
                alert(result.error || 'AI formatting failed.');
            }
        } catch (err) {
            console.error(err);
            alert('AI service error.');
        } finally {
            setGenerating(false);
        }
    }

    async function handleAutoICD10() {
        const text = diagnosis || soapA;
        if (!text.trim()) return;

        setLoadingICD(true);
        try {
            const { autoSuggestICD10 } = await import('@/app/actions/doctor-actions');
            const result = await autoSuggestICD10(text);
            if (result.success && result.data) {
                setIcd10Suggestions(result.data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingICD(false);
        }
    }

    async function handlePreBrief() {
        setLoadingBrief(true);
        setShowBrief(true);
        try {
            const { getAIPreConsultBrief } = await import('@/app/actions/doctor-actions');
            const result = await getAIPreConsultBrief(patientId);
            if (result.success && result.data) {
                setPreBrief(result.data);
            } else {
                setPreBrief('Failed to generate brief.');
            }
        } catch (err) {
            console.error(err);
            setPreBrief('AI service unavailable.');
        } finally {
            setLoadingBrief(false);
        }
    }

    function handleVoiceTranscription(text: string) {
        if (showRawInput) {
            setRawInput((prev) => (prev ? prev + ' ' + text : text));
        } else {
            onUpdate('soapS', soapS ? soapS + '\n' + text : text);
        }
    }

    const inputCls = "w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400";

    return (
        <div className="space-y-4">
            {/* AI Toolbar */}
            <div className="flex flex-wrap items-center gap-2 bg-gradient-to-r from-violet-500/5 to-teal-500/5 border border-violet-500/10 rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5 text-xs font-black text-violet-400 uppercase tracking-wider mr-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    AI Assist
                </div>

                <VoiceRecorder onTranscription={handleVoiceTranscription} disabled={disabled} />

                <button
                    onClick={() => setShowRawInput(!showRawInput)}
                    className={`px-3 py-2 text-xs font-bold rounded-lg transition ${
                        showRawInput
                            ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                            : 'bg-white/50 text-gray-500 border border-gray-200 hover:border-violet-500/30 hover:text-violet-500'
                    }`}
                >
                    {showRawInput ? 'Hide Raw Input' : 'Free-text → SOAP'}
                </button>

                <button
                    onClick={handleGenerateSOAP}
                    disabled={generating || disabled}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50 transition"
                >
                    {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {generating ? 'Formatting…' : 'AI Format SOAP'}
                </button>

                <button
                    onClick={handlePreBrief}
                    disabled={loadingBrief || disabled}
                    className="flex items-center gap-1.5 px-3 py-2 bg-teal-500/10 text-teal-400 border border-teal-500/20 text-xs font-bold rounded-lg hover:bg-teal-500/20 transition disabled:opacity-50"
                >
                    {loadingBrief ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
                    Pre-Consult Brief
                </button>

                {(diagnosis || soapA) && (
                    <button
                        onClick={handleAutoICD10}
                        disabled={loadingICD || disabled}
                        className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold rounded-lg hover:bg-amber-500/20 transition disabled:opacity-50"
                    >
                        {loadingICD ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tag className="h-3.5 w-3.5" />}
                        Auto ICD-10
                    </button>
                )}
            </div>

            {/* Pre-consult Brief Panel */}
            {showBrief && (
                <div className="bg-teal-500/5 border border-teal-500/10 rounded-xl p-5 relative">
                    <button
                        onClick={() => setShowBrief(false)}
                        className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 rounded"
                    >
                        <X className="h-4 w-4" />
                    </button>
                    <h4 className="text-xs font-black text-teal-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Brain className="h-4 w-4" /> AI Pre-Consultation Brief
                    </h4>
                    {loadingBrief ? (
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                        </div>
                    ) : (
                        <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{preBrief}</div>
                    )}
                </div>
            )}

            {/* Raw Input for AI formatting */}
            {showRawInput && (
                <div>
                    <label className="text-[10px] font-black text-violet-400 uppercase tracking-[0.15em] ml-1 block mb-1.5">
                        Raw Notes (AI will format into SOAP)
                    </label>
                    <textarea
                        value={rawInput}
                        onChange={(e) => setRawInput(e.target.value)}
                        className={`${inputCls} border-violet-200 focus:border-violet-400 focus:ring-violet-400`}
                        placeholder="Type or dictate your rough notes here. E.g.: 'Patient presents with 3 day history of fever, cough, sore throat. Temp 38.5, BP 120/80. Likely viral URI. Plan: symptomatic treatment, rest, follow up in 1 week if no improvement.'"
                        rows={4}
                    />
                </div>
            )}

            {/* ICD-10 Suggestions */}
            {icd10Suggestions.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4">
                    <h4 className="text-xs font-black text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Tag className="h-3.5 w-3.5" /> AI ICD-10 Suggestions
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {icd10Suggestions.map((s, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    const newDiag = diagnosis
                                        ? `${diagnosis} | ${s.code}: ${s.description}`
                                        : `${s.code}: ${s.description}`;
                                    onUpdate('diagnosis', newDiag);
                                }}
                                className="flex items-center gap-2 px-3 py-2 bg-white border border-amber-500/20 rounded-lg hover:border-amber-500/40 hover:bg-amber-50 transition group text-left"
                            >
                                <span className="text-xs font-mono font-bold text-amber-500">{s.code}</span>
                                <span className="text-xs text-gray-600 group-hover:text-gray-800">{s.description}</span>
                                <span className="text-[10px] text-gray-300 ml-1">{Math.round(s.confidence * 100)}%</span>
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setIcd10Suggestions([])}
                        className="mt-2 text-[10px] text-gray-400 hover:text-gray-600"
                    >
                        Dismiss
                    </button>
                </div>
            )}
        </div>
    );
}
