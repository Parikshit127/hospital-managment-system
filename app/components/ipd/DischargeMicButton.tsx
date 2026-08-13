'use client';

import React, { useState, useRef } from 'react';
import { Mic, MicOff, Loader2, Square } from 'lucide-react';
import { transcribeVoiceNote } from '@/app/actions/doctor-actions';

type MicState = 'idle' | 'recording' | 'transcribing' | 'error';

export function DischargeMicButton({
    listen,
    onResult,
    className,
}: {
    listen?: () => Promise<{ text: string; confidence: number }>;
    onResult: (text: string) => void;
    className?: string;
}) {
    const [state, setState] = useState<MicState>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const stopRecording = () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
    };

    const handleClick = async () => {
        if (state === 'transcribing') return;
        if (state === 'recording') {
            stopRecording();
            return;
        }

        setErrorMsg('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            let mimeType = 'audio/webm';
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                mimeType = 'audio/mp4';
            } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
                mimeType = 'audio/ogg';
            }

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach((t) => t.stop());
                    streamRef.current = null;
                }
                if (audioContextRef.current) {
                    try { audioContextRef.current.close(); } catch (_) {}
                    audioContextRef.current = null;
                }

                if (chunksRef.current.length === 0) {
                    setState('idle');
                    return;
                }

                setState('transcribing');
                const cleanMime = mimeType.split(';')[0];
                const ext = cleanMime.includes('mp4') ? 'mp4' : cleanMime.includes('ogg') ? 'ogg' : 'webm';
                const blob = new Blob(chunksRef.current, { type: cleanMime });

                try {
                    const formData = new FormData();
                    formData.append('audio', blob, `recording.${ext}`);
                    const result = await transcribeVoiceNote(formData);
                    if (result.success && result.data) {
                        onResult(result.data);
                        setState('idle');
                    } else {
                        setErrorMsg(result.error || 'Could not transcribe. Try again.');
                        setState('error');
                        setTimeout(() => setState('idle'), 3000);
                    }
                } catch (err) {
                    setErrorMsg(err instanceof Error ? err.message : 'Transcription failed.');
                    setState('error');
                    setTimeout(() => setState('idle'), 3000);
                }
            };

            mediaRecorder.start();
            setState('recording');

            // Set up VAD for auto-stop on silence
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioContextClass();
            audioContextRef.current = audioContext;
            audioContext.resume().catch(() => {});

            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const resetSilenceTimer = (ms: number) => {
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = setTimeout(() => {
                    stopRecording();
                }, ms);
            };

            // 5s initial window to start speaking
            resetSilenceTimer(5000);

            const checkVolume = () => {
                if (mediaRecorder.state === 'inactive') return;
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
                const average = sum / bufferLength;

                if (average > 5) {
                    // 1.5s post-speech silence window
                    resetSilenceTimer(1500);
                }
                requestAnimationFrame(checkVolume);
            };

            requestAnimationFrame(checkVolume);

            // Hard 15s timeout failsafe
            maxTimerRef.current = setTimeout(() => {
                stopRecording();
            }, 15000);
        } catch (err) {
            console.error('Microphone error:', err);
            setErrorMsg('Microphone access denied');
            setState('error');
            setTimeout(() => setState('idle'), 3000);
        }
    };

    return (
        <span className={`relative inline-flex items-center ${className || ''}`}>
            <button
                type="button"
                onClick={handleClick}
                disabled={state === 'transcribing'}
                title={
                    state === 'recording'
                        ? 'Click to stop dictating'
                        : state === 'transcribing'
                            ? 'Transcribing audio...'
                            : state === 'error'
                                ? errorMsg
                                : 'Click to dictate'
                }
                className={`inline-flex items-center justify-center h-6 w-6 rounded-full transition-all ${
                    state === 'recording'
                        ? 'bg-red-500 text-white animate-pulse shadow-md ring-2 ring-red-300'
                        : state === 'transcribing'
                            ? 'bg-indigo-100 text-indigo-600 cursor-wait'
                            : state === 'error'
                                ? 'bg-red-50 text-red-500'
                                : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                }`}
            >
                {state === 'recording' ? (
                    <Square className="h-3 w-3 fill-current" />
                ) : state === 'transcribing' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : state === 'error' ? (
                    <MicOff className="h-3.5 w-3.5" />
                ) : (
                    <Mic className="h-3.5 w-3.5" />
                )}
            </button>
            {state === 'error' && (
                <span className="absolute left-7 top-0 z-10 whitespace-nowrap rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white shadow-lg">
                    {errorMsg}
                </span>
            )}
        </span>
    );
}

