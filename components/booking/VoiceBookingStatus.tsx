'use client';

/**
 * components/booking/VoiceBookingStatus.tsx
 * =====================================================================
 * Track B — Voice kernel UI: Microphone / TTS status indicator
 *
 * MUST have THREE visually distinct states (product designer requirement):
 *   - 'idle'      → Static mic icon. Tap to start.
 *   - 'listening' → Microphone with concentric pulsing rings (sound waves)
 *   - 'thinking'  → Spinning arc + processing indicator  
 *   - 'speaking'  → Five animated audio bars (equalizer effect)
 *
 * Also renders:
 *   - Live transcript of the last utterance heard
 *   - A text label describing the current state
 *   - Step progress indicator
 *
 * Pure presentation component — state and callbacks via props.
 * =====================================================================
 */

import { useEffect, useState } from 'react';
import { Mic, MicOff, Volume2 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VoiceBookingStatusProps {
  state: VoiceState;
  /** Live transcription text shown below the button */
  transcript?: string;
  /** Text the assistant is currently speaking */
  spokenText?: string;
  /** Called when the user taps the mic (only active when state='idle') */
  onMicPress?: () => void;
  /** If true, mic button is non-interactive */
  disabled?: boolean;
  /** Contextual label e.g. "Tell me your symptoms", "Select a doctor" */
  label?: string;
  /** Current step index (1-based, e.g. 3) and total e.g. 6 */
  step?: { current: number; total: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// State metadata
// ─────────────────────────────────────────────────────────────────────────────

const STATE_META: Record<VoiceState, { color: string; bgColor: string; ringColor: string; label: string }> = {
  idle:      { color: 'text-blue-600',   bgColor: 'bg-blue-50',   ringColor: 'ring-blue-200', label: 'Tap the mic to speak' },
  listening: { color: 'text-red-600',    bgColor: 'bg-red-50',    ringColor: 'ring-red-200',  label: 'Listening…' },
  thinking:  { color: 'text-amber-600',  bgColor: 'bg-amber-50',  ringColor: 'ring-amber-200',label: 'Processing…' },
  speaking:  { color: 'text-blue-600',   bgColor: 'bg-blue-50',   ringColor: 'ring-blue-200', label: 'Speaking…' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components for each state visual
// ─────────────────────────────────────────────────────────────────────────────

/** LISTENING — microphone with 3 concentric pulsing rings */
function ListeningVisual() {
  return (
    <div className="relative flex items-center justify-center" aria-hidden="true">
      {/* Outermost ring — slowest */}
      <span
        className="absolute w-24 h-24 rounded-full bg-red-400/10 animate-ping"
        style={{ animationDuration: '1.8s' }}
      />
      {/* Middle ring */}
      <span
        className="absolute w-18 h-18 rounded-full bg-red-400/15 animate-ping"
        style={{ animationDuration: '1.4s', animationDelay: '0.15s', width: '4.5rem', height: '4.5rem' }}
      />
      {/* Inner ring */}
      <span
        className="absolute w-14 h-14 rounded-full bg-red-400/20 animate-ping"
        style={{ animationDuration: '1.0s', animationDelay: '0.3s' }}
      />
      {/* Mic icon */}
      <div className="relative w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg shadow-red-300/50">
        <Mic className="w-7 h-7 text-white" />
      </div>
    </div>
  );
}

/** THINKING — spinning arc */
function ThinkingVisual() {
  return (
    <div className="relative flex items-center justify-center" aria-hidden="true">
      {/* Spinning arc ring */}
      <span
        className="absolute w-20 h-20 rounded-full border-4 border-amber-200 border-t-amber-500 animate-spin"
        style={{ animationDuration: '0.9s' }}
      />
      {/* Brain/processing icon */}
      <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
        {/* Three bouncing dots */}
        <div className="flex items-end gap-1">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-amber-500"
              style={{
                animation: 'voiceDotBounce 0.9s ease-in-out infinite',
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** SPEAKING — five animated equalizer bars */
function SpeakingVisual() {
  const barHeights = [0.6, 0.9, 1.0, 0.75, 0.5]; // relative heights
  const barDelays = [0, 0.1, 0.2, 0.15, 0.05];

  return (
    <div className="relative flex items-center justify-center" aria-hidden="true">
      {/* Outer glow ring */}
      <div className="absolute w-20 h-20 rounded-full bg-blue-100 animate-pulse" />
      {/* Button background */}
      <div className="relative w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-300/50">
        {/* Equalizer bars */}
        <div className="flex items-end justify-center gap-0.5 h-7">
          {barHeights.map((relH, i) => (
            <span
              key={i}
              className="w-1.5 rounded-sm bg-white"
              style={{
                animation: 'voiceBarWave 0.8s ease-in-out infinite alternate',
                animationDelay: `${barDelays[i]}s`,
                minHeight: '4px',
                maxHeight: `${Math.round(relH * 24)}px`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** IDLE — static mic button */
function IdleVisual({ onPress, disabled }: { onPress?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label="Start voice input"
      className={[
        'w-16 h-16 rounded-full flex items-center justify-center',
        'bg-blue-600 text-white shadow-md shadow-blue-200/60',
        'hover:bg-blue-700 active:scale-95 transition-all duration-150',
        'focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      {disabled ? (
        <MicOff className="w-7 h-7" aria-hidden="true" />
      ) : (
        <Mic className="w-7 h-7" aria-hidden="true" />
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS keyframes injected via a style tag (scoped animations)
// Using inline <style> to avoid Tailwind config changes for custom keyframes
// ─────────────────────────────────────────────────────────────────────────────

const KEYFRAME_STYLES = `
@keyframes voiceDotBounce {
  0%, 100% { transform: translateY(0); opacity: 0.6; }
  50%       { transform: translateY(-6px); opacity: 1; }
}
@keyframes voiceBarWave {
  0%   { transform: scaleY(0.3); }
  100% { transform: scaleY(1); }
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function VoiceBookingStatus({
  state,
  transcript,
  spokenText,
  onMicPress,
  disabled = false,
  label,
  step,
}: VoiceBookingStatusProps) {
  const meta = STATE_META[state];
  const [displayedText, setDisplayedText] = useState('');

  // Typewriter effect for spoken text — makes it feel alive
  useEffect(() => {
    if (state !== 'speaking' || !spokenText) {
      setDisplayedText('');
      return;
    }
    let i = 0;
    setDisplayedText('');
    const interval = setInterval(() => {
      setDisplayedText(spokenText.slice(0, i + 1));
      i++;
      if (i >= spokenText.length) clearInterval(interval);
    }, 22);
    return () => clearInterval(interval);
  }, [spokenText, state]);

  return (
    <>
      {/* Inject custom keyframes once */}
      <style>{KEYFRAME_STYLES}</style>

      <div className="flex flex-col items-center gap-5 py-6 select-none">
        {/* ── Step progress ───────────────────────────────────────────────── */}
        {step && (
          <div className="flex items-center gap-1.5" aria-label={`Step ${step.current} of ${step.total}`}>
            {Array.from({ length: step.total }, (_, i) => (
              <span
                key={i}
                className={[
                  'h-1.5 rounded-full transition-all duration-300',
                  i < step.current
                    ? 'bg-blue-600 w-6'
                    : i === step.current - 1
                    ? 'bg-blue-600 w-8'
                    : 'bg-gray-200 w-4',
                ].join(' ')}
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        {/* ── Visual indicator (state-dependent) ──────────────────────────── */}
        <div className="h-24 flex items-center justify-center" aria-live="polite" aria-atomic="true">
          {state === 'idle'      && <IdleVisual onPress={onMicPress} disabled={disabled} />}
          {state === 'listening' && <ListeningVisual />}
          {state === 'thinking'  && <ThinkingVisual />}
          {state === 'speaking'  && <SpeakingVisual />}
        </div>

        {/* ── State label ─────────────────────────────────────────────────── */}
        <div className="text-center">
          <span
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold',
              meta.bgColor, meta.color,
            ].join(' ')}
            aria-live="polite"
          >
            {state === 'listening' && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
            )}
            {state === 'thinking' && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" aria-hidden="true" />
            )}
            {state === 'speaking' && (
              <Volume2 className="w-3 h-3" aria-hidden="true" />
            )}
            {meta.label}
          </span>

          {/* Contextual label from parent */}
          {label && (
            <p className="mt-2 text-sm text-gray-600 font-medium leading-snug max-w-xs text-center">
              {label}
            </p>
          )}
        </div>

        {/* ── Live transcript (listening state) ───────────────────────────── */}
        {state === 'listening' && transcript && (
          <div
            className="w-full max-w-xs bg-gray-50 border border-gray-200 rounded-xl px-4 py-3"
            aria-live="polite"
            aria-label="Transcript"
          >
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Hearing
            </p>
            <p className="text-sm text-gray-800 leading-relaxed italic">
              &ldquo;{transcript}&rdquo;
            </p>
          </div>
        )}

        {/* ── Spoken text (speaking state) with typewriter effect ─────────── */}
        {state === 'speaking' && displayedText && (
          <div
            className="w-full max-w-xs bg-blue-50 border border-blue-100 rounded-xl px-4 py-3"
            aria-live="polite"
            aria-label="Assistant speaking"
          >
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Volume2 className="w-3 h-3" aria-hidden="true" />
              Assistant
            </p>
            <p className="text-sm text-blue-900 leading-relaxed">
              {displayedText}
              <span className="inline-block w-0.5 h-4 bg-blue-400 ml-0.5 animate-pulse" aria-hidden="true" />
            </p>
          </div>
        )}

        {/* ── Hint text for idle state ─────────────────────────────────────── */}
        {state === 'idle' && !disabled && (
          <p className="text-xs text-gray-400 text-center max-w-[200px] leading-relaxed">
            Speak naturally — the assistant understands conversational language
          </p>
        )}
      </div>
    </>
  );
}
