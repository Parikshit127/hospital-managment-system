'use client';

import { useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

type MicState = 'idle' | 'listening' | 'error';

export function DischargeMicButton({ listen, onResult, className }: {
    listen: () => Promise<{ text: string; confidence: number }>;
    onResult: (text: string) => void;
    className?: string;
}) {
    const [state, setState] = useState<MicState>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const handleClick = async () => {
        if (state === 'listening') return;
        setState('listening');
        try {
            const result = await listen();
            setState('idle');
            if (result.text?.trim()) onResult(result.text.trim());
        } catch (err: unknown) {
            setErrorMsg(err instanceof Error ? err.message : 'Could not transcribe. Try again.');
            setState('error');
            setTimeout(() => setState('idle'), 2000);
        }
    };

    return (
        <span className={`relative inline-flex items-center ${className || ''}`}>
            <button
                type="button"
                onClick={handleClick}
                disabled={state === 'listening'}
                title={state === 'error' ? errorMsg : 'Click and speak'}
                className={`inline-flex items-center justify-center h-6 w-6 rounded-full transition-colors ${
                    state === 'listening'
                        ? 'bg-red-500 text-white animate-pulse'
                        : state === 'error'
                            ? 'bg-red-50 text-red-500'
                            : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                }`}
            >
                {state === 'error' ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            </button>
            {state === 'error' && (
                <span className="absolute left-7 top-0 z-10 whitespace-nowrap rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white shadow-lg">
                    {errorMsg}
                </span>
            )}
        </span>
    );
}
