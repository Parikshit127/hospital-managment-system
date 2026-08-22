import { prisma } from '@/backend/db';
import { getBillBranding } from '@/app/lib/bill-branding';
import { bedLabel } from '@/app/lib/bed-label';

/**
 * Shared data + rendering helpers for the Reception patient reports
 * (IPD / OPD / Walk-in). One source of truth so the on-screen table,
 * the Excel export, and the printable PDF never drift apart.
 *
 * All queries take an explicit organizationId and filter on it directly,
 * matching the pattern used by the existing report routes.
 */

export type ReportColumn = { key: string; label: string };
export type ReportRow = Record<string, string | number>;
export type ReportKind = 'ipd' | 'opd' | 'walkin';

export const IPD_COLUMNS: ReportColumn[] = [
    { key: 'mrn', label: 'MRN' },
    { key: 'patientName', label: 'Patient Name' },
    { key: 'ageGender', label: 'Age / Gender' },
    { key: 'admissionDate', label: 'Admission Date' },
    { key: 'ward', label: 'Ward' },
    { key: 'bed', label: 'Bed / Room' },
    { key: 'doctor', label: 'Doctor' },
    { key: 'category', label: 'Category' },
    { key: 'diagnosis', label: 'Diagnosis' },
    { key: 'status', label: 'Status' },
    { key: 'dischargeDate', label: 'Discharge Date' },
];

export const OPD_COLUMNS: ReportColumn[] = [
    { key: 'mrn', label: 'MRN' },
    { key: 'patientName', label: 'Patient Name' },
    { key: 'ageGender', label: 'Age / Gender' },
    { key: 'dateTime', label: 'Date / Time' },
    { key: 'doctor', label: 'Doctor' },
    { key: 'invoiceNo', label: 'Invoice No.' },
    { key: 'type', label: 'Type' },
    { key: 'status', label: 'Status' },
    { key: 'payment', label: 'Payment' },
];

export const WALKIN_COLUMNS: ReportColumn[] = [
    { key: 'mrn', label: 'MRN' },
    { key: 'patientName', label: 'Patient Name' },
    { key: 'ageGender', label: 'Age / Gender' },
    { key: 'dateTime', label: 'Date / Time' },
    { key: 'doctor', label: 'Doctor' },
    { key: 'department', label: 'Department' },
    { key: 'reason', label: 'Reason for Visit' },
    { key: 'payment', label: 'Payment' },
    { key: 'status', label: 'Status' },
];

export const REPORT_META: Record<ReportKind, { title: string; columns: ReportColumn[] }> = {
    ipd: { title: 'IPD Patient Report', columns: IPD_COLUMNS },
    opd: { title: 'OPD Patient Report', columns: OPD_COLUMNS },
    walkin: { title: 'Walk-in Patient Report', columns: WALKIN_COLUMNS },
};

// Parse YYYY-MM-DD bounds in IST (matches existing report routes).
export function parseDateRange(fromStr: string, toStr: string) {
    return {
        from: new Date(fromStr + 'T00:00:00+05:30'),
        to: new Date(toStr + 'T23:59:59.999+05:30'),
    };
}

function fmtDateTime(d: Date | null | undefined): string {
    if (!d) return '-';
    return new Date(d).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
}

function fmtDate(d: Date | null | undefined): string {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

function ageGender(age: string | null, gender: string | null): string {
    const a = age ? `${age}` : '';
    const g = gender ? gender.charAt(0).toUpperCase() : '';
    if (a && g) return `${a} / ${g}`;
    return a || g || '-';
}

/** Admitted-patient details: ward/room allocation + admission summary. */
export async function getIpdReportRows(
    organizationId: string,
    fromStr: string,
    toStr: string,
): Promise<ReportRow[]> {
    const { from, to } = parseDateRange(fromStr, toStr);
    const rows = await prisma.admissions.findMany({
        where: {
            organizationId,
            is_archived: false,
            admission_date: { gte: from, lte: to },
        },
        include: {
            patient: { select: { full_name: true, age: true, gender: true } },
            ward: { select: { ward_name: true } },
            bed: { select: { bed_name: true, bed_id: true } },
        },
        orderBy: { admission_date: 'desc' },
    });

    return rows.map(a => ({
        mrn: a.patient_id,
        patientName: a.patient?.full_name ?? '-',
        ageGender: ageGender(a.patient?.age ?? null, a.patient?.gender ?? null),
        admissionDate: fmtDateTime(a.admission_date),
        ward: a.ward?.ward_name ?? '-',
        bed: bedLabel(a.bed || a.bed_id),
        doctor: a.doctor_name ?? '-',
        category: a.admission_category ?? a.admission_type ?? '-',
        diagnosis: a.diagnosis ?? a.primary_diagnosis_icd ?? '-',
        status: a.status ?? '-',
        dischargeDate: a.status === 'Discharged' ? fmtDate(a.discharge_date) : '-',
    }));
}

/**
 * OPD visits. OPD here is walk-in and recorded as OPD invoices (the appointments
 * table is effectively unused), so this lists OPD invoices — the same source and
 * date filter as the finance "Daily Activity" OPD count, so the list and the
 * count always agree.
 */
export async function getOpdReportRows(
    organizationId: string,
    fromStr: string,
    toStr: string,
): Promise<ReportRow[]> {
    const { from, to } = parseDateRange(fromStr, toStr);
    const rows = await prisma.invoices.findMany({
        where: {
            organizationId,
            invoice_type: { in: ['OPD', 'OPD_FEE'] },
            created_at: { gte: from, lte: to },
        },
        select: {
            invoice_number: true,
            invoice_type: true,
            doctor_name: true,
            status: true,
            balance_due: true,
            created_at: true,
            patient_id: true,
            patient: { select: { full_name: true, age: true, gender: true } },
        },
        orderBy: { created_at: 'desc' },
    });

    return rows.map(inv => ({
        mrn: inv.patient_id,
        patientName: inv.patient?.full_name ?? '-',
        ageGender: ageGender(inv.patient?.age ?? null, inv.patient?.gender ?? null),
        dateTime: fmtDateTime(inv.created_at),
        doctor: inv.doctor_name ?? '-',
        invoiceNo: inv.invoice_number ?? '-',
        type: inv.invoice_type ?? 'OPD',
        status: inv.status ?? '-',
        payment: Number(inv.balance_due ?? 0) <= 0 ? 'Paid' : 'Pending',
    }));
}

/**
 * Walk-in / casualty patients: appointments booked at the desk with no
 * prior appointment (booking_channel = walk_in).
 */
export async function getWalkinReportRows(
    organizationId: string,
    fromStr: string,
    toStr: string,
): Promise<ReportRow[]> {
    const { from, to } = parseDateRange(fromStr, toStr);
    const rows = await prisma.appointments.findMany({
        where: {
            organizationId,
            booking_channel: 'walk_in',
            appointment_date: { gte: from, lte: to },
        },
        include: {
            patient: { select: { full_name: true, age: true, gender: true } },
        },
        orderBy: { appointment_date: 'desc' },
    });

    return rows.map(ap => ({
        mrn: ap.patient_id,
        patientName: ap.patient?.full_name ?? '-',
        ageGender: ageGender(ap.patient?.age ?? null, ap.patient?.gender ?? null),
        dateTime: fmtDateTime(ap.appointment_date),
        doctor: ap.doctor_name ?? '-',
        department: ap.department ?? '-',
        reason: ap.reason_for_visit ?? '-',
        payment: ap.payment_status ?? '-',
        status: ap.status ?? '-',
    }));
}

export async function getReportRows(
    kind: ReportKind,
    organizationId: string,
    fromStr: string,
    toStr: string,
): Promise<ReportRow[]> {
    if (kind === 'ipd') return getIpdReportRows(organizationId, fromStr, toStr);
    if (kind === 'opd') return getOpdReportRows(organizationId, fromStr, toStr);
    return getWalkinReportRows(organizationId, fromStr, toStr);
}

function escapeHtml(value: string | number): string {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Server-rendered printable HTML (browser Print -> PDF). Matches the
 * look of the existing collection/financial report routes.
 */
export async function renderReportHtml(
    kind: ReportKind,
    organizationId: string,
    fromStr: string,
    toStr: string,
): Promise<string> {
    const { title, columns } = REPORT_META[kind];
    const [branding, rows] = await Promise.all([
        getBillBranding(organizationId),
        getReportRows(kind, organizationId, fromStr, toStr),
    ]);

    const headCells = columns
        .map(c => `<th style="padding:6px;border:1px solid #ddd;text-align:left;">${escapeHtml(c.label)}</th>`)
        .join('');

    const bodyRows = rows.length === 0
        ? `<tr><td colspan="${columns.length + 1}" style="padding:16px;border:1px solid #ddd;text-align:center;color:#888;">No records for the selected period.</td></tr>`
        : rows.map((row, idx) => {
            const cells = columns
                .map(c => `<td style="padding:5px;border:1px solid #ddd;">${escapeHtml(row[c.key] ?? '-')}</td>`)
                .join('');
            return `<tr><td style="padding:5px;border:1px solid #ddd;text-align:center;">${idx + 1}</td>${cells}</tr>`;
        }).join('');

    const printedOn = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #111; background: #fff; font-size: 11px; padding: 40px; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        thead tr { background: #f5f5f5; }
        tbody tr:nth-child(even) { background: #fafafa; }
        @media print {
            body { padding: 20px; }
            .no-print { display: none !important; }
        }
    </style>
</head>
<body>
    <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;margin-bottom:20px;border-radius:6px;border:1px solid #ddd;">
        <button onclick="window.print()" style="padding:8px 24px;background:#4caf50;color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer;font-size:12px;">Print / Download PDF</button>
    </div>

    <div style="text-align:center;margin-bottom:16px;line-height:1.4;">
        <h1 style="font-size:16px;font-weight:bold;text-transform:uppercase;">${escapeHtml(branding.hospitalName)}</h1>
        ${branding.gstin && branding.gstin !== 'N/A' ? `<p style="font-size:10px;font-weight:bold;">GST NO.-${escapeHtml(branding.gstin)}</p>` : ''}
        <p style="font-size:10px;color:#555;">${escapeHtml(branding.hospitalAddress)}</p>
    </div>

    <div style="border-top:2px solid #111;margin:10px 0;"></div>

    <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:bold;margin-bottom:15px;">
        <span>${escapeHtml(title)}</span>
        <span>${escapeHtml(fromStr.split('-').reverse().join('-'))} to ${escapeHtml(toStr.split('-').reverse().join('-'))}</span>
        <span>Total Records : ${rows.length}</span>
    </div>

    <table>
        <thead>
            <tr>
                <th style="padding:6px;border:1px solid #ddd;text-align:center;width:40px;">Sr.</th>
                ${headCells}
            </tr>
        </thead>
        <tbody>
            ${bodyRows}
        </tbody>
    </table>

    <div style="margin-top:30px;font-size:10px;color:#555;">
        Printed On : ${escapeHtml(printedOn)}
    </div>
</body>
</html>`;
}
