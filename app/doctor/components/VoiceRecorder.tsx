'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

interface VoiceRecorderProps {
    onTranscription: (text: string) => void;
    disabled?: boolean;
}

export default function VoiceRecorder({ onTranscription, disabled }: VoiceRecorderProps) {
    const [recording, setRecording] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const [duration, setDuration] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                await sendForTranscription(blob);
            };

            mediaRecorder.start();
            setRecording(true);
            setDuration(0);
            timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
        } catch (err) {
            console.error('Microphone access denied:', err);
            alert('Please allow microphone access to use voice recording.');
        }
    }, []);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && recording) {
            mediaRecorderRef.current.stop();
            setRecording(false);
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
    }, [recording]);

    async function sendForTranscription(blob: Blob) {
        setTranscribing(true);
        try {
            const formData = new FormData();
            formData.append('audio', blob, 'recording.webm');

            const { transcribeVoiceNote } = await import('@/app/actions/doctor-actions');
            const result = await transcribeVoiceNote(formData);

            if (result.success && result.data) {
                onTranscription(result.data);
            } else {
                alert(result.error || 'Transcription failed. Is OPENAI_API_KEY configured?');
            }
        } catch (err) {
            console.error('Transcription error:', err);
            alert('Transcription failed.');
        } finally {
            setTranscribing(false);
        }
    }

    const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

    if (transcribing) {
        return (
            <button
                disabled
                className="flex items-center gap-2 px-4 py-2.5 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-xl text-sm font-bold"
            >
                <Loader2 className="h-4 w-4 animate-spin" />
                Transcribing…
            </button>
        );
    }

    if (recording) {
        return (
            <button
                onClick={stopRecording}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-xl text-sm font-bold animate-pulse hover:bg-red-500/20 transition"
            >
                <Square className="h-4 w-4 fill-current" />
                Stop ({formatTime(duration)})
            </button>
        );
    }

    return (
        <button
            onClick={startRecording}
            disabled={disabled}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-500/10 text-teal-400 border border-teal-500/20 rounded-xl text-sm font-bold hover:bg-teal-500/20 transition disabled:opacity-50"
            title="Record voice notes — transcribed via Whisper AI"
        >
            <Mic className="h-4 w-4" />
            Voice
        </button>
    );
}
