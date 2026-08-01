# Discharge Summary — Per-Field Voice Dictation

## Problem

Doctors authoring the IPD Discharge Summary (`app/components/ipd/DischargeSummaryEditor.tsx`)
type ~11 free-text narrative fields by hand. They want to speak instead: click a mic
icon on a field, dictate, and have the transcript land in that field.

## Approach

Reuse the existing voice infrastructure built for patient-portal voice
registration/booking — do not build new STT plumbing.

- `lib/voice/session.ts` → `createVoiceSession('auto')` gives a `VoiceSession` with
  `.listen('text')`, which already does: mic capture → VAD silence detection →
  stream to Groq Whisper via `/api/ws/stt` → auto-detect Hindi/English on the first
  utterance → lock to that language for the rest of the session.
- One `VoiceSession` is created per `DischargeSummaryEditor` mount (not per field),
  so language auto-detect only runs once per discharge-summary editing session,
  not once per mic click.

## Scope — which fields get a mic

11 of the 23 fields (the free-text narrative ones a doctor would actually dictate):

`final_diagnosis_primary`, `final_diagnosis_secondary`, `complaints`,
`medical_history`, `investigations`, `operative_notes`, `course`,
`discharge_medications`, `discharge_instructions`, `follow_up`, `discharge_condition`.

Excluded: short reference/lookup fields (`indoor_no`, `consulting_doctor`,
`class_applicable`, `icd_code`, `procedure_name`, `procedure_date`, `surgeon`,
`assistant_surgeon`, `anaesthetist`, `anaesthesia_type`, `prepared_by`, `verified_by`)
— these are typed defaults, names, codes, or dates, not natural dictation targets.

## Component

New `app/components/ipd/DischargeMicButton.tsx`:

```ts
function DischargeMicButton({ onResult, listen }: {
  onResult: (text: string) => void;
  listen: () => Promise<{ text: string; confidence: number }>;
}) { ... }
```

States: `idle` (outline `Mic` icon) → `listening` (pulsing red `Mic`, disabled while
awaiting the promise — the underlying `listenOnce()` has no interim/partial
callback, so there is no finer-grained "transcribing" sub-state to show) → back to
`idle` on resolve, calling `onResult(text)`. On reject (mic permission denied, STT
network failure, `isSTTSupported()` false on unsupported browsers): flash a `MicOff`
icon + inline red tooltip for ~2s, field is left untouched, then back to `idle`.

Not a new design system component — scoped to this form, colocated in
`app/components/ipd/`.

## Wiring into DischargeSummaryEditor

- `const voiceSessionRef = useRef<VoiceSession | null>(null)`, lazily created on
  first mic click (`voiceSessionRef.current ??= createVoiceSession('auto')`) so
  desktop-only staff who never touch the mic never trigger a mic-permission prompt.
- `Field` and `Area` both gain an optional `mic?: () => Promise<{text:string}>` +
  `onMicResult?: (text: string) => void` pair of props; when present, they render
  `<DischargeMicButton>` in the top-right corner of the field.
- Append behavior on a field that already has text:
  - `Area` fields (multi-line, "one per line" hint): append as a new line —
    `prev ? prev + '\n' + text : text`.
  - The two `Field`-type diagnosis inputs (single-line): append with `, ` —
    `prev ? prev + ', ' + text : text`.
- This is a pure additive wrapper around the existing `set(key, value)` setter —
  no change to `DischargeSummaryData`, no new server action, no schema change.

## Out of scope

- No backend/API changes — reuses `/api/ws/stt` and `/api/public/voice/stt` as-is.
- No continuous/live dictation (interim results) — matches the existing one-shot
  record → silence-detect → transcribe pattern used by voice booking.
- No mic on the 12 excluded fields.
