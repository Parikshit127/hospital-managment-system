import { prisma } from '@/backend/db';
import { getSignedDownloadUrl } from '@/app/lib/s3';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BillBranding {
    hospitalName: string;
    hospitalAddress: string;
    hospitalPhone: string;
    hospitalEmail: string;
    gstin: string;
    gstStateCode: string;
    registrationNumber: string;
    logoUrl: string | null;
    letterheadUrl: string | null;
    accentColor: string;
    headerHeight: number;
    footerHeight: number;
    footerText: string | null;
    tagline: string | null;
    termsConditions: string | null;
    signatureTitle: string | null;
    signatureName: string | null;
}

// ─── Fetch branding from DB ──────────────────────────────────────────────────

export async function getBillBranding(organizationId: string): Promise<BillBranding> {
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        include: { branding: true },
    });

    const b = org?.branding;

    let logoUrl = b?.logo_url || org?.logo_url || null;
    let letterheadUrl = b?.letterhead_url || null;

    // Resolve S3 keys to signed URLs (skip local paths starting with / and http URLs)
    if (logoUrl && !logoUrl.startsWith('http') && !logoUrl.startsWith('/')) {
        try { logoUrl = await getSignedDownloadUrl(logoUrl, 86400); } catch { /* keep raw */ }
    }
    if (letterheadUrl && !letterheadUrl.startsWith('http') && !letterheadUrl.startsWith('/')) {
        try { letterheadUrl = await getSignedDownloadUrl(letterheadUrl, 86400); } catch { /* keep raw */ }
    }

    return {
        hospitalName: org?.name || 'Hospital',
        hospitalAddress: org?.address || '',
        hospitalPhone: org?.phone || '',
        hospitalEmail: org?.email || '',
        gstin: org?.organization_gstin || org?.registration_number || 'N/A',
        gstStateCode: org?.gst_state_code || '',
        registrationNumber: org?.registration_number || '',
        logoUrl,
        letterheadUrl,
        accentColor: b?.accent_color || '#1e3a6e',
        headerHeight: b?.header_height ?? 130,
        footerHeight: b?.footer_height ?? 80,
        footerText: b?.footer_text || null,
        tagline: b?.tagline || null,
        termsConditions: b?.terms_conditions || null,
        signatureTitle: b?.signature_title || null,
        signatureName: b?.signature_name || null,
    };
}

// ─── Pattern A: Full-page letterhead background ──────────────────────────────

export function letterheadBackgroundHtml(b: BillBranding): string {
    if (!b.letterheadUrl) {
        // No letterhead configured — return empty (header info handled by inlineHeaderHtml)
        return '';
    }
    return `<div class="letterhead-bg"><img src="${b.letterheadUrl}" alt="" aria-hidden="true" /></div>`;
}

export function letterheadCss(b: BillBranding): string {
    return `
        .letterhead-bg { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; }
        .letterhead-bg img { width: 100%; height: 100%; object-fit: fill; }
        .print-layout-table { width: 100%; border-collapse: collapse; }
        .print-layout-header-spacer { height: ${b.letterheadUrl ? b.headerHeight : 0}px; }
        .print-layout-footer-spacer { height: ${b.letterheadUrl ? b.footerHeight : 0}px; }
        .bill-container { max-width: 800px; margin: 0 auto; padding: 0 60px; position: relative; z-index: 1; }
        .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 80px; font-weight: 900; opacity: 0.04; pointer-events: none; z-index: 0; }
        @media print {
            @page { margin: 0; }
            body { margin: 0; background: white; }
            .bill-container { max-width: 100%; margin: 0; padding: 0 60px; }
            .no-print { display: none !important; }
            .watermark { opacity: 0.06; }
        }
    `;
}

// ─── Pattern B: Inline logo header (replaces hardcoded SVG) ──────────────────

export function inlineHeaderHtml(b: BillBranding, rightHtml = ''): string {
    const logoBlock = b.logoUrl
        ? `<div style="display:flex;align-items:flex-start;gap:14px;">
            <img src="${b.logoUrl}" alt="${escHtml(b.hospitalName)}" style="height:75px;width:auto;display:block;flex-shrink:0;" />
            <div>
                <div style="font-size:22px;font-weight:900;color:${b.accentColor};font-family:'Arial Black',Arial,sans-serif;line-height:1.2;">${escHtml(b.hospitalName)}</div>
                ${b.tagline ? `<div style="font-size:10px;color:${b.accentColor};opacity:0.8;margin-top:2px;">${escHtml(b.tagline)}</div>` : ''}
                ${b.registrationNumber ? `<div style="font-size:9px;color:#6b7280;margin-top:3px;">Reg: ${escHtml(b.registrationNumber)}</div>` : ''}
                ${b.hospitalAddress ? `<div style="font-size:9px;color:#6b7280;margin-top:1px;">${escHtml(b.hospitalAddress)}</div>` : ''}
                ${b.hospitalPhone ? `<div style="font-size:9px;color:#6b7280;">Ph: ${escHtml(b.hospitalPhone)}${b.hospitalEmail ? ` | ${escHtml(b.hospitalEmail)}` : ''}</div>` : ''}
                ${b.gstin && b.gstin !== 'N/A' ? `<div style="font-size:9px;color:#6b7280;font-weight:600;">GSTIN: ${escHtml(b.gstin)}</div>` : ''}
            </div>
          </div>`
        : `<div>
            <div style="font-size:26px;font-weight:900;color:${b.accentColor};font-family:'Arial Black',Arial,sans-serif;">${escHtml(b.hospitalName)}</div>
            ${b.tagline ? `<div style="font-size:10px;color:${b.accentColor};opacity:0.7;margin-top:2px;">${escHtml(b.tagline)}</div>` : ''}
            ${b.hospitalAddress ? `<div style="font-size:9px;color:#6b7280;margin-top:2px;">${escHtml(b.hospitalAddress)}</div>` : ''}
            ${b.hospitalPhone ? `<div style="font-size:9px;color:#6b7280;">Ph: ${escHtml(b.hospitalPhone)}${b.hospitalEmail ? ` | ${escHtml(b.hospitalEmail)}` : ''}</div>` : ''}
           </div>`;

    return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:3px solid ${b.accentColor};padding-bottom:16px;">
        ${logoBlock}
        ${rightHtml ? `<div style="text-align:right;">${rightHtml}</div>` : ''}
    </div>`;
}

// ─── Pattern C: Minimal header ───────────────────────────────────────────────

export function minimalHeaderHtml(b: BillBranding): string {
    return `<div style="text-align:center;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid ${b.accentColor};">
        <h2 style="font-size:16px;font-weight:800;color:${b.accentColor};">${escHtml(b.hospitalName)}</h2>
        ${b.hospitalAddress ? `<p style="font-size:10px;color:#6b7280;">${escHtml(b.hospitalAddress)}</p>` : ''}
    </div>`;
}

// ─── Shared footer ───────────────────────────────────────────────────────────

export function signatureBlockHtml(b: BillBranding): string {
    const title = b.signatureTitle || 'Authorized Signatory';
    const name = b.signatureName || b.hospitalName;
    return `
    <div style="text-align:right;">
        <p style="font-size:10px;color:#6b7280;margin-bottom:30px;">${escHtml(title)}</p>
        <p style="font-size:10px;border-top:1px solid #d1d5db;padding-top:4px;color:#9ca3af;">For ${escHtml(name)}</p>
    </div>`;
}

export function billFooterHtml(b: BillBranding): string {
    const termsText = b.termsConditions || 'Payment due on receipt. Subject to local jurisdiction.';
    return `
    <div style="border-top:1px solid #e5e7eb;padding-top:14px;margin-top:20px;">
        <div style="display:flex;justify-content:space-between;">
            <div>
                <p style="font-size:10px;color:#9ca3af;">Terms: ${escHtml(termsText)}</p>
            </div>
            ${signatureBlockHtml(b)}
        </div>
        <p style="font-size:9px;color:#d1d5db;text-align:center;margin-top:16px;">Computer-generated document. ${escHtml(b.hospitalName)}</p>
    </div>`;
}

// ─── Print button bar ────────────────────────────────────────────────────────

export function printButtonHtml(b: BillBranding, subtitle = ''): string {
    return `<div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;">
        <button onclick="window.print()" style="padding:8px 24px;background:${b.accentColor};color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">Print / Download PDF</button>
        ${subtitle ? `<span style="margin-left:12px;font-size:11px;color:#6b7280;">${subtitle}</span>` : ''}
    </div>`;
}

/**
 * "Include medicines" toggle for bills — rendered as a plain <a> link (no JS), so it
 * always works (inline onchange handlers were unreliable). Clicking flips the ?meds
 * param: when medicines are currently shown the link removes them (meds=0), and vice
 * versa. Returns '' when the bill has no medicine items. `currentUrl` is req.url.
 */
export function medsToggleHtml(currentUrl: string, medsAvailable: boolean, includeMeds: boolean): string {
    if (!medsAvailable) return '';
    let href = '?';
    try {
        const u = new URL(currentUrl);
        if (includeMeds) u.searchParams.set('meds', '0'); else u.searchParams.delete('meds');
        const qs = u.searchParams.toString();
        href = u.pathname + (qs ? `?${qs}` : '');
    } catch { /* fall back to '?' */ }
    return `<div class="no-print" style="background:#f3f4f6;padding:0 12px 12px;text-align:center;">
        <a href="${href}" style="font-size:12px;color:#374151;text-decoration:none;display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" ${includeMeds ? 'checked' : ''} readonly style="pointer-events:none;margin:0;" />
            Include medicines on this bill
        </a>
        <span style="margin-left:8px;font-size:11px;color:#6b7280;">(click to ${includeMeds ? 'remove' : 'add'})</span>
    </div>`;
}

// ─── Date helpers (single source of truth for bill/receipt dates) ────────────
// All bills/receipts use dd/mm/yyyy, rendered in IST so the day is correct.

/** dd/mm/yyyy (e.g. 12/06/2026). Returns '-' for empty. */
export function fmtBillDate(d: any): string {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '-';
    return dt.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** dd/mm/yyyy, hh:mm am/pm. Returns '-' for empty. */
export function fmtBillDateTime(d: any): string {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '-';
    // hourCycle:'h12' (not hour12:true) — en-GB + hour12 renders the noon hour as "00:30 pm"; h12 gives "12:30 pm".
    return dt.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h12' });
}

// ─── Invoice totals (single source of truth for every bill/receipt) ──────────
// Bills must be internally consistent: the summary (Gross − Discount + Tax = Net)
// has to match the line items shown above it. The stored invoice header can drift
// (e.g. total_amount saved as the net, or a line discount applied without recalc),
// so we ALWAYS recompute from the line items when they exist and only fall back to
// the stored header for item-less invoices (e.g. a deposit-only interim bill).
export function deriveInvoiceTotals(invoice: any) {
    const items: any[] = invoice?.items || [];
    const hasItems = items.length > 0;
    // Gross = sum of line totals (pre-discount). Reliable from items; fall back to header.
    const gross = hasItems
        ? items.reduce((s, i) => s + Number(i.total_price || 0), 0)
        : Number(invoice?.total_amount || 0);
    // Discount may be line-level (stored on items) and/or bill-level (stored only on the
    // header via requestDiscount). Take the larger so neither kind is dropped.
    const itemDiscount = items.reduce((s, i) => s + Number(i.discount || 0), 0);
    const discount = Math.max(itemDiscount, Number(invoice?.total_discount || 0));
    const tax = hasItems
        ? items.reduce((s, i) => s + Number(i.tax_amount || 0), 0)
        : Number(invoice?.total_tax || 0);
    const net = gross - discount + tax;
    const paid = Number(invoice?.paid_amount || 0);
    // Approved/Applied credit notes reduce what the patient owes. They are stored as a
    // relation on the invoice (not as line items or payments), so the balance must
    // subtract them here — otherwise the bill keeps showing the charge as pending even
    // though the app's outstanding (driven off balance_due) has already gone to zero.
    const creditNotes: any[] = invoice?.credit_notes || [];
    const creditNoteTotal = creditNotes.reduce((s, c) => s + Number(c?.total_amount || 0), 0);
    const balance = net - creditNoteTotal - paid;
    return { gross, discount, tax, net, paid, creditNoteTotal, balance };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
