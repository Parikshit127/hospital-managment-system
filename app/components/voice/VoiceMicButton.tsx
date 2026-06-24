// app/components/voice/VoiceMicButton.tsx — [A] Mic button with waveform animation
'use client';

import React from 'react';

interface VoiceMicButtonProps {
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function VoiceMicButton({
  isListening,
  isSpeaking,
  isProcessing,
  disabled,
  onClick,
}: VoiceMicButtonProps) {
  const getStatusColor = () => {
    if (isListening) return 'bg-red-500 shadow-red-500/40';
    if (isSpeaking) return 'bg-blue-500 shadow-blue-500/40';
    if (isProcessing) return 'bg-amber-500 shadow-amber-500/40';
    return 'bg-emerald-600 shadow-emerald-600/30 hover:bg-emerald-700';
  };

  const getStatusText = () => {
    if (isListening) return 'Listening...';
    if (isSpeaking) return 'Speaking...';
    if (isProcessing) return 'Processing...';
    return 'Tap to speak';
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || isSpeaking || isProcessing}
        className={`relative w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${getStatusColor()} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
      >
        {/* Pulse animation when listening */}
        {isListening && (
          <>
            <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />
            <span className="absolute inset-[-4px] rounded-full border-2 border-red-300 animate-pulse" />
          </>
        )}

        {/* Mic icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-7 h-7 relative z-10"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      </button>

      <span className="text-xs font-medium text-gray-500">
        {getStatusText()}
      </span>

      {/* Waveform animation when listening */}
      {isListening && (
        <div className="flex items-center gap-1 h-6">
          {[1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              className="w-1 bg-red-400 rounded-full"
              style={{
                animation: `voiceWave 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                height: '8px',
              }}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes voiceWave {
          from { height: 8px; }
          to { height: 24px; }
        }
      `}</style>
    </div>
  );
}

export default VoiceMicButton;
