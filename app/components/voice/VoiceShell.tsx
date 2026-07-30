// app/components/voice/VoiceShell.tsx — [A] Voice UI shell with state indicator
'use client';

import React from 'react';
import type { FSMState } from '@/lib/registration/field-fsm';
import { VOICE_FIELD_ORDER } from '@/lib/registration/field-specs';

interface VoiceShellProps {
  state: FSMState;
  currentFieldIndex: number;
  children: React.ReactNode;
}

const STATE_LABELS: Record<FSMState, string> = {
  IDLE: 'Ready to start',
  GREETING: 'Welcome',
  COLLECT_FIELD: 'Collecting information',
  CONFIRM_FIELD: 'Confirming',
  REVIEW: 'Review & confirm',
  MANUAL_FALLBACK: 'Manual input needed',
  NEXT_OR_SAVE: 'All fields collected',
  SAVE_PATIENT: 'Saving registration',
  SAVE_ERROR: 'Save failed',
  DONE: 'Registration complete',
};

export function VoiceShell({ state, currentFieldIndex, children }: VoiceShellProps) {
  const totalFields = VOICE_FIELD_ORDER.length;
  const progress = Math.min((currentFieldIndex / totalFields) * 100, 100);

  const getStatusColor = () => {
    switch (state) {
      case 'DONE': return 'bg-emerald-500';
      case 'SAVE_ERROR': return 'bg-red-500';
      case 'MANUAL_FALLBACK': return 'bg-amber-500';
      case 'SAVE_PATIENT': return 'bg-blue-500';
      default: return 'bg-emerald-500';
    }
  };

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-gray-500 uppercase tracking-wider">
            {STATE_LABELS[state] || state}
          </span>
          <span className="font-mono text-gray-400">
            {currentFieldIndex}/{totalFields}
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getStatusColor()}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Field steps indicator */}
      <div className="flex gap-1">
        {VOICE_FIELD_ORDER.map((field: { name: string }, i: number) => {
          if (field.name === 'age') return null;
          return (
            <div
              key={field.name}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i < currentFieldIndex
                  ? 'bg-emerald-400'
                  : i === currentFieldIndex
                    ? 'bg-emerald-600 animate-pulse'
                    : 'bg-gray-200'
              }`}
              title={field.name.replace(/_/g, ' ')}
            />
          );
        })}
      </div>

      {children}
    </div>
  );
}

export default VoiceShell;
