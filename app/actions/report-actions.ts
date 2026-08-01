'use server';

import { requireTenantContext } from '@/backend/tenant';
import { resolveIncomeHeadCode, incomeHeadName } from '@/app/lib/gl-income-head-map';
import { formatDoctorName } from '@/app/lib/format-name';
import { canonicalTender, tenderVariants, isDepositSettlement } from '@/app/lib/payment-tender';

type MISPaymentBreakup = {
    cash_amount: number;
    upi_amount: number;
    card_amount: number;
    bank_transfer_amount: number;
};

function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

function emptyMISPaymentBreakup(): MISPaymentBreakup {
    return { cash_amount: 0, upi_amount: 0, card_amount: 0, bank_transfer_amount: 0 };
}

// Rounds to 2 decimals (paise) and snaps floating-point residue near zero down to
// exactly 0. Stored balance_due values can drift to values like 9e-13 from repeated
// float arithmetic upstream (net_amount - paid_amount across many write paths), which
// a naive `> 0` DB filter treats as truthy even though the bill is fully paid.
function round2(n: number): number {
    const r = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    return Object.is(r, -0) ? 0 : r;
}

function misPaymentBreakupKey(method: string | null | undefined): keyof MISPaymentBreakup | null {
    const tender = canonicalTender(method);
    if (tender === 'Cash') return 'cash_amount';
    if (tender === 'UPI') return 'upi_amount';
    if (tender === 'Card') return 'card_amount';
    if (tender === 'Bank Transfer' || tender === 'NEFT/RTGS') return 'bank_transfer_amount';
    return null;
}

function addMISPaymentBreakup(
    target: MISPaymentBreakup,
    method: string | null | undefined,
    amount: number,
    direction: 1 | -1 = 1,
) {
    const key = misPaymentBreakupKey(method);
    if (!key) return;
    target[key] += direction * Number(amount || 0);
}

function mergeMISPaymentBreakup(target: MISPaymentBreakup, source: MISPaymentBreakup | undefined, direction: 1 | -1 = 1) {
    if (!source) return;
    target.cash_amount += direction * Number(source.cash_amount || 0);
    target.upi_amount += direction * Number(source.upi_amount || 0);
    target.card_amount += direction * Number(source.card_amount || 0);
    target.bank_transfer_amount += direction * Number(source.bank_transfer_amount || 0);
}

export async function getCollectionsReport(filters: { from: string; to: string; method?: string; invoiceType?: string; admissionStatus?: string }) {
    try {
        const { db } = await requireTenantContext();
        const fromDate = new Date(filters.from + 'T00:00:00+05:30');
        const toDate = new Date(filters.to + 'T23:59:59.999+05:30');
        const where: any = {
            status: { in: ['Completed', 'Reversed'] },
            created_at: { gte: fromDate, lte: toDate },
        };
        if (filters.method && filters.method !== 'others' && filters.method !== 'all') {
            // Match every raw spelling of the chosen tender (BankTransfer / Bank Transfer / …).
            where.payment_method = { in: tenderVariants(filters.method) };
        } else if (filters.method === 'others') {
            where.payment_method = { notIn: ['Cash', 'UPI'] };
        }
        // Always filter via the related invoice. When no explicit invoiceType is
        // requested, pharmacy invoices are excluded — pharmacy is a separate counter
        // and should not appear in the hospital reception collection report.
        where.invoice = {
            ...(filters.invoiceType
                ? { invoice_type: filters.invoiceType }
                : { invoice_type: { notIn: ['Pharmacy', 'PHARMACY'] } }),
            ...(filters.admissionStatus ? { admission: { status: filters.admissionStatus } } : {}),
        };

        const payments = await db.payments.findMany({
            where,
            include: {
                invoice: {
                    select: {
                        invoice_number: true,
                        invoice_type: true,
                        patient: {
                            select: {
                                full_name: true,
                                patient_id: true
                            }
                        }
                    }
                }
            },
            orderBy: { created_at: 'desc' },
        });

        // Resolve cashier usernames from system audit logs
        const receiptNumbers = payments.map((p: any) => p.receipt_number);
        const auditLogs = receiptNumbers.length
            ? await db.system_audit_logs.findMany({
                where: {
                    action: { in: ['RECORD_PAYMENT', 'SPLIT_PAYMENT'] },
                    entity_id: { in: receiptNumbers }
                },
                select: { entity_id: true, username: true }
            })
            : [];
        const cashierMap = new Map<string, string>(
            auditLogs
                .filter((log: any) => log.entity_id && log.username)
                .map((log: any) => [log.entity_id as string, log.username as string])
        );

        // Fetch user full names
        const users = await db.user.findMany({
            select: { username: true, name: true }
        });
        const userMap = new Map<string, string>(
            users
                .filter((u: any) => u.username && u.name)
                .map((u: any) => [u.username.toLowerCase(), u.name])
        );

        const enrichedPayments = payments.map((p: any) => {
            const username = String(cashierMap.get(p.receipt_number) || 'system');
            const fullName = userMap.get(username.toLowerCase()) || username;
            return {
                ...p,
                cashier_username: username,
                cashier_name: fullName
            };
        });

        const totals = enrichedPayments.reduce((acc: any, p: any) => {
            if (p.status === 'Completed') {
                // Bucket under the 'Deposit' pseudo-tender by receipt number, not the
                // raw payment_method — the payment-edit screen can change a settlement
                // row's method after the fact, and this bucket must stay stable so the
                // `received` calculation below keeps excluding it (see isDepositSettlement).
                const method = isDepositSettlement(p) ? 'Deposit' : p.payment_method;
                acc[method] = (acc[method] || 0) + Number(p.amount);
                acc.total = (acc.total || 0) + Number(p.amount);
            }
            return acc;
        }, {});

        // Advance deposits actually COLLECTED in this period, by real tender
        // (Cash/UPI/Card). These are separate from the "Deposit" payment method
        // above, which represents deposits *applied* to bills. Always computed
        // across all tenders regardless of the payments method filter.
        const depositRows = await db.patientDeposit.findMany({
            where: { created_at: { gte: fromDate, lte: toDate } },
            select: { id: true, deposit_number: true, patient_id: true, amount: true, payment_method: true, admission_id: true, collected_by: true, created_at: true, refunded_amount: true },
        });

        // Resolve patient names for deposits
        const depositPatientIds = [...new Set(depositRows.map((d: any) => d.patient_id))];
        const depositPatients = depositPatientIds.length
            ? await db.oPD_REG.findMany({
                where: { patient_id: { in: depositPatientIds } },
                select: { patient_id: true, full_name: true }
            })
            : [];
        const depPatientMap = new Map(depositPatients.map((p: any) => [p.patient_id, p.full_name]));

        const enrichedDeposits = depositRows.map((d: any) => {
            const username = String(d.collected_by || 'system');
            const fullName = userMap.get(username.toLowerCase()) || username;
            return {
                ...d,
                patient_name: depPatientMap.get(d.patient_id) || '-',
                cashier_username: username,
                cashier_name: fullName
            };
        });

        // Trace each "Deposit"-applied payment back to its source deposit so the
        // report can label the deposit's real type — IPD/OPD (admission-linked) and
        // the original tender it was collected in. The apply step stamps the payment
        // with created_at = deposit.created_at and notes "Applied from deposit <num>",
        // so the source deposit is in depositRows for the same period.
        const depByNumber = new Map<string, any>(depositRows.map((d: any) => [d.deposit_number, d]));
        for (const p of enrichedPayments as any[]) {
            if (!isDepositSettlement(p)) continue;
            const m = /deposit\s+(\S+)/i.exec(p.notes || '');
            const src = m ? depByNumber.get(m[1]) : null;
            p.deposit_tender = src?.payment_method ?? null;
            p.deposit_is_ipd = src ? !!src.admission_id : null;
        }

        // Net each deposit by what's already been refunded back to the patient —
        // a refunded deposit is no longer money the hospital holds and must not
        // keep inflating "collected this period" totals.
        const depositsCollectedMap = enrichedDeposits.reduce((acc: any, d: any) => {
            const method = canonicalTender(d.payment_method);
            const net = Number(d.amount) - Number(d.refunded_amount || 0);
            acc[method] = (acc[method] || 0) + net;
            acc.total = (acc.total || 0) + net;
            return acc;
        }, {});

        // ── Money actually RECEIVED this period, by tender ──────────────────
        // = real-tender invoice payments (Cash/UPI/Card…) + advances collected
        //   in the same tender. The "Deposit" pseudo-tender inside `totals` is
        //   an advance received earlier being *applied* to a bill, so it is
        //   excluded here to avoid counting the same money twice.
        // Advances are patient-level (not tied to a bill type), so they are only
        // folded in for the unfiltered "All bill types" view.
        const depositApplied = Number((totals as any).Deposit || 0);
        const includeAdvances = !filters.invoiceType && !filters.admissionStatus;
        const received: Record<string, number> = {};
        for (const [m, amt] of Object.entries(totals)) {
            if (m === 'total' || m === 'Deposit') continue;
            const key = canonicalTender(m);
            received[key] = (received[key] || 0) + Number(amt);
        }
        if (includeAdvances) {
            for (const d of enrichedDeposits) {
                const m = canonicalTender(d.payment_method);
                if (filters.method && filters.method !== 'all') {
                    if (filters.method === 'others') { if (['Cash', 'UPI'].includes(m)) continue; }
                    else if (m !== canonicalTender(filters.method)) continue;
                }
                received[m] = (received[m] || 0) + (Number(d.amount) - Number(d.refunded_amount || 0));
            }
        }
        const receivedTotal = Object.values(received).reduce((s, v) => s + v, 0);

        // Fetch refunds from Refund table
        const refundRows = await db.refund.findMany({
            where: {
                created_at: { gte: fromDate, lte: toDate },
                status: { in: ['Approved', 'Processed'] }
            },
            select: { id: true, invoice_id: true, payment_id: true, amount: true, processed_by: true, created_at: true, payment_method: true },
            orderBy: { created_at: 'asc' }
        });

        // Resolve each refund's patient. Prefer the tender staff actually recorded
        // when processing the refund; for legacy refunds (recorded before that
        // field existed) fall back to the linked payment's original tender, then Cash.
        const refundPaymentIds = [...new Set(
            refundRows.map((r: any) => Number(r.payment_id)).filter((n: number) => Number.isFinite(n))
        )];
        const refundPayments = refundPaymentIds.length
            ? await db.payments.findMany({
                where: { id: { in: refundPaymentIds } },
                select: {
                    id: true,
                    payment_method: true,
                    invoice: {
                        select: {
                            invoice_type: true,
                            patient: { select: { full_name: true, patient_id: true } }
                        }
                    }
                }
            })
            : [];
        const refundPaymentMap = new Map<string, any>(refundPayments.map((p: any) => [String(p.id), p]));

        const unresolvedInvoiceIds = [...new Set(
            refundRows
                .filter((r: any) => !refundPaymentMap.has(String(r.payment_id)))
                .map((r: any) => Number(r.invoice_id))
                .filter((n: number) => Number.isFinite(n))
        )];
        const refundInvoices = unresolvedInvoiceIds.length
            ? await db.invoices.findMany({
                where: { id: { in: unresolvedInvoiceIds } },
                select: {
                    id: true,
                    invoice_type: true,
                    patient: { select: { full_name: true, patient_id: true } }
                }
            })
            : [];
        const refundInvoiceMap = new Map<string, any>(refundInvoices.map((i: any) => [String(i.id), i]));

        const enrichedRefunds = refundRows.map((r: any) => {
            const username = String(r.processed_by || 'system');
            const fullName = userMap.get(username.toLowerCase()) || username;
            const linkedPayment = refundPaymentMap.get(String(r.payment_id)) || null;
            const linkedInvoice = linkedPayment?.invoice || refundInvoiceMap.get(String(r.invoice_id)) || null;
            return {
                ...r,
                cashier_username: username,
                cashier_name: fullName,
                payment_method: r.payment_method || linkedPayment?.payment_method || 'Cash',
                invoice_type: linkedInvoice?.invoice_type || null,
                patient_name: linkedInvoice?.patient?.full_name || null,
                patient_id: linkedInvoice?.patient?.patient_id || null
            };
        });

        return {
            success: true,
            data: {
                payments: serialize(enrichedPayments),
                totals,
                received: serialize(received),
                receivedTotal,
                depositApplied,
                depositsCollected: serialize(depositsCollectedMap),
                depositsList: serialize(enrichedDeposits),
                refunds: serialize(enrichedRefunds)
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getARAgingReport(filters?: { invoiceType?: string; admissionStatus?: string }) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {
            status: 'Final',
            // DB-level filter is a coarse pre-filter only — balance_due can carry
            // floating-point residue (e.g. 9e-13) from upstream arithmetic on
            // otherwise fully-paid bills, so a raw `gt: 0` lets those through. Use a
            // sub-paisa threshold here (permissive, excludes only float dust) and let
            // the rounded-to-paise check in JS below be the authoritative filter —
            // that way a genuinely small real balance (e.g. 0.01) is never dropped
            // at this stage.
            balance_due: { gt: 0.001 },
            invoice_type: filters?.invoiceType
                ? filters.invoiceType
                : { notIn: ['Pharmacy', 'PHARMACY'] },
        };
        if (filters?.admissionStatus) where.admission = { status: filters.admissionStatus };
        const invoices = await db.invoices.findMany({
            where,
            include: { patient: { select: { full_name: true, phone: true } } },
            orderBy: { created_at: 'asc' },
        });

        const now = new Date();
        const aged = invoices
            .map((inv: any) => ({ ...inv, balance_due: round2(Number(inv.balance_due)) }))
            // Belt-and-braces: re-check balance > 0 after rounding to paise so any
            // remaining float dust that slipped past the DB threshold (or a bill
            // sitting just under it, e.g. 0.005) never renders as a ₹0 row.
            .filter((inv: any) => inv.balance_due > 0)
            .map((inv: any) => {
                const days = Math.floor((now.getTime() - new Date(inv.created_at).getTime()) / (1000 * 60 * 60 * 24));
                let bucket = '0-30';
                if (days > 60) bucket = '60+';
                else if (days > 30) bucket = '30-60';
                return { ...inv, days_overdue: days, aging_bucket: bucket };
            });

        const summary = {
            '0-30': aged.filter((i: any) => i.aging_bucket === '0-30').reduce((s: number, i: any) => s + Number(i.balance_due), 0),
            '30-60': aged.filter((i: any) => i.aging_bucket === '30-60').reduce((s: number, i: any) => s + Number(i.balance_due), 0),
            '60+': aged.filter((i: any) => i.aging_bucket === '60+').reduce((s: number, i: any) => s + Number(i.balance_due), 0),
        };

        return { success: true, data: { invoices: serialize(aged), summary } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getCashFlowReport(filters: { from: string; to: string; invoiceType?: string; admissionStatus?: string }) {
    try {
        const { db } = await requireTenantContext();
        const fromDate = new Date(filters.from + 'T00:00:00+05:30');
        const toDate = new Date(filters.to + 'T23:59:59.999+05:30');
        const dateFilter = { gte: fromDate, lte: toDate };
        // Inflows can be split by IPD/OPD via the payment's invoice; expenses are
        // org-wide and not attributable to a bill type, so they stay unfiltered.
        const inflowWhere: any = { status: 'Completed', created_at: dateFilter };
        if (filters.invoiceType || filters.admissionStatus) {
            inflowWhere.invoice = {
                ...(filters.invoiceType ? { invoice_type: filters.invoiceType } : {}),
                ...(filters.admissionStatus ? { admission: { status: filters.admissionStatus } } : {}),
            };
        }

        const [inflows, outflows] = await Promise.all([
            db.payments.findMany({
                where: inflowWhere,
                select: { amount: true, created_at: true, payment_method: true },
            }),
            db.expense.findMany({
                where: { status: { in: ['Approved', 'Paid'] }, created_at: dateFilter },
                select: { total_amount: true, created_at: true, payment_method: true },
            }),
        ]);

        // Group by date (IST)
        const dailyMap: Record<string, { inflow: number; outflow: number }> = {};
        inflows.forEach((p: any) => {
            const day = new Date(p.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            if (!dailyMap[day]) dailyMap[day] = { inflow: 0, outflow: 0 };
            dailyMap[day].inflow += Number(p.amount);
        });
        outflows.forEach((e: any) => {
            const day = new Date(e.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            if (!dailyMap[day]) dailyMap[day] = { inflow: 0, outflow: 0 };
            dailyMap[day].outflow += Number(e.total_amount);
        });

        const daily = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, vals]) => ({
            date, ...vals, net: vals.inflow - vals.outflow,
        }));

        const totalInflow = inflows.reduce((s: number, p: any) => s + Number(p.amount), 0);
        const totalOutflow = outflows.reduce((s: number, e: any) => s + Number(e.total_amount), 0);

        return { success: true, data: { daily, totalInflow, totalOutflow, netFlow: totalInflow - totalOutflow } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getProfitLossReport(filters: { from: string; to: string; invoiceType?: string; admissionStatus?: string }) {
    try {
        const { db } = await requireTenantContext();
        const fromDate = new Date(filters.from + 'T00:00:00+05:30');
        const toDate = new Date(filters.to + 'T23:59:59.999+05:30');
        const dateFilter = { gte: fromDate, lte: toDate };
        // Income (invoice items) can be split by IPD/OPD or admit/discharge; expenses are org-wide.
        const itemWhere: any = { created_at: dateFilter };
        if (filters.invoiceType || filters.admissionStatus) {
            itemWhere.invoice = {
                ...(filters.invoiceType ? { invoice_type: filters.invoiceType } : {}),
                ...(filters.admissionStatus ? { admission: { status: filters.admissionStatus } } : {}),
            };
        }

        const [revenueByDept, expensesByCat] = await Promise.all([
            db.invoice_items.groupBy({
                by: ['department'],
                _sum: { net_price: true },
                where: itemWhere,
            }),
            db.expense.groupBy({
                by: ['category_id'],
                _sum: { total_amount: true },
                where: { status: { in: ['Approved', 'Paid'] }, created_at: dateFilter },
            }),
        ]);

        // Get category names
        const categoryIds = expensesByCat.map((e: any) => e.category_id);
        const categories = categoryIds.length > 0
            ? await db.expenseCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
            : [];
        const catMap = Object.fromEntries(categories.map((c: any) => [c.id, c.name]));

        const income = revenueByDept.map((d: any) => ({ label: d.department, amount: Number(d._sum.net_price || 0) }));
        const expenses = expensesByCat.map((e: any) => ({ label: catMap[e.category_id] || `Category ${e.category_id}`, amount: Number(e._sum.total_amount || 0) }));

        const totalIncome = income.reduce((s: number, i: any) => s + i.amount, 0);
        const totalExpenses = expenses.reduce((s: number, e: any) => s + e.amount, 0);

        return {
            success: true,
            data: { income, expenses, totalIncome, totalExpenses, netProfit: totalIncome - totalExpenses },
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ──────────────────────────────────────────────────────────────────────────
// P&L drill-downs (one row → individual invoice items / expenses)
// ──────────────────────────────────────────────────────────────────────────

export async function getPnLIncomeBreakdown(filters: {
    department: string;
    from: string;
    to: string;
}) {
    try {
        const { db } = await requireTenantContext();
        const fromDate = new Date(filters.from + 'T00:00:00+05:30');
        const toDate = new Date(filters.to + 'T23:59:59.999+05:30');
        const dateFilter = { gte: fromDate, lte: toDate };

        const items = await db.invoice_items.findMany({
            where: { department: filters.department, created_at: dateFilter },
            include: {
                invoice: {
                    select: {
                        id: true,
                        invoice_number: true,
                        invoice_type: true,
                        status: true,
                        patient: { select: { full_name: true, patient_id: true } },
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        });

        const rows = items.map((it: any) => ({
            id: it.id,
            invoice_id: it.invoice?.id ?? it.invoice_id ?? null,
            date: it.created_at,
            description: it.description,
            quantity: it.quantity,
            unit_price: Number(it.unit_price),
            net_price: Number(it.net_price),
            tax_amount: Number(it.tax_amount || 0),
            service_category: it.service_category,
            patient_name: it.invoice?.patient?.full_name || '-',
            patient_id: it.invoice?.patient?.patient_id || '-',
            invoice_number: it.invoice?.invoice_number || '-',
            invoice_type: it.invoice?.invoice_type || '-',
        }));
        const total = rows.reduce((s: number, r: any) => s + r.net_price + r.tax_amount, 0);

        return { success: true, data: { rows, total, department: filters.department } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Tiny fetch for P&L drill-down — inline invoice items for one invoice,
 * no patient/admin context loaded. Used to expand an invoice row inline
 * in /finance/reports without navigating to /finance/invoices/[id].
 */
export async function getInvoiceItemsBrief(invoiceId: number) {
    try {
        const { db } = await requireTenantContext();
        const items = await db.invoice_items.findMany({
            where: { invoice_id: invoiceId },
            orderBy: { created_at: 'asc' },
            select: {
                id: true,
                description: true,
                department: true,
                service_category: true,
                quantity: true,
                unit_price: true,
                discount: true,
                net_price: true,
                tax_rate: true,
                tax_amount: true,
                hsn_sac_code: true,
            },
        });
        return {
            success: true as const,
            data: items.map((it: any) => ({
                ...it,
                unit_price: Number(it.unit_price),
                discount: Number(it.discount || 0),
                net_price: Number(it.net_price),
                tax_rate: Number(it.tax_rate || 0),
                tax_amount: Number(it.tax_amount || 0),
            })),
        };
    } catch (error: any) {
        return { success: false as const, error: error?.message };
    }
}

/**
 * Accounting voucher for a single invoice (READ-ONLY) — powers the P&L
 * drill-down "View Voucher" action.
 *
 * Reuses the auto-generated GL journal entry (GL_JournalEntry where
 * reference_type = 'Invoice') for the voucher identity — voucher number, date,
 * type and posting status. Because invoice GL postings aggregate all revenue
 * into a single line, the income-head credit breakdown is DERIVED from
 * invoice_items grouped by service category / department, so finance can see
 * exactly which income heads were credited (matching the requested layout:
 * "Patient/TPA Ledger Dr / To <income heads> / To GST Payable").
 *
 * Degrades gracefully when no GL entry exists yet (posted = false): the voucher
 * is still rendered from invoice data so the drill-down never dead-ends.
 */
export async function getInvoiceVoucher(invoiceId: number) {
    try {
        const { db } = await requireTenantContext();

        const invoice = await db.invoices.findFirst({
            where: { id: invoiceId },
            include: {
                items: true,
                patient: { select: { full_name: true, patient_id: true } },
            },
        });
        if (!invoice) return { success: false, error: 'Invoice not found' };

        // Reuse the auto-posted GL journal entry for this invoice (skip reversed)
        const journal = await db.gL_JournalEntry.findFirst({
            where: {
                reference_type: 'Invoice',
                reference_id: String(invoiceId),
                status: { not: 'Reversed' },
            },
            include: {
                lines: { include: { account: true }, orderBy: { line_number: 'asc' } },
            },
        });

        // Which ledger is debited depends on who pays the bill.
        const payerType = invoice.billing_patient_type || 'cash';
        const debitLedger =
            payerType === 'corporate'
                ? { label: 'Corporate Ledger A/c', code: '1140' }
                : payerType === 'tpa_insurance'
                ? { label: 'TPA / Insurance Ledger A/c', code: '1150' }
                : { label: 'Patient Ledger A/c', code: '1130' };

        // Derive income-head credits from line items, grouped by the SAME income
        // head the GL posts to (so this view matches the posted voucher exactly).
        const headMap = new Map<string, number>();
        for (const it of invoice.items as any[]) {
            const head = incomeHeadName(resolveIncomeHeadCode(it, invoice.invoice_type));
            headMap.set(head, (headMap.get(head) || 0) + Number(it.net_price || 0));
        }
        const credits = Array.from(headMap.entries())
            .map(([head, amount]) => ({ head, amount }))
            .filter((c) => c.amount !== 0)
            .sort((a, b) => b.amount - a.amount);

        const incomeTotal = credits.reduce((s, c) => s + c.amount, 0);
        const gstAmount =
            (invoice.items as any[]).reduce((s, it) => s + Number(it.tax_amount || 0), 0) ||
            Number(invoice.total_tax || 0);
        const totalDebit = incomeTotal + gstAmount;

        const voucher = {
            posted: !!journal,
            voucher_type: journal ? journal.entry_type || 'Invoice' : 'Sales / Invoice',
            voucher_number: journal?.journal_number ?? null,
            voucher_date: journal?.entry_date ?? invoice.created_at,
            gl_status: journal?.status ?? null,
            narration: journal?.narration ?? `Patient Invoice - ${invoice.invoice_number}`,

            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            invoice_status: invoice.status,
            invoice_type: invoice.invoice_type,
            patient_name: invoice.patient?.full_name || '-',
            patient_id: invoice.patient?.patient_id || invoice.patient_id,
            patient_type: payerType,

            debit_ledger: debitLedger.label,
            debit_account_code: debitLedger.code,
            credits,
            gst_amount: gstAmount,
            income_total: incomeTotal,
            total_debit: totalDebit,
            total_credit: totalDebit,

            net_amount: Number(invoice.net_amount || 0),
            total_amount: Number(invoice.total_amount || 0),

            // Raw posted GL lines (revenue may be a single aggregated line) — shown
            // as a secondary "as posted to GL" reference for full transparency.
            gl_lines: journal
                ? (journal.lines as any[]).map((l) => ({
                      account_code: l.account?.account_code ?? '',
                      account_name: l.account?.account_name ?? '',
                      debit: Number(l.debit_amount || 0),
                      credit: Number(l.credit_amount || 0),
                      description: l.description ?? '',
                  }))
                : [],
        };

        return { success: true, data: serialize(voucher) };
    } catch (error: any) {
        console.error('getInvoiceVoucher error:', error);
        return { success: false, error: error.message };
    }
}

export async function getPnLExpenseBreakdown(filters: {
    categoryLabel: string;
    from: string;
    to: string;
}) {
    try {
        const { db } = await requireTenantContext();
        const fromDate = new Date(filters.from + 'T00:00:00+05:30');
        const toDate = new Date(filters.to + 'T23:59:59.999+05:30');
        const dateFilter = { gte: fromDate, lte: toDate };

        // Resolve category by name (label) → id
        const category = await db.expenseCategory.findFirst({
            where: { name: filters.categoryLabel },
            select: { id: true },
        });
        const where: any = {
            status: { in: ['Approved', 'Paid'] },
            created_at: dateFilter,
        };
        if (category) where.category_id = category.id;
        else where.category_id = -1; // no match → empty result

        const expenses = await db.expense.findMany({
            where,
            include: { vendor: { select: { vendor_name: true } } },
            orderBy: { created_at: 'desc' },
        });

        const rows = expenses.map((e: any) => ({
            id: e.id,
            date: e.created_at,
            expense_number: e.expense_number,
            description: e.description,
            vendor: e.vendor?.vendor_name || '-',
            payment_method: e.payment_method,
            amount: Number(e.total_amount),
            status: e.status,
        }));
        const total = rows.reduce((s: number, r: any) => s + r.amount, 0);

        return { success: true, data: { rows, total, category: filters.categoryLabel } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getRevenueByDepartment(filters: { from: string; to: string; invoiceType?: string; admissionStatus?: string }) {
    try {
        const { db } = await requireTenantContext();
        const fromDate = new Date(filters.from + 'T00:00:00+05:30');
        const toDate = new Date(filters.to + 'T23:59:59.999+05:30');
        const dateFilter = { gte: fromDate, lte: toDate };
        const itemWhere: any = { created_at: dateFilter };
        if (filters.invoiceType || filters.admissionStatus) {
            itemWhere.invoice = {
                ...(filters.invoiceType ? { invoice_type: filters.invoiceType } : {}),
                ...(filters.admissionStatus ? { admission: { status: filters.admissionStatus } } : {}),
            };
        }
        const invWhere: any = { status: { not: 'Cancelled' }, created_at: dateFilter };
        if (filters.invoiceType) invWhere.invoice_type = filters.invoiceType;
        if (filters.admissionStatus) invWhere.admission = { status: filters.admissionStatus };

        const [byDept, byType] = await Promise.all([
            db.invoice_items.groupBy({
                by: ['department'],
                _sum: { net_price: true },
                _count: { _all: true },
                where: itemWhere,
            }),
            db.invoices.groupBy({
                by: ['invoice_type'],
                _sum: { net_amount: true },
                _count: { _all: true },
                where: invWhere,
            }),
        ]);

        return {
            success: true,
            data: {
                byDepartment: byDept.map((d: any) => ({
                    department: d.department,
                    amount: Number(d._sum.net_price || 0),
                    count: d._count._all,
                })),
                byType: byType.map((t: any) => ({
                    type: t.invoice_type,
                    amount: Number(t._sum.net_amount || 0),
                    count: t._count._all,
                })),
            },
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getInsuranceCollectionReport(filters: { from: string; to: string; invoiceType?: string; admissionStatus?: string }) {
    try {
        const { db } = await requireTenantContext();
        const fromDate = new Date(filters.from + 'T00:00:00+05:30');
        const toDate = new Date(filters.to + 'T23:59:59.999+05:30');
        const dateFilter = { gte: fromDate, lte: toDate };
        const claimWhere: any = { submitted_at: dateFilter };
        if (filters.invoiceType || filters.admissionStatus) {
            claimWhere.invoice = {
                ...(filters.invoiceType ? { invoice_type: filters.invoiceType } : {}),
                ...(filters.admissionStatus ? { admission: { status: filters.admissionStatus } } : {}),
            };
        }

        const claims = await db.insurance_claims.findMany({
            where: claimWhere,
            include: {
                policy: { include: { provider: { select: { provider_name: true } } } },
                invoice: { select: { invoice_number: true, net_amount: true } },
            },
            orderBy: { submitted_at: 'desc' },
        });

        const summary = {
            totalClaims: claims.length,
            totalClaimed: claims.reduce((s: number, c: any) => s + Number(c.claimed_amount), 0),
            totalApproved: claims.filter((c: any) => c.approved_amount).reduce((s: number, c: any) => s + Number(c.approved_amount || 0), 0),
            totalRejected: claims.filter((c: any) => c.rejected_amount).reduce((s: number, c: any) => s + Number(c.rejected_amount || 0), 0),
            pending: claims.filter((c: any) => c.status === 'Submitted').length,
            approved: claims.filter((c: any) => c.status === 'Approved').length,
            settled: claims.filter((c: any) => c.status === 'Settled').length,
            rejected: claims.filter((c: any) => c.status === 'Rejected').length,
        };

        return { success: true, data: { claims: serialize(claims), summary } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Per-day operational + financial summary for finance: OPD visits, IPD admissions,
// IPD discharges, and collections — one row per calendar day (IST).
export async function getDailyActivityReport(filters: { from: string; to: string }) {
    try {
        const { db } = await requireTenantContext();
        const start = new Date(filters.from + 'T00:00:00+05:30');
        const end = new Date(filters.to + 'T23:59:59.999+05:30');
        const istDay = (d: any) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD

        const [opdInvoices, admits, discharges, payments] = await Promise.all([
            // OPD visits are recorded as OPD invoices (OPD is walk-in; the appointments
            // table is effectively unused, so there is no separate walk-in category).
            db.invoices.findMany({ where: { invoice_type: { in: ['OPD', 'OPD_FEE'] }, status: { not: 'Cancelled' }, created_at: { gte: start, lte: end } }, select: { created_at: true, invoice_number: true, patient: { select: { full_name: true, patient_id: true } } } }),
            db.admissions.findMany({ where: { admission_date: { gte: start, lte: end } }, select: { admission_date: true, admission_id: true, patient: { select: { full_name: true, patient_id: true } } } }),
            db.admissions.findMany({ where: { discharge_date: { gte: start, lte: end } }, select: { discharge_date: true, admission_id: true, patient: { select: { full_name: true, patient_id: true } } } }),
            db.payments.findMany({ where: { status: 'Completed', created_at: { gte: start, lte: end } }, select: { amount: true, created_at: true } }),
        ]);

        type DayRow = { date: string; opd: number; admissions: number; discharges: number; collections: number; opdList: any[]; admitList: any[]; dischargeList: any[] };
        const map: Record<string, DayRow> = {};
        const row = (day: string) => (map[day] ||= { date: day, opd: 0, admissions: 0, discharges: 0, collections: 0, opdList: [], admitList: [], dischargeList: [] });
        opdInvoices.forEach((a: any) => { const r = row(istDay(a.created_at)); r.opd += 1; r.opdList.push({ name: a.patient?.full_name || 'Unknown', patient_id: a.patient?.patient_id || '', ref: a.invoice_number || '' }); });
        admits.forEach((a: any) => { const r = row(istDay(a.admission_date)); r.admissions += 1; r.admitList.push({ name: a.patient?.full_name || 'Unknown', patient_id: a.patient?.patient_id || '', admission_id: a.admission_id }); });
        discharges.forEach((a: any) => { const r = row(istDay(a.discharge_date)); r.discharges += 1; r.dischargeList.push({ name: a.patient?.full_name || 'Unknown', patient_id: a.patient?.patient_id || '', admission_id: a.admission_id }); });
        payments.forEach((p: any) => { row(istDay(p.created_at)).collections += Number(p.amount); });

        const daily = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
        const totals = daily.reduce((t, d) => ({
            opd: t.opd + d.opd, admissions: t.admissions + d.admissions,
            discharges: t.discharges + d.discharges,
            collections: t.collections + d.collections,
        }), { opd: 0, admissions: 0, discharges: 0, collections: 0 });

        return { success: true, data: { daily, totals } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getDailyCollectionSummary(filters: { from: string; to: string }) {
    try {
        const { db } = await requireTenantContext();
        const fromDate = new Date(filters.from + 'T00:00:00+05:30');
        const toDate = new Date(filters.to + 'T23:59:59.999+05:30');
        const payments = await db.payments.findMany({
            where: {
                status: 'Completed',
                created_at: { gte: fromDate, lte: toDate },
            },
            select: { amount: true, payment_method: true, created_at: true },
        });

        const dailyMap: Record<string, Record<string, number>> = {};
        payments.forEach((p: any) => {
            const day = new Date(p.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            if (!dailyMap[day]) dailyMap[day] = { Cash: 0, Card: 0, UPI: 0, BankTransfer: 0, Razorpay: 0, total: 0 };
            dailyMap[day][p.payment_method] = (dailyMap[day][p.payment_method] || 0) + Number(p.amount);
            dailyMap[day].total += Number(p.amount);
        });

        const daily = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, vals]) => ({ date, ...vals }));

        return { success: true, data: daily };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ========================================
// MIS (Management Information System) Report
// ========================================

function categorizeDept(dept: string | null | undefined, svcCat: string | null | undefined): string {
    const d = (dept || '').toLowerCase();
    const s = (svcCat || '').toLowerCase();
    if (s === 'pharmacy' || d === 'pharmacy') return 'pharmacy';
    if (s === 'lab' || d.includes('lab') || d.includes('pathology')) return 'lab';
    if (s === 'radiology' || d.includes('radiology') || d.includes('imaging') || d.includes('x-ray') || d.includes('xray') || d.includes('ultrasound') || d.includes('usg') || d.includes('sono')) return 'radiology';
    if (d.includes('ct') || d.includes('mri') || d.includes('scan') || s.includes('ct') || s.includes('mri')) return 'ct_mri';
    if (s === 'consultation' || d.includes('consultation') || d.includes('opd consult')) return 'consultation';
    if (s === 'room rent' || s === 'room' || s === 'bed' || d.includes('room rent') || d.includes('bed charge') || d.includes('ward charge')) return 'room_rent';
    if (s === 'procedure' || s === 'ot' || d.includes('procedure') || d.includes('ot ') || d.includes('operation') || d.includes('surgery')) return 'procedure';
    if (s === 'nursing' || d.includes('nursing')) return 'nursing';
    if (s === 'consumable' || s === 'consumables' || d.includes('consumable')) return 'consumables';
    if (s === 'implant' || d.includes('implant') || d.includes('stent') || d.includes('prosthesis')) return 'implant';
    if (s === 'package' || d.includes('package')) return 'package';
    return 'other';
}

export async function getMISReport(filters: { from: string; to: string; billType?: string }) {
    try {
        const { db } = await requireTenantContext();

        const fromDate = new Date(filters.from + 'T00:00:00+05:30');
        const toDate = new Date(filters.to + 'T23:59:59.999+05:30');
        const reportDateRange = { gte: fromDate, lte: toDate };
        // Include Cancelled bills alongside Final ones so the bill-number series
        // stays gap-free and auditors can see a cancellation instead of a "missing"
        // number. Draft bills are excluded — they carry no invoice_number yet.
        const baseWhere: any = {
            status: { in: ['Final', 'Cancelled'] },
            is_archived: false,
        };
        let where: any = { ...baseWhere };

        if (filters.billType && filters.billType !== 'all') {
            if (filters.billType === 'IPD') {
                where = {
                    ...baseWhere,
                    OR: [
                        { invoice_type: 'IPD' },
                        { admission_id: { not: null } },
                    ],
                    admission: { discharge_date: reportDateRange },
                };
            } else {
                where.invoice_type = filters.billType;
                where.created_at = reportDateRange;
            }
        } else {
            // Default ("all"): exclude standalone pharmacy counter / OTC bills; they
            // belong to the Pharmacy -> Invoices module, not the hospital MIS report.
            // IPD/admission-linked revenue is recognized on discharge date, so a bill
            // raised on admission appears in the MIS for the discharge date.
            where.OR = [
                {
                    OR: [
                        { invoice_type: 'IPD' },
                        { admission_id: { not: null } },
                    ],
                    admission: { discharge_date: reportDateRange },
                },
                {
                    admission_id: null,
                    invoice_type: { notIn: ['IPD', 'Pharmacy', 'PHARMACY'] },
                    created_at: reportDateRange,
                },
            ];
        }

        const invoices = await db.invoices.findMany({
            where,
            include: {
                patient: {
                    select: {
                        patient_id: true, full_name: true, phone: true,
                        patient_type: true, registration_number: true, department: true,
                        corporate: { select: { company_name: true } },
                    },
                },
                admission: {
                    select: {
                        admission_id: true, admission_date: true, discharge_date: true,
                        doctor_name: true, attending_doctor_id: true, diagnosis: true, patient_class: true,
                        billing_category: true, admission_source: true,
                        bed: { select: { bed_category: true, pricing_tier: true } },
                        ward: { select: { ward_name: true, ward_type: true } },
                    },
                },
                items: {
                    select: {
                        department: true, description: true, quantity: true,
                        unit_price: true, total_price: true, discount: true,
                        net_price: true, tax_amount: true, service_category: true,
                    },
                },
                payments: {
                    where: { status: 'Completed' },
                    select: { amount: true, payment_method: true, payment_type: true, notes: true },
                },
                credit_notes: {
                    where: { status: 'Applied' },
                    select: { total_amount: true },
                },
                insurance_claims: {
                    select: { id: true, policy: { select: { provider: { select: { provider_name: true } } } } },
                },
            },
            orderBy: { created_at: 'asc' },
        });

        // Get TPA provider names for TPA invoices
        const tpaProviderIds = [...new Set(invoices.filter((i: any) => i.tpa_provider_id).map((i: any) => i.tpa_provider_id))];
        let tpaMap: Record<number, string> = {};
        if (tpaProviderIds.length > 0) {
            const tpaProviders = await db.insurance_providers.findMany({
                where: { id: { in: tpaProviderIds } },
                select: { id: true, provider_name: true },
            });
            tpaProviders.forEach((tp: any) => { tpaMap[tp.id] = tp.provider_name; });
        }

        const patientIds = [...new Set(invoices.map((i: any) => i.patient_id).filter(Boolean))] as string[];
        const isGenericDoc = (n?: string) => {
            if (!n) return true;
            // Strip parenthetical annotations like "(RMO)" and the "Dr." prefix
            // so that "Dr. Yogesh (RMO)" → "Yogesh" → NOT generic,
            // while bare "RMO" or "Dr. RMO" → "" or "RMO" → generic.
            const core = String(n).trim()
                .replace(/\s*\([^)]*\)\s*/g, '')   // remove (RMO), (Resident) etc.
                .replace(/^\s*(dr\.?|doctor)\s+/i, '')  // remove Dr. prefix
                .trim();
            return !core || /^(rmo|resident(\s+(doctor|medical\s+officer))?|duty\s*doctor)$/i.test(core);
        };
        // Normalize varied payer-type strings (e.g. "Insurance", "tpa", "TPA/Insurance").
        const normType = (t: any) => {
            const s = String(t || '').toLowerCase();
            if (s.includes('tpa') || s.includes('insurance')) return 'tpa_insurance';
            if (s.includes('corporate')) return 'corporate';
            return 'cash';
        };
        // Doctor specialty = clinical department (avoids "Pharmacy" dominating from line counts).
        const docKey = (n?: string) => String(n || '').replace(/^dr\.?\s*/i, '').trim().toLowerCase();
        const docSpecByName: Record<string, string> = {};
        const docs = await db.user.findMany({ where: { role: 'doctor' }, select: { name: true, specialty: true } });
        for (const d of docs as any[]) { if (d.name && d.specialty) docSpecByName[docKey(d.name)] = d.specialty; }
        const ANCILLARY = new Set(['pharmacy', 'lab', 'laboratory', 'diagnostics', 'diagnostics charges', 'radiology', 'haematology', 'serology', 'biochemistry', 'microbiology', 'pathology']);

        // Real consulting doctor per patient from appointments — used to fill blank
        // or placeholder ("RMO") doctor names on bills.
        const apptDocByPatient: Record<string, string> = {};
        // Booked clinical department per patient from appointments (department fallback).
        const apptDeptByPatient: Record<string, string> = {};
        // TPA provider per patient from their insurance policy (fallback when the
        // invoice has no tpa_provider_id but the patient is TPA in the master).
        const policyProviderByPatient: Record<string, string> = {};
        if (patientIds.length) {
            const [appts, policies] = await Promise.all([
                db.appointments.findMany({
                    where: { patient_id: { in: patientIds } },
                    select: { patient_id: true, doctor_name: true, department: true },
                    orderBy: { appointment_date: 'desc' },
                }),
                db.insurance_policies.findMany({
                    where: { patient_id: { in: patientIds } },
                    select: { patient_id: true, provider: { select: { provider_name: true } } },
                    orderBy: { created_at: 'desc' },
                }),
            ]);
            for (const a of appts) {
                if (!apptDocByPatient[a.patient_id] && a.doctor_name && !isGenericDoc(a.doctor_name)) {
                    apptDocByPatient[a.patient_id] = a.doctor_name;
                }
                if (!apptDeptByPatient[a.patient_id] && a.department && !ANCILLARY.has(a.department.trim().toLowerCase())) {
                    apptDeptByPatient[a.patient_id] = a.department.trim();
                }
            }
            for (const p of policies as any[]) {
                if (!policyProviderByPatient[p.patient_id] && p.provider?.provider_name) {
                    policyProviderByPatient[p.patient_id] = p.provider.provider_name;
                }
            }
        }

        // Deposits applied to the invoice, so the deposit effect shows up in
        // Received Amount. Deliberately excludes deposits still un-applied on the
        // admission — that money hasn't settled against ANY bill yet, and since
        // it was keyed by admission_id it was being added to every invoice under
        // that admission, inflating Received (and its Cash/UPI/Card/Bank Transfer
        // breakup) by the same unapplied balance on each one. The query below still
        // fetches admission-scoped rows too (kept broad for depositTenderByNumber /
        // resolvePaymentTender's refund-tender lookup below) — they're just no
        // longer aggregated into any invoice's received amount.
        const invoiceIds = invoices.map((i: any) => i.id);
        const admissionIds = [...new Set(invoices.filter((i: any) => i.admission_id).map((i: any) => i.admission_id))] as string[];
        const appliedDepByInvoice: Record<number, number> = {};
        const appliedDepBreakupByInvoice: Record<number, MISPaymentBreakup> = {};
        type DepositTenderRow = {
            deposit_number: string | null;
            payment_method: string | null;
            applied_to_invoice: number | null;
            admission_id: string | null;
            amount: unknown;
            applied_amount: unknown;
            refunded_amount: unknown;
            status: string | null;
        };
        const depositRows: DepositTenderRow[] = await db.patientDeposit.findMany({
            where: { OR: [{ applied_to_invoice: { in: invoiceIds } }, ...(admissionIds.length ? [{ admission_id: { in: admissionIds } }] : [])] },
            select: {
                deposit_number: true,
                payment_method: true,
                applied_to_invoice: true,
                admission_id: true,
                amount: true,
                applied_amount: true,
                refunded_amount: true,
                status: true,
            },
        });
        const depositTenderByNumber = new Map<string, string>(
            depositRows
                .filter((d) => d.deposit_number)
                .map((d) => [String(d.deposit_number), String(d.payment_method || '')])
        );
        const resolvePaymentTender = (payment: { payment_method?: string | null; notes?: string | null } | null | undefined) => {
            if (!payment) return null;
            if (canonicalTender(payment.payment_method) !== 'Deposit') return payment.payment_method;
            const match = /deposit\s+(\S+)/i.exec(payment.notes || '');
            return match ? (depositTenderByNumber.get(match[1]) || payment.payment_method) : payment.payment_method;
        };
        for (const d of depositRows) {
            if (d.applied_to_invoice != null) {
                const applied = Number(d.applied_amount || 0);
                appliedDepByInvoice[d.applied_to_invoice] = (appliedDepByInvoice[d.applied_to_invoice] || 0) + applied;
                const bucket = appliedDepBreakupByInvoice[d.applied_to_invoice] || emptyMISPaymentBreakup();
                addMISPaymentBreakup(bucket, d.payment_method, applied);
                appliedDepBreakupByInvoice[d.applied_to_invoice] = bucket;
            }
        }

        // Refunds — money paid back to the patient against a bill. Netted off both
        // Received and Patient Receipt so a refund reduces the recorded collection
        // (and correspondingly raises outstanding). Only settled refunds count.
        const refundByInvoice: Record<number, number> = {};
        // invoices.id is Int but refunds.invoice_id is String — match on string keys.
        type RefundTenderRow = { invoice_id: string | null; payment_id: string | null; amount: unknown };
        type RefundPaymentTender = { id: number; payment_method: string | null; notes: string | null };
        const refundRows: RefundTenderRow[] = await db.refund.findMany({
            where: { invoice_id: { in: invoiceIds.map(String) }, status: { in: ['Approved', 'Processed'] } },
            select: { invoice_id: true, payment_id: true, amount: true },
        });
        const refundPaymentIds = [...new Set(
            refundRows
                .map((r) => Number(r.payment_id))
                .filter((n: number) => Number.isFinite(n))
        )];
        const refundPayments: RefundPaymentTender[] = refundPaymentIds.length
            ? await db.payments.findMany({
                where: { id: { in: refundPaymentIds } },
                select: { id: true, payment_method: true, notes: true },
            })
            : [];
        const refundPaymentById = new Map<string, RefundPaymentTender>(
            refundPayments.map((p) => [String(p.id), p])
        );
        const refundBreakupByInvoice: Record<number, MISPaymentBreakup> = {};
        for (const r of refundRows) {
            if (r.invoice_id != null) {
                const key = Number(r.invoice_id);
                const refundAmount = Number(r.amount || 0);
                refundByInvoice[key] = (refundByInvoice[key] || 0) + refundAmount;
                const refundPayment = refundPaymentById.get(String(r.payment_id)) || null;
                const refundTender = resolvePaymentTender(refundPayment);
                if (refundTender) {
                    const bucket = refundBreakupByInvoice[key] || emptyMISPaymentBreakup();
                    addMISPaymentBreakup(bucket, refundTender, refundAmount);
                    refundBreakupByInvoice[key] = bucket;
                }
            }
        }

        // Real IPD attending consultant (attending_doctor_id → user name). This is the
        // doctor the admission form captured and the patient profile shows, as opposed to
        // admission.doctor_name which often holds the duty/RMO placeholder.
        const attendingIds = [...new Set(
            invoices.map((i: any) => i.admission?.attending_doctor_id).filter(Boolean)
        )] as string[];
        const attendingDocById: Record<string, string> = {};
        if (attendingIds.length) {
            const attendingUsers = await db.user.findMany({
                where: { id: { in: attendingIds } },
                select: { id: true, name: true },
            });
            for (const u of attendingUsers as any[]) {
                if (u.name) attendingDocById[u.id] = u.name;
            }
        }

        const rows = invoices.map((inv: any) => {
            const items = inv.items || [];
            const categorySums: Record<string, number> = {
                pharmacy: 0, lab: 0, radiology: 0, ct_mri: 0,
                consultation: 0, room_rent: 0, procedure: 0, nursing: 0,
                consumables: 0, implant: 0, package: 0, other: 0,
            };

            items.forEach((it: any) => {
                const cat = categorizeDept(it.department, it.service_category);
                const lineTotal = Number(it.net_price || 0) + Number(it.tax_amount || 0);
                categorySums[cat] += lineTotal;
            });

            const creditNoteTotal = (inv.credit_notes || []).reduce((s: number, cn: any) => s + Number(cn.total_amount || 0), 0);

            const allPayments = inv.payments || [];
            const patientPayments = allPayments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
            // isDepositSettlement also matches on receipt_number (RCP-DEP-*), not just
            // payment_method — the payment-edit screen lets finance/admin change a
            // receipt's method after the fact, which would otherwise let an edited
            // deposit-settlement row slip past this filter and get double-counted
            // against appliedDep below.
            const nonDepositPaid = allPayments
                .filter((p: any) => !isDepositSettlement(p))
                .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

            // Category — TPA patients were showing as Cash when the bill wasn't
            // explicitly tagged. Resolve payer from every available signal, strongest
            // first: explicit billing type → invoice-level payer links (corporate /
            // TPA provider / pre-auth / insurance claim) → patient master type →
            // patient corporate link → patient insurance policy.
            const hasClaim = (inv.insurance_claims?.length || 0) > 0;
            // Patient-level payer type (corporate/TPA) is set at IPD admission and only
            // applies to IPD bills. OPD bills are walk-in: their payer is whatever the
            // OPD bill itself is tagged with at billing time (invoice-level signals
            // below). Without an explicit OPD tag the visit is Cash — never inherit the
            // patient master's IPD admission type or patient-level corporate/insurance
            // links, or a TPA-admitted patient's unrelated OPD visit would show as TPA.
            const isIPD = !!inv.admission_id || (inv.invoice_type || '').toUpperCase() === 'IPD';
            const recognizedDate = isIPD
                ? (inv.admission?.discharge_date || inv.created_at)
                : inv.created_at;
            let effectiveType = normType(inv.billing_patient_type);
            if (effectiveType === 'cash') {
                if (inv.corporate_id) effectiveType = 'corporate';
                else if (inv.tpa_provider_id || inv.pre_auth_id || hasClaim) effectiveType = 'tpa_insurance';
            }
            if (isIPD && effectiveType === 'cash') {
                const pt = normType(inv.patient?.patient_type);
                if (pt !== 'cash') effectiveType = pt;
            }
            if (isIPD && effectiveType === 'cash') {
                if (inv.patient?.corporate?.company_name) effectiveType = 'corporate';
                else if (policyProviderByPatient[inv.patient_id]) effectiveType = 'tpa_insurance';
            }
            let admCat = 'Cash';
            if (effectiveType === 'tpa_insurance') admCat = 'TPA/Insurance';
            else if (effectiveType === 'corporate') admCat = 'Corporate';

            // TPA/Corporate name
            let tpaCorporateName = '';
            if (inv.tpa_provider_id && tpaMap[inv.tpa_provider_id]) {
                tpaCorporateName = tpaMap[inv.tpa_provider_id];
            } else if (effectiveType === 'corporate' && inv.patient?.corporate?.company_name) {
                tpaCorporateName = inv.patient.corporate.company_name;
            } else if (effectiveType === 'tpa_insurance') {
                tpaCorporateName = policyProviderByPatient[inv.patient_id]
                    || inv.insurance_claims?.find((c: any) => c.policy?.provider?.provider_name)?.policy?.provider?.provider_name
                    || '';
            }

            // Doctor — IPD attending consultant (matches patient profile) → admission
            // doctor_name → invoice doctor → appointment (real consultant) → consultation
            // line item. Generic placeholders ("RMO"/"Resident") are skipped in favour of
            // the actual doctor where available.
            const attendingName = inv.admission?.attending_doctor_id
                ? (attendingDocById[inv.admission.attending_doctor_id] || '')
                : '';
            let doctorName = '';
            if (attendingName && !isGenericDoc(attendingName)) {
                // The explicitly-recorded admitting consultant is authoritative for IPD.
                doctorName = attendingName;
            } else {
                doctorName = inv.admission?.doctor_name || (inv as any).doctor_name || '';
            }
            if (isGenericDoc(doctorName) && apptDocByPatient[inv.patient_id]) {
                doctorName = apptDocByPatient[inv.patient_id];
            }
            if (isGenericDoc(doctorName)) {
                const consultItem = items.find((it: any) =>
                    (it.service_category || '').toLowerCase() === 'consultation'
                );
                if (consultItem) {
                    let parsed = consultItem.description
                        // Strip chained prefixes: "Dr. Consultation - Basic" → "Basic"
                        .replace(/^(dr\.?\s*)?(consultation|follow-?up)\s*[-–—]\s*/i, '')
                        .replace(/^dr\.?\s*/i, '') // standalone "Dr. Name" without consultation prefix
                        .replace(/\s*\([^)]*\)\s*$/, '')
                        .trim();
                    // Reject service-item-like names (e.g. "Basic", "General", "OPD")
                    const isServiceLabel = /^(basic|general|opd|ipd|emergency|standard|premium|special|package|charges?)$/i.test(parsed);
                    if (parsed && !isGenericDoc(parsed) && !isServiceLabel) {
                        doctorName = formatDoctorName(parsed);
                    }
                }
            }
            doctorName = doctorName || '';

            // Department — the clinical department, resolved strongest-first:
            // doctor's specialty → consultation item's dept → booked appointment dept
            // → most-common NON-ancillary item dept → patient registration dept
            // → most-common item dept. (Avoids showing blank, or "Pharmacy" just
            // because pharmacy has the most line items.)
            let department = (doctorName && docSpecByName[docKey(doctorName)]) || '';
            if (!department) {
                const consult = items.find((it: any) => (it.service_category || '').toLowerCase() === 'consultation');
                if (consult?.department && !ANCILLARY.has(consult.department.trim().toLowerCase())) department = consult.department;
            }
            if (!department && apptDeptByPatient[inv.patient_id]) {
                department = apptDeptByPatient[inv.patient_id];
            }
            if (!department && items.length > 0) {
                const clinicalCounts: Record<string, number> = {};
                items.forEach((it: any) => {
                    const d = (it.department || '').trim();
                    if (d && !ANCILLARY.has(d.toLowerCase())) clinicalCounts[d] = (clinicalCounts[d] || 0) + 1;
                });
                const sorted = Object.entries(clinicalCounts).sort(([, a], [, b]) => b - a);
                if (sorted.length > 0) department = sorted[0][0];
            }
            if (!department && inv.patient?.department && !ANCILLARY.has(String(inv.patient.department).trim().toLowerCase())) {
                department = String(inv.patient.department).trim();
            }
            if (!department && items.length > 0) {
                const deptCounts: Record<string, number> = {};
                items.forEach((it: any) => { if (it.department) deptCounts[it.department] = (deptCounts[it.department] || 0) + 1; });
                const sorted = Object.entries(deptCounts).sort(([, a], [, b]) => b - a);
                if (sorted.length > 0) department = sorted[0][0];
            }

            // Room category
            const roomCat = inv.admission?.billing_category || inv.admission?.patient_class || inv.admission?.ward?.ward_type || '';

            // Package vs Non-Package
            const hasPackage = categorySums.package > 0;

            // Amounts (deposit-aware Received)
            const grossAmount = Number(inv.total_amount || 0) + Number(inv.total_tax || 0);
            // Net = gross − discount + tax (live), so the discount is always reflected
            // even when the stored net_amount is stale.
            const netAmount = Number(inv.total_amount || 0) - Number(inv.total_discount || 0) + Number(inv.total_tax || 0);
            const appliedDep = appliedDepByInvoice[inv.id] || 0;
            const refundAmount = refundByInvoice[inv.id] || 0;
            // Net refunds off collection figures (floored at 0).
            const receivedAmount = Math.max(0, nonDepositPaid + appliedDep - refundAmount);
            const netPatientReceipt = Math.max(0, patientPayments - refundAmount);
            const paymentBreakup = emptyMISPaymentBreakup();
            for (const p of allPayments) {
                if (isDepositSettlement(p)) continue;
                addMISPaymentBreakup(paymentBreakup, p.payment_method, Number(p.amount || 0));
            }
            mergeMISPaymentBreakup(paymentBreakup, appliedDepBreakupByInvoice[inv.id]);
            mergeMISPaymentBreakup(paymentBreakup, refundBreakupByInvoice[inv.id], -1);
            paymentBreakup.cash_amount = Math.max(0, paymentBreakup.cash_amount);
            paymentBreakup.upi_amount = Math.max(0, paymentBreakup.upi_amount);
            paymentBreakup.card_amount = Math.max(0, paymentBreakup.card_amount);
            paymentBreakup.bank_transfer_amount = Math.max(0, paymentBreakup.bank_transfer_amount);

            // A cancelled bill carries no revenue (cancellation is only permitted
            // before any money is collected — see cancelInvoice in finance-actions.ts).
            // Zero out every financial column so it doesn't inflate the gross/net/
            // outstanding totals; the row still surfaces with its bill number, date,
            // patient and Status = "Cancelled" so the series stays visible.
            const isCancelled = inv.status === 'Cancelled';
            const zeroIfCancelled = (n: number) => (isCancelled ? 0 : n);

            return {
                invoice_id: inv.id,
                patient_name: inv.patient?.full_name || '-',
                bill_type: inv.invoice_type || 'OPD',
                admission_category: admCat,
                bill_no: inv.invoice_number,
                uhid: inv.patient?.patient_id || '',
                bill_date: recognizedDate,
                admission_date: inv.admission?.admission_date || null,
                discharge_date: inv.admission?.discharge_date || null,
                doctor_name: doctorName,
                department: department,
                room_category: roomCat,
                phone: inv.patient?.phone || '',
                // Income breakdown
                package_income: zeroIfCancelled(categorySums.package),
                pharma_income: zeroIfCancelled(categorySums.pharmacy),
                lab_income: zeroIfCancelled(categorySums.lab),
                radiology_income: zeroIfCancelled(categorySums.radiology),
                ct_mri_income: zeroIfCancelled(categorySums.ct_mri),
                room_rent_income: zeroIfCancelled(categorySums.room_rent),
                procedure_income: zeroIfCancelled(categorySums.procedure),
                consultation_income: zeroIfCancelled(categorySums.consultation),
                nursing_income: zeroIfCancelled(categorySums.nursing),
                consumables_income: zeroIfCancelled(categorySums.consumables),
                implant_income: zeroIfCancelled(categorySums.implant),
                other_income: zeroIfCancelled(categorySums.other),
                // Totals
                discount: zeroIfCancelled(Number(inv.total_discount || 0)),
                credit_note: zeroIfCancelled(creditNoteTotal),
                gross_amount: zeroIfCancelled(grossAmount),
                net_amount: zeroIfCancelled(netAmount),
                gross_net_diff: zeroIfCancelled(grossAmount - netAmount),
                received_amount: zeroIfCancelled(receivedAmount),
                cash_amount: zeroIfCancelled(paymentBreakup.cash_amount),
                upi_amount: zeroIfCancelled(paymentBreakup.upi_amount),
                card_amount: zeroIfCancelled(paymentBreakup.card_amount),
                bank_transfer_amount: zeroIfCancelled(paymentBreakup.bank_transfer_amount),
                outstanding_amount: zeroIfCancelled(Math.max(0, netAmount - receivedAmount)),
                patient_receipt: zeroIfCancelled(netPatientReceipt),
                // TPA sanctioned/approved amount — only meaningful for TPA/Insurance
                // bills; left at 0 (renders as "-") for Cash/Corporate so the column
                // reads cleanly for the TPA patients it's intended for.
                approved_amount: zeroIfCancelled(effectiveType === 'tpa_insurance' ? Number(inv.tpa_approved_amount || 0) : 0),
                // TPA amount actually settled/received from the payer (paid against the claim).
                settled_amount: zeroIfCancelled(effectiveType === 'tpa_insurance' ? Number(inv.tpa_settled_amount || 0) : 0),
                tpa_corporate_name: tpaCorporateName,
                referral_source: inv.admission?.admission_source || '',
                package_vs_nonpackage: hasPackage ? 'Package' : 'Non-Package',
                remarks: inv.notes || '',
                status: inv.status,
            };
        });

        // Summary totals
        const summary = {
            total_bills: rows.length,
            total_gross: rows.reduce((s: number, r: any) => s + r.gross_amount, 0),
            total_net: rows.reduce((s: number, r: any) => s + r.net_amount, 0),
            total_received: rows.reduce((s: number, r: any) => s + r.received_amount, 0),
            total_outstanding: rows.reduce((s: number, r: any) => s + r.outstanding_amount, 0),
            total_approved: rows.reduce((s: number, r: any) => s + r.approved_amount, 0),
            total_settled: rows.reduce((s: number, r: any) => s + r.settled_amount, 0),
            total_discount: rows.reduce((s: number, r: any) => s + r.discount, 0),
            total_pharma: rows.reduce((s: number, r: any) => s + r.pharma_income, 0),
            total_lab: rows.reduce((s: number, r: any) => s + r.lab_income, 0),
            total_radiology: rows.reduce((s: number, r: any) => s + r.radiology_income, 0),
            ipd_count: rows.filter((r: any) => r.bill_type === 'IPD').length,
            opd_count: rows.filter((r: any) => r.bill_type !== 'IPD').length,
        };

        return serialize({ success: true, data: { rows, summary } });
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ── Doctor Revenue Recon ────────────────────────────────────────────────────
// Reproduces the hospital's monthly "Recon" workbook: one spotlighted doctor
// vs. every other doctor (bucketed as "Axten"), each split into IPD TPA / IPD
// Cash / OPD Cash. Recognition follows the same rule as the MIS report — an
// IPD bill counts on its discharge date, an OPD bill on its bill date — so the
// two reports never disagree about which month a bill belongs to.

type ReconCategory = {
    patients: number;
    gross: number;
    discount: number;
    net: number;
    approved?: number;
    collection: number;
    // TPA only: what the PATIENT paid (co-pay/deposit) on a TPA bill, shown as its
    // own column. Kept separate from `collection` (= TPA settled) so the report
    // still reconciles against the hospital's workbook while nothing is hidden.
    patient_paid?: number;
    outstanding: number;
};

function emptyReconAccumulator() {
    return { patients: new Set<string>(), gross: 0, discount: 0, net: 0, approved: 0, collection: 0, patient_paid: 0 };
}
type ReconAccumulator = ReturnType<typeof emptyReconAccumulator>;

function finalizeReconCategory(acc: ReconAccumulator, isTpa: boolean): ReconCategory {
    // TPA outstanding stays what the INSURER still owes (approved − settled); the
    // patient co-pay is separate money and is reported in its own column, so it
    // must not reduce the TPA outstanding here.
    const outstanding = isTpa ? acc.approved - acc.collection : acc.net - acc.collection;
    return {
        patients: acc.patients.size,
        gross: round2(acc.gross),
        discount: round2(acc.discount),
        net: round2(acc.net),
        ...(isTpa ? { approved: round2(acc.approved) } : {}),
        collection: round2(acc.collection),
        ...(isTpa ? { patient_paid: round2(acc.patient_paid) } : {}),
        outstanding: round2(outstanding),
    };
}

function sumReconCategory(a: ReconCategory, b: ReconCategory, isTpa: boolean): ReconCategory {
    return {
        patients: a.patients + b.patients,
        gross: round2(a.gross + b.gross),
        discount: round2(a.discount + b.discount),
        net: round2(a.net + b.net),
        ...(isTpa ? { approved: round2((a.approved || 0) + (b.approved || 0)) } : {}),
        collection: round2(a.collection + b.collection),
        ...(isTpa ? { patient_paid: round2((a.patient_paid || 0) + (b.patient_paid || 0)) } : {}),
        outstanding: round2(a.outstanding + b.outstanding),
    };
}

export async function getDoctorRevenueRecon(filters: { from: string; to: string; spotlightDoctorId: string }) {
    try {
        const { db } = await requireTenantContext();
        if (!filters.spotlightDoctorId) return { success: false, error: 'Select a doctor to spotlight' };

        const doctor = await db.user.findFirst({
            where: { id: filters.spotlightDoctorId, role: 'doctor' },
            select: { id: true, name: true, username: true },
        });
        if (!doctor) return { success: false, error: 'Doctor not found' };

        // Same name resolution as getMISReport, so the two reports never disagree
        // about whose bill this is: attending_doctor_id is authoritative when it
        // resolves to a real (non-generic) doctor; otherwise fall back to the
        // free-text doctor_name recorded on the admission/bill. A lot of IPD
        // admissions never got the FK properly linked, so trusting the FK alone
        // silently dumps those bills into "Axten" even though the chart says
        // whose patient it was.
        const allDoctors = await db.user.findMany({ where: { role: 'doctor' }, select: { id: true, name: true } });
        const docNameById = new Map<string, string>(allDoctors.map((d: any) => [d.id, d.name || '']));
        const isGenericDocName = (n?: string | null) => {
            if (!n) return true;
            const core = String(n).trim()
                .replace(/\s*\([^)]*\)\s*/g, '')
                .replace(/^\s*(dr\.?|doctor)\s+/i, '')
                .trim();
            return !core || /^(rmo|resident(\s+(doctor|medical\s+officer))?|duty\s*doctor)$/i.test(core);
        };
        const nameKey = (n?: string | null) => String(n || '').replace(/^\s*(dr\.?|doctor)\s+/i, '').trim().toLowerCase();
        const spotlightNameKey = nameKey(doctor.name || doctor.username);

        const fromDate = new Date(filters.from + 'T00:00:00+05:30');
        const toDate = new Date(filters.to + 'T23:59:59.999+05:30');
        const reportDateRange = { gte: fromDate, lte: toDate };

        // Same recognition rule as getMISReport: IPD on discharge date, everything
        // else (excluding standalone pharmacy counter bills) on bill date. Only
        // Final bills count — a recon is about revenue actually raised, not a
        // gap-free audit trail, so Cancelled/Draft bills are excluded outright.
        const where: any = {
            status: 'Final',
            is_archived: false,
            OR: [
                {
                    OR: [{ invoice_type: 'IPD' }, { admission_id: { not: null } }],
                    admission: { discharge_date: reportDateRange },
                },
                {
                    admission_id: null,
                    invoice_type: { notIn: ['IPD', 'Pharmacy', 'PHARMACY'] },
                    created_at: reportDateRange,
                },
            ],
        };

        const invoices = await db.invoices.findMany({
            where,
            select: {
                patient_id: true, invoice_type: true, admission_id: true, doctor_id: true, doctor_name: true,
                total_amount: true, total_tax: true, total_discount: true, paid_amount: true,
                billing_patient_type: true, corporate_id: true, tpa_provider_id: true, pre_auth_id: true,
                tpa_approved_amount: true, tpa_settled_amount: true,
                admission: { select: { attending_doctor_id: true, doctor_name: true } },
                insurance_claims: { select: { id: true } },
            },
        });

        const normType = (t: any) => {
            const s = String(t || '').toLowerCase();
            if (s.includes('tpa') || s.includes('insurance')) return 'tpa_insurance';
            if (s.includes('corporate')) return 'corporate';
            return 'cash';
        };

        const buckets = {
            spotlight: { ipd_tpa: emptyReconAccumulator(), ipd_cash: emptyReconAccumulator(), opd_cash: emptyReconAccumulator() },
            axten: { ipd_tpa: emptyReconAccumulator(), ipd_cash: emptyReconAccumulator(), opd_cash: emptyReconAccumulator() },
        };

        for (const inv of invoices as any[]) {
            const isIPD = inv.invoice_type === 'IPD' || !!inv.admission_id;

            // Payer type from invoice-level signals only — deliberately no
            // patient-master fallback for OPD (that inheritance caused an OPD
            // payer-type bug in the MIS report; IPD legitimately uses the
            // admission's payer, but a walk-in OPD visit is whatever the bill
            // itself says, defaulting to Cash).
            let effectiveType = normType(inv.billing_patient_type);
            if (effectiveType === 'cash') {
                if (inv.corporate_id) effectiveType = 'corporate';
                else if (inv.tpa_provider_id || inv.pre_auth_id || (inv.insurance_claims?.length || 0) > 0) effectiveType = 'tpa_insurance';
            }

            let category: 'ipd_tpa' | 'ipd_cash' | 'opd_cash';
            if (isIPD) {
                category = effectiveType === 'tpa_insurance' ? 'ipd_tpa' : 'ipd_cash';
            } else {
                // The workbook's OPD section is Cash-only — OPD TPA/Corporate bills
                // (rare) fall outside this recon, matching the source file exactly.
                if (effectiveType !== 'cash') continue;
                category = 'opd_cash';
            }

            const attendingId = isIPD ? (inv.doctor_id ?? inv.admission?.attending_doctor_id ?? null) : inv.doctor_id;
            let which: 'spotlight' | 'axten';
            if (attendingId === doctor.id) {
                which = 'spotlight';
            } else {
                const attendingName = attendingId ? docNameById.get(attendingId) : null;
                if (isIPD && (!attendingId || isGenericDocName(attendingName))) {
                    const freeName = inv.admission?.doctor_name || inv.doctor_name;
                    which = freeName && nameKey(freeName) === spotlightNameKey ? 'spotlight' : 'axten';
                } else {
                    which = 'axten';
                }
            }

            const gross = Number(inv.total_amount || 0) + Number(inv.total_tax || 0);
            const discount = Number(inv.total_discount || 0);
            const net = gross - discount;

            const acc = buckets[which][category];
            if (inv.patient_id) acc.patients.add(inv.patient_id);
            acc.gross += gross;
            acc.discount += discount;
            acc.net += net;
            if (category === 'ipd_tpa') {
                acc.approved += Number(inv.tpa_approved_amount || 0);
                acc.collection += Number(inv.tpa_settled_amount || 0);
                // Co-pay / deposit the patient paid on this TPA bill — its own column.
                acc.patient_paid += Number(inv.paid_amount || 0);
            } else {
                acc.collection += Number(inv.paid_amount || 0);
            }
        }

        const build = (label: string, doctorId: string | null, b: typeof buckets['spotlight']) => ({
            label,
            doctor_id: doctorId,
            ipd_tpa: finalizeReconCategory(b.ipd_tpa, true),
            ipd_cash: finalizeReconCategory(b.ipd_cash, false),
            opd_cash: finalizeReconCategory(b.opd_cash, false),
        });

        const spotlightRow = build(doctor.name || doctor.username, doctor.id, buckets.spotlight);
        const axtenRow = build('Axten', null, buckets.axten);
        const totalRow = {
            label: 'Total',
            doctor_id: null,
            ipd_tpa: sumReconCategory(spotlightRow.ipd_tpa, axtenRow.ipd_tpa, true),
            ipd_cash: sumReconCategory(spotlightRow.ipd_cash, axtenRow.ipd_cash, false),
            opd_cash: sumReconCategory(spotlightRow.opd_cash, axtenRow.opd_cash, false),
        };

        // Snapshot: TPA's "Net Rev" is the Approved amount (what will actually be
        // recognized once settled), not the gross-billed figure — matches the
        // source workbook, which treats Approved as the TPA revenue line.
        const snapshot = (row: typeof spotlightRow) => ({
            label: row.label,
            ipd_tpa: { net: row.ipd_tpa.approved ?? 0, collection: row.ipd_tpa.collection, credit: row.ipd_tpa.outstanding },
            ipd_cash: { net: row.ipd_cash.net, collection: row.ipd_cash.collection, credit: row.ipd_cash.outstanding },
            opd_cash: { net: row.opd_cash.net, collection: row.opd_cash.collection, credit: row.opd_cash.outstanding },
            total: {
                net: round2((row.ipd_tpa.approved ?? 0) + row.ipd_cash.net + row.opd_cash.net),
                collection: round2(row.ipd_tpa.collection + row.ipd_cash.collection + row.opd_cash.collection),
                credit: round2(row.ipd_tpa.outstanding + row.ipd_cash.outstanding + row.opd_cash.outstanding),
            },
        });

        const billedRev = round2(totalRow.ipd_tpa.net + totalRow.ipd_cash.net + totalRow.opd_cash.net);

        // Flag (don't include) IPD bills that were discharged in the window but never
        // finalised — they're silently excluded, so staff should know how many are
        // sitting in Draft and being left out of the revenue figures above.
        const excludedDraftIpd = await db.invoices.count({
            where: {
                invoice_type: 'IPD',
                is_archived: false,
                status: { notIn: ['Final', 'Cancelled'] },
                admission: { discharge_date: reportDateRange },
            },
        });

        return {
            success: true,
            data: {
                rows: [spotlightRow, axtenRow, totalRow],
                snapshot: [snapshot(spotlightRow), snapshot(axtenRow), snapshot({ ...totalRow, label: 'Both' } as any)],
                billedRev,
                excludedDraftIpd,
            },
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
