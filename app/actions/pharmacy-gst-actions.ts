'use server';

import { requireTenantContext } from '@/backend/tenant';
import { prisma } from '@/backend/db';
import { denyUnlessPharmacyRole, PHARMACY_OPERATE_ROLES } from '@/app/lib/pharmacy-access';
import { getPharmacyBranding } from '@/app/lib/pharmacy-branding';
import { getDayRange, getOrgTimezone } from '@/app/lib/timezone';
import {
    r2, isValidGstRate, checkGstin, stateCodeOf, placeOfSupplyLabel,
    parseMedicineName, splitHeads, utilizeItc, type Heads,
} from '@/app/lib/pharmacy-gst';

/**
 * Pharmacy GST report — everything needed to file GSTR-1 and GSTR-3B for the
 * pharmacy's own GSTIN (see app/lib/pharmacy-branding.ts), built straight from
 * source records (invoice lines, credit notes, purchase invoices, returns)
 * rather than the generic gst_invoice_register, which is not populated
 * reliably for pharmacy (see the notes in the issues list).
 *
 * Read-only: nothing here writes to the database.
 */

// ── Types (erased at build; safe to import from the client page) ────────────

export type GstAgg = { taxable: number; cgst: number; sgst: number; igst: number; tax: number };
export type RateRow = GstAgg & { rate: number };

export type GstIssue = {
    code: string;
    severity: 'high' | 'medium' | 'info';
    title: string;
    detail: string;
    count: number;
    amount?: number;
    refs: string[];
};

export type SalesInvoiceRow = {
    invoiceNo: string; date: string; channel: string; status: string;
    taxable: number; cgst: number; sgst: number; igst: number; discount: number; total: number;
};
export type HsnRow = {
    hsn: string; description: string; uqc: string; rate: number; qty: number;
    totalValue: number; taxable: number; cgst: number; sgst: number; igst: number;
};
export type CreditNoteRow = {
    cnNo: string; date: string; originalInvoice: string; status: string; reason: string;
    taxable: number; cgst: number; sgst: number; igst: number; total: number; resolved: boolean;
};
export type PurchaseRow = {
    invoiceNo: string; date: string; vendor: string; gstin: string; gstinOk: boolean; gstinNote: string;
    status: string; taxable: number; cgst: number; sgst: number; igst: number; total: number;
    itcEligible: boolean; flags: string[];
};
export type MasterFixRow = {
    medicine: string; qty: number; soldValue: number; currentRate: number; currentHsn: string;
    suggestedRate: number | null; suggestedHsn: string; source: 'purchase bill' | 'purchase order' | '';
};
export type ReversalRow = {
    date: string; kind: 'writeoff' | 'supplier_return'; medicine: string; batch: string; vendor: string;
    qty: number; rate: number; taxable: number; cgst: number; sgst: number; igst: number;
};

export type PharmacyGstReport = {
    meta: {
        pharmacyName: string; gstin: string; gstinValid: boolean; stateCode: string; placeOfSupply: string;
        address: string; from: string; to: string; generatedAt: string;
    };
    sales: {
        byRate: RateRow[];
        total: GstAgg;
        byChannel: Array<GstAgg & { channel: string; invoices: number }>;
        creditNotes: { rows: CreditNoteRow[]; byRate: RateRow[]; total: GstAgg };
        net: { byRate: RateRow[]; total: GstAgg };
        hsn: HsnRow[];
        documents: {
            series: Array<{ prefix: string; first: string; last: string; issued: number; cancelled: number; missing: string[] }>;
            issued: number; cancelled: number; net: number; drafts: number;
        };
        invoices: SalesInvoiceRow[];
    };
    catalog: { total: number; noHsn: number; zeroRate: number };
    masterFixes: MasterFixRow[];
    underBilledEstimate: number;
    ipd: {
        billedValue: number; returnedValue: number; netValue: number; billedTax: number;
        packageConsumedValue: number;
        byRate: Array<{ rate: number; value: number; indicativeTax: number }>;
        unresolvedValue: number; indicativeTax: number;
    };
    purchases: {
        rows: PurchaseRow[];
        byRate: RateRow[];
        total: GstAgg;
        itc: Heads & { total: number };
        itcAtRisk: number;
        notPosted: { count: number; tax: number };
        grnWithoutInvoice: { count: number; value: number };
    };
    reversals: {
        rows: ReversalRow[];
        writeoff: Heads & { total: number };
        supplierReturn: Heads & { total: number };
    };
    gstr3b: {
        t31a: { taxable: number } & Heads;           // outward taxable (other than zero/nil/exempt)
        t31c: { taxable: number };                   // nil-rated / exempt
        t4A5: Heads;                                 // ITC available — all other
        t4B1: Heads;                                 // reversal — Sec 17(5)(h) write-offs
        t4B2: Heads;                                 // reversal — others (supplier returns)
        netItc: Heads;
        liability: Heads;
        cashPayable: Heads;
        cashTotal: number;
        carryForward: Heads;
    };
    issues: GstIssue[];
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const emptyAgg = (): GstAgg => ({ taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 });
const addAgg = (a: GstAgg, taxable: number, h: Heads) => {
    a.taxable += taxable; a.cgst += h.cgst; a.sgst += h.sgst; a.igst += h.igst;
    a.tax += h.cgst + h.sgst + h.igst;
};
const roundAgg = (a: GstAgg): GstAgg => ({ taxable: r2(a.taxable), cgst: r2(a.cgst), sgst: r2(a.sgst), igst: r2(a.igst), tax: r2(a.tax) });
const rateRows = (m: Map<number, GstAgg>): RateRow[] =>
    Array.from(m.entries()).sort((a, b) => a[0] - b[0]).map(([rate, a]) => ({ rate, ...roundAgg(a) }));
const bump = (m: Map<number, GstAgg>, rate: number, taxable: number, h: Heads) => {
    const e = m.get(rate) || emptyAgg();
    addAgg(e, taxable, h);
    m.set(rate, e);
};
const uniq = (xs: string[], max = 8) => Array.from(new Set(xs.filter(Boolean))).slice(0, max);
const masterRateOf = (m: any) => num(m?.gst_percent) || num(m?.tax_rate) || 0;
const sumHeads = (hs: Heads[]): Heads => hs.reduce((s, h) => ({ cgst: s.cgst + h.cgst, sgst: s.sgst + h.sgst, igst: s.igst + h.igst }), { cgst: 0, sgst: 0, igst: 0 });
const roundHeads = (h: Heads): Heads => ({ cgst: r2(h.cgst), sgst: r2(h.sgst), igst: r2(h.igst) });
const iso = (d: Date) => new Date(d).toISOString();

const HSN_OK = /^(\d{4}|\d{6}|\d{8})$/;
const PI_COUNTED = ['Posted', 'OnCredit', 'PartiallyPaid', 'Paid'];
const PI_DEAD = ['Cancelled', 'Rejected', 'Void'];
const CN_DEAD = ['Cancelled', 'Rejected', 'Void'];

// ── The report ──────────────────────────────────────────────────────────────

export async function getPharmacyGstReport(filters: { from: string; to: string }):
    Promise<{ success: true; report: PharmacyGstReport } | { success: false; error: string }> {
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId } = await requireTenantContext();
        const tz = await getOrgTimezone();

        const start = getDayRange(filters.from, tz).start;
        const end = getDayRange(filters.to, tz).end;
        if (!start.getTime() || !end.getTime()) return { success: false, error: 'Pick a valid From and To date.' };
        if (end < start) return { success: false, error: 'The To date is before the From date.' };
        if (end.getTime() - start.getTime() > 400 * 86400000) return { success: false, error: 'Pick a range of at most 13 months.' };
        const range = { gte: start, lte: end };

        const branding = getPharmacyBranding(organizationId);
        const gstinCheck = checkGstin(branding.gstin);
        const orgState = stateCodeOf(branding.gstin);
        const issues: GstIssue[] = [];

        if (!branding.gstin) {
            issues.push({
                code: 'ORG_GSTIN_MISSING', severity: 'high', count: 1, refs: [],
                title: 'Pharmacy GSTIN is not configured',
                detail: 'No GSTIN is set for this hospital in app/lib/pharmacy-branding.ts, so the report cannot tell intra-state from inter-state purchases and invoices will print without a GSTIN.',
            });
        } else if (!gstinCheck.ok) {
            issues.push({
                code: 'ORG_GSTIN_INVALID', severity: 'high', count: 1, refs: [branding.gstin],
                title: 'Pharmacy GSTIN looks invalid',
                detail: `${branding.gstin}: ${gstinCheck.reason}.`,
            });
        }

        // Medicine master — one pass, used for rate / HSN look-ups everywhere below.
        const meds: any[] = await db.pharmacy_medicine_master.findMany({
            where: { organizationId },
            select: { id: true, brand_name: true, gst_percent: true, tax_rate: true, hsn_sac_code: true, is_active: true },
        });
        const medById = new Map<number, any>(meds.map((m) => [m.id, m]));
        const medByName = new Map<string, any>(meds.map((m) => [String(m.brand_name).toLowerCase().trim(), m]));

        // ═══ 1. OUTWARD — counter / OPD pharmacy invoices ═══════════════════
        // Base client (explicit organizationId) on purpose: the tenant client silently hides
        // archived invoices, but an archived bill is still a supply that must be reported.
        const invoices: any[] = await prisma.invoices.findMany({
            where: { organizationId, invoice_type: 'Pharmacy', created_at: range },
            select: {
                id: true, invoice_number: true, status: true, patient_id: true, created_at: true,
                total_tax: true, bill_discount: true, total_discount: true, is_inter_state: true,
                items: {
                    select: {
                        description: true, quantity: true, unit_price: true, discount: true, net_price: true,
                        tax_rate: true, tax_amount: true, hsn_sac_code: true, mrp: true,
                    },
                },
            },
            orderBy: { created_at: 'asc' },
        });

        const salesByRate = new Map<number, GstAgg>();
        const channelMap = new Map<string, GstAgg & { invoices: number }>();
        const hsnMap = new Map<string, HsnRow>();
        const invoiceRows: SalesInvoiceRow[] = [];
        const allNos: string[] = [];
        const cancelledNos = new Set<string>();
        let cancelledCount = 0;
        let draftCount = 0;

        const overMrp = { count: 0, tax: 0, refs: [] as string[] };
        const badRate = { count: 0, refs: [] as string[] };
        const zeroButMaster = { count: 0, refs: [] as string[] };
        const hsnBad = { count: 0, refs: [] as string[] };
        const headerMismatch = { count: 0, amount: 0, refs: [] as string[] };
        // Lines sold at 0% where the catalogue has neither a GST % nor an HSN — i.e. the
        // medicine was never set up, as opposed to genuinely nil-rated.
        const unconfigured = new Map<string, { medicineId: number | null; name: string; qty: number; value: number }>();
        let unconfiguredLines = 0; let unconfiguredValue = 0; let salesTaxableAll = 0;

        for (const inv of invoices) {
            const no: string = inv.invoice_number || `#${inv.id}`;
            const channel = inv.patient_id === 'WALKIN' ? 'Walk-in / OTC'
                : inv.patient_id === 'HOSPITAL' ? 'Hospital internal use'
                    : 'OPD / registered patient';

            if (inv.status === 'Draft') { draftCount++; continue; }
            allNos.push(no);
            if (inv.status === 'Cancelled') {
                cancelledCount++; cancelledNos.add(no);
                invoiceRows.push({ invoiceNo: no, date: iso(inv.created_at), channel, status: 'Cancelled', taxable: 0, cgst: 0, sgst: 0, igst: 0, discount: 0, total: 0 });
                continue;
            }

            const lines = (inv.items || []) as any[];
            const gross = lines.reduce((s, l) => s + num(l.net_price) + num(l.tax_amount), 0);
            const lineDiscounts = lines.reduce((s, l) => s + num(l.discount), 0);
            // Bill-level discount is given at the time of supply, so it reduces the
            // taxable value (Sec 15(3)(a)) — spread it pro-rata over the lines.
            const billDisc = num(inv.bill_discount) || Math.max(0, num(inv.total_discount) - lineDiscounts);
            const factor = gross > 0 ? Math.max(0, 1 - Math.min(billDisc, gross) / gross) : 1;

            let invTaxable = 0; let invTax = 0; const inter = !!inv.is_inter_state;
            let headerTax = 0;
            for (const l of lines) {
                const rate = num(l.tax_rate);
                const taxable = num(l.net_price) * factor;
                const tax = num(l.tax_amount) * factor;
                const heads = splitHeads(tax, inter);
                headerTax += num(l.tax_amount);
                invTaxable += taxable; invTax += tax;

                bump(salesByRate, rate, taxable, heads);

                const med = medByName.get(parseMedicineName(l.description).toLowerCase());
                const hsn = String(l.hsn_sac_code || med?.hsn_sac_code || '').trim() || 'MISSING';
                const hk = `${hsn}|${rate}`;
                const h = hsnMap.get(hk) || { hsn, description: 'Medicines / pharmaceutical products', uqc: 'NOS-NUMBERS', rate, qty: 0, totalValue: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
                h.qty += num(l.quantity); h.taxable += taxable; h.cgst += heads.cgst; h.sgst += heads.sgst; h.igst += heads.igst;
                h.totalValue += taxable + tax;
                hsnMap.set(hk, h);

                if (!isValidGstRate(rate)) { badRate.count++; badRate.refs.push(no); }
                if (!HSN_OK.test(hsn)) { hsnBad.count++; hsnBad.refs.push(no); }
                if (rate === 0 && med && masterRateOf(med) > 0) { zeroButMaster.count++; zeroButMaster.refs.push(no); }
                salesTaxableAll += taxable;
                if (rate === 0 && (!med || (masterRateOf(med) === 0 && !String(med.hsn_sac_code || '').trim()))) {
                    const name = med?.brand_name || parseMedicineName(l.description);
                    const key = med ? `id:${med.id}` : `n:${name.toLowerCase()}`;
                    const e = unconfigured.get(key) || { medicineId: med?.id ?? null, name, qty: 0, value: 0 };
                    e.qty += num(l.quantity); e.value += taxable; unconfigured.set(key, e);
                    unconfiguredLines++; unconfiguredValue += taxable;
                }
                // GST is added on top of the unit price. MRP is tax-inclusive by law, so a
                // line whose pre-tax price already equals/exceeds MRP charges the patient
                // more than MRP once tax is added.
                if (num(l.mrp) > 0 && num(l.unit_price) >= num(l.mrp) - 0.005 && num(l.tax_amount) > 0) {
                    overMrp.count++; overMrp.tax += num(l.tax_amount); overMrp.refs.push(no);
                }
            }

            if (Math.abs(headerTax - num(inv.total_tax)) > 1) {
                headerMismatch.count++; headerMismatch.amount += Math.abs(headerTax - num(inv.total_tax)); headerMismatch.refs.push(no);
            }

            const heads = splitHeads(invTax, inter);
            const ch = channelMap.get(channel) || { ...emptyAgg(), invoices: 0 };
            addAgg(ch, invTaxable, heads); ch.invoices++;
            channelMap.set(channel, ch);

            invoiceRows.push({
                invoiceNo: no, date: iso(inv.created_at), channel, status: inv.status,
                taxable: r2(invTaxable), cgst: r2(heads.cgst), sgst: r2(heads.sgst), igst: r2(heads.igst),
                discount: r2(billDisc), total: r2(invTaxable + invTax),
            });
        }

        // Credit notes raised in the period against pharmacy invoices
        const cns: any[] = await db.creditNote.findMany({
            where: {
                organizationId, created_at: range, status: { notIn: CN_DEAD },
                original_invoice: { invoice_type: 'Pharmacy' },
            },
            select: {
                credit_note_number: true, status: true, total_amount: true, items: true, reason: true, created_at: true,
                original_invoice: { select: { invoice_number: true } },
            },
            orderBy: { created_at: 'asc' },
        });
        const cnByRate = new Map<number, GstAgg>();
        const cnRows: CreditNoteRow[] = [];
        const hsnCn: Array<{ hsn: string; rate: number; qty: number; taxable: number; h: Heads }> = [];
        for (const cn of cns) {
            let items: any[] = [];
            try { items = JSON.parse(cn.items || '[]'); } catch { items = []; }
            if (!Array.isArray(items)) items = [];
            const tot = emptyAgg(); let resolved = items.length > 0;
            const rowsFor = items.length ? items : [{ amount: num(cn.total_amount), quantity: 0 }];
            for (const it of rowsFor) {
                const med = medById.get(Number(it.medicine_id)) || medByName.get(String(it.medicine_name || '').toLowerCase().trim());
                if (!med) resolved = false;
                const rate = med ? masterRateOf(med) : 0;
                const incl = num(it.amount);
                const taxable = incl / (1 + rate / 100);
                const heads = splitHeads(incl - taxable, false);
                bump(cnByRate, rate, taxable, heads);
                addAgg(tot, taxable, heads);
                hsnCn.push({ hsn: String(med?.hsn_sac_code || '').trim() || 'MISSING', rate, qty: num(it.quantity), taxable, h: heads });
            }
            const t = roundAgg(tot);
            cnRows.push({
                cnNo: cn.credit_note_number, date: iso(cn.created_at), originalInvoice: cn.original_invoice?.invoice_number || '',
                status: cn.status, reason: cn.reason || '', taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst,
                total: r2(t.taxable + t.tax), resolved,
            });
        }
        for (const c of hsnCn) {
            const hk = `${c.hsn}|${c.rate}`;
            const h = hsnMap.get(hk) || { hsn: c.hsn, description: 'Medicines / pharmaceutical products', uqc: 'NOS-NUMBERS', rate: c.rate, qty: 0, totalValue: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
            h.qty -= c.qty; h.taxable -= c.taxable; h.cgst -= c.h.cgst; h.sgst -= c.h.sgst; h.igst -= c.h.igst;
            h.totalValue -= c.taxable + c.h.cgst + c.h.sgst + c.h.igst;
            hsnMap.set(hk, h);
        }
        const cnDraft = cns.filter((c) => c.status === 'Draft');
        if (cnDraft.length) {
            issues.push({
                code: 'CN_DRAFT', severity: 'medium', count: cnDraft.length, refs: uniq(cnDraft.map((c) => c.credit_note_number)),
                title: 'Credit notes still in Draft',
                detail: 'These patient returns reduce the GST liability in this report, but the credit note has not been approved. Approve them (or exclude them) before filing — a credit note must be issued/approved to be reported in GSTR-1.',
            });
        }
        const unresolvedCn = cnRows.filter((c) => !c.resolved);
        if (unresolvedCn.length) {
            issues.push({
                code: 'CN_RATE_UNRESOLVED', severity: 'medium', count: unresolvedCn.length, refs: uniq(unresolvedCn.map((c) => c.cnNo)),
                title: 'Credit note lines with unknown medicine / GST rate',
                detail: 'The medicine on these credit notes could not be matched to the catalogue, so their tax was taken at 0%. Liability reduction is understated for them.',
            });
        }

        // Net of credit notes (this is what GSTR-1 table 7 / 3B 3.1 actually report)
        const netByRate = new Map<number, GstAgg>();
        for (const [rate, a] of salesByRate) netByRate.set(rate, { ...a });
        for (const [rate, a] of cnByRate) {
            const e = netByRate.get(rate) || emptyAgg();
            e.taxable -= a.taxable; e.cgst -= a.cgst; e.sgst -= a.sgst; e.igst -= a.igst; e.tax -= a.tax;
            netByRate.set(rate, e);
        }
        const sumAgg = (m: Map<number, GstAgg>) => { const t = emptyAgg(); for (const a of m.values()) { t.taxable += a.taxable; t.cgst += a.cgst; t.sgst += a.sgst; t.igst += a.igst; t.tax += a.tax; } return roundAgg(t); };

        // Document series (GSTR-1 table 13). Group by prefix so the FY series and any
        // legacy/imported numbers are not mixed, and list numbers skipped inside a series
        // (deleted invoices must be declared as cancelled/unused in GSTR-1).
        const seriesMap = new Map<string, { nums: Array<{ n: number; no: string }>; cancelled: number; width: number }>();
        for (const no of allNos) {
            const m = no.match(/^(.*?)(\d+)$/);
            const prefix = m ? m[1] : no;
            const e = seriesMap.get(prefix) || { nums: [], cancelled: 0, width: 0 };
            if (m) { e.nums.push({ n: Number(m[2]), no }); e.width = Math.max(e.width, m[2].length); }
            if (cancelledNos.has(no)) e.cancelled++;
            seriesMap.set(prefix, e);
        }
        const series: PharmacyGstReport['sales']['documents']['series'] = [];
        for (const [prefix, e] of seriesMap) {
            e.nums.sort((a, b) => a.n - b.n);
            let missing: string[] = [];
            if (e.nums.length > 1) {
                const lo = e.nums[0].n; const hi = e.nums[e.nums.length - 1].n;
                // Compare against every number ever issued in this series (not just the
                // period) so a backdated bill that lives in another month isn't a "gap".
                const everIssued: any[] = hi - lo >= e.nums.length ? await prisma.invoices.findMany({
                    where: { organizationId, invoice_type: 'Pharmacy', invoice_number: { startsWith: prefix } },
                    select: { invoice_number: true },
                }) : [];
                const have = new Set<number>(e.nums.map((x) => x.n));
                for (const x of everIssued) { const mm = String(x.invoice_number).match(/(\d+)$/); if (mm) have.add(Number(mm[1])); }
                for (let n = lo; n <= hi && missing.length < 50; n++) if (!have.has(n)) missing.push(`${prefix}${String(n).padStart(e.width, '0')}`);
            }
            series.push({
                prefix, first: e.nums[0]?.no || prefix, last: e.nums[e.nums.length - 1]?.no || prefix,
                issued: e.nums.length || 0, cancelled: e.cancelled, missing,
            });
        }
        const documents = { series, issued: allNos.length, cancelled: cancelledCount, net: allNos.length - cancelledCount, drafts: draftCount };
        const gapNos = series.flatMap((x) => x.missing);
        if (gapNos.length) {
            issues.push({
                code: 'DOC_GAPS', severity: 'medium', count: gapNos.length, refs: uniq(gapNos),
                title: 'Gaps in the pharmacy invoice number series',
                detail: 'These numbers were issued but no invoice exists (deleted?). GSTR-1 table 13 needs every number accounted for as issued, cancelled or unused — cancel rather than delete in future.',
            });
        }
        const internal = channelMap.get('Hospital internal use');
        if (internal && internal.invoices > 0) {
            issues.push({
                code: 'HOSPITAL_INTERNAL_USE', severity: 'info', count: internal.invoices, amount: r2(internal.taxable), refs: [],
                title: '"Hospital internal use" bills are counted as sales',
                detail: 'Issuing stock to the hospital itself is not a retail sale. If the hospital is a different GSTIN it is a B2B supply that needs the hospital\'s GSTIN on the invoice; if it is the same entity it should be a stock transfer, not a sale. Confirm treatment with your CA.',
            });
        }
        if (draftCount) {
            issues.push({
                code: 'SALES_DRAFT', severity: 'medium', count: draftCount, refs: [],
                title: 'Draft pharmacy invoices in the period',
                detail: 'Draft invoices are not counted as supplies. Finalise or cancel them so the invoice series is complete.',
            });
        }

        if (overMrp.count) {
            issues.push({
                code: 'SALES_TAX_ON_TOP_OF_MRP', severity: 'high', count: overMrp.count, amount: r2(overMrp.tax), refs: uniq(overMrp.refs),
                title: 'GST charged on top of MRP',
                detail: 'On these lines the pre-tax price already equals (or exceeds) the printed MRP, and GST is added above it. MRP is inclusive of GST, so the patient pays more than MRP (Legal Metrology offence). The taxable value in this report is the amount actually billed; if the price should have been MRP-inclusive, the real taxable value is MRP ÷ (1 + rate). Fix the billing price rule before filing so liability and invoices agree. (Lines with no MRP on file also show here.)',
            });
        }
        if (badRate.count) {
            issues.push({
                code: 'SALES_RATE_INVALID', severity: 'high', count: badRate.count, refs: uniq(badRate.refs),
                title: 'Sales lines with a non-standard GST rate',
                detail: 'Rate is not one of 0, 0.25, 3, 5, 12, 18, 28, 40%. The GST portal will reject these rows.',
            });
        }
        if (zeroButMaster.count) {
            issues.push({
                code: 'SALES_ZERO_RATE_BUT_MASTER_TAXED', severity: 'medium', count: zeroButMaster.count, refs: uniq(zeroButMaster.refs),
                title: 'Billed at 0% but the medicine master has a GST rate',
                detail: 'Possible GST under-charged (or rate changed since the bill). Check the medicine master and the bill.',
            });
        }
        if (hsnBad.count) {
            issues.push({
                code: 'SALES_HSN_INVALID', severity: 'medium', count: hsnBad.count, refs: uniq(hsnBad.refs),
                title: 'Sales lines with missing / malformed HSN',
                detail: 'HSN must be 4, 6 or 8 digits (6+ if aggregate turnover is above ₹5 Cr). Fix in the medicine master.',
            });
        }
        if (headerMismatch.count) {
            issues.push({
                code: 'SALES_HEADER_MISMATCH', severity: 'medium', count: headerMismatch.count, amount: r2(headerMismatch.amount), refs: uniq(headerMismatch.refs),
                title: 'Invoice header tax ≠ sum of line tax',
                detail: 'The report uses line-level tax. The invoice header (what finance sees) differs by more than ₹1 — the invoice was probably edited after creation.',
            });
        }

        // Suggest a rate/HSN for never-configured medicines from their latest purchase bill.
        const fixIds = Array.from(unconfigured.values()).map((u) => u.medicineId).filter((x): x is number => x != null);
        const suggestion = new Map<number, { rate: number; hsn: string; source: 'purchase bill' | 'purchase order' }>();
        if (fixIds.length) {
            const hist: any[] = await db.pharmacyPurchaseInvoiceLine.findMany({
                where: { medicine_id: { in: fixIds }, invoice: { organizationId, status: { in: PI_COUNTED } } },
                select: { medicine_id: true, gst_rate: true, hsn_code: true },
                orderBy: { invoice: { invoice_date: 'desc' } },
            });
            for (const h of hist) if (!suggestion.has(h.medicine_id)) suggestion.set(h.medicine_id, { rate: num(h.gst_rate), hsn: String(h.hsn_code || '').trim(), source: 'purchase bill' });
            // Fall back to purchase-order lines (GST is entered there too). A PO is not a tax
            // document, so it only feeds this suggestion list — never the ITC figures.
            const noBill = fixIds.filter((id) => !suggestion.has(id));
            if (noBill.length) {
                const poHist: any[] = await db.purchaseOrderItem.findMany({
                    where: { medicine_id: { in: noBill }, purchase_order: { organizationId }, gst_rate: { gt: 0 } },
                    select: { medicine_id: true, gst_rate: true, hsn_code: true },
                    orderBy: { purchase_order: { created_at: 'desc' } },
                });
                for (const h of poHist) if (!suggestion.has(h.medicine_id)) suggestion.set(h.medicine_id, { rate: num(h.gst_rate), hsn: String(h.hsn_code || '').trim(), source: 'purchase order' });
            }
        }
        let underBilledEstimate = 0;
        const masterFixes: MasterFixRow[] = Array.from(unconfigured.values())
            .sort((a, b) => b.value - a.value)
            .map((u) => {
                const sg = u.medicineId != null ? suggestion.get(u.medicineId) : undefined;
                const med = u.medicineId != null ? medById.get(u.medicineId) : undefined;
                if (sg && sg.rate > 0) underBilledEstimate += u.value * sg.rate / 100;
                return {
                    medicine: u.name, qty: r2(u.qty), soldValue: r2(u.value), currentRate: masterRateOf(med),
                    currentHsn: String(med?.hsn_sac_code || '').trim(), suggestedRate: sg ? sg.rate : null, suggestedHsn: sg?.hsn || '', source: sg?.source || '',
                };
            });
        underBilledEstimate = r2(underBilledEstimate);
        const catActive = meds.filter((m) => m.is_active !== false);
        const catZero = catActive.filter((m) => masterRateOf(m) === 0).length;
        const catNoHsn = catActive.filter((m) => !String(m.hsn_sac_code || '').trim()).length;
        if (unconfiguredLines > 0 || catZero > catActive.length * 0.5) {
            const share = salesTaxableAll > 0 ? Math.round((unconfiguredValue / salesTaxableAll) * 100) : 0;
            issues.push({
                code: 'GST_NOT_CONFIGURED', severity: 'high', count: unconfiguredLines,
                amount: underBilledEstimate > 0 ? underBilledEstimate : undefined,
                refs: uniq(masterFixes.map((f) => f.medicine)),
                title: `GST % / HSN not set up in the medicine master (${catZero.toLocaleString('en-IN')} of ${catActive.length.toLocaleString('en-IN')} medicines at 0%)`,
                detail: `${unconfiguredLines} sales line(s) — ${share}% of this period's sales value — were billed at 0% GST because the medicine has no GST % and no HSN in the master (${catNoHsn.toLocaleString('en-IN')} medicines have no HSN). Only a few life-saving drugs are genuinely nil-rated, so output GST is almost certainly under-billed${underBilledEstimate > 0 ? ` (≈ ₹${underBilledEstimate.toLocaleString('en-IN')} using the GST rate on their latest purchase bill / purchase order)` : ''}. The "Fix master data" list gives a suggested rate and HSN per medicine from your purchase bills / purchase orders. IMPORTANT: billing adds GST on top of the unit price, which defaults to MRP. MRP already includes GST, so once rates are filled in, patients would be charged above MRP — decide with your CA whether prices become MRP-inclusive before switching rates on.`,
            });
        }

        // ═══ 2. IPD / package dispensing — billed at nil GST ════════════════
        const otherLines: any[] = await db.invoice_items.findMany({
            where: {
                organizationId, created_at: range,
                service_category: { equals: 'Pharmacy', mode: 'insensitive' },
                invoice: { invoice_type: { not: 'Pharmacy' }, status: { not: 'Cancelled' } },
            },
            select: {
                description: true, net_price: true, tax_amount: true,
                invoice: { select: { invoice_type: true, invoice_number: true } },
            },
        });
        const ipdRate = new Map<number, { value: number; tax: number }>();
        let ipdBilled = 0; let ipdReturned = 0; let ipdUnresolved = 0; let ipdBilledTax = 0;
        const taxedOnOther = { count: 0, amount: 0, refs: [] as string[] };
        const bumpIpd = (rate: number, value: number, tax: number) => {
            const e = ipdRate.get(rate) || { value: 0, tax: 0 };
            e.value += value; e.tax += tax; ipdRate.set(rate, e);
        };
        for (const l of otherLines) {
            if (l.invoice?.invoice_type !== 'IPD') {
                if (num(l.tax_amount) > 0) {
                    taxedOnOther.count++; taxedOnOther.amount += num(l.tax_amount);
                    taxedOnOther.refs.push(l.invoice?.invoice_number || String(l.invoice?.invoice_type));
                }
                continue;
            }
            const net = num(l.net_price);
            ipdBilledTax += num(l.tax_amount);
            const med = medByName.get(parseMedicineName(l.description).toLowerCase());
            const rate = med ? masterRateOf(med) : null;
            const isReturn = net < 0;
            // Return lines hold the refund INCLUDING tax; sale lines are pre-tax.
            const base = isReturn && rate != null ? net / (1 + rate / 100) : net;
            if (isReturn) ipdReturned += Math.abs(net); else ipdBilled += net;
            if (rate == null) { ipdUnresolved += base; continue; }
            bumpIpd(rate, base, base * rate / 100);
        }
        const pkgPostings: any[] = await db.ipdChargePosting.findMany({
            where: {
                organizationId, disposition: 'package_consumed', posted_at: range,
                OR: [{ service_category: { equals: 'Pharmacy', mode: 'insensitive' } }, { source_module: 'pharmacy' }],
            },
            select: { description: true, amount: true },
        });
        let pkgValue = 0;
        for (const p of pkgPostings) {
            const amt = num(p.amount);
            pkgValue += amt;
            const med = medByName.get(parseMedicineName(p.description).toLowerCase());
            if (!med) { ipdUnresolved += amt; continue; }
            const rate = masterRateOf(med);
            bumpIpd(rate, amt, amt * rate / 100);
        }
        const ipdByRate = Array.from(ipdRate.entries()).sort((a, b) => a[0] - b[0])
            .map(([rate, e]) => ({ rate, value: r2(e.value), indicativeTax: r2(e.tax) }));
        const ipdIndicativeTax = r2(ipdByRate.reduce((s, r) => s + r.indicativeTax, 0));
        const ipdNet = r2(ipdBilled - ipdReturned);
        if (ipdNet + pkgValue > 0) {
            issues.push({
                code: 'IPD_NIL_GST_DECISION', severity: 'high', count: otherLines.filter((l) => l.invoice?.invoice_type === 'IPD').length + pkgPostings.length,
                amount: r2(ipdNet + pkgValue), refs: [],
                title: 'Medicines given to in-patients carry NO GST — decide with your CA',
                detail: `₹${r2(ipdNet + pkgValue).toLocaleString('en-IN')} of medicines was dispensed to admitted patients (billed on the hospital IPD bill / absorbed in packages) with GST forced to 0%. That is correct only if the pharmacy is part of the same legal entity as the hospital (exempt composite healthcare supply). The pharmacy runs on its own GSTIN (Garnet Medicare), so if it is a separate registered person, these are taxable supplies by the pharmacy to the hospital (indicative GST ≈ ₹${ipdIndicativeTax.toLocaleString('en-IN')} at catalogue rates) and are NOT in the totals above. Conversely, if they stay exempt, input tax credit on the stock used for them has to be reversed (Rule 42/43). Get this settled before the first return.${ipdBilledTax > 0 ? ` (Note: ₹${r2(ipdBilledTax).toLocaleString('en-IN')} of GST is already printed on some older IPD pharmacy lines.)` : ''}`,
            });
        }
        if (taxedOnOther.count) {
            issues.push({
                code: 'PHARMACY_LINES_ON_OTHER_BILLS', severity: 'medium', count: taxedOnOther.count, amount: r2(taxedOnOther.amount), refs: uniq(taxedOnOther.refs),
                title: 'Pharmacy lines with GST on non-pharmacy bills',
                detail: 'Pharmacy-category lines carrying tax exist on OPD/other bills. They are not part of the pharmacy outward totals — check whether they belong in this GSTIN.',
            });
        }

        // ═══ 3. INWARD — purchase invoices & ITC ════════════════════════════
        const pis: any[] = await db.pharmacyPurchaseInvoice.findMany({
            where: { organizationId, invoice_date: range },
            include: {
                vendor: { select: { vendor_name: true, gst_number: true } },
                line_items: true,
            },
            orderBy: { invoice_date: 'asc' },
        });
        const purchaseRows: PurchaseRow[] = [];
        const purchByRate = new Map<number, GstAgg>();
        const purchTotal = emptyAgg();
        const itcHeads: Heads[] = [];
        let itcAtRisk = 0;
        const notPosted = { count: 0, tax: 0, refs: [] as string[] };
        const gstinBad = { count: 0, amount: 0, refs: [] as string[] };
        const headMismatch = { count: 0, amount: 0, refs: [] as string[] };
        const piHeaderMismatch = { count: 0, refs: [] as string[] };
        const piRateMismatch = { count: 0, refs: [] as string[] };

        for (const pi of pis) {
            if (PI_DEAD.includes(pi.status)) continue;
            const lineTax = (l: any) => num(l.cgst_amount) + num(l.sgst_amount) + num(l.igst_amount);
            const lines = (pi.line_items || []) as any[];
            const taxableOf = (l: any) => Math.max(0,
                num(l.quantity) * num(l.unit_price) * (1 - num(l.discount_pct) / 100) - num(l.discount_amount) - num(l.scheme_amount));

            if (!PI_COUNTED.includes(pi.status)) {
                notPosted.count++;
                notPosted.tax += lines.reduce((s, l) => s + lineTax(l), 0);
                notPosted.refs.push(pi.invoice_number);
                continue;
            }

            const vendorGstin = String(pi.vendor_gstin || pi.vendor?.gst_number || '').trim().toUpperCase();
            const gc = checkGstin(vendorGstin);
            const taxable = lines.reduce((s, l) => s + taxableOf(l), 0);
            const booked: Heads = sumHeads(lines.map((l) => ({ cgst: num(l.cgst_amount), sgst: num(l.sgst_amount), igst: num(l.igst_amount) })));
            const tax = booked.cgst + booked.sgst + booked.igst;
            const flags: string[] = [];

            // Right tax head follows the supplier's state vs ours. The purchase screen
            // always books CGST+SGST ("isInter = false // TODO"), which would put
            // inter-state ITC in the wrong ledger.
            let eff = booked;
            if (gc.ok && orgState) {
                const inter = gc.stateCode !== orgState;
                eff = splitHeads(tax, inter);
                if (tax > 0 && Math.abs(eff.igst - booked.igst) > 0.5) {
                    flags.push(inter ? 'Inter-state supplier: tax moved CGST/SGST → IGST' : 'Same-state supplier: tax moved IGST → CGST/SGST');
                    headMismatch.count++; headMismatch.amount += tax; headMismatch.refs.push(pi.invoice_number);
                }
            }
            const itcEligible = gc.ok && tax > 0;
            if (tax > 0 && !gc.ok) {
                flags.push(`Supplier GSTIN ${gc.reason} — ITC at risk`);
                gstinBad.count++; gstinBad.amount += tax; gstinBad.refs.push(`${pi.invoice_number} (${pi.vendor?.vendor_name || 'vendor'})`);
                itcAtRisk += tax;
            }
            if (Math.abs(tax - (num(pi.cgst_amount) + num(pi.sgst_amount) + num(pi.igst_amount))) > 1) {
                flags.push('Header tax ≠ line tax');
                piHeaderMismatch.count++; piHeaderMismatch.refs.push(pi.invoice_number);
            }
            for (const l of lines) {
                const m = medById.get(l.medicine_id);
                if (m && masterRateOf(m) > 0 && Math.abs(masterRateOf(m) - num(l.gst_rate)) > 0.01) {
                    piRateMismatch.count++; piRateMismatch.refs.push(`${pi.invoice_number}: ${m.brand_name} (bill ${num(l.gst_rate)}% / master ${masterRateOf(m)}%)`);
                }
                bump(purchByRate, num(l.gst_rate), taxableOf(l), { cgst: num(l.cgst_amount), sgst: num(l.sgst_amount), igst: num(l.igst_amount) });
            }

            addAgg(purchTotal, taxable, eff);
            if (itcEligible) itcHeads.push(eff);
            purchaseRows.push({
                invoiceNo: pi.invoice_number, date: iso(pi.invoice_date), vendor: pi.vendor?.vendor_name || '',
                gstin: vendorGstin, gstinOk: gc.ok, gstinNote: gc.ok ? '' : (gc.reason || ''), status: pi.status,
                taxable: r2(taxable), cgst: r2(eff.cgst), sgst: r2(eff.sgst), igst: r2(eff.igst), total: r2(taxable + tax),
                itcEligible, flags,
            });
        }
        const itcHeadsSum = roundHeads(sumHeads(itcHeads));

        // Goods received (stock in) with no purchase invoice → no ITC document
        const grns: any[] = await db.goodsReceiptNote.findMany({
            where: { organizationId, received_at: range },
            select: { id: true, grn_number: true, po_id: true, total_amount: true },
        });
        let grnNoInvoice = { count: 0, value: 0, refs: [] as string[] };
        if (grns.length) {
            const grnIds = grns.map((g) => g.id);
            const poIds = Array.from(new Set(grns.map((g) => g.po_id).filter(Boolean))) as number[];
            const [lineLinks, poLinks] = await Promise.all([
                db.pharmacyPurchaseInvoiceLine.findMany({ where: { grn_id: { in: grnIds }, invoice: { organizationId } }, select: { grn_id: true } }),
                poIds.length
                    ? db.pharmacyPurchaseInvoice.findMany({ where: { organizationId, po_id: { in: poIds }, status: { notIn: PI_DEAD } }, select: { po_id: true } })
                    : Promise.resolve([] as any[]),
            ]);
            const invoicedGrn = new Set((lineLinks as any[]).map((x) => x.grn_id));
            const invoicedPo = new Set((poLinks as any[]).map((x) => x.po_id));
            for (const g of grns) {
                if (invoicedGrn.has(g.id) || (g.po_id && invoicedPo.has(g.po_id))) continue;
                grnNoInvoice.count++; grnNoInvoice.value += num(g.total_amount); grnNoInvoice.refs.push(g.grn_number);
            }
        }

        if (gstinBad.count) {
            issues.push({
                code: 'PURCHASE_GSTIN_INVALID', severity: 'high', count: gstinBad.count, amount: r2(gstinBad.amount), refs: uniq(gstinBad.refs),
                title: 'Purchase invoices with tax but no valid supplier GSTIN',
                detail: 'ITC is allowed only against a valid supplier GSTIN and only if the invoice appears in your GSTR-2B. These are excluded from ITC below. Fix the GSTIN on the supplier / invoice.',
            });
        }
        if (headMismatch.count) {
            issues.push({
                code: 'PURCHASE_TAX_HEAD', severity: 'high', count: headMismatch.count, amount: r2(headMismatch.amount), refs: uniq(headMismatch.refs),
                title: 'Purchase tax booked under the wrong head (CGST/SGST vs IGST)',
                detail: 'The purchase-invoice screen always books CGST+SGST. This report re-classifies tax by comparing the supplier GSTIN state with the pharmacy state; the stored invoices are not changed. Your GSTR-2B will show the correct head — keep it as the source of truth.',
            });
        }
        if (piHeaderMismatch.count) {
            issues.push({
                code: 'PURCHASE_HEADER_MISMATCH', severity: 'medium', count: piHeaderMismatch.count, refs: uniq(piHeaderMismatch.refs),
                title: 'Purchase invoice header tax ≠ sum of line tax', detail: 'The report uses line-level tax.',
            });
        }
        if (piRateMismatch.count) {
            issues.push({
                code: 'PURCHASE_RATE_VS_MASTER', severity: 'medium', count: piRateMismatch.count, refs: uniq(piRateMismatch.refs),
                title: 'Purchase GST rate differs from the medicine master',
                detail: 'The purchase bill rate is used here. If the master rate is stale, sales will be taxed at the wrong rate — update the master.',
            });
        }
        if (notPosted.count) {
            issues.push({
                code: 'PURCHASE_NOT_POSTED', severity: 'medium', count: notPosted.count, amount: r2(notPosted.tax), refs: uniq(notPosted.refs),
                title: 'Purchase invoices dated in the period but not posted',
                detail: 'Draft / pending-approval invoices are excluded from ITC (the stock is not received yet). Post them if the goods arrived this period.',
            });
        }
        if (grnNoInvoice.count) {
            issues.push({
                code: 'GRN_WITHOUT_INVOICE', severity: 'medium', count: grnNoInvoice.count, amount: r2(grnNoInvoice.value), refs: uniq(grnNoInvoice.refs),
                title: 'Goods received without a purchase invoice entered',
                detail: 'Stock came in through a GRN but no supplier tax invoice is recorded, so no ITC is claimed for it. Enter the invoice (ITC needs it) — compare against GSTR-2B.',
            });
        }

        // ═══ 4. ITC reversals — write-offs and supplier returns ═════════════
        const rets: any[] = await db.pharmacyReturn.findMany({
            where: {
                organizationId, created_at: range, status: 'Processed',
                return_type: { in: ['supplier_return', 'expired_stock', 'damage_writeoff'] },
            },
            select: { return_type: true, medicine_id: true, batch_id: true, quantity: true, unit_cost: true, vendor_id: true, created_at: true },
            orderBy: { created_at: 'asc' },
        });
        const vendorIds = Array.from(new Set(rets.map((r) => r.vendor_id).filter(Boolean))) as number[];
        const vendors: any[] = vendorIds.length
            ? await db.vendor.findMany({ where: { organizationId, id: { in: vendorIds } }, select: { id: true, vendor_name: true, gst_number: true } })
            : [];
        const vendorById = new Map<number, any>(vendors.map((v) => [v.id, v]));
        const reversalRows: ReversalRow[] = [];
        const woHeads: Heads[] = []; const srHeads: Heads[] = [];
        for (const r of rets) {
            const med = medById.get(r.medicine_id);
            const rate = masterRateOf(med);
            const taxable = num(r.unit_cost) * num(r.quantity);
            const tax = taxable * rate / 100;
            const isSupplier = r.return_type === 'supplier_return';
            const v = r.vendor_id ? vendorById.get(r.vendor_id) : null;
            const gc = checkGstin(v?.gst_number);
            const inter = isSupplier && gc.ok && !!orgState && gc.stateCode !== orgState;
            const heads = splitHeads(tax, inter);
            (isSupplier ? srHeads : woHeads).push(heads);
            reversalRows.push({
                date: iso(r.created_at), kind: isSupplier ? 'supplier_return' : 'writeoff',
                medicine: med?.brand_name || `#${r.medicine_id}`, batch: r.batch_id || '', vendor: v?.vendor_name || '',
                qty: num(r.quantity), rate, taxable: r2(taxable), cgst: r2(heads.cgst), sgst: r2(heads.sgst), igst: r2(heads.igst),
            });
        }
        const woSum = roundHeads(sumHeads(woHeads)); const srSum = roundHeads(sumHeads(srHeads));
        const woTotal = r2(woSum.cgst + woSum.sgst + woSum.igst); const srTotal = r2(srSum.cgst + srSum.sgst + srSum.igst);
        if (reversalRows.length) {
            issues.push({
                code: 'ITC_REVERSAL_ESTIMATED', severity: 'info', count: reversalRows.length, amount: r2(woTotal + srTotal), refs: [],
                title: 'ITC reversal is an estimate',
                detail: 'Write-offs (expired / damaged — Sec 17(5)(h), GSTR-3B 4(B)(1)) and supplier returns (debit notes, 4(B)(2)) are valued at batch cost × current catalogue GST rate. Reverse only the ITC you actually claimed on those goods; for supplier returns also issue a debit note to the supplier.',
            });
        }
        const orphanReturns = await db.pharmacyReturn.count({
            where: { organizationId, created_at: range, return_type: 'patient_return', original_invoice_id: null },
        });
        if (orphanReturns) {
            issues.push({
                code: 'PATIENT_RETURN_NO_INVOICE', severity: 'medium', count: orphanReturns, refs: [],
                title: 'Patient returns not linked to a bill',
                detail: 'Stock was restocked but no invoice / credit note exists, so no GST reduction is possible for them. Link returns to the original bill.',
            });
        }

        // Master-data hygiene for everything touched in the period
        const touched = new Set<number>();
        for (const pi of pis) for (const l of pi.line_items || []) touched.add(l.medicine_id);
        for (const r of rets) touched.add(r.medicine_id);
        const hsnMissingMaster: string[] = []; const rateOddMaster: string[] = [];
        for (const id of touched) {
            const m = medById.get(id);
            if (!m) continue;
            if (!HSN_OK.test(String(m.hsn_sac_code || '').trim())) hsnMissingMaster.push(m.brand_name);
            if (!isValidGstRate(masterRateOf(m))) rateOddMaster.push(m.brand_name);
        }
        if (hsnMissingMaster.length) {
            issues.push({
                code: 'MASTER_HSN', severity: 'medium', count: hsnMissingMaster.length, refs: uniq(hsnMissingMaster),
                title: 'Medicines purchased/returned with missing or malformed HSN',
                detail: 'Counter bills silently default a blank HSN to 3004; purchases and returns do not. Complete the HSN in the medicine master.',
            });
        }
        if (rateOddMaster.length) {
            issues.push({
                code: 'MASTER_RATE', severity: 'high', count: rateOddMaster.length, refs: uniq(rateOddMaster),
                title: 'Medicines with a non-standard GST % in the master', detail: 'Correct the GST % in the medicine master.',
            });
        }

        issues.push({
            code: 'NO_B2B_CAPTURE', severity: 'info', count: 0, refs: [],
            title: 'All sales are reported as B2C (table 7)',
            detail: 'Pharmacy bills carry no customer GSTIN field. If you sell to nursing homes/clinics that need a tax invoice with their GSTIN (GSTR-1 table 4 B2B), those cannot be produced from this system yet.',
        });
        issues.push({
            code: 'GSTR2B_RECONCILE', severity: 'info', count: 0, refs: [],
            title: 'Reconcile purchases with GSTR-2B before claiming ITC',
            detail: 'ITC can be claimed only for invoices that appear in your auto-drafted GSTR-2B (Sec 16(2)(aa)). Match the purchase register with the 2B download invoice-by-invoice.',
        });

        // ═══ 5. GSTR-3B assembly ═════════════════════════════════════════════
        const netRows = rateRows(netByRate);
        const taxableRows = netRows.filter((r) => r.rate > 0);
        const t31a = {
            taxable: r2(taxableRows.reduce((s, r) => s + r.taxable, 0)),
            cgst: r2(taxableRows.reduce((s, r) => s + r.cgst, 0)),
            sgst: r2(taxableRows.reduce((s, r) => s + r.sgst, 0)),
            igst: r2(taxableRows.reduce((s, r) => s + r.igst, 0)),
        };
        const t31c = { taxable: r2(netRows.filter((r) => r.rate === 0).reduce((s, r) => s + r.taxable, 0)) };
        const liability: Heads = { cgst: t31a.cgst, sgst: t31a.sgst, igst: t31a.igst };
        const t4B1: Heads = { cgst: woSum.cgst, sgst: woSum.sgst, igst: woSum.igst };
        const t4B2: Heads = { cgst: srSum.cgst, sgst: srSum.sgst, igst: srSum.igst };
        const netItc: Heads = {
            cgst: r2(itcHeadsSum.cgst - t4B1.cgst - t4B2.cgst),
            sgst: r2(itcHeadsSum.sgst - t4B1.sgst - t4B2.sgst),
            igst: r2(itcHeadsSum.igst - t4B1.igst - t4B2.igst),
        };
        const credit: Heads = { cgst: Math.max(0, netItc.cgst), sgst: Math.max(0, netItc.sgst), igst: Math.max(0, netItc.igst) };
        // A negative net ITC (reversals above credits) is payable in cash.
        const extraCash: Heads = { cgst: Math.max(0, -netItc.cgst), sgst: Math.max(0, -netItc.sgst), igst: Math.max(0, -netItc.igst) };
        const util = utilizeItc({ cgst: liability.cgst + extraCash.cgst, sgst: liability.sgst + extraCash.sgst, igst: liability.igst + extraCash.igst }, credit);

        const report: PharmacyGstReport = {
            meta: {
                pharmacyName: branding.name, gstin: branding.gstin, gstinValid: gstinCheck.ok, stateCode: orgState,
                placeOfSupply: placeOfSupplyLabel(orgState), address: branding.address,
                from: filters.from, to: filters.to, generatedAt: new Date().toISOString(),
            },
            sales: {
                byRate: rateRows(salesByRate),
                total: sumAgg(salesByRate),
                byChannel: Array.from(channelMap.entries()).map(([channel, a]) => ({ channel, invoices: a.invoices, ...roundAgg(a) })),
                creditNotes: { rows: cnRows, byRate: rateRows(cnByRate), total: sumAgg(cnByRate) },
                net: { byRate: netRows, total: sumAgg(netByRate) },
                hsn: Array.from(hsnMap.values())
                    .map((h) => ({ ...h, qty: r2(h.qty), totalValue: r2(h.totalValue), taxable: r2(h.taxable), cgst: r2(h.cgst), sgst: r2(h.sgst), igst: r2(h.igst) }))
                    .sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate),
                documents,
                invoices: invoiceRows,
            },
            catalog: {
                total: meds.filter((m) => m.is_active !== false).length,
                noHsn: meds.filter((m) => m.is_active !== false && !String(m.hsn_sac_code || '').trim()).length,
                zeroRate: meds.filter((m) => m.is_active !== false && masterRateOf(m) === 0).length,
            },
            masterFixes,
            underBilledEstimate,
            ipd: {
                billedValue: r2(ipdBilled), returnedValue: r2(ipdReturned), netValue: ipdNet, billedTax: r2(ipdBilledTax),
                packageConsumedValue: r2(pkgValue), byRate: ipdByRate, unresolvedValue: r2(ipdUnresolved), indicativeTax: ipdIndicativeTax,
            },
            purchases: {
                rows: purchaseRows,
                byRate: rateRows(purchByRate),
                total: roundAgg(purchTotal),
                itc: { ...itcHeadsSum, total: r2(itcHeadsSum.cgst + itcHeadsSum.sgst + itcHeadsSum.igst) },
                itcAtRisk: r2(itcAtRisk),
                notPosted: { count: notPosted.count, tax: r2(notPosted.tax) },
                grnWithoutInvoice: { count: grnNoInvoice.count, value: r2(grnNoInvoice.value) },
            },
            reversals: {
                rows: reversalRows,
                writeoff: { ...woSum, total: woTotal },
                supplierReturn: { ...srSum, total: srTotal },
            },
            gstr3b: {
                t31a, t31c, t4A5: itcHeadsSum, t4B1, t4B2, netItc, liability,
                cashPayable: util.cash,
                cashTotal: r2(util.cash.cgst + util.cash.sgst + util.cash.igst),
                carryForward: util.carryForward,
            },
            issues: issues.sort((a, b) => ({ high: 0, medium: 1, info: 2 }[a.severity] - { high: 0, medium: 1, info: 2 }[b.severity])),
        };
        return { success: true, report };
    } catch (error: any) {
        console.error('Pharmacy GST report error:', error);
        return { success: false, error: error?.message || 'Failed to build the pharmacy GST report' };
    }
}
