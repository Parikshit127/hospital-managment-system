/**
 * Doctor commission engine.
 *
 * Commission is earned per (invoice, doctor) pair, computed on a share of the
 * amount actually collected (paid_amount). Two ways a doctor earns on a bill:
 *  - As the bill's attending/consulting doctor (invoices.doctor_id) — earns on
 *    whatever portion of the bill is NOT attributed to a specific line item below.
 *  - As the "rendered by" doctor on one or more invoice_items lines
 *    (invoice_items.rendered_by_doctor_id) — earns on that line's share only.
 * A doctor who is both (e.g. the attending doctor also performed a procedure
 * line) gets ONE combined row, not two.
 *
 * The bill's net_amount is split proportionally by each doctor's attributed
 * net total, then paid_amount is allocated in that same proportion to get each
 * doctor's "collected" base — so partial payments still split fairly instead
 * of crediting a doctor for money not yet collected.
 *
 * Call recomputeInvoiceDoctorCommission whenever an invoice's paid_amount,
 * doctor_id, or line-item rendered-by attribution changes (payment, refund,
 * cancellation, charge edit).
 *
 * Rows already pulled into a statement (included_in_statement | paid) are
 * LOCKED per-doctor — other doctors' rows on the same invoice still recompute.
 *
 * Plain util (not a server action) — invoked inline within a tenant-scoped db
 * context. Wrap calls in try/catch at the call site so it never blocks billing.
 */

function toNum(v: unknown): number {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : 0;
}

type AnyDb = any;

/**
 * Split a bill's net total across the doctors who earned it.
 *
 * Each "rendered by" line item credits its own doctor with that line's net_price;
 * whatever net is left over (lines with no specific rendering doctor) belongs to
 * the bill's attending/consulting doctor. A doctor who is both gets one merged
 * entry, never two.
 *
 * Exported so the payout statement can show a doctor's attributed share of every
 * bill WITHOUT depending on a commission row existing — commission is only
 * accrued once a rate is configured, but the doctor's clinical work (and the
 * patients behind it) must be listable either way.
 */
export function computeDoctorNetShares(
    items: Array<{ net_price?: unknown; rendered_by_doctor_id?: string | null }>,
    netAmountRaw: unknown,
    attendingDoctorId: string | null | undefined,
): { shares: Map<string, number>; netAmount: number; renderedTotal: number } {
    const shares = new Map<string, number>();
    let renderedTotal = 0;
    for (const it of items) {
        if (it.rendered_by_doctor_id) {
            const net = toNum(it.net_price);
            shares.set(it.rendered_by_doctor_id, (shares.get(it.rendered_by_doctor_id) || 0) + net);
            renderedTotal += net;
        }
    }
    const netAmount = toNum(netAmountRaw) || items.reduce((s, it) => s + toNum(it.net_price), 0);
    const remainderNet = Math.max(0, netAmount - renderedTotal);
    if (attendingDoctorId && remainderNet > 0) {
        shares.set(attendingDoctorId, (shares.get(attendingDoctorId) || 0) + remainderNet);
    }
    return { shares, netAmount, renderedTotal };
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/**
 * Resolve the per_service percent for one bill line.
 * A rate naming the service wins over the invoice_type bucket rate, so a hospital
 * can pay (say) 5% on IPD generally but 12% on one specific procedure.
 */
function rateForLine(config: any, invoiceType: string, description: unknown): number {
    const rates: any[] = config?.service_rates ?? [];
    const named = rates.find((r) => r.service_name && norm(r.service_name) === norm(description));
    if (named) return toNum(named.percent);
    const bucket = rates.find((r) => !r.service_name && r.service_type === invoiceType);
    return bucket ? toNum(bucket.percent) : 0;
}

/**
 * Commission for one doctor's share of the bill, given their own config.
 *
 * `lines` are THIS doctor's attributed lines with the collected amount apportioned
 * to each. When supplied, per_service configs are evaluated line by line so a
 * named-service rate can differ from the bucket rate. Without lines the whole
 * collected amount is charged at the bucket rate (previous behaviour), which keeps
 * every existing caller working.
 *
 * The returned `rate` is the effective blended percent — for a bill mixing a 5%
 * room charge and a 12% procedure it lands between the two, which is what the
 * statement should display.
 */
export function computeCommission(
    config: any,
    invoiceType: string,
    collected: number,
    defaultPercent: number,
    lines?: Array<{ description?: unknown; collected: number }>,
): { rate: number; amount: number } {
    let rate = 0;
    let amount = 0;
    if (config) {
        if (config.commission_type === 'flat_percent') {
            rate = toNum(config.flat_percent);
            amount = (collected * rate) / 100;
        } else if (config.commission_type === 'per_service') {
            if (lines?.length) {
                for (const ln of lines) {
                    amount += (toNum(ln.collected) * rateForLine(config, invoiceType, ln.description)) / 100;
                }
                rate = collected > 0 ? (amount / collected) * 100 : 0;
            } else {
                const match = (config.service_rates ?? []).find(
                    (r: any) => !r.service_name && r.service_type === invoiceType,
                );
                rate = match ? toNum(match.percent) : 0;
                amount = (collected * rate) / 100;
            }
        } else if (config.commission_type === 'fixed_per_bill') {
            rate = 0;
            amount = collected > 0 ? toNum(config.fixed_amount_per_bill) : 0;
        }
    } else {
        rate = defaultPercent;
        amount = (collected * rate) / 100;
    }
    return { rate, amount };
}

/**
 * The individual bill lines a doctor is credited for, with the collected amount
 * apportioned to each — the input `computeCommission` needs for per-service rates,
 * and the source of the service names shown on the doctor's invoice.
 *
 * A doctor is credited for the lines they personally rendered; if they are also
 * (or only) the attending doctor they additionally get every line nobody else
 * rendered.
 */
export function doctorLineShares(
    items: Array<{ net_price?: unknown; rendered_by_doctor_id?: string | null; description?: unknown }>,
    netAmount: number,
    paidAmount: number,
    attendingDoctorId: string | null | undefined,
    doctorId: string,
): Array<{ description: string; net: number; collected: number }> {
    const ratio = netAmount > 0 ? paidAmount / netAmount : 0;
    const out: Array<{ description: string; net: number; collected: number }> = [];
    for (const it of items) {
        const mine = it.rendered_by_doctor_id
            ? it.rendered_by_doctor_id === doctorId
            : attendingDoctorId === doctorId;
        if (!mine) continue;
        const net = toNum(it.net_price);
        out.push({ description: String(it.description ?? ''), net, collected: net * ratio });
    }
    return out;
}

/**
 * Org-wide fallback flat % applied to doctors with no DoctorCommissionConfig.
 * Returns 0 when unset/disabled. Cached value can be passed into
 * recomputeInvoiceDoctorCommission to avoid a per-invoice lookup during backfill.
 */
export async function getOrgDefaultDoctorCommission(db: AnyDb, organizationId: string): Promise<number> {
    const cfg = await db.organizationConfig.findUnique({
        where: { organizationId },
        select: { default_doctor_commission_percent: true },
    });
    const pct = Number(cfg?.default_doctor_commission_percent ?? 0);
    return Number.isFinite(pct) && pct > 0 ? pct : 0;
}

export async function recomputeInvoiceDoctorCommission(
    db: AnyDb,
    organizationId: string,
    invoiceId: number,
    opts?: { defaultPercent?: number },
): Promise<void> {
    const invoice = await db.invoices.findFirst({
        where: { id: invoiceId, organizationId },
        select: {
            id: true,
            patient_id: true,
            invoice_type: true,
            paid_amount: true,
            net_amount: true,
            status: true,
            doctor_id: true,
        },
    });
    if (!invoice) return;

    const items = await db.invoice_items.findMany({
        where: { invoice_id: invoiceId },
        // description is needed so per-named-service rates can match the line.
        select: { net_price: true, rendered_by_doctor_id: true, description: true },
    });

    // Split the bill's net total by doctor (see computeDoctorNetShares).
    const { shares: doctorNetShare, netAmount } = computeDoctorNetShares(
        items,
        invoice.net_amount,
        invoice.doctor_id,
    );

    const existingRows = await db.doctorCommission.findMany({ where: { invoice_id: invoiceId } });
    const lockedDoctorIds = new Set(
        existingRows.filter((r: any) => r.status !== 'accrued').map((r: any) => r.doctor_id),
    );

    // Nobody to pay (no attending doctor and no rendered-by lines) → clear
    // whatever's accrued (untouched rows stay locked).
    if (doctorNetShare.size === 0) {
        const toDelete = existingRows.filter((r: any) => !lockedDoctorIds.has(r.doctor_id));
        if (toDelete.length) {
            await db.doctorCommission.deleteMany({
                where: { invoice_id: invoiceId, doctor_id: { in: toDelete.map((r: any) => r.doctor_id) } },
            });
        }
        return;
    }

    const cancelled = invoice.status === 'Cancelled';
    const collected = cancelled ? 0 : toNum(invoice.paid_amount);

    const doctorIds = [...doctorNetShare.keys()];
    const configs = await db.doctorCommissionConfig.findMany({
        where: { organizationId, doctor_id: { in: doctorIds }, is_active: true },
        include: { service_rates: true },
    });
    const configByDoctor = new Map<string, any>(configs.map((c: any) => [c.doctor_id, c]));
    const defaultPercent =
        opts?.defaultPercent !== undefined
            ? opts.defaultPercent
            : await getOrgDefaultDoctorCommission(db, organizationId);

    const seenDoctorIds = new Set<string>();
    for (const doctorId of doctorIds) {
        if (lockedDoctorIds.has(doctorId)) continue; // already paid/statemented for this invoice — don't touch

        const netShare = doctorNetShare.get(doctorId)!;
        const collectedForDoctor = netAmount > 0 ? collected * (netShare / netAmount) : 0;
        const config = configByDoctor.get(doctorId);
        const lines = doctorLineShares(items, netAmount, collected, invoice.doctor_id, doctorId);
        const { rate, amount } = computeCommission(
            config,
            invoice.invoice_type,
            collectedForDoctor,
            defaultPercent,
            lines,
        );

        if (amount <= 0) continue;
        seenDoctorIds.add(doctorId);

        const data = {
            organizationId,
            doctor_id: doctorId,
            patient_id: invoice.patient_id,
            invoice_id: invoiceId,
            invoice_type: invoice.invoice_type,
            eligible_base: collectedForDoctor.toFixed(2),
            rate_applied: rate,
            commission_amount: amount.toFixed(2),
            status: 'accrued',
        };

        await db.doctorCommission.upsert({
            where: { invoice_id_doctor_id: { invoice_id: invoiceId, doctor_id: doctorId } },
            create: data,
            update: {
                eligible_base: data.eligible_base,
                rate_applied: data.rate_applied,
                commission_amount: data.commission_amount,
                invoice_type: data.invoice_type,
            },
        });
    }

    // Drop unlocked rows for doctors no longer owed anything on this invoice
    // (e.g. their line was removed, or their share now computes to 0).
    const staleDoctorIds = existingRows
        .filter((r: any) => !lockedDoctorIds.has(r.doctor_id) && !seenDoctorIds.has(r.doctor_id))
        .map((r: any) => r.doctor_id);
    if (staleDoctorIds.length) {
        await db.doctorCommission.deleteMany({
            where: { invoice_id: invoiceId, doctor_id: { in: staleDoctorIds } },
        });
    }
}

/**
 * Backfill doctor commissions for all paid invoices that have a doctor assigned
 * — either bill-level (invoices.doctor_id) or via a rendered-by line item.
 * Idempotent for accrued rows.
 */
export async function backfillDoctorCommissions(
    db: AnyDb,
    organizationId: string,
): Promise<{ processed: number }> {
    const [billLevel, renderedByItems] = await Promise.all([
        db.invoices.findMany({
            where: { organizationId, paid_amount: { gt: 0 }, doctor_id: { not: null } },
            select: { id: true },
        }),
        db.invoice_items.findMany({
            where: { organizationId, rendered_by_doctor_id: { not: null }, invoice: { paid_amount: { gt: 0 } } },
            select: { invoice_id: true },
            distinct: ['invoice_id'],
        }),
    ]);
    const invoiceIds = new Set<number>([
        ...billLevel.map((i: any) => i.id),
        ...renderedByItems.map((i: any) => i.invoice_id),
    ]);
    const invoices = [...invoiceIds].map((id) => ({ id }));
    // Resolve the org default once so unconfigured doctors accrue without N lookups.
    const defaultPercent = await getOrgDefaultDoctorCommission(db, organizationId);
    let processed = 0;
    for (const inv of invoices) {
        try {
            await recomputeInvoiceDoctorCommission(db, organizationId, inv.id, { defaultPercent });
            processed++;
        } catch (e) {
            console.error('backfill doctor commission failed for invoice', inv.id, e);
        }
    }
    return { processed };
}
