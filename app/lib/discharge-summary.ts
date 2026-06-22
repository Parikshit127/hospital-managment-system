// Shared definitions + renderers for the structured NABH-format IPD discharge summary.
// Used by both the server actions (to persist a rendered text copy) and the print route
// (to produce the printable HTML). Renderers are pure — they take already-fetched records
// so they work with either the tenant `db` or the top-level `prisma` client.

import {
    BillBranding,
    inlineHeaderHtml,
    billFooterHtml,
    fmtBillDateTime,
    fmtBillDate,
} from '@/app/lib/bill-branding';

// Doctor-authored, free-text sections of the discharge summary. Header/demographic fields
// (patient name, UHID, ward, dates, …) are NOT stored here — they are derived live from the
// admission/patient/bed/ward records at render time so they always stay current. Only the
// few header values a doctor may need to override are kept (indoor_no, consulting_doctor,
// class_applicable).
export interface DischargeSummaryData {
    // Header overrides (optional — blank falls back to the live chart value)
    indoor_no: string;
    consulting_doctor: string;
    class_applicable: string;
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

// Live demographic / stay header derived from the chart records.
export interface DischargeHeaderContext {
    patient_name: string;
    age_gender: string;
    indoor_no: string;
    uhid: string;
    consulting_doctor: string;
    ward: string;
    bed_no: string;
    floor: string;
    class_applicable: string;
    admission_dt: string;
    discharge_dt: string;
    discharge_status: string;
}

// Build the header context from the admission (+ included patient, bed, ward).
// `data` overrides are applied where the doctor provided them.
export function buildDischargeHeader(admission: any, data?: Partial<DischargeSummaryData>): DischargeHeaderContext {
    const patient = admission?.patient || {};
    const ward = admission?.ward || admission?.bed?.wards || {};
    const bed = admission?.bed || {};
    const isDischarged = admission?.status === 'Discharged';
    return {
        patient_name: patient.full_name || '—',
        age_gender: `${patient.age ?? '—'} Years / ${patient.gender || '—'}`,
        indoor_no: (data?.indoor_no || '').trim() || admission?.admission_id || '—',
        uhid: patient.patient_id || '—',
        consulting_doctor: (data?.consulting_doctor || '').trim() || admission?.doctor_name || '—',
        ward: ward?.ward_name || '—',
        bed_no: bed?.bed_name || admission?.bed_id || '—',
        floor: ward?.floor_number || '—',
        class_applicable:
            (data?.class_applicable || '').trim() || admission?.patient_class || admission?.billing_category || '—',
        admission_dt: admission?.admission_date ? fmtBillDateTime(admission.admission_date) : '—',
        discharge_dt: isDischarged && admission?.discharge_date ? fmtBillDateTime(admission.discharge_date) : '—',
        discharge_status: isDischarged ? (admission?.discharge_type || 'Discharged') : 'Not yet discharged',
    };
}

function esc(s: any): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Render a multiline value as <br>-joined HTML, blank → em dash.
function multiline(s: string): string {
    const v = String(s ?? '').trim();
    if (!v) return '<span style="color:#9ca3af;">—</span>';
    return v.split('\n').map((l) => esc(l)).join('<br>');
}

// Render list-style multiline value as <ul>; blank → em dash.
function bulletList(s: string): string {
    const lines = String(s ?? '')
        .split('\n')
        .map((l) => l.replace(/^[-•*]\s*/, '').trim())
        .filter(Boolean);
    if (lines.length === 0) return '<span style="color:#9ca3af;">—</span>';
    return `<ul style="margin:0;padding-left:18px;">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
}

const titleCss = `font-size:11px;font-weight:800;color:#334155;text-transform:uppercase;letter-spacing:0.8px;margin:18px 0 6px;border-bottom:1.5px solid #e5e7eb;padding-bottom:3px;`;

function infoRow(label: string, value: string): string {
    return `<tr><td style="padding:3px 10px 3px 0;font-weight:700;color:#475569;white-space:nowrap;vertical-align:top;width:180px;">${esc(label)}</td><td style="padding:3px 0;color:#111827;">${esc(value)}</td></tr>`;
}

// Full printable HTML document for the discharge summary.
export function renderDischargeSummaryHtml(
    branding: BillBranding,
    header: DischargeHeaderContext,
    data: DischargeSummaryData,
    opts?: { withPrintButton?: boolean },
): string {
    const printBar = opts?.withPrintButton
        ? `<div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;">
            <button onclick="window.print()" style="padding:8px 24px;background:${branding.accentColor};color:#fff;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:14px;">Print / Download PDF</button>
           </div>`
        : '';

    const hasProcedure =
        data.procedure_name.trim() ||
        data.operative_notes.trim() ||
        data.surgeon.trim() ||
        data.anaesthetist.trim();

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Discharge Summary - ${esc(header.patient_name)}</title>
<style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI', Arial, sans-serif; color:#1f2937; background:#fff; font-size:12px; line-height:1.5; }
    .page { max-width:820px; margin:0 auto; padding:24px 32px; }
    .doc-title { text-align:center; font-size:16px; font-weight:900; letter-spacing:1px; color:${branding.accentColor}; margin:6px 0 14px; }
    table.info { width:100%; border-collapse:collapse; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:0 24px; }
    .body-text { white-space:normal; color:#111827; }
    @media print { body { margin:0; } .no-print { display:none !important; } .page { padding:0 18px; } }
</style>
</head>
<body>
${printBar}
<div class="page">
    ${inlineHeaderHtml(branding)}
    <div class="doc-title">DISCHARGE SUMMARY</div>

    <div style="${titleCss}">Patient Information</div>
    <div class="grid2">
        <table class="info">
            ${infoRow('Patient Name', header.patient_name)}
            ${infoRow('Age / Gender', header.age_gender)}
            ${infoRow('Indoor No.', header.indoor_no)}
            ${infoRow('UHID No.', header.uhid)}
            ${infoRow('Consulting Doctor', header.consulting_doctor)}
            ${infoRow('Ward', header.ward)}
        </table>
        <table class="info">
            ${infoRow('Bed No.', header.bed_no)}
            ${infoRow('Floor', header.floor)}
            ${infoRow('Class Applicable', header.class_applicable)}
            ${infoRow('Admitted', header.admission_dt)}
            ${infoRow('Discharged', header.discharge_dt)}
            ${infoRow('Discharge Status', header.discharge_status)}
        </table>
    </div>

    <div style="${titleCss}">Final Diagnosis</div>
    <div class="body-text">
        ${data.final_diagnosis_primary.trim() ? `<div>${esc(data.final_diagnosis_primary)}</div>` : '<span style="color:#9ca3af;">—</span>'}
        ${data.final_diagnosis_secondary.trim() ? `<div>${esc(data.final_diagnosis_secondary)}</div>` : ''}
        ${data.icd_code.trim() ? `<div style="margin-top:4px;font-size:11px;color:#475569;"><strong>ICD Code:</strong> ${esc(data.icd_code)}</div>` : ''}
    </div>

    <div style="${titleCss}">Complaints on Admission</div>
    <div class="body-text">${bulletList(data.complaints)}</div>

    <div style="${titleCss}">Medical History</div>
    <div class="body-text">${multiline(data.medical_history || 'N/A')}</div>

    <div style="${titleCss}">Investigations</div>
    <div class="body-text">${bulletList(data.investigations)}</div>

    ${hasProcedure ? `
    <div style="${titleCss}">Surgery / Procedure Performed</div>
    <table class="info">
        ${infoRow('Name of Surgery/Procedure', data.procedure_name || '—')}
        ${infoRow('Surgeon', data.surgeon || '—')}
        ${infoRow('Assistant Surgeon', data.assistant_surgeon || '—')}
        ${infoRow('Anaesthetist', data.anaesthetist || '—')}
        ${infoRow('Anaesthesia Type', data.anaesthesia_type || '—')}
        ${infoRow('Procedure Date', data.procedure_date || '—')}
    </table>

    <div style="${titleCss}">Operative Notes</div>
    <div class="body-text">${multiline(data.operative_notes)}</div>
    ` : ''}

    <div style="${titleCss}">Course During Hospitalization</div>
    <div class="body-text">${multiline(data.course)}</div>

    <div style="${titleCss}">Discharge Medications</div>
    <div class="body-text">${bulletList(data.discharge_medications)}</div>

    <div style="${titleCss}">Discharge Instructions</div>
    <div class="body-text">${bulletList(data.discharge_instructions)}</div>

    <div style="${titleCss}">Follow-Up</div>
    <div class="body-text">${multiline(data.follow_up)}</div>

    <div style="${titleCss}">Discharge Condition</div>
    <div class="body-text">${multiline(data.discharge_condition || DEFAULT_DISCHARGE_CONDITION)}</div>

    <div style="display:flex;justify-content:space-between;margin-top:32px;gap:24px;">
        <div style="flex:1;">
            <div style="border-top:1px solid #94a3b8;padding-top:4px;font-size:11px;color:#475569;">Prepared By: <strong>${esc(data.prepared_by || header.consulting_doctor)}</strong></div>
        </div>
        <div style="flex:1;">
            <div style="border-top:1px solid #94a3b8;padding-top:4px;font-size:11px;color:#475569;">Verified By: <strong>${esc(data.verified_by || '—')}</strong></div>
        </div>
        <div style="flex:1;text-align:right;">
            <div style="font-size:11px;color:#475569;">Date: <strong>${esc(fmtBillDate(new Date()))}</strong></div>
        </div>
    </div>

    ${billFooterHtml(branding)}
</div>
</body>
</html>`;
}

// Plain-text rendering kept in `generated_summary` for backward-compatible consumers.
export function renderDischargeSummaryText(header: DischargeHeaderContext, data: DischargeSummaryData): string {
    const L: string[] = [];
    L.push('DISCHARGE SUMMARY');
    L.push('');
    L.push('PATIENT INFORMATION');
    L.push(`Patient Name: ${header.patient_name}`);
    L.push(`Age/Gender: ${header.age_gender}`);
    L.push(`Indoor No.: ${header.indoor_no}`);
    L.push(`UHID No.: ${header.uhid}`);
    L.push(`Consulting Doctor: ${header.consulting_doctor}`);
    L.push(`Ward: ${header.ward} | Bed: ${header.bed_no} | Floor: ${header.floor}`);
    L.push(`Class: ${header.class_applicable}`);
    L.push(`Admitted: ${header.admission_dt}`);
    L.push(`Discharged: ${header.discharge_dt}`);
    L.push(`Discharge Status: ${header.discharge_status}`);
    L.push('');
    L.push('FINAL DIAGNOSIS');
    L.push([data.final_diagnosis_primary, data.final_diagnosis_secondary].filter(Boolean).join('\n') || '—');
    if (data.icd_code.trim()) L.push(`ICD Code: ${data.icd_code}`);
    L.push('');
    L.push('COMPLAINTS ON ADMISSION');
    L.push(data.complaints || '—');
    L.push('');
    L.push('MEDICAL HISTORY');
    L.push(data.medical_history || 'N/A');
    L.push('');
    L.push('INVESTIGATIONS');
    L.push(data.investigations || '—');
    if (data.procedure_name.trim() || data.operative_notes.trim()) {
        L.push('');
        L.push('SURGERY / PROCEDURE PERFORMED');
        L.push(`Name: ${data.procedure_name || '—'}`);
        L.push(`Surgeon: ${data.surgeon || '—'} | Assistant: ${data.assistant_surgeon || '—'}`);
        L.push(`Anaesthetist: ${data.anaesthetist || '—'} | Anaesthesia: ${data.anaesthesia_type || '—'}`);
        L.push(`Procedure Date: ${data.procedure_date || '—'}`);
        L.push('');
        L.push('OPERATIVE NOTES');
        L.push(data.operative_notes || '—');
    }
    L.push('');
    L.push('COURSE DURING HOSPITALIZATION');
    L.push(data.course || '—');
    L.push('');
    L.push('DISCHARGE MEDICATIONS');
    L.push(data.discharge_medications || '—');
    L.push('');
    L.push('DISCHARGE INSTRUCTIONS');
    L.push(data.discharge_instructions || '—');
    L.push('');
    L.push('FOLLOW-UP');
    L.push(data.follow_up || '—');
    L.push('');
    L.push('DISCHARGE CONDITION');
    L.push(data.discharge_condition || DEFAULT_DISCHARGE_CONDITION);
    L.push('');
    L.push(`Prepared By: ${data.prepared_by || header.consulting_doctor}`);
    L.push(`Verified By: ${data.verified_by || '—'}`);
    return L.join('\n');
}
