/**
 * Referral commission engine.
 *
 * Commission accrues on the amount a patient actually PAYS (collected), for the
 * patient's lifetime, to the referrer linked at registration. Call
 * recomputeInvoiceCommission whenever an invoice's paid_amount changes
 * (payment, refund, cancellation). Self patients (referrer_id = null) never accrue.
 *
 * Rows already pulled into a statement (status included_in_statement | paid) are
 * LOCKED — the engine never mutates them. Only `accrued` rows are recomputed.
 *
 * This is a plain util (not a server action) so it can be invoked inline within
 * an existing tenant-scoped db context. Always wrap calls in try/catch at the
 * call site so commission errors never block billing.
 */

function toNum(v: unknown): number {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : 0;
}

type AnyDb = any;

export async function recomputeInvoiceCommission(
    db: AnyDb,
    organizationId: string,
    invoiceId: number,
): Promise<void> {
    const invoice = await db.invoices.findFirst({
        where: { id: invoiceId, organizationId },
        select: {
            id: true,
            patient_id: true,
            invoice_type: true,
            paid_amount: true,
            status: true,
        },
    });
    if (!invoice) return;

    const existing = await db.referralCommission.findUnique({
        where: { invoice_id: invoiceId },
    });
    // Locked once it's part of a statement/payout — leave it alone.
    if (existing && existing.status !== 'accrued') return;

    const patient = await db.oPD_REG.findUnique({
        where: { patient_id: invoice.patient_id },
        select: { referrer_id: true },
    });

    const removeIfPresent = async () => {
        if (existing) await db.referralCommission.delete({ where: { invoice_id: invoiceId } });
    };

    // Self / no referrer → nothing to accrue.
    if (!patient?.referrer_id) return removeIfPresent();

    const referrer = await db.referrer.findFirst({
        where: { id: patient.referrer_id, organizationId },
        include: { service_rates: true },
    });
    if (!referrer) return removeIfPresent();

    // Cancelled bills earn nothing.
    const cancelled = invoice.status === 'Cancelled';
    const collected = cancelled ? 0 : toNum(invoice.paid_amount);

    let rate = 0;
    let amount = 0;

    if (referrer.commission_type === 'flat_percent') {
        rate = toNum(referrer.flat_percent);
        amount = (collected * rate) / 100;
    } else if (referrer.commission_type === 'per_service') {
        const match = referrer.service_rates.find(
            (r: any) => r.service_type === invoice.invoice_type,
        );
        rate = match ? toNum(match.percent) : 0;
        amount = (collected * rate) / 100;
    } else if (referrer.commission_type === 'fixed_per_patient') {
        rate = 0;
        const fixed = toNum(referrer.fixed_amount_per_patient);
        if (collected > 0 && fixed > 0) {
            // Credit the fixed amount only once per patient. If another (non-void)
            // commission row for this patient already holds it, this invoice gets 0.
            const otherHolder = await db.referralCommission.findFirst({
                where: {
                    organizationId,
                    referrer_id: referrer.id,
                    patient_id: invoice.patient_id,
                    invoice_id: { not: invoiceId },
                    status: { not: 'void' },
                    commission_amount: { gt: 0 },
                },
                select: { id: true },
            });
            amount = otherHolder ? 0 : fixed;
        }
    }

    // Nothing payable → drop any stale accrued row, don't create noise.
    if (amount <= 0) return removeIfPresent();

    const data = {
        organizationId,
        referrer_id: referrer.id,
        patient_id: invoice.patient_id,
        invoice_id: invoiceId,
        invoice_type: invoice.invoice_type,
        eligible_base: collected.toFixed(2),
        rate_applied: rate,
        commission_amount: amount.toFixed(2),
        status: 'accrued',
    };

    await db.referralCommission.upsert({
        where: { invoice_id: invoiceId },
        create: data,
        update: {
            eligible_base: data.eligible_base,
            rate_applied: data.rate_applied,
            commission_amount: data.commission_amount,
            invoice_type: data.invoice_type,
        },
    });
}

/**
 * Backfill commissions for all paid invoices of patients that have a referrer.
 * Safe to re-run — recomputeInvoiceCommission is idempotent for accrued rows.
 */
export async function backfillReferralCommissions(
    db: AnyDb,
    organizationId: string,
): Promise<{ processed: number }> {
    const invoices = await db.invoices.findMany({
        where: {
            organizationId,
            paid_amount: { gt: 0 },
            patient: { referrer_id: { not: null } },
        },
        select: { id: true },
    });
    let processed = 0;
    for (const inv of invoices) {
        try {
            await recomputeInvoiceCommission(db, organizationId, inv.id);
            processed++;
        } catch (e) {
            console.error('backfill commission failed for invoice', inv.id, e);
        }
    }
    return { processed };
}
