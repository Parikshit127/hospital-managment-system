// Pure, client-safe discharge summary data shapes. Split out of discharge-summary.ts
// so client components (admission page, DischargeSummaryEditor) can import DISCHARGE_TYPES
// etc. without pulling in that file's server-only chain (bill-branding -> s3 -> Azure/AWS SDKs).

export const DISCHARGE_TYPES = ['Normal', 'LAMA', 'DAMA', 'Absconded', 'Death', 'Transfer'] as const;

export interface DischargeSummaryData {
    // Header overrides (optional — blank falls back to the live chart value)
    indoor_no: string;
    consulting_doctor: string;
    class_applicable: string;
    // Discharge type/mode — optional; blank leaves the admission's existing value
    // untouched. One of DISCHARGE_TYPES when set (e.g. "LAMA" for Leave Against
    // Medical Advice). Saving a non-blank value here updates admission.discharge_type.
    discharge_type: string;
    // Final diagnosis
    final_diagnosis_primary: string;
    final_diagnosis_secondary: string;
    icd_code: string;
    // Narrative (multiline where noted; one item per line for list-style fields)
    complaints: string;
    medical_history: string;
    investigations: string;
    // Surgery / procedure
    procedure_name: string;
    surgeon: string;
    assistant_surgeon: string;
    anaesthetist: string;
    anaesthesia_type: string;
    procedure_date: string;
    operative_notes: string;
    // Course + discharge
    course: string;
    discharge_medications: string;
    discharge_instructions: string;
    follow_up: string;
    discharge_condition: string;
    prepared_by: string;
    verified_by: string;
}

export const DEFAULT_DISCHARGE_INSTRUCTIONS = [
    'Maintain proper hygiene.',
    'Follow prescribed medications.',
    'Avoid strenuous physical activity as advised.',
    'Follow dietary recommendations.',
    'Return immediately if symptoms worsen.',
].join('\n');

export const DEFAULT_DISCHARGE_CONDITION =
    'Patient is stable, afebrile, ambulatory, tolerating oral diet, and fit for discharge.';

export function emptyDischargeData(): DischargeSummaryData {
    return {
        indoor_no: '',
        consulting_doctor: '',
        class_applicable: '',
        discharge_type: '',
        final_diagnosis_primary: '',
        final_diagnosis_secondary: '',
        icd_code: '',
        complaints: '',
        medical_history: '',
        investigations: '',
        procedure_name: '',
        surgeon: '',
        assistant_surgeon: '',
        anaesthetist: '',
        anaesthesia_type: '',
        procedure_date: '',
        operative_notes: '',
        course: '',
        discharge_medications: '',
        discharge_instructions: '',
        follow_up: '',
        discharge_condition: '',
        prepared_by: '',
        verified_by: '',
    };
}

// Normalise an arbitrary stored JSON blob into a complete DischargeSummaryData (so older
// rows / partial payloads never crash a renderer with `undefined`).
export function normalizeDischargeData(raw: any): DischargeSummaryData {
    const base = emptyDischargeData();
    if (raw && typeof raw === 'object') {
        for (const k of Object.keys(base) as (keyof DischargeSummaryData)[]) {
            if (typeof raw[k] === 'string') base[k] = raw[k];
        }
    }
    return base;
}

/** Render a date as an IST "YYYY-MM-DDTHH:mm" string for a datetime-local input. */
export function toIstLocalInput(value: Date | string | null | undefined): string {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    const g = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
    const hour = g('hour') === '24' ? '00' : g('hour');
    return `${g('year')}-${g('month')}-${g('day')}T${hour}:${g('minute')}`;
}
