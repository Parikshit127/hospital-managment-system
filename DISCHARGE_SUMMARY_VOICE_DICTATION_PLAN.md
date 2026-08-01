# Discharge Summary Voice Dictation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mic button to the 11 free-text narrative fields on the IPD Discharge Summary form so a doctor can click, speak, and have the transcript appended into that field.

**Architecture:** A new small presentational component (`DischargeMicButton`) wraps the existing `VoiceSession.listen('text')` API (already built and shipped for patient-portal voice booking — mic capture, VAD silence detection, Groq Whisper transcription, Hindi/English auto-detect). One `VoiceSession` is created lazily per editor mount. `Field`/`Area` gain optional mic props; `DischargeSummaryEditor` wires them to an `appendField` helper that appends onto existing text rather than replacing it.

**Tech Stack:** Next.js (React, client components), existing `lib/voice/session.ts` / `lib/voice/stt.ts` (Groq Whisper via WebSocket, already deployed), `lucide-react` icons (`Mic`, `MicOff`).

## Global Constraints

- No new backend/API routes — reuse `/api/ws/stt` and `/api/public/voice/stt` as-is.
- No changes to `DischargeSummaryData` shape, `discharge-summary-actions.ts`, or the DB schema.
- Only these 11 fields get a mic: `final_diagnosis_primary`, `final_diagnosis_secondary`, `complaints`, `medical_history`, `investigations`, `operative_notes`, `course`, `discharge_medications`, `discharge_instructions`, `follow_up`, `discharge_condition`.
- This repo has no automated test runner (no Jest/Vitest/Playwright configured, no `test` script in package.json). Verification is `npx tsc --noEmit` (type-check) + `npm run lint` + manual browser QA — do not invent a test framework.
- One `VoiceSession` per editor mount, created lazily on first mic click (not on component mount) — staff who never click a mic should never trigger a mic-permission prompt.

---

### Task 1: `DischargeMicButton` component

**Files:**
- Create: `app/components/ipd/DischargeMicButton.tsx`

**Interfaces:**
- Consumes: nothing from other tasks — pure presentational component with a `listen` callback prop.
- Produces:
  ```ts
  export function DischargeMicButton(props: {
    listen: () => Promise<{ text: string; confidence: number }>;
    onResult: (text: string) => void;
    className?: string;
  }): JSX.Element
  ```
  Task 2 imports `DischargeMicButton` and passes it a `listen` closure bound to the shared `VoiceSession`.

- [ ] **Step 1: Write the component**

```tsx
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
        } catch (err: any) {
            setErrorMsg(err?.message || 'Could not transcribe. Try again.');
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `DischargeMicButton.tsx`.

- [ ] **Step 3: Commit**

```bash
git add app/components/ipd/DischargeMicButton.tsx
git commit -m "feat: add DischargeMicButton for voice dictation"
```

---

### Task 2: Wire mic buttons into `DischargeSummaryEditor`

**Files:**
- Modify: `app/components/ipd/DischargeSummaryEditor.tsx`

**Interfaces:**
- Consumes: `DischargeMicButton` from Task 1 (`{ listen, onResult, className }` props); `createVoiceSession` from `lib/voice/session.ts` (`createVoiceSession('auto'): VoiceSession`, already exists); `VoiceSession` type from `lib/contracts/voice.ts` (already exists).
- Produces: `Field` and `Area` gain optional `mic?: boolean` prop (nothing outside this file consumes them).

- [ ] **Step 1: Add imports and a lazy voice session ref**

At the top of `app/components/ipd/DischargeSummaryEditor.tsx`, add imports (after the existing imports, before line 20):

```tsx
import { useRef } from 'react';
import { createVoiceSession } from '@/lib/voice/session';
import type { VoiceSession } from '@/lib/contracts/voice';
import { DischargeMicButton } from './DischargeMicButton';
```

(Note: `useRef` must be added to the existing `import React, { useCallback, useEffect, useState } from 'react';` on line 3 instead of a separate import — change line 3 to:
`import React, { useCallback, useEffect, useState, useRef } from 'react';`)

Inside `DischargeSummaryEditor`, right after the existing `const [dischargeDateTime, setDischargeDateTime] = useState('');` (around line 31), add:

```tsx
const voiceSessionRef = useRef<VoiceSession | null>(null);
const getVoiceSession = (): VoiceSession => {
    if (!voiceSessionRef.current) voiceSessionRef.current = createVoiceSession('auto');
    return voiceSessionRef.current;
};
```

- [ ] **Step 2: Run type-check to confirm the new imports/refs compile**

Run: `npx tsc --noEmit`
Expected: no new errors in `DischargeSummaryEditor.tsx` (existing pre-existing errors elsewhere in the repo, if any, are out of scope).

- [ ] **Step 3: Add `appendField` alongside the existing `set` helper**

Right after the existing `set` function (around line 56-59):

```tsx
const set = (k: keyof DischargeSummaryData, v: string) => {
    setData(prev => ({ ...prev, [k]: v }));
    setDirty(true);
};

// Voice dictation appends onto existing text instead of overwriting it, so a
// doctor can click the mic multiple times to build up a multi-line field
// (e.g. dictate one complaint per click). Single-line Field-type fields join
// with ", " instead of a newline since they render as one line.
const appendField = (k: keyof DischargeSummaryData, text: string, separator: '\n' | ', ') => {
    setData(prev => {
        const existing = prev[k];
        return { ...prev, [k]: existing ? `${existing}${separator}${text}` : text };
    });
    setDirty(true);
};
```

- [ ] **Step 4: Add `mic` prop support to `Field` and `Area`**

Replace the `Field` function (currently lines 284-296) with:

```tsx
function Field({ label, value, onChange, placeholder, mic }: {
    label: string; value: string; onChange: (v: string) => void; placeholder?: string;
    mic?: { listen: () => Promise<{ text: string; confidence: number }>; onResult: (text: string) => void };
}) {
    return (
        <div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600 mb-1">
                {label}
                {mic && <DischargeMicButton listen={mic.listen} onResult={mic.onResult} />}
            </label>
            <input
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
        </div>
    );
}
```

Replace the `Area` function (currently lines 298-311) with:

```tsx
function Area({ value, onChange, rows = 3, hint, placeholder, mic }: {
    value: string; onChange: (v: string) => void; rows?: number; hint?: string; placeholder?: string;
    mic?: { listen: () => Promise<{ text: string; confidence: number }>; onResult: (text: string) => void };
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                {hint ? <p className="text-[10px] text-gray-400">{hint}</p> : <span />}
                {mic && <DischargeMicButton listen={mic.listen} onResult={mic.onResult} />}
            </div>
            <textarea
                value={value}
                onChange={e => onChange(e.target.value)}
                rows={rows}
                placeholder={placeholder}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
        </div>
    );
}
```

(This moves the `hint` text above the textarea instead of below it, to sit level with the mic button. This is the one visual layout change from the original.)

- [ ] **Step 5: Attach `mic` to the 11 target fields**

In the JSX body of `DischargeSummaryEditor` (around lines 182-243), update exactly these 11 `Field`/`Area` usages to pass a `mic` prop. Each `mic.listen` calls `getVoiceSession().listen('text')`; each `mic.onResult` calls `appendField` with the field's key and the correct separator.

Final Diagnosis section (was lines 183-184, `icd_code` on line 185 is unchanged/no mic):

```tsx
<Section title="Final Diagnosis">
    <Field label="Primary Diagnosis" value={data.final_diagnosis_primary} onChange={v => set('final_diagnosis_primary', v)}
        mic={{ listen: () => getVoiceSession().listen('text'), onResult: t => appendField('final_diagnosis_primary', t, ', ') }} />
    <Field label="Secondary Diagnosis (if any)" value={data.final_diagnosis_secondary} onChange={v => set('final_diagnosis_secondary', v)}
        mic={{ listen: () => getVoiceSession().listen('text'), onResult: t => appendField('final_diagnosis_secondary', t, ', ') }} />
    <Field label="ICD Code" value={data.icd_code} onChange={v => set('icd_code', v)} />
</Section>
```

Complaints on Admission (was line 189):

```tsx
<Section title="Complaints on Admission">
    <Area value={data.complaints} onChange={v => set('complaints', v)} rows={3} hint="One complaint per line"
        mic={{ listen: () => getVoiceSession().listen('text'), onResult: t => appendField('complaints', t, '\n') }} />
</Section>
```

Medical History (was line 193):

```tsx
<Section title="Medical History">
    <Area value={data.medical_history} onChange={v => set('medical_history', v)} rows={2} placeholder="Past medical history / N/A"
        mic={{ listen: () => getVoiceSession().listen('text'), onResult: t => appendField('medical_history', t, '\n') }} />
</Section>
```

Investigations (was line 197):

```tsx
<Section title="Investigations">
    <Area value={data.investigations} onChange={v => set('investigations', v)} rows={3} hint="One investigation per line"
        mic={{ listen: () => getVoiceSession().listen('text'), onResult: t => appendField('investigations', t, '\n') }} />
</Section>
```

Operative Notes, inside the collapsible Surgery block (was line 218):

```tsx
<div>
    <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600 mb-1">
        Operative Notes
        <DischargeMicButton listen={() => getVoiceSession().listen('text')} onResult={t => appendField('operative_notes', t, '\n')} />
    </label>
    <Area value={data.operative_notes} onChange={v => set('operative_notes', v)} rows={3} />
</div>
```

(This field uses a manual `<label>` instead of `Area`'s built-in mic slot because the original markup already has a separate `<label>` above the `Area` — see original lines 216-219.)

Course During Hospitalization (was lines 225-226):

```tsx
<Section title="Course During Hospitalization">
    <Area value={data.course} onChange={v => set('course', v)} rows={6}
        hint="Admission condition, assessment, procedure, post-op recovery, monitoring, condition at discharge, follow-up"
        mic={{ listen: () => getVoiceSession().listen('text'), onResult: t => appendField('course', t, '\n') }} />
</Section>
```

Discharge Medications (was line 230):

```tsx
<Section title="Discharge Medications">
    <Area value={data.discharge_medications} onChange={v => set('discharge_medications', v)} rows={4} hint="One per line: Name – Dose – Frequency – Duration"
        mic={{ listen: () => getVoiceSession().listen('text'), onResult: t => appendField('discharge_medications', t, '\n') }} />
</Section>
```

Discharge Instructions (was line 234):

```tsx
<Section title="Discharge Instructions">
    <Area value={data.discharge_instructions} onChange={v => set('discharge_instructions', v)} rows={4} hint="One instruction per line"
        mic={{ listen: () => getVoiceSession().listen('text'), onResult: t => appendField('discharge_instructions', t, '\n') }} />
</Section>
```

Follow-Up (was line 238):

```tsx
<Section title="Follow-Up">
    <Area value={data.follow_up} onChange={v => set('follow_up', v)} rows={2} placeholder="Review after X days with Dr. ... in OPD."
        mic={{ listen: () => getVoiceSession().listen('text'), onResult: t => appendField('follow_up', t, '\n') }} />
</Section>
```

Discharge Condition (was line 242):

```tsx
<Section title="Discharge Condition">
    <Area value={data.discharge_condition} onChange={v => set('discharge_condition', v)} rows={2}
        mic={{ listen: () => getVoiceSession().listen('text'), onResult: t => appendField('discharge_condition', t, '\n') }} />
</Section>
```

- [ ] **Step 6: Run type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors or lint warnings introduced by this file. (Pre-existing unrelated lint warnings in this file, if any, are out of scope — do not fix them here.)

- [ ] **Step 7: Commit**

```bash
git add app/components/ipd/DischargeSummaryEditor.tsx
git commit -m "feat: wire voice dictation mic buttons into discharge summary fields"
```

---

### Task 3: Manual browser verification

**Files:** none (verification only — this repo has no automated test runner).

**Interfaces:** none.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Open an in-progress IPD admission's discharge summary**

Navigate to an admission's discharge summary editor (`/ipd/.../discharge-summary` or wherever `DischargeSummaryEditor` is mounted — confirm the route via `grep -rn "DischargeSummaryEditor" app --include=*.tsx` if unsure).

- [ ] **Step 3: Verify mic buttons appear only on the 11 target fields**

Confirm: Primary Diagnosis, Secondary Diagnosis, Complaints, Medical History, Investigations, Operative Notes (expand the Surgery section), Course During Hospitalization, Discharge Medications, Discharge Instructions, Follow-Up, Discharge Condition each show a small mic icon. Confirm Indoor No., Consulting Doctor, Class Applicable, ICD Code, Procedure Name/Date/Surgeon/Assistant Surgeon/Anaesthetist/Anaesthesia Type, Prepared By, Verified By do NOT show a mic icon.

- [ ] **Step 4: Verify the happy path**

Click the mic on "Complaints on Admission", grant mic permission if prompted, speak a short sentence, wait for it to stop listening (icon turns from pulsing red back to idle). Confirm the spoken text appears in the textarea. Click the mic again and speak a second sentence; confirm it appears on a new line below the first (not overwriting it).

- [ ] **Step 5: Verify single-line append behavior**

Click the mic on "Primary Diagnosis" with the field empty, speak a diagnosis, confirm it fills the field. Click the mic again and speak a second phrase; confirm the field now reads `<first>, <second>` on one line.

- [ ] **Step 6: Verify denied-permission handling**

In the browser's site settings, block microphone access for this page, click any mic button, confirm the icon shows an error state (MicOff, red tooltip) for ~2 seconds and then returns to idle without altering the field's existing text. Re-allow microphone access afterward.

- [ ] **Step 7: Verify Save still works end-to-end**

With at least one dictated field populated, click "Save Summary", confirm the toast shows success and the saved values persist on reload.
