'use server';

import { requireTenantContext } from '@/backend/tenant';
import { resolveIncomeHeadCode, incomeHeadName } from '@/app/lib/gl-income-head-map';

function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

export async function getCollectionsReport(filters: { from: string; to: string; method?: string; invoiceType?: string; admissionStatus?: string }) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {
            status: 'Completed',
            created_at: { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') },
        };
        if (filters.method && filters.method !== 'others') {
            where.payment_method = filters.method;
        } else if (filters.method === 'others') {
            where.payment_method = { notIn: ['Cash', 'UPI'] };
        }
        // IPD/OPD split (by invoice type) and Admit/Discharge split (by the
        // invoice's admission status) — both filter via the related invoice.
        if (filters.invoiceType || filters.admissionStatus) {
            where.invoice = {
                ...(filters.invoiceType ? { invoice_type: filters.invoiceType } : {}),
                ...(filters.admissionStatus ? { admission: { status: filters.admissionStatus } } : {}),
            };
        }

        const payments = await db.payments.findMany({
            where,
            include: { invoice: { select: { invoice_number: true, patient: { select: { full_name: true } } } } },
            orderBy: { created_at: 'desc' },
        });

        const totals = payments.reduce((acc: any, p: any) => {
            const method = p.payment_method;
            acc[method] = (acc[method] || 0) + Number(p.amount);
            acc.total = (acc.total || 0) + Number(p.amount);
            return acc;
        }, {});

        // Advance deposits actually COLLECTED in this period, by real tender
        // (Cash/UPI/Card). These are separate from the "Deposit" payment method
        // above, which represents deposits *applied* to bills. Always computed
        // across all tenders regardless of the payments method filter.
        const depositRows = await db.patientDeposit.findMany({
            where: { created_at: { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') } },
            select: { amount: true, payment_method: true },
        });
        const depositsCollected = depositRows.reduce((acc: any, d: any) => {
            const method = d.payment_method || 'Unknown';
            acc[method] = (acc[method] || 0) + Number(d.amount);
            acc.total = (acc.total || 0) + Number(d.amount);
            return acc;
        }, {});

        return { success: true, data: { payments: serialize(payments), totals, depositsCollected } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getARAgingReport(filters?: { invoiceType?: string; admissionStatus?: string }) {
    try {
        const { db } = await requireTenantContext();
        const where: any = { status: { in: ['Final', 'Partial'] }, balance_due: { gt: 0 } };
        if (filters?.invoiceType) where.invoice_type = filters.invoiceType;
        if (filters?.admissionStatus) where.admission = { status: filters.admissionStatus };
        const invoices = await db.invoices.findMany({
            where,
            include: { patient: { select: { full_name: true, phone: true } } },
            orderBy: { created_at: 'asc' },
        });

        const now = new Date();
        const aged = invoices.map((inv: any) => {
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
        const dateFilter = { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') };
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

        // Group by date
        const dailyMap: Record<string, { inflow: number; outflow: number }> = {};
        inflows.forEach((p: any) => {
            const day = new Date(p.created_at).toISOString().slice(0, 10);
            if (!dailyMap[day]) dailyMap[day] = { inflow: 0, outflow: 0 };
            dailyMap[day].inflow += Number(p.amount);
        });
        outflows.forEach((e: any) => {
            const day = new Date(e.created_at).toISOString().slice(0, 10);
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
        const dateFilter = { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') };
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
        const dateFilter = { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') };

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
        const dateFilter = { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') };

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
        const dateFilter = { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') };
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
        const dateFilter = { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') };
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
        const start = new Date(filters.from);
        const end = new Date(filters.to + 'T23:59:59');
        const istDay = (d: any) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD

        const [opdInvoices, admits, discharges, payments] = await Promise.all([
            // OPD visits are recorded as OPD invoices (appointments table is not used for walk-in OPD).
            db.invoices.findMany({ where: { invoice_type: { in: ['OPD', 'OPD_FEE'] }, created_at: { gte: start, lte: end } }, select: { created_at: true, invoice_number: true, patient: { select: { full_name: true, patient_id: true } } } }),
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
            discharges: t.discharges + d.discharges, collections: t.collections + d.collections,
        }), { opd: 0, admissions: 0, discharges: 0, collections: 0 });

        return { success: true, data: { daily, totals } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getDailyCollectionSummary(filters: { from: string; to: string }) {
    try {
        const { db } = await requireTenantContext();
        const payments = await db.payments.findMany({
            where: {
                status: 'Completed',
                created_at: { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') },
            },
            select: { amount: true, payment_method: true, created_at: true },
        });

        const dailyMap: Record<string, Record<string, number>> = {};
        payments.forEach((p: any) => {
            const day = new Date(p.created_at).toISOString().slice(0, 10);
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

        const where: any = {
            created_at: { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') },
            status: { notIn: ['Cancelled'] },
            is_archived: false,
        };
        if (filters.billType && filters.billType !== 'all') {
            where.invoice_type = filters.billType;
        }

        const invoices = await db.invoices.findMany({
            where,
            include: {
                patient: {
                    select: {
                        patient_id: true, full_name: true, phone: true,
                        patient_type: true, registration_number: true,
                        corporate: { select: { company_name: true } },
                    },
                },
                admission: {
                    select: {
                        admission_id: true, admission_date: true, discharge_date: true,
                        doctor_name: true, diagnosis: true, patient_class: true,
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
                    select: { amount: true, payment_method: true, payment_type: true },
                },
                credit_notes: {
                    where: { status: 'Applied' },
                    select: { total_amount: true },
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
        const isGenericDoc = (n?: string) => !n || /\brmo\b|resident/i.test(String(n).trim());
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
        // TPA provider per patient from their insurance policy (fallback when the
        // invoice has no tpa_provider_id but the patient is TPA in the master).
        const policyProviderByPatient: Record<string, string> = {};
        if (patientIds.length) {
            const [appts, policies] = await Promise.all([
                db.appointments.findMany({
                    where: { patient_id: { in: patientIds } },
                    select: { patient_id: true, doctor_name: true },
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
            }
            for (const p of policies as any[]) {
                if (!policyProviderByPatient[p.patient_id] && p.provider?.provider_name) {
                    policyProviderByPatient[p.patient_id] = p.provider.provider_name;
                }
            }
        }

        // Deposits — applied to the invoice + available (un-applied) admission advances,
        // so the deposit effect shows up in Received Amount.
        const invoiceIds = invoices.map((i: any) => i.id);
        const admissionIds = [...new Set(invoices.filter((i: any) => i.admission_id).map((i: any) => i.admission_id))] as string[];
        const appliedDepByInvoice: Record<number, number> = {};
        const availDepByAdmission: Record<string, number> = {};
        const depositRows = await db.patientDeposit.findMany({
            where: { OR: [{ applied_to_invoice: { in: invoiceIds } }, ...(admissionIds.length ? [{ admission_id: { in: admissionIds } }] : [])] },
            select: { applied_to_invoice: true, admission_id: true, amount: true, applied_amount: true, refunded_amount: true, status: true },
        });
        for (const d of depositRows as any[]) {
            if (d.applied_to_invoice != null) {
                appliedDepByInvoice[d.applied_to_invoice] = (appliedDepByInvoice[d.applied_to_invoice] || 0) + Number(d.applied_amount || 0);
            }
            if (d.admission_id && d.status === 'Active') {
                const avail = Math.max(0, Number(d.amount || 0) - Number(d.applied_amount || 0) - Number(d.refunded_amount || 0));
                availDepByAdmission[d.admission_id] = (availDepByAdmission[d.admission_id] || 0) + avail;
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
            const nonDepositPaid = allPayments
                .filter((p: any) => (p.payment_method || '').toLowerCase() !== 'deposit')
                .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

            // Category — use the bill's billing_patient_type, else fall back to the
            // patient master type (TPA patients were showing as Cash when the bill
            // wasn't explicitly tagged).
            const bptNorm = normType(inv.billing_patient_type);
            const effectiveType = bptNorm !== 'cash'
                ? bptNorm
                : (normType(inv.patient?.patient_type) !== 'cash'
                    ? normType(inv.patient?.patient_type)
                    : (policyProviderByPatient[inv.patient_id] ? 'tpa_insurance' : 'cash'));
            let admCat = 'Cash';
            if (effectiveType === 'tpa_insurance') admCat = 'TPA/Insurance';
            else if (effectiveType === 'corporate') admCat = 'Corporate';

            // TPA/Corporate name
            let tpaCorporateName = '';
            if (inv.tpa_provider_id && tpaMap[inv.tpa_provider_id]) {
                tpaCorporateName = tpaMap[inv.tpa_provider_id];
            } else if (effectiveType === 'corporate' && inv.patient?.corporate?.company_name) {
                tpaCorporateName = inv.patient.corporate.company_name;
            } else if (effectiveType === 'tpa_insurance' && policyProviderByPatient[inv.patient_id]) {
                tpaCorporateName = policyProviderByPatient[inv.patient_id];
            }

            // Doctor — admission doctor → invoice doctor → appointment (real consultant)
            // → consultation line item. Generic placeholders ("RMO"/"Resident") are
            // skipped in favour of the actual doctor where available.
            let doctorName = inv.admission?.doctor_name || (inv as any).doctor_name || '';
            if (isGenericDoc(doctorName) && apptDocByPatient[inv.patient_id]) {
                doctorName = apptDocByPatient[inv.patient_id];
            }
            if (isGenericDoc(doctorName)) {
                const consultItem = items.find((it: any) =>
                    (it.service_category || '').toLowerCase() === 'consultation'
                );
                if (consultItem) {
                    const parsed = consultItem.description.replace(/^(Dr\.?\s*|Consultation\s*[-–—]\s*)/i, '').trim();
                    if (parsed && !isGenericDoc(parsed)) doctorName = parsed;
                }
            }
            doctorName = doctorName || '';

            // Department — the clinical department: doctor's specialty → consultation
            // item's dept → most-common NON-ancillary dept → most-common dept.
            // (Avoids showing "Pharmacy" just because pharmacy has the most line items.)
            let department = (doctorName && docSpecByName[docKey(doctorName)]) || '';
            if (!department) {
                const consult = items.find((it: any) => (it.service_category || '').toLowerCase() === 'consultation');
                if (consult?.department) department = consult.department;
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
            const availDep = inv.admission_id ? (availDepByAdmission[inv.admission_id] || 0) : 0;
            const receivedAmount = nonDepositPaid + appliedDep + availDep;

            return {
                patient_name: inv.patient?.full_name || '-',
                bill_type: inv.invoice_type || 'OPD',
                admission_category: admCat,
                bill_no: inv.invoice_number,
                uhid: inv.patient?.patient_id || '',
                bill_date: inv.created_at,
                admission_date: inv.admission?.admission_date || null,
                discharge_date: inv.admission?.discharge_date || null,
                doctor_name: doctorName,
                department: department,
                room_category: roomCat,
                phone: inv.patient?.phone || '',
                // Income breakdown
                package_income: categorySums.package,
                pharma_income: categorySums.pharmacy,
                lab_income: categorySums.lab,
                radiology_income: categorySums.radiology,
                ct_mri_income: categorySums.ct_mri,
                room_rent_income: categorySums.room_rent,
                procedure_income: categorySums.procedure,
                consultation_income: categorySums.consultation,
                nursing_income: categorySums.nursing,
                consumables_income: categorySums.consumables,
                implant_income: categorySums.implant,
                other_income: categorySums.other,
                // Totals
                discount: Number(inv.total_discount || 0),
                credit_note: creditNoteTotal,
                gross_amount: grossAmount,
                net_amount: netAmount,
                gross_net_diff: grossAmount - netAmount,
                received_amount: receivedAmount,
                outstanding_amount: Math.max(0, netAmount - receivedAmount),
                patient_receipt: patientPayments,
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
