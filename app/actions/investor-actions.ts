'use server';

import { prisma } from '@/backend/db';
import { getInvestorSession } from './investor-auth-actions';

// Per-organization values keyed by organization id, plus the sum across every
// active organization. Dynamic (not a fixed set of hospitals) — the investor
// portal shows every active organization on this server, so a newly added
// hospital appears automatically without a code change.
export interface UnitMetrics {
    byOrg: Record<string, number>;
    total: number;
}

export interface InvestorDashboardData {
    period: string;
    selectedUnit: string;
    fromDate?: string;
    toDate?: string;
    units: Array<{ code: string; name: string; beds: number }>;
    executiveKPIs: {
        ebitdaMarginPct: number;
        bedOccupancyRate: number;
        alosDays: number;
        collectionEfficiencyPct: number;
    };
    currentAdmittedPatients: {
        cash: UnitMetrics;
        insurance: UnitMetrics;
        panel: UnitMetrics;
        corporate: UnitMetrics;
        total: UnitMetrics;
    };
    admissions: {
        cash: UnitMetrics;
        insurance: UnitMetrics;
        panel: UnitMetrics;
        corporate: UnitMetrics;
        total: UnitMetrics;
    };
    discharges: {
        cash: UnitMetrics;
        insurance: UnitMetrics;
        panel: UnitMetrics;
        corporate: UnitMetrics;
        total: UnitMetrics;
    };
    revenue: {
        cash: UnitMetrics;
        insurance: UnitMetrics;
        panel: UnitMetrics;
        corporate: UnitMetrics;
        total: UnitMetrics;
    };
    opdVsIpdRevenue: {
        opd: UnitMetrics;
        ipd: UnitMetrics;
        pharmacy: UnitMetrics;
        diagnostics: UnitMetrics;
        total: UnitMetrics;
    };
    departmentRevenue: Array<{
        name: string;
        metrics: UnitMetrics;
    }>;
    expenses: {
        byMonth: Array<{ label: string; data: UnitMetrics }>;
        total: UnitMetrics;
    };
    receivables: {
        cash: UnitMetrics;
        insurance: UnitMetrics;
        panel: UnitMetrics;
        corporate: UnitMetrics;
        tdsReceivables: UnitMetrics;
        total: UnitMetrics;
    };
    insuranceAging: {
        days0to30: UnitMetrics;
        days31to60: UnitMetrics;
        days60Plus: UnitMetrics;
        total: UnitMetrics;
    };
    payables: {
        vendors: UnitMetrics;
        doctorsProfessional: UnitMetrics;
        tdsPayable: UnitMetrics;
        others: UnitMetrics;
        total: UnitMetrics;
    };
    salaries: {
        byMonth: Array<{ label: string; data: UnitMetrics }>;
        total: UnitMetrics;
    };
    arpob: {
        noOfBeds: UnitMetrics;
        byMonth: Array<{ label: string; data: UnitMetrics }>;
        average: UnitMetrics;
    };
    profitLoss: {
        amount: UnitMetrics;
        percentage: UnitMetrics;
    };
}

// Real patient_type / billing_patient_type values behind each investor-facing
// payer category. Live data is inconsistent in casing ("Insurance" vs
// "tpa_insurance"), so this normalizes rather than doing an exact match.
// "Panel" has no real backing field anywhere in the schema — always 0, and not
// offered for drill-down (documented wherever it's zeroed below).
function categoryOf(rawType: string | null | undefined): 'cash' | 'insurance' | 'corporate' {
    const t = (rawType || '').toLowerCase();
    if (t.includes('corporate')) return 'corporate';
    if (t.includes('insurance') || t.includes('tpa')) return 'insurance';
    return 'cash';
}

function zeroUnit(orgIds: string[]): UnitMetrics {
    const byOrg: Record<string, number> = {};
    for (const id of orgIds) byOrg[id] = 0;
    return { byOrg, total: 0 };
}

// Sum unit metrics across columns reliably
function sumUnits(orgIds: string[], ...unitsArr: UnitMetrics[]): UnitMetrics {
    const res = zeroUnit(orgIds);
    for (const u of unitsArr) {
        for (const id of orgIds) res.byOrg[id] += (u.byOrg[id] || 0);
        res.total += u.total;
    }
    return res;
}

function addTo(bucket: UnitMetrics, orgId: string, amount: number) {
    bucket.byOrg[orgId] = (bucket.byOrg[orgId] ?? 0) + amount;
    bucket.total += amount;
}

// The set of hospitals the investor portal reports on: every currently active
// organization. Deactivating an organization in admin settings removes it from
// the portal; there is no separate investor-visibility flag.
async function getActiveOrgs(): Promise<Array<{ id: string; name: string }>> {
    return prisma.organization.findMany({
        where: { is_active: true },
        select: { id: true, name: true },
        orderBy: { created_at: 'asc' },
    }).catch((err) => { console.error('investor: active orgs', err); return [] as Array<{ id: string; name: string }>; });
}

// Single consolidated reporting window for every real query below. 'day' /
// 'month' / 'year' are computed here directly (today; current calendar month;
// current fiscal year to date) so the filter buttons actually narrow the data.
// 'custom' (or no filterType) uses the investor's own from/to picker, falling
// back to the FY Apr 1 - Jul 31 window when neither is set. Point-in-time
// sections (receivables, payables, aging, current admitted) intentionally
// ignore this and use "as of now" instead, same as any real balance sheet.
function resolvePeriod(params?: { filterType?: 'day' | 'month' | 'year' | 'custom'; fromDate?: string; toDate?: string }) {
    const now = new Date();
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // month index 3 = April

    if (params?.filterType === 'day') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return { start, end, fyStartYear };
    }
    if (params?.filterType === 'month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return { start, end, fyStartYear };
    }
    if (params?.filterType === 'year') {
        const start = new Date(fyStartYear, 3, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        return { start, end, fyStartYear };
    }

    const defaultStart = new Date(fyStartYear, 3, 1);
    const defaultEnd = new Date(fyStartYear, 7, 1); // Aug 1, exclusive — covers Apr-Jul
    let start = defaultStart;
    let end = defaultEnd;
    if (params?.fromDate) {
        const d = new Date(params.fromDate);
        if (!isNaN(d.getTime())) start = d;
    }
    if (params?.toDate) {
        const d = new Date(params.toDate);
        if (!isNaN(d.getTime())) { d.setDate(d.getDate() + 1); end = d; }
    }
    return { start, end, fyStartYear };
}

const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const daysInMonth = (year: number, monthIndex: number) => new Date(year, monthIndex + 1, 0).getDate();

// Every month of the fiscal year (Apr 1 start) from April through the current
// month, inclusive — so "latest month" always shows up as soon as it starts,
// not just once a full quarter has passed. Handles the Jan-Mar rollover into
// fyStartYear + 1.
function fyMonthsToDate(fyStartYear: number): Array<{ year: number; monthIndex: number; label: string }> {
    const now = new Date();
    const monthsElapsed = now.getFullYear() > fyStartYear || (now.getFullYear() === fyStartYear && now.getMonth() >= 3)
        ? now.getMonth() - 3 + 1
        : now.getMonth() + 9 + 1; // Jan-Mar of fyStartYear+1: month 0/1/2 -> 10th/11th/12th FY month
    const months: Array<{ year: number; monthIndex: number; label: string }> = [];
    for (let m = 0; m < Math.max(1, monthsElapsed); m++) {
        const absoluteMonth = 3 + m; // 3 = April
        const year = fyStartYear + Math.floor(absoluteMonth / 12);
        const monthIndex = absoluteMonth % 12;
        months.push({ year, monthIndex, label: MONTH_LABELS[monthIndex] });
    }
    return months;
}

export async function getInvestorDashboardData(params?: {
    filterType?: 'day' | 'month' | 'year' | 'custom';
    selectedUnit?: string; // 'all' or a comma-separated list of organization ids
    fromDate?: string;
    toDate?: string;
}): Promise<{ success: boolean; data?: InvestorDashboardData; error?: string }> {
    try {
        const session = await getInvestorSession();
        if (!session) {
            return { success: false, error: 'Unauthorized investor session' };
        }

        const selectedUnit = params?.selectedUnit || 'all';
        const { start, end, fyStartYear } = resolvePeriod(params);
        // Shared month list for every "monthly breakdown" section (Expenses,
        // Salaries, ARPOB) — April through whichever month is current right now,
        // so a new month shows up the moment it starts rather than waiting for a
        // hardcoded window to be manually extended.
        const fyMonths = fyMonthsToDate(fyStartYear);
        const fyMonthKey = (y: number, m: number) => y * 12 + m;
        const fyMonthIndexByKey = new Map(fyMonths.map((mo, i) => [fyMonthKey(mo.year, mo.monthIndex), i]));
        const fyRangeStart = new Date(fyMonths[0].year, fyMonths[0].monthIndex, 1);
        const fyRangeEnd = new Date(fyMonths[fyMonths.length - 1].year, fyMonths[fyMonths.length - 1].monthIndex + 1, 1);

        // ---- Every active hospital on this server ----
        const activeOrgs = await getActiveOrgs();
        const orgIds = activeOrgs.map((o) => o.id);

        // ---- Real operational bed counts per hospital (drives bed occupancy + ARPOB) ----
        // Sourced from actual `beds` rows only — the same count the Hospital Wards
        // screen shows as Occupied+Available. organization.bed_capacity is a free-typed
        // admin field from onboarding (often a placeholder guess) and is deliberately
        // NOT used here, since it can be stale or larger than the real ward setup.
        const bedRows = await prisma.beds.groupBy({
            by: ['organizationId'],
            // Archived beds are retained only for historical admission/billing
            // references and must not contribute to current capacity.
            where: { organizationId: { in: orgIds }, status: { not: 'Archived' } },
            _count: true,
        }).catch(() => [] as Array<{ organizationId: string; _count: number }>);

        const bedCounts = zeroUnit(orgIds);
        for (const id of orgIds) {
            const tableRow = bedRows.find((r) => r.organizationId === id);
            bedCounts.byOrg[id] = tableRow ? tableRow._count : 0;
        }
        bedCounts.total = orgIds.reduce((s, id) => s + bedCounts.byOrg[id], 0);

        const units = activeOrgs.map((o) => ({ code: o.id, name: o.name, beds: bedCounts.byOrg[o.id] }));

        // ---- 1. Current Admitted Patients (real, point-in-time) ----
        const admittedRows = await prisma.admissions.findMany({
            where: { status: { notIn: ['Discharged', 'Cancelled'] }, is_archived: false, organizationId: { in: orgIds } },
            select: { organizationId: true, patient: { select: { patient_type: true } } },
        }).catch((err) => { console.error('investor: admitted rows', err); return [] as Array<{ organizationId: string; patient: { patient_type: string } | null }>; });

        const admittedCash = zeroUnit(orgIds);
        const admittedInsurance = zeroUnit(orgIds);
        const admittedPanel = zeroUnit(orgIds); // no real backing field — always 0
        const admittedCorporate = zeroUnit(orgIds);
        for (const row of admittedRows) {
            const bucket = categoryOf(row.patient?.patient_type) === 'corporate' ? admittedCorporate
                : categoryOf(row.patient?.patient_type) === 'insurance' ? admittedInsurance
                : admittedCash;
            addTo(bucket, row.organizationId, 1);
        }
        const admittedTotal = sumUnits(orgIds, admittedCash, admittedInsurance, admittedPanel, admittedCorporate);

        // ---- 2. Admissions (real, within period) ----
        // Excludes Cancelled — a cancelled admission was never actually admitted.
        const admissionRows = await prisma.admissions.findMany({
            where: { organizationId: { in: orgIds }, is_archived: false, status: { not: 'Cancelled' }, admission_date: { gte: start, lt: end } },
            select: { organizationId: true, patient: { select: { patient_type: true } } },
        }).catch((err) => { console.error('investor: admission rows', err); return [] as Array<{ organizationId: string; patient: { patient_type: string } | null }>; });

        const admCash = zeroUnit(orgIds), admInsurance = zeroUnit(orgIds), admPanel = zeroUnit(orgIds), admCorporate = zeroUnit(orgIds);
        for (const row of admissionRows) {
            const bucket = categoryOf(row.patient?.patient_type) === 'corporate' ? admCorporate
                : categoryOf(row.patient?.patient_type) === 'insurance' ? admInsurance
                : admCash;
            addTo(bucket, row.organizationId, 1);
        }
        const admTotal = sumUnits(orgIds, admCash, admInsurance, admPanel, admCorporate);

        // ---- 3. Discharges (real, within period) ----
        const dischargeRows = await prisma.admissions.findMany({
            where: { organizationId: { in: orgIds }, is_archived: false, status: 'Discharged', discharge_date: { gte: start, lt: end } },
            select: { organizationId: true, patient: { select: { patient_type: true } } },
        }).catch((err) => { console.error('investor: discharge rows', err); return [] as Array<{ organizationId: string; patient: { patient_type: string } | null }>; });

        const disCash = zeroUnit(orgIds), disInsurance = zeroUnit(orgIds), disPanel = zeroUnit(orgIds), disCorporate = zeroUnit(orgIds);
        for (const row of dischargeRows) {
            const bucket = categoryOf(row.patient?.patient_type) === 'corporate' ? disCorporate
                : categoryOf(row.patient?.patient_type) === 'insurance' ? disInsurance
                : disCash;
            addTo(bucket, row.organizationId, 1);
        }
        const disTotal = sumUnits(orgIds, disCash, disInsurance, disPanel, disCorporate);

        // ---- 4. Revenue by payer category (real, within period) ----
        // Revenue = Final (finalized/billed) invoices only, dated by created_at —
        // Draft bills are still being edited and Cancelled ones carry no financial
        // weight. Deliberately matches getFinanceDashboardStats's definition
        // (the screen finance staff already use daily) rather than getMISReport's
        // discharge-date recognition for IPD — an earlier version of this
        // dashboard used the discharge-date convention instead, which made its
        // Revenue number not reconcile against the Finance Dashboard's Total
        // Revenue for the same hospital. Consistency across the app's own
        // screens matters more here than which convention is theoretically purer.
        const revenueInvoices = await prisma.invoices.findMany({
            where: { organizationId: { in: orgIds }, status: 'Final', created_at: { gte: start, lt: end } },
            select: { organizationId: true, net_amount: true, paid_amount: true, billing_patient_type: true, invoice_type: true, doctor_id: true, id: true },
        }).catch((err) => { console.error('investor: revenue invoices', err); return [] as Array<{ organizationId: string; net_amount: unknown; paid_amount: unknown; billing_patient_type: string | null; invoice_type: string; doctor_id: string | null; id: number }>; });

        const revCash = zeroUnit(orgIds), revInsurance = zeroUnit(orgIds), revPanel = zeroUnit(orgIds), revCorporate = zeroUnit(orgIds);
        for (const inv of revenueInvoices) {
            const amt = Number(inv.net_amount);
            const bucket = categoryOf(inv.billing_patient_type) === 'corporate' ? revCorporate
                : categoryOf(inv.billing_patient_type) === 'insurance' ? revInsurance
                : revCash;
            addTo(bucket, inv.organizationId, amt);
        }
        const revTotal = sumUnits(orgIds, revCash, revInsurance, revPanel, revCorporate);

        // ---- 4B. OPD vs IPD vs Pharmacy vs Diagnostics (real, line-item level) ----
        // Bucketed by item so a pharmacy/lab line inside an IPD bill still lands in
        // Pharmacy/Diagnostics rather than IPD — matches how the numbers are
        // actually earned, not just which invoice type they were billed on.
        const invoiceIdsInPeriod = revenueInvoices.map((i) => i.id);
        const invoiceMetaById = new Map(revenueInvoices.map((i) => [i.id, i]));
        const periodItems = invoiceIdsInPeriod.length
            ? await prisma.invoice_items.findMany({
                where: { invoice_id: { in: invoiceIdsInPeriod } },
                select: { invoice_id: true, net_price: true, service_category: true, department: true },
            }).catch((err) => { console.error('investor: opd/ipd items', err); return [] as Array<{ invoice_id: number; net_price: unknown; service_category: string | null; department: string | null }>; })
            : [];

        const opdRev = zeroUnit(orgIds), ipdRev = zeroUnit(orgIds), pharmRev = zeroUnit(orgIds), diagRev = zeroUnit(orgIds);
        const PHARMACY_RE = /pharma/i;
        const DIAGNOSTIC_RE = /lab|diagnos|radiol|biochem|microbiol|serolog|haematol|hematol|patholog/i;
        for (const item of periodItems) {
            const inv = invoiceMetaById.get(item.invoice_id);
            if (!inv) continue;
            const label = `${item.service_category || ''} ${item.department || ''}`;
            const amt = Number(item.net_price);
            if (PHARMACY_RE.test(label) || /^(pharmacy|phm)$/i.test(inv.invoice_type)) {
                addTo(pharmRev, inv.organizationId, amt);
            } else if (DIAGNOSTIC_RE.test(label)) {
                addTo(diagRev, inv.organizationId, amt);
            } else if (inv.invoice_type === 'IPD') {
                addTo(ipdRev, inv.organizationId, amt);
            } else {
                addTo(opdRev, inv.organizationId, amt);
            }
        }
        const opdVsIpdTotal = sumUnits(orgIds, opdRev, ipdRev, pharmRev, diagRev);

        // ---- 4C. Top clinical department revenue (real, by treating doctor's specialty) ----
        // invoice_items.rendered_by_doctor_id is essentially unpopulated in live data
        // (1 row out of 14.5k), so specialty is attributed at the invoice level via
        // invoices.doctor_id instead — that field IS well populated (~79% of bills).
        // Bills with no doctor recorded fall into "General / Unassigned".
        const doctorIds = Array.from(new Set(revenueInvoices.map((i) => i.doctor_id).filter((d): d is string => !!d)));
        const doctors = doctorIds.length
            ? await prisma.user.findMany({ where: { id: { in: doctorIds } }, select: { id: true, specialty: true } }).catch(() => [] as Array<{ id: string; specialty: string | null }>)
            : [];
        const specialtyByDoctorId = new Map(doctors.map((d) => [d.id, (d.specialty || '').trim() || 'General / Unassigned']));
        const deptRevenueMap = new Map<string, UnitMetrics>();
        for (const inv of revenueInvoices) {
            const dept = inv.doctor_id ? (specialtyByDoctorId.get(inv.doctor_id) || 'General / Unassigned') : 'General / Unassigned';
            if (!deptRevenueMap.has(dept)) deptRevenueMap.set(dept, zeroUnit(orgIds));
            addTo(deptRevenueMap.get(dept)!, inv.organizationId, Number(inv.net_amount));
        }
        const departmentRevenue = Array.from(deptRevenueMap.entries())
            .map(([name, metrics]) => ({ name, metrics }))
            .sort((a, b) => b.metrics.total - a.metrics.total)
            .slice(0, 8);

        // ---- 5. Expenses (real, monthly, Approved/Paid only) ----
        const expenseRows = await prisma.expense.findMany({
            where: { organizationId: { in: orgIds }, status: { in: ['Approved', 'Paid'] }, created_at: { gte: fyRangeStart, lt: fyRangeEnd } },
            select: { organizationId: true, total_amount: true, created_at: true },
        }).catch((err) => { console.error('investor: expenses', err); return [] as Array<{ organizationId: string; total_amount: unknown; created_at: Date }>; });

        const expByMonth: UnitMetrics[] = fyMonths.map(() => zeroUnit(orgIds));
        for (const row of expenseRows) {
            const idx = fyMonthIndexByKey.get(fyMonthKey(row.created_at.getFullYear(), row.created_at.getMonth()));
            if (idx === undefined) continue;
            addTo(expByMonth[idx], row.organizationId, Number(row.total_amount));
        }
        const expTotal = sumUnits(orgIds, ...expByMonth);

        // ---- 6. Receivables — yet to receive (real, point-in-time balance) ----
        // Final bills only — a Draft is still being edited, not a committed
        // receivable yet.
        const openInvoices = await prisma.invoices.findMany({
            where: { organizationId: { in: orgIds }, status: 'Final', balance_due: { gt: 0 } },
            select: { organizationId: true, balance_due: true, billing_patient_type: true, tpa_tds_amount: true },
        }).catch((err) => { console.error('investor: receivables', err); return [] as Array<{ organizationId: string; balance_due: unknown; billing_patient_type: string | null; tpa_tds_amount: unknown }>; });

        const recCash = zeroUnit(orgIds), recInsurance = zeroUnit(orgIds), recPanel = zeroUnit(orgIds), recCorporate = zeroUnit(orgIds);
        for (const inv of openInvoices) {
            const bucket = categoryOf(inv.billing_patient_type) === 'corporate' ? recCorporate
                : categoryOf(inv.billing_patient_type) === 'insurance' ? recInsurance
                : recCash;
            addTo(bucket, inv.organizationId, Number(inv.balance_due));
        }

        // TDS receivables: invoices.tpa_tds_amount — TDS the insurer deducted on
        // settlement, which the hospital claims back via income-tax filing. This
        // is the authoritative per-invoice field (identity: settled + disallowed +
        // tds = approved, per the field's own schema comment).
        const tdsInvoices = await prisma.invoices.findMany({
            where: { organizationId: { in: orgIds }, tpa_tds_amount: { gt: 0 } },
            select: { organizationId: true, tpa_tds_amount: true },
        }).catch((err) => { console.error('investor: tds receivables', err); return [] as Array<{ organizationId: string; tpa_tds_amount: unknown }>; });
        const recTds = zeroUnit(orgIds);
        for (const inv of tdsInvoices) {
            addTo(recTds, inv.organizationId, Number(inv.tpa_tds_amount));
        }
        const recTotal = sumUnits(orgIds, recCash, recInsurance, recPanel, recCorporate, recTds);

        // ---- 6B. Insurance receivables aging (real, point-in-time) ----
        // invoices.tpa_payable — money still owed by the payer, net of receipts/
        // disallowances/TDS as they post (more precise than balance_due for TPA
        // bills specifically). Aged off whichever of tpa_approved_at / finalized_at
        // / created_at is available, same fallback order the existing TPA
        // outstanding report (getInsuranceOutstanding) uses.
        const tpaOutstandingInvoices = await prisma.invoices.findMany({
            where: { organizationId: { in: orgIds }, tpa_payable: { gt: 0 } },
            select: { organizationId: true, tpa_payable: true, tpa_approved_at: true, finalized_at: true, created_at: true },
        }).catch((err) => { console.error('investor: insurance aging', err); return [] as Array<{ organizationId: string; tpa_payable: unknown; tpa_approved_at: Date | null; finalized_at: Date | null; created_at: Date }>; });

        const age0to30 = zeroUnit(orgIds), age31to60 = zeroUnit(orgIds), age60Plus = zeroUnit(orgIds);
        const nowTs = Date.now();
        for (const inv of tpaOutstandingInvoices) {
            const agedFrom = inv.tpa_approved_at || inv.finalized_at || inv.created_at;
            const days = Math.floor((nowTs - new Date(agedFrom).getTime()) / (1000 * 60 * 60 * 24));
            const bucket = days <= 30 ? age0to30 : days <= 60 ? age31to60 : age60Plus;
            addTo(bucket, inv.organizationId, Number(inv.tpa_payable));
        }
        const ageTotal = sumUnits(orgIds, age0to30, age31to60, age60Plus);

        // ---- 7. Payables — due for payment (real, point-in-time) ----
        // Vendors: general (non-pharmacy) vendor bills approved but not yet paid,
        // plus pharmacy purchase invoices with an unpaid balance (drug procurement
        // is tracked on its own model, PharmacyPurchaseInvoice, not Expense).
        const payableExpenses = await prisma.expense.findMany({
            where: { organizationId: { in: orgIds }, status: 'Approved' }, // approved but not yet Paid = owed
            select: { organizationId: true, total_amount: true, vendor_id: true },
        }).catch((err) => { console.error('investor: payables (expenses)', err); return [] as Array<{ organizationId: string; total_amount: unknown; vendor_id: number | null }>; });
        const payVendors = zeroUnit(orgIds), payOthers = zeroUnit(orgIds);
        for (const e of payableExpenses) {
            addTo(e.vendor_id ? payVendors : payOthers, e.organizationId, Number(e.total_amount));
        }

        const pharmacyPayables = await prisma.pharmacyPurchaseInvoice.findMany({
            where: { organizationId: { in: orgIds }, status: { not: 'Draft' } },
            select: { organizationId: true, total_amount: true, amount_paid: true },
        }).catch((err) => { console.error('investor: payables (pharmacy purchases)', err); return [] as Array<{ organizationId: string; total_amount: number; amount_paid: number }>; });
        for (const p of pharmacyPayables) {
            const due = Number(p.total_amount) - Number(p.amount_paid);
            if (due > 0) addTo(payVendors, p.organizationId, due);
        }

        // Doctor/professional payables + the TDS withheld on them: DoctorCommission
        // lines still 'accrued' (earned, not yet grouped into a payout statement)
        // or 'included_in_statement' (grouped but the statement isn't paid yet) —
        // this is the real unpaid-commission ledger, one level more complete than
        // just the DoctorPayoutStatement header (which would miss commission never
        // yet bundled into any statement).
        const unpaidCommissions = await prisma.doctorCommission.findMany({
            where: { organizationId: { in: orgIds }, status: { in: ['accrued', 'included_in_statement'] } },
            select: { organizationId: true, commission_amount: true, tds_amount: true },
        }).catch((err) => { console.error('investor: payables (doctor commission)', err); return [] as Array<{ organizationId: string; commission_amount: unknown; tds_amount: unknown }>; });
        const payDoctors = zeroUnit(orgIds), payTds = zeroUnit(orgIds);
        for (const c of unpaidCommissions) {
            addTo(payDoctors, c.organizationId, Number(c.commission_amount));
            addTo(payTds, c.organizationId, Number(c.tds_amount));
        }
        const payTotal = sumUnits(orgIds, payVendors, payDoctors, payTds, payOthers);

        // ---- 8. Salaries (real, monthly, from active-employee roster) ----
        // No payroll-run model exists (no per-month "paid" record) — this uses each
        // active employee's salary_basic as their run-rate for a month, counted only
        // from the month after they joined onward. It won't reflect mid-month
        // exits (no termination-date field exists to detect those).
        const employees = await prisma.employee.findMany({
            where: { organizationId: { in: orgIds }, is_active: true },
            select: { organizationId: true, salary_basic: true, date_of_joining: true },
        }).catch((err) => { console.error('investor: salaries', err); return [] as Array<{ organizationId: string; salary_basic: number; date_of_joining: Date }>; });

        const salByMonth: UnitMetrics[] = fyMonths.map(() => zeroUnit(orgIds));
        fyMonths.forEach((mo, m) => {
            const monthEnd = new Date(mo.year, mo.monthIndex + 1, 1); // exclusive end of this month
            for (const e of employees) {
                if (new Date(e.date_of_joining) < monthEnd) {
                    addTo(salByMonth[m], e.organizationId, Number(e.salary_basic || 0));
                }
            }
        });
        const salTotal = sumUnits(orgIds, ...salByMonth);

        // ---- 9. ARPOB — Average Revenue Per Operational Bed (real, monthly, IPD revenue only) ----
        // Same Final-status + created_at dating as the main Revenue section (see
        // that section's comment for why created_at, not discharge_date).
        const ipdMonthlyRevenue = await prisma.invoices.findMany({
            where: { organizationId: { in: orgIds }, invoice_type: 'IPD', status: 'Final', created_at: { gte: fyRangeStart, lt: fyRangeEnd } },
            select: { organizationId: true, net_amount: true, created_at: true },
        }).catch((err) => { console.error('investor: arpob', err); return [] as Array<{ organizationId: string; net_amount: unknown; created_at: Date }>; });
        const ipdRevByMonth: UnitMetrics[] = fyMonths.map(() => zeroUnit(orgIds));
        for (const inv of ipdMonthlyRevenue) {
            const idx = fyMonthIndexByKey.get(fyMonthKey(inv.created_at.getFullYear(), inv.created_at.getMonth()));
            if (idx === undefined) continue;
            addTo(ipdRevByMonth[idx], inv.organizationId, Number(inv.net_amount));
        }
        const arpobFor = (revBucket: UnitMetrics, days: number): UnitMetrics => {
            const res = zeroUnit(orgIds);
            for (const id of orgIds) {
                res.byOrg[id] = bedCounts.byOrg[id] > 0 ? Math.round(revBucket.byOrg[id] / (bedCounts.byOrg[id] * days)) : 0;
            }
            res.total = bedCounts.total > 0 ? Math.round(revBucket.total / (bedCounts.total * days)) : 0;
            return res;
        };
        // The current (still in-progress) month divides by days elapsed so far,
        // not the full month length — otherwise a partial month's revenue would
        // look artificially diluted against days that haven't happened yet.
        const todayForArpob = new Date();
        const arpobByMonth: UnitMetrics[] = fyMonths.map((mo, i) => {
            const isCurrentMonth = mo.year === todayForArpob.getFullYear() && mo.monthIndex === todayForArpob.getMonth();
            const days = isCurrentMonth ? todayForArpob.getDate() : daysInMonth(mo.year, mo.monthIndex);
            return arpobFor(ipdRevByMonth[i], days);
        });
        const arpobAvg = zeroUnit(orgIds);
        for (const id of orgIds) {
            arpobAvg.byOrg[id] = Math.round(arpobByMonth.reduce((s, m) => s + m.byOrg[id], 0) / arpobByMonth.length);
        }
        arpobAvg.total = Math.round(arpobByMonth.reduce((s, m) => s + m.total, 0) / arpobByMonth.length);

        // ---- 10. Status of Profit/Loss (derived — real now that every input is real) ----
        const profitAmount = zeroUnit(orgIds);
        for (const id of orgIds) {
            profitAmount.byOrg[id] = revTotal.byOrg[id] - expTotal.byOrg[id] - salTotal.byOrg[id];
        }
        profitAmount.total = orgIds.reduce((s, id) => s + profitAmount.byOrg[id], 0);

        const profitPercentage = zeroUnit(orgIds);
        for (const id of orgIds) {
            profitPercentage.byOrg[id] = Number(((profitAmount.byOrg[id] / (revTotal.byOrg[id] || 1)) * 100).toFixed(1));
        }
        profitPercentage.total = Number(((profitAmount.total / (revTotal.total || 1)) * 100).toFixed(1));

        // ---- Executive KPIs (real) ----
        const alosRows = await prisma.admissions.findMany({
            where: { organizationId: { in: orgIds }, status: 'Discharged', discharge_date: { gte: start, lt: end, not: null } },
            select: { admission_date: true, discharge_date: true },
        }).catch(() => [] as Array<{ admission_date: Date; discharge_date: Date | null }>);
        const alosDays = alosRows.length
            ? Number((alosRows.reduce((s, a) => s + Math.max(0, (new Date(a.discharge_date!).getTime() - new Date(a.admission_date).getTime()) / (1000 * 60 * 60 * 24)), 0) / alosRows.length).toFixed(1))
            : 0;

        // Same invoice population as Revenue above (Final only, IPD recognized on
        // discharge date) so the ratio compares billed vs paid for the same bills.
        const totalBilledForCollection = revenueInvoices.reduce((s, i) => s + Number(i.net_amount), 0);
        const totalPaidForCollection = revenueInvoices.reduce((s, i) => s + Number(i.paid_amount), 0);
        const collectionEfficiencyPct = totalBilledForCollection > 0
            ? Number(((totalPaidForCollection / totalBilledForCollection) * 100).toFixed(1))
            : 0;

        const executiveKPIs = {
            ebitdaMarginPct: profitPercentage.total,
            bedOccupancyRate: bedCounts.total > 0 ? Number(((admittedTotal.total / bedCounts.total) * 100).toFixed(1)) : 0,
            alosDays,
            collectionEfficiencyPct,
        };

        const inclusiveEnd = new Date(end);
        inclusiveEnd.setDate(inclusiveEnd.getDate() - 1); // end is exclusive
        return {
            success: true,
            data: {
                period: params?.filterType || 'month',
                selectedUnit,
                // The actual applied window (matches "day"/"month"/"year" as well as
                // "custom"), not just an echo of whatever fromDate/toDate the caller
                // passed — those are ignored for anything but "custom".
                fromDate: start.toISOString().slice(0, 10),
                toDate: inclusiveEnd.toISOString().slice(0, 10),
                units,
                executiveKPIs,
                currentAdmittedPatients: {
                    cash: admittedCash,
                    insurance: admittedInsurance,
                    panel: admittedPanel,
                    corporate: admittedCorporate,
                    total: admittedTotal,
                },
                admissions: {
                    cash: admCash,
                    insurance: admInsurance,
                    panel: admPanel,
                    corporate: admCorporate,
                    total: admTotal,
                },
                discharges: {
                    cash: disCash,
                    insurance: disInsurance,
                    panel: disPanel,
                    corporate: disCorporate,
                    total: disTotal,
                },
                revenue: {
                    cash: revCash,
                    insurance: revInsurance,
                    panel: revPanel,
                    corporate: revCorporate,
                    total: revTotal,
                },
                opdVsIpdRevenue: {
                    opd: opdRev,
                    ipd: ipdRev,
                    pharmacy: pharmRev,
                    diagnostics: diagRev,
                    total: opdVsIpdTotal,
                },
                departmentRevenue,
                expenses: {
                    byMonth: fyMonths.map((mo, i) => ({ label: mo.label, data: expByMonth[i] })),
                    total: expTotal,
                },
                receivables: {
                    cash: recCash,
                    insurance: recInsurance,
                    panel: recPanel,
                    corporate: recCorporate,
                    tdsReceivables: recTds,
                    total: recTotal,
                },
                insuranceAging: {
                    days0to30: age0to30,
                    days31to60: age31to60,
                    days60Plus: age60Plus,
                    total: ageTotal,
                },
                payables: {
                    vendors: payVendors,
                    doctorsProfessional: payDoctors,
                    tdsPayable: payTds,
                    others: payOthers,
                    total: payTotal,
                },
                salaries: {
                    byMonth: fyMonths.map((mo, i) => ({ label: mo.label, data: salByMonth[i] })),
                    total: salTotal,
                },
                arpob: {
                    noOfBeds: bedCounts,
                    byMonth: fyMonths.map((mo, i) => ({ label: mo.label, data: arpobByMonth[i] })),
                    average: arpobAvg,
                },
                profitLoss: {
                    amount: profitAmount,
                    percentage: profitPercentage,
                },
            },
        };
    } catch (error: any) {
        console.error('getInvestorDashboardData error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// Drill-down — click a cell in any real section to see the actual records
// that sum to it. One generic action, a per-section switch, returned as a
// flat {columns, rows} table so the frontend needs only one modal component.
// ============================================================================
export type DrilldownSection =
    | 'admitted' | 'admissions' | 'discharges' | 'revenue' | 'opdVsIpd' | 'department'
    | 'expenses' | 'receivables' | 'insuranceAging' | 'payables' | 'salaries'
    | 'profitLoss' | 'beds' | 'alos' | 'arpob' | 'collectionEfficiency';

export interface DrilldownResult {
    columns: string[];
    rows: Array<Array<string | number>>;
    totalCount: number;
    truncated: boolean;
}

const ROW_CAP = 200;
const money = (n: unknown) => Number(n || 0);
const fmtDate = (d: Date | string | null | undefined) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export async function getInvestorDrilldown(params: {
    section: DrilldownSection;
    category: string;
    unit: string; // organization id
    fromDate?: string;
    toDate?: string;
}): Promise<{ success: boolean; data?: DrilldownResult; error?: string }> {
    try {
        const session = await getInvestorSession();
        if (!session) return { success: false, error: 'Unauthorized investor session' };

        // Only allow drilling into organizations that are actually part of the
        // active investor-visible set — the org id comes from the client, so this
        // is the tenant-isolation boundary, not just data lookup. 'all' (used by
        // the executive/summary KPI cards, which are always consolidated across
        // every active hospital, same as their own headline figure) resolves to
        // every active org; anything else must name one real org exactly.
        const activeOrgs = await getActiveOrgs();
        const orgIds: string[] = params.unit === 'all'
            ? activeOrgs.map((o) => o.id)
            : (() => { const found = activeOrgs.find((o) => o.id === params.unit)?.id; return found ? [found] : []; })();
        if (orgIds.length === 0) return { success: false, error: 'Unknown unit' };
        if (params.category === 'panel') {
            return { success: true, data: { columns: [], rows: [], totalCount: 0, truncated: false } };
        }
        const { start, end, fyStartYear } = resolvePeriod(params);
        const fyMonths = fyMonthsToDate(fyStartYear);
        const monthByLabel = new Map(fyMonths.map((mo) => [mo.label.toLowerCase(), mo]));

        switch (params.section) {
            case 'admitted':
            case 'admissions':
            case 'discharges': {
                const dateFilter = params.section === 'admitted'
                    ? { status: { notIn: ['Discharged', 'Cancelled'] } }
                    : params.section === 'admissions'
                        ? { status: { not: 'Cancelled' }, admission_date: { gte: start, lt: end } }
                        : { status: 'Discharged', discharge_date: { gte: start, lt: end } };
                const rows = await prisma.admissions.findMany({
                    where: { organizationId: { in: orgIds }, is_archived: false, ...dateFilter },
                    select: {
                        admission_id: true, admission_date: true, discharge_date: true, status: true,
                        patient: { select: { full_name: true, patient_id: true, patient_type: true } },
                    },
                    orderBy: { admission_date: 'desc' },
                    take: ROW_CAP + 1,
                });
                const filtered = params.category === 'all' ? rows : rows.filter((r) => categoryOf(r.patient?.patient_type) === params.category);
                return { success: true, data: {
                    columns: ['Patient', 'UHID', 'Admission ID', 'Admitted', 'Discharged', 'Status'],
                    rows: filtered.slice(0, ROW_CAP).map((r) => [
                        r.patient?.full_name || 'Unknown', r.patient?.patient_id || '—', r.admission_id,
                        fmtDate(r.admission_date), fmtDate(r.discharge_date), r.status,
                    ]),
                    totalCount: filtered.length,
                    truncated: filtered.length > ROW_CAP,
                } };
            }

            case 'revenue': {
                const rows = await prisma.invoices.findMany({
                    where: { organizationId: { in: orgIds }, status: 'Final', created_at: { gte: start, lt: end } },
                    select: { id: true, invoice_number: true, patient_id: true, net_amount: true, billing_patient_type: true, invoice_type: true, created_at: true },
                    orderBy: { created_at: 'desc' },
                    take: 5000,
                });
                const filtered = params.category === 'all' ? rows : rows.filter((r) => categoryOf(r.billing_patient_type) === params.category);
                return { success: true, data: {
                    columns: ['Invoice #', 'Patient ID', 'Type', 'Date', 'Amount (₹)'],
                    rows: filtered.slice(0, ROW_CAP).map((r) => [
                        r.invoice_number || `Draft #${r.id}`, r.patient_id, r.invoice_type, fmtDate(r.created_at), money(r.net_amount),
                    ]),
                    totalCount: filtered.length,
                    truncated: filtered.length > ROW_CAP,
                } };
            }

            case 'opdVsIpd': {
                const invoices = await prisma.invoices.findMany({
                    where: { organizationId: { in: orgIds }, status: 'Final', created_at: { gte: start, lt: end } },
                    select: { id: true, invoice_number: true, patient_id: true, invoice_type: true, created_at: true },
                });
                const invMetaById = new Map(invoices.map((i) => [i.id, i]));
                const items = invoices.length ? await prisma.invoice_items.findMany({
                    where: { invoice_id: { in: invoices.map((i) => i.id) } },
                    select: { invoice_id: true, description: true, net_price: true, service_category: true, department: true },
                }) : [];
                const PHARMACY_RE = /pharma/i;
                const DIAGNOSTIC_RE = /lab|diagnos|radiol|biochem|microbiol|serolog|haematol|hematol|patholog/i;
                const matched: Array<{ invoice_number: string; patient_id: string; date: Date; description: string; amount: number }> = [];
                for (const item of items) {
                    const inv = invMetaById.get(item.invoice_id);
                    if (!inv) continue;
                    const label = `${item.service_category || ''} ${item.department || ''}`;
                    let bucket: string;
                    if (PHARMACY_RE.test(label) || /^(pharmacy|phm)$/i.test(inv.invoice_type)) bucket = 'pharmacy';
                    else if (DIAGNOSTIC_RE.test(label)) bucket = 'diagnostics';
                    else if (inv.invoice_type === 'IPD') bucket = 'ipd';
                    else bucket = 'opd';
                    if (bucket === params.category) {
                        matched.push({ invoice_number: inv.invoice_number || `Draft #${inv.id}`, patient_id: inv.patient_id, date: inv.created_at, description: item.description, amount: money(item.net_price) });
                    }
                }
                return { success: true, data: {
                    columns: ['Invoice #', 'Patient ID', 'Date', 'Line Item', 'Amount (₹)'],
                    rows: matched.slice(0, ROW_CAP).map((r) => [r.invoice_number, r.patient_id, fmtDate(r.date), r.description, r.amount]),
                    totalCount: matched.length,
                    truncated: matched.length > ROW_CAP,
                } };
            }

            case 'department': {
                const invoices = await prisma.invoices.findMany({
                    where: { organizationId: { in: orgIds }, status: 'Final', doctor_id: { not: null }, created_at: { gte: start, lt: end } },
                    select: { invoice_number: true, patient_id: true, net_amount: true, created_at: true, doctor_id: true, id: true },
                });
                const doctorIds = Array.from(new Set(invoices.map((i) => i.doctor_id).filter((d): d is string => !!d)));
                const doctors = doctorIds.length ? await prisma.user.findMany({ where: { id: { in: doctorIds } }, select: { id: true, name: true, specialty: true } }) : [];
                const doctorById = new Map(doctors.map((d) => [d.id, d]));
                const filtered = invoices.filter((i) => {
                    const specialty = (i.doctor_id && doctorById.get(i.doctor_id)?.specialty?.trim()) || 'General / Unassigned';
                    return specialty === params.category;
                });
                return { success: true, data: {
                    columns: ['Invoice #', 'Patient ID', 'Doctor', 'Date', 'Amount (₹)'],
                    rows: filtered.slice(0, ROW_CAP).map((i) => [
                        i.invoice_number || `Draft #${i.id}`, i.patient_id, (i.doctor_id && doctorById.get(i.doctor_id)?.name) || '—', fmtDate(i.created_at), money(i.net_amount),
                    ]),
                    totalCount: filtered.length,
                    truncated: filtered.length > ROW_CAP,
                } };
            }

            case 'expenses': {
                const mo = monthByLabel.get(params.category.toLowerCase());
                if (!mo) return { success: true, data: { columns: [], rows: [], totalCount: 0, truncated: false } };
                const monthStart = new Date(mo.year, mo.monthIndex, 1);
                const monthEnd = new Date(mo.year, mo.monthIndex + 1, 1);
                const rows = await prisma.expense.findMany({
                    where: { organizationId: { in: orgIds }, status: { in: ['Approved', 'Paid'] }, created_at: { gte: monthStart, lt: monthEnd } },
                    select: { expense_number: true, description: true, total_amount: true, created_at: true, status: true, vendor: { select: { vendor_name: true } } },
                    orderBy: { created_at: 'desc' },
                    take: ROW_CAP + 1,
                });
                return { success: true, data: {
                    columns: ['Expense #', 'Description', 'Vendor', 'Date', 'Status', 'Amount (₹)'],
                    rows: rows.slice(0, ROW_CAP).map((r) => [r.expense_number, r.description, r.vendor?.vendor_name || '—', fmtDate(r.created_at), r.status, money(r.total_amount)]),
                    totalCount: rows.length,
                    truncated: rows.length > ROW_CAP,
                } };
            }

            case 'receivables': {
                if (params.category === 'tdsReceivables') {
                    const rows = await prisma.invoices.findMany({
                        where: { organizationId: { in: orgIds }, tpa_tds_amount: { gt: 0 } },
                        select: { invoice_number: true, id: true, patient_id: true, tpa_tds_amount: true, tpa_settled_at: true, tpa_claim_status: true },
                        orderBy: { tpa_settled_at: 'desc' },
                        take: ROW_CAP + 1,
                    });
                    return { success: true, data: {
                        columns: ['Invoice #', 'Patient ID', 'Claim Status', 'Settled', 'TDS (₹)'],
                        rows: rows.slice(0, ROW_CAP).map((r) => [r.invoice_number || `Draft #${r.id}`, r.patient_id, r.tpa_claim_status, fmtDate(r.tpa_settled_at), money(r.tpa_tds_amount)]),
                        totalCount: rows.length,
                        truncated: rows.length > ROW_CAP,
                    } };
                }
                const rows = await prisma.invoices.findMany({
                    where: { organizationId: { in: orgIds }, status: 'Final', balance_due: { gt: 0 } },
                    select: { invoice_number: true, patient_id: true, balance_due: true, billing_patient_type: true, created_at: true, id: true },
                    orderBy: { created_at: 'desc' },
                });
                const filtered = rows.filter((r) => categoryOf(r.billing_patient_type) === params.category);
                return { success: true, data: {
                    columns: ['Invoice #', 'Patient ID', 'Billed On', 'Balance Due (₹)'],
                    rows: filtered.slice(0, ROW_CAP).map((r) => [r.invoice_number || `Draft #${r.id}`, r.patient_id, fmtDate(r.created_at), money(r.balance_due)]),
                    totalCount: filtered.length,
                    truncated: filtered.length > ROW_CAP,
                } };
            }

            case 'insuranceAging': {
                const rows = await prisma.invoices.findMany({
                    where: { organizationId: { in: orgIds }, tpa_payable: { gt: 0 } },
                    select: { invoice_number: true, id: true, patient_id: true, tpa_payable: true, tpa_approved_at: true, finalized_at: true, created_at: true, tpa_claim_status: true },
                });
                const nowTs = Date.now();
                const matched = rows.filter((inv) => {
                    const agedFrom = inv.tpa_approved_at || inv.finalized_at || inv.created_at;
                    const days = Math.floor((nowTs - new Date(agedFrom).getTime()) / (1000 * 60 * 60 * 24));
                    const bucket = days <= 30 ? 'days0to30' : days <= 60 ? 'days31to60' : 'days60Plus';
                    return bucket === params.category;
                });
                return { success: true, data: {
                    columns: ['Invoice #', 'Patient ID', 'Claim Status', 'Aged Since', 'Outstanding (₹)'],
                    rows: matched.slice(0, ROW_CAP).map((inv) => [
                        inv.invoice_number || `Draft #${inv.id}`, inv.patient_id, inv.tpa_claim_status,
                        fmtDate(inv.tpa_approved_at || inv.finalized_at || inv.created_at), money(inv.tpa_payable),
                    ]),
                    totalCount: matched.length,
                    truncated: matched.length > ROW_CAP,
                } };
            }

            case 'payables': {
                if (params.category === 'doctorsProfessional' || params.category === 'tdsPayable') {
                    const rows = await prisma.doctorCommission.findMany({
                        where: { organizationId: { in: orgIds }, status: { in: ['accrued', 'included_in_statement'] } },
                        select: { doctor_id: true, patient_id: true, invoice_id: true, invoice_type: true, commission_amount: true, tds_amount: true, status: true },
                        orderBy: { invoice_id: 'desc' },
                        take: ROW_CAP + 1,
                    });
                    const doctorIds = Array.from(new Set(rows.map((r) => r.doctor_id)));
                    const doctors = doctorIds.length ? await prisma.user.findMany({ where: { id: { in: doctorIds } }, select: { id: true, name: true } }) : [];
                    const doctorById = new Map(doctors.map((d) => [d.id, d.name]));
                    return { success: true, data: {
                        columns: ['Doctor', 'Patient ID', 'Invoice', 'Status', params.category === 'tdsPayable' ? 'TDS (₹)' : 'Commission (₹)'],
                        rows: rows.slice(0, ROW_CAP).map((r) => [
                            doctorById.get(r.doctor_id) || r.doctor_id, r.patient_id, `${r.invoice_type} #${r.invoice_id}`, r.status,
                            money(params.category === 'tdsPayable' ? r.tds_amount : r.commission_amount),
                        ]),
                        totalCount: rows.length,
                        truncated: rows.length > ROW_CAP,
                    } };
                }
                if (params.category === 'vendors') {
                    const [expenseRows, pharmacyRows] = await Promise.all([
                        prisma.expense.findMany({
                            where: { organizationId: { in: orgIds }, status: 'Approved', vendor_id: { not: null } },
                            select: { expense_number: true, description: true, total_amount: true, created_at: true, vendor: { select: { vendor_name: true } } },
                            orderBy: { created_at: 'desc' },
                        }),
                        prisma.pharmacyPurchaseInvoice.findMany({
                            where: { organizationId: { in: orgIds }, status: { not: 'Draft' } },
                            select: { invoice_number: true, total_amount: true, amount_paid: true, invoice_date: true, vendor: { select: { vendor_name: true } } },
                            orderBy: { invoice_date: 'desc' },
                        }),
                    ]);
                    const combined = [
                        ...expenseRows.map((r) => [r.expense_number, r.description, r.vendor?.vendor_name || '—', fmtDate(r.created_at), money(r.total_amount)] as Array<string | number>),
                        ...pharmacyRows.filter((r) => Number(r.total_amount) - Number(r.amount_paid) > 0).map((r) => [r.invoice_number, 'Pharmacy purchase', r.vendor?.vendor_name || '—', fmtDate(r.invoice_date), money(Number(r.total_amount) - Number(r.amount_paid))] as Array<string | number>),
                    ];
                    return { success: true, data: {
                        columns: ['Ref #', 'Description', 'Vendor', 'Date', 'Amount (₹)'],
                        rows: combined.slice(0, ROW_CAP),
                        totalCount: combined.length,
                        truncated: combined.length > ROW_CAP,
                    } };
                }
                const rows = await prisma.expense.findMany({
                    where: { organizationId: { in: orgIds }, status: 'Approved', vendor_id: null },
                    select: { expense_number: true, description: true, total_amount: true, created_at: true, vendor: { select: { vendor_name: true } } },
                    orderBy: { created_at: 'desc' },
                    take: ROW_CAP + 1,
                });
                return { success: true, data: {
                    columns: ['Expense #', 'Description', 'Vendor', 'Date', 'Amount (₹)'],
                    rows: rows.slice(0, ROW_CAP).map((r) => [r.expense_number, r.description, r.vendor?.vendor_name || '—', fmtDate(r.created_at), money(r.total_amount)]),
                    totalCount: rows.length,
                    truncated: rows.length > ROW_CAP,
                } };
            }

            case 'salaries': {
                const mo = monthByLabel.get(params.category.toLowerCase());
                if (!mo) return { success: true, data: { columns: [], rows: [], totalCount: 0, truncated: false } };
                const monthEnd = new Date(mo.year, mo.monthIndex + 1, 1);
                const rows = await prisma.employee.findMany({
                    where: { organizationId: { in: orgIds }, is_active: true, date_of_joining: { lt: monthEnd } },
                    select: { employee_code: true, name: true, designation: true, salary_basic: true, date_of_joining: true },
                    orderBy: { name: 'asc' },
                    take: ROW_CAP + 1,
                });
                return { success: true, data: {
                    columns: ['Employee Code', 'Name', 'Designation', 'Joined', 'Monthly Salary (₹)'],
                    rows: rows.slice(0, ROW_CAP).map((r) => [r.employee_code, r.name, r.designation, fmtDate(r.date_of_joining), money(r.salary_basic)]),
                    totalCount: rows.length,
                    truncated: rows.length > ROW_CAP,
                } };
            }

            case 'beds': {
                const orgNameById = new Map(activeOrgs.map((o) => [o.id, o.name]));
                const rows = await prisma.beds.findMany({
                    where: { organizationId: { in: orgIds }, status: { not: 'Archived' } },
                    select: { bed_id: true, bed_name: true, status: true, bed_category: true, organizationId: true, wards: { select: { ward_name: true } } },
                    orderBy: [{ organizationId: 'asc' }, { bed_name: 'asc' }],
                    take: ROW_CAP + 1,
                });
                return { success: true, data: {
                    columns: ['Hospital', 'Bed', 'Ward', 'Category', 'Status'],
                    rows: rows.slice(0, ROW_CAP).map((r) => [
                        orgNameById.get(r.organizationId) || r.organizationId, r.bed_name || r.bed_id,
                        r.wards?.ward_name || '—', r.bed_category || '—', r.status || 'Available',
                    ]),
                    totalCount: rows.length,
                    truncated: rows.length > ROW_CAP,
                } };
            }

            case 'alos': {
                const orgNameById = new Map(activeOrgs.map((o) => [o.id, o.name]));
                const rows = await prisma.admissions.findMany({
                    where: { organizationId: { in: orgIds }, status: 'Discharged', discharge_date: { gte: start, lt: end, not: null } },
                    select: {
                        organizationId: true, admission_id: true, admission_date: true, discharge_date: true,
                        patient: { select: { full_name: true, patient_id: true } },
                    },
                    orderBy: { discharge_date: 'desc' },
                    take: ROW_CAP + 1,
                });
                return { success: true, data: {
                    columns: ['Hospital', 'Patient', 'UHID', 'Admission ID', 'Admitted', 'Discharged', 'LOS (Days)'],
                    rows: rows.slice(0, ROW_CAP).map((r) => {
                        const los = Math.max(0, (new Date(r.discharge_date!).getTime() - new Date(r.admission_date).getTime()) / (1000 * 60 * 60 * 24));
                        return [
                            orgNameById.get(r.organizationId) || r.organizationId, r.patient?.full_name || 'Unknown', r.patient?.patient_id || '—',
                            r.admission_id, fmtDate(r.admission_date), fmtDate(r.discharge_date), Number(los.toFixed(1)),
                        ];
                    }),
                    totalCount: rows.length,
                    truncated: rows.length > ROW_CAP,
                } };
            }

            case 'collectionEfficiency': {
                const orgNameById = new Map(activeOrgs.map((o) => [o.id, o.name]));
                const rows = await prisma.invoices.findMany({
                    where: { organizationId: { in: orgIds }, status: 'Final', created_at: { gte: start, lt: end } },
                    select: { id: true, invoice_number: true, patient_id: true, net_amount: true, paid_amount: true, organizationId: true, created_at: true },
                    orderBy: { created_at: 'desc' },
                    take: ROW_CAP + 1,
                });
                return { success: true, data: {
                    columns: ['Hospital', 'Invoice #', 'Patient ID', 'Date', 'Billed (₹)', 'Collected (₹)', 'Collected %'],
                    rows: rows.slice(0, ROW_CAP).map((r) => {
                        const billed = money(r.net_amount);
                        const collected = money(r.paid_amount);
                        const pct = billed > 0 ? Number(((collected / billed) * 100).toFixed(1)) : 0;
                        return [orgNameById.get(r.organizationId) || r.organizationId, r.invoice_number || `Draft #${r.id}`, r.patient_id, fmtDate(r.created_at), billed, collected, pct];
                    }),
                    totalCount: rows.length,
                    truncated: rows.length > ROW_CAP,
                } };
            }

            case 'arpob': {
                const ipdInvoices = await prisma.invoices.findMany({
                    where: { organizationId: { in: orgIds }, invoice_type: 'IPD', status: 'Final', created_at: { gte: new Date(fyMonths[0].year, fyMonths[0].monthIndex, 1), lt: new Date(fyMonths[fyMonths.length - 1].year, fyMonths[fyMonths.length - 1].monthIndex + 1, 1) } },
                    select: { net_amount: true, created_at: true },
                });
                const bedRows = await prisma.beds.groupBy({
                    by: ['organizationId'],
                    where: { organizationId: { in: orgIds }, status: { not: 'Archived' } },
                    _count: true,
                }).catch(() => [] as Array<{ organizationId: string; _count: number }>);
                let totalBeds = 0;
                for (const r of bedRows) totalBeds += r._count;
                const todayForArpob = new Date();
                const revByMonth = fyMonths.map(() => 0);
                for (const inv of ipdInvoices) {
                    const idx = fyMonths.findIndex((mo) => mo.year === inv.created_at.getFullYear() && mo.monthIndex === inv.created_at.getMonth());
                    if (idx >= 0) revByMonth[idx] += money(inv.net_amount);
                }
                return { success: true, data: {
                    columns: ['Month', 'IPD Revenue (₹)', 'Beds', 'Days', 'ARPOB (₹)'],
                    rows: fyMonths.map((mo, i) => {
                        const isCurrentMonth = mo.year === todayForArpob.getFullYear() && mo.monthIndex === todayForArpob.getMonth();
                        const days = isCurrentMonth ? todayForArpob.getDate() : daysInMonth(mo.year, mo.monthIndex);
                        const arpobVal = totalBeds > 0 ? Math.round(revByMonth[i] / (totalBeds * days)) : 0;
                        return [mo.label, Math.round(revByMonth[i]), totalBeds, days, arpobVal];
                    }),
                    totalCount: fyMonths.length,
                    truncated: false,
                } };
            }

            case 'profitLoss': {
                const fyRangeStart = new Date(fyMonths[0].year, fyMonths[0].monthIndex, 1);
                const fyRangeEnd = new Date(fyMonths[fyMonths.length - 1].year, fyMonths[fyMonths.length - 1].monthIndex + 1, 1);
                const [periodRevenue, fyExpenses, fyEmployees] = await Promise.all([
                    prisma.invoices.findMany({
                        where: { organizationId: { in: orgIds }, status: 'Final', created_at: { gte: start, lt: end } },
                        select: { net_amount: true },
                    }),
                    prisma.expense.findMany({
                        where: { organizationId: { in: orgIds }, status: { in: ['Approved', 'Paid'] }, created_at: { gte: fyRangeStart, lt: fyRangeEnd } },
                        select: { total_amount: true },
                    }),
                    prisma.employee.findMany({
                        where: { organizationId: { in: orgIds }, is_active: true },
                        select: { salary_basic: true, date_of_joining: true },
                    }),
                ]);
                const revenueTotal = periodRevenue.reduce((s, r) => s + money(r.net_amount), 0);
                const expenseTotal = fyExpenses.reduce((s, r) => s + money(r.total_amount), 0);
                // Same run-rate approximation as the headline figure: each active
                // employee's salary counted once per FY month they'd already joined by.
                let salaryTotal = 0;
                for (const mo of fyMonths) {
                    const monthEnd = new Date(mo.year, mo.monthIndex + 1, 1);
                    for (const e of fyEmployees) {
                        if (new Date(e.date_of_joining) < monthEnd) salaryTotal += money(e.salary_basic);
                    }
                }
                const netProfit = revenueTotal - expenseTotal - salaryTotal;
                const marginPct = revenueTotal > 0 ? Number(((netProfit / revenueTotal) * 100).toFixed(1)) : 0;
                return { success: true, data: {
                    columns: ['Line Item', 'Period Covered', 'Amount (₹)'],
                    rows: [
                        ['Revenue', 'Selected filter period', Math.round(revenueTotal)],
                        ['Less: Expenses (Approved/Paid)', 'Fiscal-year-to-date', -Math.round(expenseTotal)],
                        ['Less: Salaries (active roster run-rate)', 'Fiscal-year-to-date', -Math.round(salaryTotal)],
                        ['Net Profit / (Loss)', '—', Math.round(netProfit)],
                        ['EBITDA / Net Margin %', '—', marginPct],
                    ],
                    totalCount: 5,
                    truncated: false,
                } };
            }

            default:
                return { success: false, error: 'Unsupported drill-down section' };
        }
    } catch (error: any) {
        console.error('getInvestorDrilldown error:', error);
        return { success: false, error: error.message };
    }
}

export async function getInvestorUnitSummaries(): Promise<Array<{ code: string; name: string; shortName: string; beds: number }>> {
    try {
        const activeOrgs = await getActiveOrgs();
        const orgIds = activeOrgs.map((o) => o.id);

        // Real `beds` rows only — see getInvestorDashboardData for why
        // organization.bed_capacity is deliberately not used as a fallback.
        const bedRows = await prisma.beds.groupBy({
            by: ['organizationId'],
            // Keep this header summary aligned with the dashboard and IPD setup:
            // archived beds remain for history but are no longer operational.
            where: { organizationId: { in: orgIds }, status: { not: 'Archived' } },
            _count: true,
        }).catch(() => [] as Array<{ organizationId: string; _count: number }>);

        return activeOrgs.map((o) => {
            const tableRow = bedRows.find((r) => r.organizationId === o.id);
            return {
                code: o.id,
                name: o.name,
                shortName: o.name,
                beds: tableRow ? tableRow._count : 0,
            };
        });
    } catch (err) {
        console.error('getInvestorUnitSummaries error:', err);
        return [];
    }
}
