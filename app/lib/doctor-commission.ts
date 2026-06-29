/**
 * Doctor commission engine.
 *
 * Commission is earned by the doctor assigned to a bill (invoices.doctor_id),
 * computed PER BILL on the amount actually collected (paid_amount). Call
 * recomputeInvoiceDoctorCommission whenever an invoice's paid_amount changes
 * (payment, refund, cancellation). Bills with no doctor never accrue.
 *
 * Rows already pulled into a statement (included_in_statement | paid) are LOCKED.
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
            status: true,
            doctor_id: true,
        },
    });
    if (!invoice) return;

    const existing = await db.doctorCommission.findUnique({ where: { invoice_id: invoiceId } });
    // Locked once part of a statement/payout.
    if (existing && existing.status !== 'accrued') return;

    const removeIfPresent = async () => {
        if (existing) await db.doctorCommission.delete({ where: { invoice_id: invoiceId } });
    };

    // No doctor on the bill → nothing to accrue.
    if (!invoice.doctor_id) return removeIfPresent();

    const config = await db.doctorCommissionConfig.findFirst({
        where: { organizationId, doctor_id: invoice.doctor_id, is_active: true },
        include: { service_rates: true },
    });

    const cancelled = invoice.status === 'Cancelled';
    const collected = cancelled ? 0 : toNum(invoice.paid_amount);

    let rate = 0;
    let amount = 0;

    if (config) {
        if (config.commission_type === 'flat_percent') {
            rate = toNum(config.flat_percent);
            amount = (collected * rate) / 100;
        } else if (config.commission_type === 'per_service') {
            const match = config.service_rates.find((r: any) => r.service_type === invoice.invoice_type);
            rate = match ? toNum(match.percent) : 0;
            amount = (collected * rate) / 100;
        } else if (config.commission_type === 'fixed_per_bill') {
            rate = 0;
            amount = collected > 0 ? toNum(config.fixed_amount_per_bill) : 0;
        }
    } else {
        // No per-doctor config → fall back to the org-wide default flat %. This makes
        // unconfigured doctors accrue a real, settle-able payout. 0 = disabled.
        const defaultPercent =
            opts?.defaultPercent !== undefined
                ? opts.defaultPercent
                : await getOrgDefaultDoctorCommission(db, organizationId);
        rate = defaultPercent;
        amount = (collected * rate) / 100;
    }

    if (amount <= 0) return removeIfPresent();

    const data = {
        organizationId,
        doctor_id: invoice.doctor_id,
        patient_id: invoice.patient_id,
        invoice_id: invoiceId,
        invoice_type: invoice.invoice_type,
        eligible_base: collected.toFixed(2),
        rate_applied: rate,
        commission_amount: amount.toFixed(2),
        status: 'accrued',
    };

    await db.doctorCommission.upsert({
        where: { invoice_id: invoiceId },
        create: data,
        update: {
            doctor_id: data.doctor_id,
            eligible_base: data.eligible_base,
            rate_applied: data.rate_applied,
            commission_amount: data.commission_amount,
            invoice_type: data.invoice_type,
        },
    });
}

/**
 * Backfill doctor commissions for all paid invoices that have a doctor assigned.
 * Idempotent for accrued rows.
 */
export async function backfillDoctorCommissions(
    db: AnyDb,
    organizationId: string,
): Promise<{ processed: number }> {
    const invoices = await db.invoices.findMany({
        where: { organizationId, paid_amount: { gt: 0 }, doctor_id: { not: null } },
        select: { id: true },
    });
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
