/**
 * Printable Admission Trail.
 *
 * Follows the house document pattern rather than printing the React UI: letterhead
 * background + per-page header/footer spacers (so a multi-page trail keeps the
 * letterhead on every sheet), bordered tables, and the standard footer. Printing the
 * on-screen tab with @media print produced something that read as a screenshot —
 * rounded cards, icon chips, hover surfaces — which is not what the other documents
 * in this system look like.
 *
 * Query params:
 *   ?full=1   whole patient history instead of this admission
 *   ?audit=1  append the "who changed what" table
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTenantContext } from '@/backend/tenant';
import {
    getBillBranding,
    letterheadCss,
    letterheadBackgroundHtml,
    inlineHeaderHtml,
    billFooterHtml,
    printButtonHtml,
    fmtBillDate,
    fmtBillDateTime,
} from '@/app/lib/bill-branding';
import { getAdmissionTrail } from '@/app/actions/ipd-actions';
import { auditActionLabel, auditActorFromDetails, ENTITY_TYPE_LABELS } from '@/app/lib/audit-actions';
import type { TrailEvent } from '@/app/lib/patient-trail';

function esc(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const GROUP_LABEL: Record<string, string> = {
    clinical: 'Clinical',
    financial: 'Billing',
    admin: 'Admission',
};

/** dd/mm/yyyy heading for a day block, matching the bill's date format. */
function dayHeading(iso: string): string {
    const d = new Date(iso);
    return `${fmtBillDate(d)} — ${d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'long' })}`;
}

function timeOnly(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h12',
    });
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ admissionId: string }> },
) {
    try {
        const { admissionId } = await params;
        const url = new URL(request.url);
        const fullHistory = url.searchParams.get('full') === '1';
        const includeAudit = url.searchParams.get('audit') === '1';

        const { db, organizationId, session } = await requireTenantContext();
        const branding = await getBillBranding(organizationId);
        const printedBy = session?.name ? { name: session.name, role: session.role } : undefined;

        // Reuses the same action the screen uses, so the printed record and the
        // on-screen trail can never disagree. The action carries its own role guard.
        const res = await getAdmissionTrail(admissionId, { fullHistory });
        if (!res.success || !res.data) {
            return NextResponse.json({ error: res.error || 'Trail not found' }, { status: 404 });
        }

        const admission: any = res.data.admission;
        const events: TrailEvent[] = res.data.events || [];
        const audit: any[] = res.data.audit || [];

        const patient: any = admission?.patient_id
            ? await (db.oPD_REG as any).findUnique({ where: { patient_id: admission.patient_id } })
            : null;

        const docTitle = fullHistory ? 'Patient Record — Full History' : 'Admission Trail';

        const admitted = admission?.admission_date ? fmtBillDateTime(admission.admission_date) : '—';
        const discharged = admission?.discharge_date
            ? fmtBillDateTime(admission.discharge_date)
            : 'Not discharged';
        const los = admission?.admission_date
            ? Math.max(
                  1,
                  Math.ceil(
                      (new Date(admission.discharge_date || Date.now()).getTime() -
                          new Date(admission.admission_date).getTime()) /
                          86400000,
                  ),
              )
            : 0;
        const wardBed = [admission?.ward?.ward_name, admission?.bed?.bed_name || admission?.bed?.bed_id]
            .filter(Boolean)
            .join(' / ') || '—';

        // ── Trail rows, grouped into day blocks ──────────────────────────────
        let rows = '';
        let lastDay = '';
        let totalIn = 0;
        for (const e of events) {
            const day = e.ts.slice(0, 10);
            if (day !== lastDay) {
                rows += `<tr style="background:#f0f0f0;">
                    <td colspan="5" style="padding:5px 8px;font-size:11px;font-weight:700;border:1px solid #999;">${esc(dayHeading(e.ts))}</td>
                </tr>`;
                lastDay = day;
            }
            if (typeof e.amount === 'number' && e.amount > 0) totalIn += e.amount;
            rows += `<tr>
                <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:11px;white-space:nowrap;">${esc(timeOnly(e.ts))}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:10px;color:#6b7280;white-space:nowrap;">${esc(GROUP_LABEL[e.group] || e.group)}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:11px;font-weight:600;">${esc(e.label)}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:10px;color:#4b5563;">${esc(e.meta || '')}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:10px;white-space:nowrap;">${esc(e.actor || '')}</td>
            </tr>`;
        }

        // ── Audit table ──────────────────────────────────────────────────────
        const auditRows = audit
            .map((r: any) => {
                // Same rule as the on-screen change log: a real username wins, then the
                // actor buried in details, then "System" only when there genuinely was no
                // session. An unrecorded actor prints as a dash, not as "System".
                const named =
                    r.username && !['system', 'unknown'].includes(String(r.username).toLowerCase())
                        ? String(r.username)
                        : '';
                const who = named || auditActorFromDetails(r.details) || (r.user_id === 'system' ? 'System' : '—');
                const label = auditActionLabel(r.action);
                const tidy =
                    label && label === label.toUpperCase()
                        ? label.charAt(0) + label.slice(1).toLowerCase()
                        : label;
                return `<tr>
                    <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:10px;white-space:nowrap;">${esc(fmtBillDateTime(r.created_at))}</td>
                    <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:10px;">${esc(who)}${r.role ? ` <span style="color:#9ca3af;">(${esc(r.role)})</span>` : ''}</td>
                    <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:10px;font-weight:600;">${esc(tidy)}</td>
                    <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:10px;">${esc(ENTITY_TYPE_LABELS[r.entity_type] ?? r.entity_type ?? '')}</td>
                </tr>`;
            })
            .join('');

        const infoField = (label: string, value: unknown) =>
            `<div class="field"><div class="lbl">${esc(label)}</div><div class="val">${esc(value || '—')}</div></div>`;

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(docTitle)} - ${esc(admission?.admission_id || '')}</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; }
    ${letterheadCss(branding)}
    .doc-title { font-size: 13px; letter-spacing: 4px; text-transform: uppercase; color: ${branding.accentColor}; font-weight: 700; margin-top: 4px; }
    .sec { margin-top: 18px; }
    .sec-t { font-size: 11px; font-weight: bold; text-transform: uppercase; color: ${branding.accentColor}; letter-spacing: 2px; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 24px; }
    .field { margin-bottom: 8px; }
    .lbl { font-size: 9px; text-transform: uppercase; color: #999; letter-spacing: 1px; }
    .val { font-size: 12px; font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 2px; min-height: 17px; }
    table.data { width: 100%; border-collapse: collapse; border: 1px solid #999; }
    table.data thead tr { background: #eee; }
    table.data th { padding: 6px 8px; text-align: left; font-size: 10px; border: 1px solid #999; }
    tr { break-inside: avoid; }
    thead { display: table-header-group; }
</style>
</head>
<body>
${letterheadBackgroundHtml(branding)}
${printButtonHtml(branding, `${events.length} event(s)${includeAudit ? ` · ${audit.length} audit row(s)` : ''}`)}
<table class="print-layout-table">
    <thead><tr><td class="print-layout-header-spacer"></td></tr></thead>
    <tbody><tr><td>
        <div class="bill-container">
            ${branding.letterheadUrl ? `<div style="text-align:right;"><div class="doc-title">${esc(docTitle)}</div></div>` : inlineHeaderHtml(branding, `<div class="doc-title">${esc(docTitle)}</div>`)}

            <div class="sec">
                <div class="sec-t">Patient &amp; Admission</div>
                <div class="grid">
                    ${infoField('Patient Name', patient?.full_name)}
                    ${infoField('UHID', admission?.patient_id)}
                    ${infoField('Age / Gender', `${patient?.age ?? '—'} yrs / ${patient?.gender ?? '—'}`)}
                    ${infoField('Admission No.', admission?.admission_id)}
                    ${infoField('Ward / Bed', wardBed)}
                    ${infoField('Consultant', admission?.doctor_name)}
                    ${infoField('Admitted', admitted)}
                    ${infoField('Discharged', discharged)}
                    ${infoField('Length of Stay', `${los} day(s)`)}
                    ${infoField('Diagnosis', admission?.diagnosis)}
                    ${infoField('Status', admission?.status)}
                    ${infoField('Scope', fullHistory ? 'All visits & admissions' : 'This admission only')}
                </div>
            </div>

            <div class="sec">
                <div class="sec-t">Chronological Record (${events.length} events, most recent first)</div>
                <table class="data">
                    <thead>
                        <tr>
                            <th style="width:62px;">Time</th>
                            <th style="width:62px;">Type</th>
                            <th>Event</th>
                            <th>Details</th>
                            <th style="width:110px;">Recorded By</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || '<tr><td colspan="5" style="padding:12px;text-align:center;color:#999;font-size:11px;">No events recorded</td></tr>'}
                    </tbody>
                </table>
                ${totalIn > 0 ? `<p style="font-size:10px;text-align:right;color:#666;margin-top:6px;">Billed / received during this record: Rs. ${totalIn.toFixed(2)}</p>` : ''}
            </div>

            ${includeAudit ? `
            <div class="sec">
                <div class="sec-t">Change Log — Who Changed What (${audit.length})</div>
                <table class="data">
                    <thead>
                        <tr>
                            <th style="width:120px;">When</th>
                            <th style="width:150px;">User</th>
                            <th>Action</th>
                            <th style="width:110px;">Record</th>
                        </tr>
                    </thead>
                    <tbody>${auditRows || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#999;font-size:11px;">No recorded changes</td></tr>'}</tbody>
                </table>
            </div>` : ''}

            ${billFooterHtml(branding, printedBy)}
        </div>
    </td></tr></tbody>
    <tfoot><tr><td class="print-layout-footer-spacer"></td></tr></tfoot>
</table>
</body>
</html>`;

        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } catch (e: any) {
        console.error('trail print error:', e);
        return NextResponse.json({ error: 'Failed to generate trail document' }, { status: 500 });
    }
}
