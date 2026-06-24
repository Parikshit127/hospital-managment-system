// app/components/voice/VoiceTranscript.tsx — [A] Live transcript display
'use client';

import React, { useRef, useEffect } from 'react';

interface TranscriptEntry {
  role: 'assistant' | 'user';
  text: string;
}

interface VoiceTranscriptProps {
  entries: TranscriptEntry[];
  maxHeight?: string;
}

export function VoiceTranscript({ entries, maxHeight = '200px' }: VoiceTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <div
      className="border border-gray-100 rounded-2xl bg-white shadow-inner overflow-y-auto"
      style={{ maxHeight }}
    >
      <div className="p-5 space-y-4">
        {entries.map((entry, i) => (
          <div
            key={i}
            className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-4 py-3 text-[15px] leading-relaxed shadow-sm ${
                entry.role === 'user'
                  ? 'bg-emerald-600 text-white rounded-2xl rounded-tr-sm'
                  : 'bg-gray-100 border border-gray-200 text-gray-800 rounded-2xl rounded-tl-sm'
              }`}
            >
              <span className={`text-[10px] font-black uppercase tracking-widest block mb-1 ${entry.role === 'user' ? 'text-emerald-200' : 'text-gray-400'}`}>
                {entry.role === 'user' ? 'You' : 'Assistant'}
              </span>
              {entry.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default VoiceTranscript;
