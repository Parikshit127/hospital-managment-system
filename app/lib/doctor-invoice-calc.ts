/**
 * Pure maths for doctor invoices — shared by the worksheet (client), the server
 * actions and the PDF so every screen agrees to the paisa.
 *
 * No server-only imports: this module is bundled into 'use client' components.
 */

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** One service line inside a bill's payable, with the rate that applied to it. */
export type InvoiceService = {
    /** invoice_items.id — lets an edit target the exact line even if names repeat. */
    item_id?: number | null;
    name: string;
    net: number;
    collected: number;
    rate: number;
    amount: number;
    /** Engine rate before a manual edit; present only when the rate was changed. */
    base_rate?: number | null;
};

export type BillEdit = {
    /** Final payable for the whole bill. number = override, null = reset, undefined = untouched. */
    amount?: number | null;
    /** New rate per service, keyed by item_id. */
    rates?: Record<string, number>;
    note?: string;
};

/** Snapshot frozen onto doctor_commissions.line_breakdown. */
export type LineBreakdown = {
    services: InvoiceService[];
    bill_net: number;
    bill_paid: number;
    doctor_net: number;
    doctor_collected: number;
    attribution: 'attending' | 'rendered' | 'both';
};

/**
 * Apply a manual edit on top of the engine's number for one bill.
 *
 * Order of precedence: an explicit bill amount wins; otherwise edited service
 * rates adjust the engine amount by (collected × rate delta) per edited service —
 * a delta, not a re-sum, so fixed-per-bill configs (whose service rows show 0%)
 * keep their fixed fee when someone tweaks one rate.
 */
export function applyBillEdit(
    computed: number,
    services: InvoiceService[],
    edit?: BillEdit,
): { final: number; services: InvoiceService[]; adjusted: boolean; svcFinal: number } {
    const reset = edit?.amount === null;
    const out: InvoiceService[] = services.map((s) => {
        const key = s.item_id != null ? String(s.item_id) : null;
        const hasNew = !reset && key != null && edit?.rates && Object.prototype.hasOwnProperty.call(edit.rates, key);
        // A reset puts every edited service back on its engine rate.
        if (reset && s.base_rate != null) {
            return { ...s, rate: s.base_rate, amount: r2((s.collected * s.base_rate) / 100), base_rate: null };
        }
        if (!hasNew) return { ...s };
        const newRate = Math.max(0, Math.min(100, Number(edit!.rates![key!]) || 0));
        const base = s.base_rate ?? s.rate;
        return {
            ...s,
            rate: newRate,
            amount: r2((s.collected * newRate) / 100),
            base_rate: Math.abs(newRate - base) < 1e-9 ? null : base,
        };
    });

    const delta = out.reduce(
        (sum, s) => (s.base_rate != null ? sum + (s.collected * (s.rate - s.base_rate)) / 100 : sum),
        0,
    );
    const svcFinal = r2(Math.max(0, computed + delta));

    let final: number;
    if (reset) final = r2(computed);
    else if (typeof edit?.amount === 'number' && Number.isFinite(edit.amount)) final = r2(Math.max(0, edit.amount));
    else final = svcFinal;

    return { final, services: out, svcFinal, adjusted: Math.abs(final - computed) > 0.004 };
}

/** Gross → adjustment → TDS → net, in the one order every screen uses. */
export function invoiceTotals(lineAmounts: number[], adjustment: number, tdsRatePercent: number) {
    const lines = r2(lineAmounts.reduce((s, n) => s + (Number(n) || 0), 0));
    const adj = r2(adjustment);
    const gross = r2(lines + adj);
    const tds = r2((gross * (Number(tdsRatePercent) || 0)) / 100);
    return { lines, adjustment: adj, gross, tds, net: r2(gross - tds) };
}

export type DoctorInvoiceStatus = 'draft' | 'finalized' | 'partially_paid' | 'paid';

/** Status shown to people — draft/finalized both just mean "nothing paid yet". */
export const INVOICE_STATUS_LABEL: Record<string, string> = {
    draft: 'Unpaid',
    finalized: 'Unpaid',
    partially_paid: 'Part paid',
    paid: 'Paid',
};

/** Paid/balance/status from the live (non-voided) payments against the net due. */
export function paymentState(net: number, paid: number, current: string): {
    paid: number;
    balance: number;
    status: DoctorInvoiceStatus;
} {
    const p = r2(paid);
    const balance = r2(Math.max(0, net - p));
    let status: DoctorInvoiceStatus;
    if (p > 0 && balance <= 0.004) status = 'paid';
    else if (p > 0) status = 'partially_paid';
    else status = current === 'finalized' ? 'finalized' : 'draft';
    return { paid: p, balance, status };
}

export const PAYMENT_MODES = ['Bank Transfer', 'UPI', 'Cash', 'Cheque', 'Other'] as const;
