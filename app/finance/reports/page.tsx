'use client';

import { useState, useEffect, Fragment } from 'react';
import {
    getCollectionsReport, getARAgingReport, getCashFlowReport,
    getProfitLossReport, getInsuranceCollectionReport, getRevenueByDepartment,
    getPnLIncomeBreakdown, getPnLExpenseBreakdown, getInvoiceItemsBrief,
    getDailyActivityReport, getMISReport,
} from '@/app/actions/report-actions';
import { getBalanceSheet, getScheduleIIIBalanceSheet } from '@/app/actions/gl-actions';
import { DateRangePicker } from '@/app/components/finance/DateRangePicker';
import { ReportChart } from '@/app/components/finance/ReportChart';
import { ExportButton } from '@/app/components/finance/ExportButton';
import {
    BarChart3, Clock, TrendingUp, IndianRupee, ShieldCheck, Building2, Scale,
    Loader2, FileText, BookOpenCheck, FileSpreadsheet, CalendarDays, ChevronDown, ChevronRight,
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { VoucherModal } from '@/app/components/finance/VoucherModal';
import { canonicalTender, isDepositSettlement } from '@/app/lib/payment-tender';
import Link from 'next/link';

type ReportType = 'collections' | 'voucher' | 'daily' | 'aging' | 'cashflow' | 'pnl' | 'balance-sheet' | 'insurance' | 'department';

const REPORT_TABS: { key: ReportType; label: string; icon: React.ReactNode }[] = [
    { key: 'collections', label: 'Collections', icon: <IndianRupee className="h-4 w-4" /> },
    { key: 'voucher', label: 'Daily Sale Voucher', icon: <BookOpenCheck className="h-4 w-4" /> },
    { key: 'daily', label: 'Daily Activity', icon: <CalendarDays className="h-4 w-4" /> },
    { key: 'aging', label: 'A/R Aging', icon: <Clock className="h-4 w-4" /> },
    { key: 'cashflow', label: 'Cash Flow', icon: <TrendingUp className="h-4 w-4" /> },
    { key: 'pnl', label: 'Profit & Loss', icon: <BarChart3 className="h-4 w-4" /> },
    { key: 'balance-sheet', label: 'Balance Sheet', icon: <Scale className="h-4 w-4" /> },
    { key: 'insurance', label: 'Insurance', icon: <ShieldCheck className="h-4 w-4" /> },
    { key: 'department', label: 'Department', icon: <Building2 className="h-4 w-4" /> },
];


export function FinancialReportsContent({ shell = 'app' }: { shell?: 'app' | 'admin' }) {
    const adminMode = shell === 'admin';
    const Shell = adminMode ? AdminPage : AppShell;
    const _now = new Date();
    const _ld = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const today = _ld(_now);
    const firstOfMonth = _ld(new Date(_now.getFullYear(), _now.getMonth(), 1));

    const [activeReport, setActiveReport] = useState<ReportType>('collections');
    const [from, setFrom] = useState(firstOfMonth);
    const [to, setTo] = useState(today);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [quickFilter, setQuickFilter] = useState<'all' | 'cash' | 'upi' | 'others'>('all');
    const [methodFilter, setMethodFilter] = useState<string>('all');
    const [billType, setBillType] = useState<string>('all'); // all | OPD | IPD | Pharmacy | Lab
    const [bsFormat, setBsFormat] = useState<'normal' | 'schedule3'>('normal');
    const [orgId, setOrgId] = useState('');

    // Balance Sheet needs the tenant's org id explicitly (its GL actions take
    // organizationId as a param rather than resolving it server-side) — same
    // pattern /finance/gl-reports uses.
    useEffect(() => {
        fetch('/api/session').then((r) => r.json()).then((s) => { if (s?.organization_id) setOrgId(s.organization_id); }).catch(() => {});
    }, []);

    useEffect(() => { loadReport(); }, [activeReport, from, to, quickFilter, methodFilter, billType, bsFormat, orgId]);

    async function loadReport() {
        setLoading(true);
        setData(null); // always clear stale data before loading new report
        // Bill Type: OPD/IPD/Pharmacy/Lab filter by invoice type; Admit/Discharge
        // filter IPD bills by the patient's admission status.
        const it = ['OPD', 'IPD', 'Pharmacy', 'Lab'].includes(billType) ? billType : undefined;
        const adm = billType === 'Admit' ? 'Admitted' : billType === 'Discharge' ? 'Discharged' : undefined;
        let res;
        switch (activeReport) {
            case 'collections': {
                    const quickFilterMap: Record<string, string> = { cash: 'Cash', upi: 'UPI', others: 'others' };
                    const activeMethod = methodFilter !== 'all' ? methodFilter : quickFilter !== 'all' ? quickFilterMap[quickFilter] : undefined;
                    res = await getCollectionsReport({ from, to, method: activeMethod, invoiceType: it, admissionStatus: adm });
                    break;
                }
            case 'voucher': {
                    // Sales must be bill-date/accrual (same basis as MIS's "billed amount"),
                    // not payment-date — getCollectionsReport's totals.total sums payments
                    // received in range regardless of the underlying bill's date, which
                    // overstates Sales whenever money comes in against an older bill (common
                    // for IPD installments / late OPD dues). getMISReport gives the correct
                    // bill-date total_net to use instead.
                    // getMISReport has no admissionStatus filter — skip it when the
                    // "Admitted"/"Discharged" bill-type filter is active so we don't compare
                    // admission-filtered collections against an unfiltered MIS Sales total.
                    const [collRes, misRes] = await Promise.all([
                        getCollectionsReport({ from, to, invoiceType: it, admissionStatus: adm }),
                        adm ? Promise.resolve({ success: false }) : getMISReport({ from, to, billType: it }),
                    ]);
                    const misOk = (misRes as any)?.success;
                    res = collRes?.success
                        ? {
                            success: true,
                            data: {
                                ...collRes.data,
                                misSales: misOk ? (misRes as any).data.summary?.total_net ?? 0 : null,
                                // Dr/Cr Advance for applied deposits, classified against each
                                // bill's own date — computed in getMISReport where the deposit
                                // is properly joined to the bill it settled (see that function).
                                advanceDr: misOk ? (misRes as any).data.summary?.advance_dr ?? 0 : 0,
                                advanceCr: misOk ? (misRes as any).data.summary?.advance_cr ?? 0 : 0,
                            },
                        }
                        : collRes;
                    break;
                }
            case 'daily': res = await getDailyActivityReport({ from, to }); break;
            case 'aging': res = await getARAgingReport({ invoiceType: it, admissionStatus: adm }); break;
            case 'cashflow': res = await getCashFlowReport({ from, to, invoiceType: it, admissionStatus: adm }); break;
            case 'pnl': res = await getProfitLossReport({ from, to, invoiceType: it, admissionStatus: adm }); break;
            case 'balance-sheet': {
                    if (!orgId) { setLoading(false); return; }
                    const asOf = new Date(`${to}T23:59:59`);
                    const bsRes: any = bsFormat === 'schedule3'
                        ? await getScheduleIIIBalanceSheet(orgId, { as_of_date: asOf })
                        : await getBalanceSheet(orgId, { as_of_date: asOf });
                    // Both actions shape their payload differently from the rest of
                    // this page's `res.data` convention — normalise here so the
                    // generic `if (res?.success) setData(res.data)` below still works.
                    res = bsRes?.success ? { success: true, data: bsRes } : bsRes;
                    break;
                }
            case 'insurance': res = await getInsuranceCollectionReport({ from, to, invoiceType: it, admissionStatus: adm }); break;
            case 'department': res = await getRevenueByDepartment({ from, to, invoiceType: it, admissionStatus: adm }); break;
        }
        if (res?.success) setData(res.data);
        setLoading(false);
    }

    const fmt = (n: number) => {
        if (n == null || isNaN(n)) return '₹0';
        return Number(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
    };

    return (
        <Shell pageTitle="Financial Reports" pageIcon={<BarChart3 className="h-5 w-5" />} onRefresh={loadReport} refreshing={loading}>
        <div className="max-w-7xl mx-auto">

            {/* Report Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
                {REPORT_TABS.map(tab => (
                    <button key={tab.key} onClick={() => { setActiveReport(tab.key); setQuickFilter('all'); setMethodFilter('all'); }}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition ${
                            activeReport === tab.key ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'text-gray-500 hover:bg-gray-100 border border-transparent'
                        }`}>
                        {tab.icon} {tab.label}
                    </button>
                ))}
                <Link href={adminMode ? "/admin/finance/reports/mis" : "/finance/reports/mis"}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100">
                    <FileSpreadsheet className="h-4 w-4" /> MIS Report
                </Link>
                <Link href={adminMode ? "/admin/finance/reports/doctor-recon" : "/finance/reports/doctor-recon"}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100">
                    <FileSpreadsheet className="h-4 w-4" /> Doctor Recon
                </Link>
            </div>

            {/* Date Range + Export */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                {activeReport === 'balance-sheet' ? (
                    <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">As of</span>
                        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                            className="text-sm font-bold text-gray-700 border-none focus:ring-0 p-0 bg-transparent outline-none" />
                    </div>
                ) : activeReport !== 'aging' ? (
                    <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
                ) : <div />}
                <div className="flex items-center gap-2">
                    {activeReport === 'balance-sheet' ? (
                        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
                            {([['normal', 'Normal Statement'], ['schedule3', 'Schedule III (Companies Act 2013)']] as const).map(([key, label]) => (
                                <button key={key} onClick={() => setBsFormat(key)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition ${bsFormat === key ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    ) : (
                        /* IPD / OPD report separation */
                        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Bill Type</span>
                            <select value={billType} onChange={e => setBillType(e.target.value)}
                                className="text-sm font-bold text-gray-700 border-none focus:ring-0 p-0 bg-transparent outline-none">
                                <option value="all">All</option>
                                <option value="OPD">OPD only</option>
                                <option value="IPD">IPD only</option>
                                <option value="Pharmacy">Pharmacy only</option>
                                <option value="Lab">Lab only</option>
                                <option value="Admit">Admitted (IPD in-house)</option>
                                <option value="Discharge">Discharged (IPD)</option>
                            </select>
                        </div>
                    )}
                    <button onClick={loadReport} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">
                        Generate Report
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>
            ) : !data ? (
                <div className="text-center py-24 text-gray-400">
                    <FileText className="h-10 w-10 mx-auto mb-3" />
                    <p className="font-medium">Select a report and click Generate</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {activeReport === 'collections' && (
                        <CollectionsReport
                            data={data} fmt={fmt} from={from} to={to}
                            quickFilter={quickFilter} setQuickFilter={setQuickFilter}
                            methodFilter={methodFilter} setMethodFilter={setMethodFilter}
                        />
                    )}
                    {activeReport === 'voucher' && <DailySaleVoucherReport data={data} fmt={fmt} from={from} to={to} />}
                    {activeReport === 'daily' && <DailyActivityReport data={data} fmt={fmt} from={from} to={to} />}
                    {activeReport === 'aging' && <AgingReport data={data} fmt={fmt} />}
                    {activeReport === 'cashflow' && <CashFlowReport data={data} fmt={fmt} from={from} to={to} />}
                    {activeReport === 'pnl' && <ProfitLossReport data={data} fmt={fmt} from={from} to={to} />}
                    {activeReport === 'balance-sheet' && <BalanceSheetReport data={data} fmt={fmt} asOf={to} format={bsFormat} />}
                    {activeReport === 'insurance' && <InsuranceReport data={data} fmt={fmt} from={from} to={to} />}
                    {activeReport === 'department' && <DepartmentReport data={data} fmt={fmt} from={from} to={to} />}
                </div>
            )}
        </div>
        </Shell>
    );
}

export default function FinancialReportsPage() {
    return <FinancialReportsContent />;
}

function CollectionsReport({ data, fmt, from, to, quickFilter, setQuickFilter, methodFilter, setMethodFilter }: {
    data: any; fmt: (n: number) => string; from: string; to: string;
    quickFilter: 'all' | 'cash' | 'upi' | 'others'; setQuickFilter: (v: 'all' | 'cash' | 'upi' | 'others') => void;
    methodFilter: string; setMethodFilter: (v: string) => void;
}) {
    const methodLabel = (m: string) => m;
    const depositsCollected = data?.depositsCollected || {};
    const depositModes = Object.entries(depositsCollected).filter(([k]) => k !== 'total');
    // Total received this period, by tender = real-tender invoice payments PLUS
    // advances collected in the same tender (computed server-side). The
    // "Deposit Applied" amount (earlier advances settled against a bill) is shown
    // separately for transparency but is NOT added, to avoid double-counting.
    const received = data?.received || {};
    const methods = Object.entries(received).filter(([, a]) => Number(a) !== 0);
    const receivedTotal = Number(data?.receivedTotal || 0);
    const depositApplied = Number(data?.depositApplied || 0);
    const depositCollectedTotal = Number(depositsCollected?.total || 0);

    const [excelExporting, setExcelExporting] = useState(false);

    // Column-level client-side filters for the Payment Details table
    const [colReceipt, setColReceipt] = useState('');
    const [colPatient, setColPatient] = useState('');
    const [colColMethod, setColColMethod] = useState('');
    const [colAmountMin, setColAmountMin] = useState('');
    const [colDate, setColDate] = useState('');
    const [viewMode, setViewMode] = useState<'patient' | 'payment'>('patient');
    const [openPatientKey, setOpenPatientKey] = useState<string | null>(null);

    const depositsList: any[] = data?.depositsList || [];

    // Unified collection payments = Direct invoice payments (excluding internal deposit settlements)
    // + Advance deposits collected in this period.
    const allPayments = [
        ...(data?.payments || [])
            .filter((p: any) => p.status === 'Completed' && !isDepositSettlement(p))
            .map((p: any) => ({
                id: p.id,
                created_at: p.created_at,
                receipt_number: p.receipt_number,
                amount: p.amount,
                payment_method: p.payment_method,
                patient_name: p.invoice?.patient?.full_name || 'Walk-in / No Patient',
                patient_id: p.invoice?.patient?.patient_id || '-',
                invoice_number: p.invoice?.invoice_number || '-',
                _isDeposit: false,
                raw: p,
            })),
        ...depositsList.map((d: any) => ({
            id: `dep-${d.id}`,
            deposit_id: d.id,
            created_at: d.created_at,
            receipt_number: d.deposit_number,
            amount: d.amount,
            payment_method: d.payment_method,
            patient_name: d.patient_name || 'Walk-in / No Patient',
            patient_id: d.patient_id || '-',
            invoice_number: 'Advance',
            _isDeposit: true,
            raw: d,
        })),
    ];

    const uniquePaymentMethods: string[] = Array.from(
        new Set<string>(allPayments.map((p: any) => canonicalTender(p.payment_method)))
    ).sort();

    const filteredPayments = allPayments.filter((p: any) => {
        if (colReceipt && !String(p.receipt_number || '').toLowerCase().includes(colReceipt.toLowerCase())) return false;
        if (colPatient && !String(p.patient_name || '').toLowerCase().includes(colPatient.toLowerCase())) return false;
        if (colColMethod && canonicalTender(p.payment_method) !== colColMethod) return false;
        if (colAmountMin && Number(p.amount) < Number(colAmountMin)) return false;
        if (colDate) {
            const dt = new Date(p.created_at);
            const ymd = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
            if (ymd !== colDate) return false;
        }
        return true;
    });

    const hasColFilter = colReceipt || colPatient || colColMethod || colAmountMin || colDate;
    function clearColFilters() {
        setColReceipt(''); setColPatient(''); setColColMethod(''); setColAmountMin(''); setColDate('');
    }

    // Group the same filtered payments by patient so collections can be reviewed
    // per-patient instead of as one long chronological list.
    type PatientGroup = {
        key: string; patientName: string; patientId: string;
        payments: any[]; total: number; firstDate: Date; lastDate: Date;
    };
    const patientGroups: PatientGroup[] = (() => {
        const map = new Map<string, PatientGroup>();
        filteredPayments.forEach((p: any) => {
            const key = (p.patient_id && p.patient_id !== '-') ? p.patient_id : p.patient_name;
            const dt = new Date(p.created_at);
            let group = map.get(key);
            if (!group) {
                group = { key, patientName: p.patient_name, patientId: p.patient_id, payments: [], total: 0, firstDate: dt, lastDate: dt };
                map.set(key, group);
            }
            group.payments.push(p);
            group.total += Number(p.amount);
            if (dt < group.firstDate) group.firstDate = dt;
            if (dt > group.lastDate) group.lastDate = dt;
        });
        return Array.from(map.values())
            .map((g) => ({ ...g, payments: [...g.payments].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) }))
            .sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime());
    })();

    async function handleCollectionsExcelExport() {
        setExcelExporting(true);
        try {
            const xlsxModule = await import('xlsx');
            const XLSX = xlsxModule.default ?? xlsxModule;

            const depts = ['Advance', 'OP/ER', 'IPD', 'Walkin', 'Voucher'];
            const allModesSet = new Set<string>();
            const cashierList = new Set<string>();

            const paymentsList = data?.payments || [];
            const depositsList = data?.depositsList || [];
            const refundsList = data?.refunds || [];

            const itemsList: any[] = [];
            let sr = 1;

            function getDept(invoiceType: string) {
                const t = (invoiceType || '').toUpperCase();
                if (t === 'IPD') return 'IPD';
                if (t === 'LAB' || t === 'WALKIN') return 'Walkin';
                if (t === 'Voucher') return 'Voucher';
                return 'OP/ER';
            }

            // Process Completed & Reversed payments
            paymentsList.forEach((p: any) => {
                if (isDepositSettlement(p)) return; // Skip deposits applied to bills

                const cashierUser = p.cashier_username || 'system';
                const cashierName = p.cashier_name || cashierUser;
                const patientName = p.invoice?.patient?.full_name || '-';
                const patientId = p.invoice?.patient?.patient_id || '-';
                const dept = getDept(p.invoice?.invoice_type || 'OPD');
                const mode = canonicalTender(p.payment_method);
                allModesSet.add(mode);
                cashierList.add(cashierUser);

                const dt = new Date(p.created_at);
                const dateStr = dt.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
                const timeStr = dt.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });

                if (p.status === 'Completed') {
                    itemsList.push({
                        srNo: sr++,
                        type: 'Receipt',
                        receiptNo: p.receipt_number,
                        invoiceNo: p.invoice?.invoice_number || '-',
                        patientName,
                        mrn: patientId,
                        mode,
                        date: dateStr,
                        time: timeStr,
                        amount: Number(p.amount),
                        cashier: cashierName,
                        cashierUsername: cashierUser,
                        counter: 'MAIN CASH COUNTER',
                        department: dept
                    });
                } else if (p.status === 'Reversed') {
                    itemsList.push({
                        srNo: sr++,
                        type: 'Refund',
                        receiptNo: p.receipt_number,
                        invoiceNo: p.invoice?.invoice_number || '-',
                        patientName,
                        mrn: patientId,
                        mode,
                        date: dateStr,
                        time: timeStr,
                        amount: Number(p.amount),
                        cashier: cashierName,
                        cashierUsername: cashierUser,
                        counter: 'MAIN CASH COUNTER',
                        department: dept
                    });
                }
            });

            // Process deposits collected (Advances)
            depositsList.forEach((d: any) => {
                const cashierUser = d.cashier_username || 'system';
                const cashierName = d.cashier_name || cashierUser;
                const patientName = d.patient_name || '-';
                const patientId = d.patient_id;
                const mode = canonicalTender(d.payment_method);
                allModesSet.add(mode);
                cashierList.add(cashierUser);

                const dt = new Date(d.created_at);
                const dateStr = dt.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
                const timeStr = dt.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });

                itemsList.push({
                    srNo: sr++,
                    type: 'Receipt',
                    receiptNo: d.deposit_number,
                    invoiceNo: '-',
                    patientName,
                    mrn: patientId,
                    mode,
                    date: dateStr,
                    time: timeStr,
                    amount: Number(d.amount),
                    cashier: cashierName,
                    cashierUsername: cashierUser,
                    counter: 'MAIN CASH COUNTER',
                    department: 'Advance'
                });

                // Deposit refunds live only as a running total on the deposit row
                // (refunded_amount) — mirror the PDF route's netting so a refunded
                // deposit doesn't still read as pure collection in the export.
                const refundedAmt = Number(d.refunded_amount || 0);
                if (refundedAmt > 0) {
                    itemsList.push({
                        srNo: sr++,
                        type: 'Refund',
                        receiptNo: d.deposit_number,
                        invoiceNo: '-',
                        patientName,
                        mrn: patientId,
                        mode,
                        date: dateStr,
                        time: timeStr,
                        amount: refundedAmt,
                        cashier: cashierName,
                        cashierUsername: cashierUser,
                        counter: 'MAIN CASH COUNTER',
                        department: 'Advance'
                    });
                }
            });

            // Process refunds table
            refundsList.forEach((r: any) => {
                const cashierUser = r.cashier_username || 'system';
                const cashierName = r.cashier_name || cashierUser;
                // Refund goes back through the original tender; only fall back to
                // Cash when the payment link couldn't be resolved (legacy data).
                const mode = r.payment_method ? canonicalTender(r.payment_method) : 'Cash';
                const patientName = r.patient_name || 'Refund Payout';
                const patientId = r.patient_id || '-';
                const dept = r.invoice_type ? getDept(r.invoice_type) : 'OP/ER';
                allModesSet.add(mode);
                cashierList.add(cashierUser);

                const dt = new Date(r.created_at);
                const dateStr = dt.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
                const timeStr = dt.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });

                itemsList.push({
                    srNo: sr++,
                    type: 'Refund',
                    receiptNo: `RF-${r.id}`,
                    invoiceNo: r.invoice_id ? String(r.invoice_id) : '-',
                    patientName,
                    mrn: patientId,
                    mode,
                    date: dateStr,
                    time: timeStr,
                    amount: Number(r.amount),
                    cashier: cashierName,
                    cashierUsername: cashierUser,
                    counter: 'MAIN CASH COUNTER',
                    department: dept
                });
            });

            if (allModesSet.size === 0) {
                allModesSet.add('Cash');
                allModesSet.add('UPI');
            }

            const modes = Array.from(allModesSet);

            function buildSummaryMatrix(filteredItems: any[]) {
                const receipts: Record<string, Record<string, number>> = {};
                const refunds: Record<string, Record<string, number>> = {};

                modes.forEach(m => {
                    receipts[m] = {};
                    refunds[m] = {};
                    depts.forEach(d => {
                        receipts[m][d] = 0;
                        refunds[m][d] = 0;
                    });
                });

                filteredItems.forEach(item => {
                    const target = item.type === 'Receipt' ? receipts : refunds;
                    if (target[item.mode] === undefined) {
                        target[item.mode] = {};
                        depts.forEach(d => { target[item.mode][d] = 0; });
                    }
                    target[item.mode][item.department] = (target[item.mode][item.department] || 0) + item.amount;
                });

                return { receipts, refunds };
            }

            const summaryRows: any[] = [];
            summaryRows.push({ 'Payment Mode': '1. SUMMARY', 'Advance': '', 'OP/ER': '', 'IPD': '', 'Walkin': '', 'Voucher': '', 'Total Collection': '' });
            summaryRows.push({});

            const summaryHeaders = ['Payment Mode', 'Advance', 'OP/ER', 'IPD', 'Walkin', 'Voucher', 'Total Collection'];
            summaryRows.push(summaryHeaders.reduce((acc, h) => ({ ...acc, [h]: h }), {}));

            function addMatrixRows(matrix: { receipts: Record<string, Record<string, number>>; refunds: Record<string, Record<string, number>> }, rowsArray: any[]) {
                modes.forEach(m => {
                    const row = matrix.receipts[m] || {};
                    let rowSum = 0;
                    depts.forEach(d => { rowSum += row[d] || 0; });
                    if (rowSum === 0) return;

                    const rowObj: any = { 'Payment Mode': `Receipt ${m}` };
                    depts.forEach(d => { rowObj[d] = row[d] || 0; });
                    rowObj['Total Collection'] = rowSum;
                    rowsArray.push(rowObj);
                });

                let totalReceiptSum = 0;
                const deptTotals: Record<string, number> = {};
                depts.forEach(d => { deptTotals[d] = 0; });
                modes.forEach(m => {
                    depts.forEach(d => {
                        const val = matrix.receipts[m]?.[d] || 0;
                        deptTotals[d] += val;
                        totalReceiptSum += val;
                    });
                });

                const totalReceiptObj: any = { 'Payment Mode': 'Total Receipt' };
                depts.forEach(d => { totalReceiptObj[d] = deptTotals[d]; });
                totalReceiptObj['Total Collection'] = totalReceiptSum;
                rowsArray.push(totalReceiptObj);

                modes.forEach(m => {
                    const row = matrix.refunds[m] || {};
                    let rowSum = 0;
                    depts.forEach(d => { rowSum += row[d] || 0; });
                    if (rowSum === 0) return;

                    const rowObj: any = { 'Payment Mode': `Refund/Payment ${m}` };
                    depts.forEach(d => { rowObj[d] = row[d] || 0; });
                    rowObj['Total Collection'] = rowSum;
                    rowsArray.push(rowObj);
                });

                let totalRefundSum = 0;
                const deptRefundTotals: Record<string, number> = {};
                depts.forEach(d => { deptRefundTotals[d] = 0; });
                modes.forEach(m => {
                    depts.forEach(d => {
                        const val = matrix.refunds[m]?.[d] || 0;
                        deptRefundTotals[d] += val;
                        totalRefundSum += val;
                    });
                });

                const totalRefundObj: any = { 'Payment Mode': 'Total Refund' };
                depts.forEach(d => { totalRefundObj[d] = deptRefundTotals[d]; });
                totalRefundObj['Total Collection'] = totalRefundSum;
                rowsArray.push(totalRefundObj);

                const netObj: any = { 'Payment Mode': 'Net Amount' };
                let overallNet = 0;
                depts.forEach(d => {
                    const netVal = deptTotals[d] - deptRefundTotals[d];
                    netObj[d] = netVal;
                    overallNet += netVal;
                });
                netObj['Total Collection'] = overallNet;
                rowsArray.push(netObj);
            }

            const overallMatrix = buildSummaryMatrix(itemsList);
            addMatrixRows(overallMatrix, summaryRows);

            // Add Mini Table Count helper
            summaryRows.push({});
            summaryRows.push({ 'Payment Mode': `No Of Receipt : ${itemsList.filter(i => i.type === 'Receipt').length}     No Of Refund : ${itemsList.filter(i => i.type === 'Refund').length}` });
            summaryRows.push({});

            // Mini summary matrix
            summaryRows.push({ 'Payment Mode': 'Type', 'Advance': 'Receipt', 'OP/ER': 'Refund', 'IPD': 'Total' });
            let totalReceiptSum = 0;
            let totalRefundSum = 0;
            modes.forEach(m => {
                let receiptSum = 0;
                let refundSum = 0;
                depts.forEach(d => {
                    receiptSum += overallMatrix.receipts[m]?.[d] || 0;
                    refundSum += overallMatrix.refunds[m]?.[d] || 0;
                });
                if (receiptSum === 0 && refundSum === 0) return;
                totalReceiptSum += receiptSum;
                totalRefundSum += refundSum;
                summaryRows.push({
                    'Payment Mode': m,
                    'Advance': receiptSum,
                    'OP/ER': refundSum,
                    'IPD': receiptSum - refundSum
                });
            });
            summaryRows.push({
                'Payment Mode': 'Net Total',
                'Advance': totalReceiptSum,
                'OP/ER': totalRefundSum,
                'IPD': totalReceiptSum - totalRefundSum
            });

            summaryRows.push({});
            summaryRows.push({});
            summaryRows.push({ 'Payment Mode': '2. CASHIER WISE SUMMARY' });
            summaryRows.push({});

            const cashiersSorted = Array.from(cashierList).sort();
            cashiersSorted.forEach(cUser => {
                const cItems = itemsList.filter(item => item.cashierUsername === cUser);
                if (cItems.length === 0) return;

                const sampleItem = cItems[0];
                const cashierName = sampleItem.cashier || cUser;

                summaryRows.push({ 'Payment Mode': `Cashier : ${cashierName.toUpperCase()} [${cUser}]` });
                summaryRows.push(summaryHeaders.reduce((acc, h) => ({ ...acc, [h]: h }), {}));

                const cMatrix = buildSummaryMatrix(cItems);
                addMatrixRows(cMatrix, summaryRows);

                // Add Cashier Mini Table
                summaryRows.push({});
                summaryRows.push({ 'Payment Mode': `No Of Receipt : ${cItems.filter(i => i.type === 'Receipt').length}     No Of Refund : ${cItems.filter(i => i.type === 'Refund').length}` });
                summaryRows.push({});
                summaryRows.push({ 'Payment Mode': 'Type', 'Advance': 'Receipt', 'OP/ER': 'Refund', 'IPD': 'Total' });
                let cTotalReceiptSum = 0;
                let cTotalRefundSum = 0;
                modes.forEach(m => {
                    let receiptSum = 0;
                    let refundSum = 0;
                    depts.forEach(d => {
                        receiptSum += cMatrix.receipts[m]?.[d] || 0;
                        refundSum += cMatrix.refunds[m]?.[d] || 0;
                    });
                    if (receiptSum === 0 && refundSum === 0) return;
                    cTotalReceiptSum += receiptSum;
                    cTotalRefundSum += refundSum;
                    summaryRows.push({
                        'Payment Mode': m,
                        'Advance': receiptSum,
                        'OP/ER': refundSum,
                        'IPD': receiptSum - refundSum
                    });
                });
                summaryRows.push({
                    'Payment Mode': 'Net Total',
                    'Advance': cTotalReceiptSum,
                    'OP/ER': cTotalRefundSum,
                    'IPD': cTotalReceiptSum - cTotalRefundSum
                });

                summaryRows.push({});
                summaryRows.push({});
            });

            const detailRows: any[] = [];

            depts.forEach(dept => {
                const deptItems = itemsList.filter(item => item.department === dept);
                if (deptItems.length === 0) return;

                let deptReceiptAmt = 0;
                let deptRefundAmt = 0;
                deptItems.forEach(item => {
                    if (item.type === 'Receipt') deptReceiptAmt += item.amount;
                    else deptRefundAmt += item.amount;
                });
                const deptNetAmt = deptReceiptAmt - deptRefundAmt;

                detailRows.push({ 'Sr. No.': `${dept.toUpperCase()} COLLECTION` });
                detailRows.push({
                    'Sr. No.': '',
                    'Receipt No.': `Receipt Amount: ${deptReceiptAmt.toFixed(2)}`,
                    'Invoice No.': `Refund Amount: ${deptRefundAmt.toFixed(2)}`,
                    'Patient Name': `Net Amount: ${deptNetAmt.toFixed(2)}`
                });

                const detailHeaders = ['Sr. No.', 'Receipt No.', 'Invoice No.', 'Patient Name', 'MRN (Patient ID)', 'Payment Mode', 'Date', 'Time', 'Receipt Amt', 'Refund Amt', 'Deleted Amt', 'Cashier', 'Counter'];
                detailRows.push(detailHeaders.reduce((acc, h) => ({ ...acc, [h]: h }), {}));

                deptItems.forEach((item, idx) => {
                    detailRows.push({
                        'Sr. No.': idx + 1,
                        'Receipt No.': item.receiptNo,
                        'Invoice No.': item.invoiceNo,
                        'Patient Name': item.patientName,
                        'MRN (Patient ID)': item.mrn,
                        'Payment Mode': item.mode,
                        'Date': item.date,
                        'Time': item.time,
                        'Receipt Amt': item.type === 'Receipt' ? item.amount : '-',
                        'Refund Amt': item.type === 'Refund' ? item.amount : '-',
                        'Deleted Amt': '-',
                        'Cashier': item.cashier,
                        'Counter': item.counter
                    });
                });

                detailRows.push({});
                detailRows.push({});
            });

            const wb = XLSX.utils.book_new();
            const wsSummary = XLSX.utils.json_to_sheet(summaryRows, { skipHeader: true });
            XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

            const wsDetails = XLSX.utils.json_to_sheet(detailRows, { skipHeader: true });
            XLSX.utils.book_append_sheet(wb, wsDetails, 'Payment Details');

            XLSX.writeFile(wb, `collections-detail-${from}-${to}.xlsx`);

        } catch (err) {
            console.error('Excel export failed:', err);
            alert('Export failed. Please try again.');
        } finally {
            setExcelExporting(false);
        }
    }

    return (
        <>
            {/* Payment Method Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3">
                <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Filter by method</span>
                <div className="flex gap-1.5">
                    {(['all', 'cash', 'upi', 'others'] as const).map(f => (
                        <button key={f}
                            onClick={() => { setQuickFilter(f); setMethodFilter('all'); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${
                                quickFilter === f && methodFilter === 'all'
                                    ? 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/30'
                                    : 'bg-gray-100 text-gray-500 border border-gray-200 hover:text-gray-800'
                             }`}>
                            {f === 'all' ? 'All' : f === 'others' ? 'All Others' : f.toUpperCase()}
                        </button>
                    ))}
                </div>
                <select
                    value={methodFilter}
                    onChange={e => { setMethodFilter(e.target.value); setQuickFilter('all'); }}
                    className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-500 focus:outline-none focus:border-emerald-500/50 ml-1">
                    <option value="all">Any Method</option>
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                    <option value="BankTransfer">Bank Transfer</option>
                    <option value="NEFT_RTGS">NEFT/RTGS</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Razorpay">Razorpay</option>
                </select>
                <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">View</span>
                    <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1">
                        {(['patient', 'payment'] as const).map((v) => (
                            <button key={v} onClick={() => setViewMode(v)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition ${viewMode === v ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:bg-white'}`}>
                                {v === 'patient' ? 'Patient-wise' : 'Payment-wise'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <SummaryCard label="Total Received (collection + advance)" value={fmt(receivedTotal)} color="emerald" />
                {methods.map(([method, amount]) => (
                    <SummaryCard key={method} label={methodLabel(method)} value={fmt(amount as number)} color="gray" />
                ))}
                {depositCollectedTotal > 0 && (
                    <SummaryCard label="Deposit Collected (advances received · already in total)" value={fmt(depositCollectedTotal)} color="gray" />
                )}
                {depositApplied > 0 && (
                    <SummaryCard label="Deposit Applied (earlier advances settled to bills · not added)" value={fmt(depositApplied)} color="gray" />
                )}
            </div>
            {methods.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <ReportChart type="doughnut" labels={methods.map(([m]) => methodLabel(m))} datasets={[{ label: 'Amount', data: methods.map(([, a]) => a as number) }]} height={300} />
                </div>
            )}
            {/* Advance deposits collected in this period, by real tender (Cash/UPI/Card). */}
            {depositModes.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-gray-900">Advance Deposits Collected</h3>
                        <span className="text-lg font-black text-gray-900">{fmt((depositsCollected.total as number) || 0)}</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-4">
                        Advance money received this period, by tender — <strong>already included</strong> in &ldquo;Total Received&rdquo; above. (Distinct from &ldquo;Deposit Applied&rdquo;, which is earlier advances being settled against bills.)
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {depositModes.map(([method, amount]) => (
                            <SummaryCard key={method} label={method} value={fmt(amount as number)} color="gray" />
                        ))}
                    </div>
                </div>
            )}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-900">
                            {viewMode === 'patient'
                                ? `Patient-wise Collections (${patientGroups.length} patient${patientGroups.length !== 1 ? 's' : ''})`
                                : `Payment Details (${hasColFilter ? `${filteredPayments.length} of ${allPayments.length}` : allPayments.length})`}
                        </h3>
                        {hasColFilter && (
                            <button onClick={clearColFilters} className="text-xs text-rose-500 hover:text-rose-700 font-medium underline">
                                Clear filters
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCollectionsExcelExport}
                            disabled={excelExporting || !allPayments || allPayments.length === 0}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {excelExporting ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Exporting...</>
                            ) : (
                                <><FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Export Excel</>
                            )}
                        </button>
                        <button
                            onClick={() => {
                                const methodVal = methodFilter !== 'all' ? methodFilter : quickFilter !== 'all' ? (quickFilter === 'cash' ? 'Cash' : quickFilter === 'upi' ? 'UPI' : 'others') : '';
                                window.open(`/api/reports/collections/pdf?from=${from}&to=${to}${methodVal ? `&method=${methodVal}` : ''}`, '_blank');
                            }}
                            disabled={!allPayments || allPayments.length === 0}
                            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <FileText className="h-4 w-4" /> Export PDF
                        </button>
                    </div>
                </div>

                {/* Shared filters — apply to both Patient-wise and Payment-wise views */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 px-6 py-3 bg-gray-50/60 border-b border-gray-100">
                    <input
                        type="text"
                        value={colPatient}
                        onChange={e => setColPatient(e.target.value)}
                        placeholder="Search patient…"
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white placeholder-gray-300"
                    />
                    <input
                        type="text"
                        value={colReceipt}
                        onChange={e => setColReceipt(e.target.value)}
                        placeholder="Search receipt…"
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white placeholder-gray-300"
                    />
                    <select
                        value={colColMethod}
                        onChange={e => setColColMethod(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white text-gray-600"
                    >
                        <option value="">All methods</option>
                        {uniquePaymentMethods.map((m: string) => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                    <input
                        type="number"
                        value={colAmountMin}
                        onChange={e => setColAmountMin(e.target.value)}
                        placeholder="Min ₹"
                        min={0}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white placeholder-gray-300 text-right"
                    />
                    <input
                        type="date"
                        value={colDate}
                        onChange={e => setColDate(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white text-gray-600"
                    />
                </div>

                {viewMode === 'patient' ? (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Patient</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">MRN</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Payments</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">First Collection</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Last Collection</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total Collected</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {patientGroups.length === 0 ? (
                                    <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">No payments match the current filters</td></tr>
                                ) : patientGroups.map((g) => {
                                    const isOpen = openPatientKey === g.key;
                                    return (
                                        <Fragment key={g.key}>
                                            <tr
                                                onClick={() => setOpenPatientKey(isOpen ? null : g.key)}
                                                title="Click to see all payments from this patient"
                                                className="hover:bg-emerald-50/60 cursor-pointer transition-colors">
                                                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                                                        {g.patientName}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500 font-mono">{g.patientId}</td>
                                                <td className="px-4 py-3 text-sm text-gray-700 text-right">{g.payments.length}</td>
                                                <td className="px-4 py-3 text-sm text-gray-500">{g.firstDate.toLocaleDateString('en-GB')}</td>
                                                <td className="px-4 py-3 text-sm text-gray-500">{g.lastDate.toLocaleDateString('en-GB')}</td>
                                                <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{fmt(g.total)}</td>
                                            </tr>
                                            {isOpen && (
                                                <tr className="bg-gray-50/60">
                                                    <td colSpan={6} className="px-6 py-4">
                                                        <table className="w-full">
                                                            <thead>
                                                                <tr className="text-left">
                                                                    <th className="px-3 py-1.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Date</th>
                                                                    <th className="px-3 py-1.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Receipt</th>
                                                                    <th className="px-3 py-1.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Invoice</th>
                                                                    <th className="px-3 py-1.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Method</th>
                                                                    <th className="px-3 py-1.5 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right">Amount</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {g.payments.map((p: any) => (
                                                                    <tr key={p.id}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (p._isDeposit) {
                                                                                const depositId = String(p.id).replace(/^dep-/, '');
                                                                                window.open(`/api/deposit/${depositId}/receipt`, '_blank');
                                                                            } else {
                                                                                window.open(`/api/payment/${p.id}/receipt`, '_blank');
                                                                            }
                                                                        }}
                                                                        title="Open receipt"
                                                                        className="hover:bg-white cursor-pointer transition-colors">
                                                                        <td className="px-3 py-2 text-xs text-gray-600">{new Date(p.created_at).toLocaleDateString('en-GB')}</td>
                                                                        <td className="px-3 py-2 text-xs font-mono text-emerald-700 hover:underline">{p.receipt_number}</td>
                                                                        <td className="px-3 py-2 text-xs text-gray-600">{p._isDeposit ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Advance</span> : (p.invoice?.invoice_number || '-')}</td>
                                                                        <td className="px-3 py-2 text-xs text-gray-600">{(() => {
                                                                            if (p._isDeposit) return `Advance · ${canonicalTender(p.payment_method)}`;
                                                                            if (!isDepositSettlement(p)) return canonicalTender(p.payment_method);
                                                                            const parts = [
                                                                                p.deposit_is_ipd != null ? (p.deposit_is_ipd ? 'IPD' : 'OPD') : null,
                                                                                p.deposit_tender ? canonicalTender(p.deposit_tender) : null,
                                                                            ].filter(Boolean);
                                                                            return parts.length ? `Deposit (${parts.join(' · ')})` : 'Deposit';
                                                                        })()}</td>
                                                                        <td className="px-3 py-2 text-xs font-semibold text-gray-900 text-right">{fmt(Number(p.amount))}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Receipt</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Patient</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Method</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredPayments.length === 0 ? (
                                    <tr><td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">No payments match the current filters</td></tr>
                                ) : filteredPayments.map((p: any) => (
                                    <tr key={p.id}
                                        onClick={() => {
                                            if (p._isDeposit) {
                                                const depositId = p.deposit_id || String(p.id).replace(/^dep-/, '');
                                                window.open(`/api/deposit/${depositId}/receipt`, '_blank');
                                            } else {
                                                window.open(`/api/payment/${p.id}/receipt`, '_blank');
                                            }
                                        }}
                                        title="Open receipt"
                                        className="hover:bg-emerald-50/60 cursor-pointer transition-colors">
                                        <td className="px-4 py-3 text-sm font-mono text-emerald-700 hover:underline">{p.receipt_number}</td>
                                        <td className="px-4 py-3 text-sm text-gray-900">{p.patient_name || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {p._isDeposit ? `Advance · ${canonicalTender(p.payment_method)}` : canonicalTender(p.payment_method)}
                                        </td>
                                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{fmt(Number(p.amount))}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500">{new Date(p.created_at).toLocaleDateString('en-GB')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}

// Daily Sale Voucher — combines getCollectionsReport (cash-side truth: what
// actually moved today, by tender) with getMISReport (bill-side truth: what
// was actually billed today, by the bill's own date) and lays them out as a
// Dr/Cr journal so the front-desk can copy the figures straight into Tally.
//   Dr <tender>       = received[tender] — real cash-counter tender payments
//                        against bills PLUS advance collected in that same
//                        tender (blended, matches how a single Tally line reads).
//                        A fresh/unbilled advance's cash lives here (it has no
//                        bill to apply against yet); see the Advance memo below
//                        for how much of this is that vs. a direct bill payment.
//   Dr Advance         = an applied deposit that was collected BEFORE this
//                        report's own date range, now recognized against a bill
//                        dated inside it (a non-cash reclassification — no money
//                        moved today, only the bookkeeping catches up). A deposit
//                        collected and applied within this same range is ordinary
//                        Cash → Sales instead (its cash is already in Dr <tender>
//                        above; see getMISReport for the exact rule).
//   Cr Sales           = misSales (getMISReport's total_net) — the bill's OWN
//                        date (OPD: invoice created_at, IPD: discharge date),
//                        NOT the date money was collected. Using payment date
//                        here would overstate Sales on any day a patient pays
//                        against a bill raised on a different date.
//   Dr/Cr Sundry Debtors = reconciling line for the gap between "billed today"
//                        and "collected today" — e.g. an IPD installment paid
//                        today against a bill dated on an earlier/later day.
//                        Dr Debtors: billed today, not fully collected today.
//                        Cr Debtors: collected today against an older bill.
// Dr and Cr always tie out by construction (the Debtors line is the balancing figure).
function DailySaleVoucherReport({ data, fmt, from, to }: { data: any; fmt: (n: number) => string; from: string; to: string }) {
    const EPS = 0.5;
    const received: Record<string, number> = data?.received || {};
    const debitTenders = Object.entries(received).filter(([, amt]) => Number(amt) !== 0);
    const receivedTotal = Number(data?.receivedTotal || 0);
    const misSalesAvailable = data?.misSales != null;
    const sales = Number(data?.misSales ?? data?.totals?.total ?? 0);

    // Genuinely earlier-period advance now consumed by a bill in this range —
    // the only case that needs a non-cash Dr Advance adjustment (computed in
    // getMISReport, which correctly joins each deposit to the bill it settled).
    const advanceDr = Number(data?.advanceDr || 0);
    // Structurally always 0 (see getMISReport) — kept for symmetry/future use.
    const advanceCr = Number(data?.advanceCr || 0);

    // Fresh advance collected this period, still unbilled — its cash is already
    // inside Dr <tender> above (server-side blending); this is a memo breakdown
    // only, not added again into the Debit total, so it doesn't double-count.
    const freshAdvance: { total: number; byTender: Record<string, number> } =
        data?.freshAdvance || { total: 0, byTender: {} };
    const freshAdvanceModes = Object.entries(freshAdvance.byTender || {}).filter(([, amt]) => Number(amt) > 0.5);

    const debitCore = receivedTotal + advanceDr;
    const creditCore = sales + advanceCr;
    const netDebtors = creditCore - debitCore;
    const drDebtors = netDebtors > EPS ? netDebtors : 0;
    const crDebtors = netDebtors < -EPS ? -netDebtors : 0;

    const totalDebit = debitCore + drDebtors;
    const totalCredit = creditCore + crDebtors;
    const balanced = Math.abs(totalDebit - totalCredit) < 1;

    return (
        <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div>
                        <h3 className="text-sm font-bold text-gray-900">Daily Sale Voucher — Journal Entry</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {from === to ? from : `${from} to ${to}`} · Ready to punch into Tally as a Sale/Journal voucher
                        </p>
                    </div>
                    {!balanced && (
                        <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                            Debit/Credit mismatch — check data
                        </span>
                    )}
                </div>

                {!misSalesAvailable && (
                    <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                        Couldn't load the bill-date Sales figure from the MIS report — showing the payment-date total instead,
                        which may overstate Sales on days with collections against older bills. The Dr Advance line is also
                        unavailable until this loads (it depends on the same report). Try regenerating.
                    </p>
                )}

                {debitTenders.length === 0 && sales === 0 && advanceDr === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">No collections recorded for this period.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                <th className="pb-2">Particulars</th>
                                <th className="pb-2 text-right">Debit</th>
                                <th className="pb-2 text-right">Credit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {debitTenders.map(([tender, amt]) => (
                                <tr key={tender}>
                                    <td className="py-2 font-bold text-gray-700">Dr&nbsp; {tender}</td>
                                    <td className="py-2 text-right font-mono">{fmt(Number(amt))}</td>
                                    <td className="py-2 text-right" />
                                </tr>
                            ))}
                            {advanceDr > 0 && (
                                <tr>
                                    <td className="py-2 font-bold text-gray-700">
                                        Dr&nbsp; Advance <span className="text-gray-400 font-normal">(advance collected in an earlier period, applied to a bill in this range)</span>
                                    </td>
                                    <td className="py-2 text-right font-mono">{fmt(advanceDr)}</td>
                                    <td className="py-2 text-right" />
                                </tr>
                            )}
                            <tr>
                                <td className="py-2 font-bold text-gray-700">
                                    Cr&nbsp; Sales <span className="text-gray-400 font-normal">(billed amount for the day)</span>
                                </td>
                                <td className="py-2 text-right" />
                                <td className="py-2 text-right font-mono">{fmt(sales)}</td>
                            </tr>
                            {advanceCr > 0 && (
                                <tr>
                                    <td className="py-2 font-bold text-gray-700">
                                        Cr&nbsp; Advance
                                    </td>
                                    <td className="py-2 text-right" />
                                    <td className="py-2 text-right font-mono">{fmt(advanceCr)}</td>
                                </tr>
                            )}
                            {drDebtors > 0 && (
                                <tr>
                                    <td className="py-2 font-bold text-gray-700">
                                        Dr&nbsp; Sundry Debtors <span className="text-gray-400 font-normal">(billed today, not yet fully collected)</span>
                                    </td>
                                    <td className="py-2 text-right font-mono">{fmt(drDebtors)}</td>
                                    <td className="py-2 text-right" />
                                </tr>
                            )}
                            {crDebtors > 0 && (
                                <tr>
                                    <td className="py-2 font-bold text-gray-700">
                                        Cr&nbsp; Sundry Debtors <span className="text-gray-400 font-normal">(today's collection against an earlier bill)</span>
                                    </td>
                                    <td className="py-2 text-right" />
                                    <td className="py-2 text-right font-mono">{fmt(crDebtors)}</td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-gray-300 font-black">
                                <td className="py-2">Total</td>
                                <td className="py-2 text-right font-mono">{fmt(totalDebit)}</td>
                                <td className="py-2 text-right font-mono">{fmt(totalCredit)}</td>
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>

            {freshAdvanceModes.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h4 className="text-xs font-bold text-gray-900 mb-1">Memo — Fresh Advance Collected, by Mode</h4>
                    <p className="text-[11px] text-gray-400 mb-3">
                        Money collected as advance this period, still unbilled (no bill to apply against yet) — already
                        folded into the Dr tender lines above (that's where the physical cash is), shown separately only
                        so you can see how much of today's Cash/UPI/Card is advance vs. a direct bill payment.
                        Don't add these again.
                    </p>
                    <table className="w-full text-sm">
                        <tbody className="divide-y divide-gray-100">
                            {freshAdvanceModes.map(([mode, amt]) => (
                                <tr key={mode}>
                                    <td className="py-1.5 text-gray-600">{mode}</td>
                                    <td className="py-1.5 text-right font-mono">{fmt(Number(amt))}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function DailyActivityReport({ data, fmt, from, to }: { data: any; fmt: (n: number) => string; from: string; to: string }) {
    const daily = data?.daily || [];
    const totals = data?.totals || { opd: 0, admissions: 0, discharges: 0, collections: 0 };
    const totalPatients = (totals.opd || 0) + (totals.admissions || 0);
    const fmtDay = (s: string) => { const [y, m, d] = (s || '').split('-'); return d ? `${d}/${m}/${y}` : s; };
    const [open, setOpen] = useState<string | null>(null);

    const NameList = ({ title, color, items, render }: { title: string; color: string; items: any[]; render: (i: any) => React.ReactNode }) => (
        <div className="flex-1 min-w-[180px]">
            <p className={`text-[10px] font-black uppercase tracking-wider mb-1.5 ${color}`}>{title} ({items.length})</p>
            {items.length === 0 ? (
                <p className="text-xs text-gray-400">—</p>
            ) : (
                <ul className="space-y-1">
                    {items.map((i, idx) => <li key={idx} className="text-xs text-gray-700">{render(i)}</li>)}
                </ul>
            )}
        </div>
    );

    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <SummaryCard label="Total Patients" value={String(totalPatients)} color="emerald" />
                <SummaryCard label="OPD Visits" value={String(totals.opd)} color="gray" />
                <SummaryCard label="IPD Admissions" value={String(totals.admissions)} color="gray" />
                <SummaryCard label="IPD Discharges" value={String(totals.discharges)} color="gray" />
                <SummaryCard label="Total Collections" value={fmt(totals.collections)} color="gray" />
            </div>
            <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3">
                <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Patient lists ({fmtDay(from)} – {fmtDay(to)})</span>
                {[
                    { key: 'ipd', label: 'IPD Patients' },
                    { key: 'opd', label: 'OPD Patients' },
                ].map(r => (
                    <button key={r.key}
                        onClick={() => window.open(`/api/reports/reception/${r.key}?from=${from}&to=${to}`, '_blank')}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200 hover:bg-emerald-50 hover:text-emerald-700 transition flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" /> {r.label}
                    </button>
                ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Day-wise Activity ({daily.length} day{daily.length !== 1 ? 's' : ''})</h3>
                    <ExportButton
                        data={daily.map((d: any) => ({ date: fmtDay(d.date), opd: d.opd, admissions: d.admissions, discharges: d.discharges, total: (d.opd || 0) + (d.admissions || 0), collections: d.collections }))}
                        filename={`daily-activity-${from}-${to}`}
                        columns={[
                            { key: 'date', label: 'Date' }, { key: 'opd', label: 'OPD Visits' },
                            { key: 'admissions', label: 'Admissions' }, { key: 'discharges', label: 'Discharges' },
                            { key: 'total', label: 'Total Patients' }, { key: 'collections', label: 'Collections' },
                        ]}
                    />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead><tr className="bg-gray-50">
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">OPD Visits</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Admissions</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Discharges</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total Patients</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Collections</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-100">
                            {daily.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">No activity in this date range</td></tr>
                            ) : daily.map((d: any) => {
                                const isOpen = open === d.date;
                                const dayTotal = (d.opd || 0) + (d.admissions || 0);
                                return (
                                    <Fragment key={d.date}>
                                        <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(isOpen ? null : d.date)} title="Click to see patient names">
                                            <td className="px-6 py-3 text-sm font-medium text-gray-800">
                                                <span className="inline-flex items-center gap-1.5">
                                                    {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                                                    {fmtDay(d.date)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-sm text-gray-700 text-right">{d.opd}</td>
                                            <td className="px-6 py-3 text-sm text-emerald-700 font-semibold text-right">{d.admissions}</td>
                                            <td className="px-6 py-3 text-sm text-rose-600 font-semibold text-right">{d.discharges}</td>
                                            <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right">{dayTotal}</td>
                                            <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right">{fmt(d.collections)}</td>
                                        </tr>
                                        {isOpen && (
                                            <tr className="bg-gray-50/60">
                                                <td colSpan={6} className="px-6 py-4">
                                                    <div className="flex flex-wrap gap-6">
                                                        <NameList title="OPD Visits" color="text-gray-500" items={d.opdList || []}
                                                            render={(i) => <span>{i.name}{i.ref ? <span className="text-gray-400 font-mono"> · {i.ref}</span> : null}</span>} />
                                                        <NameList title="Admissions" color="text-emerald-700" items={d.admitList || []}
                                                            render={(i) => <span>{i.name} <span className="text-gray-400 font-mono">({i.patient_id})</span></span>} />
                                                        <NameList title="Discharges" color="text-rose-600" items={d.dischargeList || []}
                                                            render={(i) => <span>{i.name} <span className="text-gray-400 font-mono">({i.patient_id})</span></span>} />
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

function AgingReport({ data, fmt }: { data: any; fmt: (n: number) => string }) {
    const summary = data.summary || { '0-30': 0, '30-60': 0, '60+': 0 };
    const totalOutstanding = Object.values(summary).reduce((s: number, v: any) => s + v, 0) as number;
    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <SummaryCard label="0-30 Days" value={fmt(summary['0-30'] || 0)} color="emerald" />
                <SummaryCard label="30-60 Days" value={fmt(summary['30-60'] || 0)} color="amber" />
                <SummaryCard label="60+ Days" value={fmt(summary['60+'] || 0)} color="red" />
                <SummaryCard label="Total Outstanding" value={fmt(totalOutstanding)} color="gray" />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
                <ReportChart type="bar" labels={['0-30 Days', '30-60 Days', '60+ Days']}
                    datasets={[{ label: 'Outstanding', data: [summary['0-30'] || 0, summary['30-60'] || 0, summary['60+'] || 0] }]} height={250} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Outstanding Invoices ({(data.invoices || []).length})</h3>
                    <ExportButton data={(data.invoices || []).map((inv: any) => ({
                        invoice: inv.invoice_number, patient: inv.patient?.full_name, phone: inv.patient?.phone,
                        balance: Number(inv.balance_due), days: inv.days_overdue, bucket: inv.aging_bucket,
                    }))} filename="ar-aging" columns={[
                        { key: 'invoice', label: 'Invoice' }, { key: 'patient', label: 'Patient' },
                        { key: 'phone', label: 'Phone' }, { key: 'balance', label: 'Balance Due' },
                        { key: 'days', label: 'Days Overdue' }, { key: 'bucket', label: 'Bucket' },
                    ]} />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead><tr className="bg-gray-50">
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Invoice</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Patient</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Balance</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Days</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Bucket</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-100">
                            {(data.invoices || []).map((inv: any) => {
                                const bucketColor = inv.aging_bucket === '60+' ? 'bg-red-50 text-red-700' : inv.aging_bucket === '30-60' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700';
                                return (
                                    <tr key={inv.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-3 text-sm font-mono text-gray-600">{inv.invoice_number || 'Draft (unsaved)'}</td>
                                        <td className="px-6 py-3 text-sm text-gray-900">{inv.patient?.full_name || '-'}</td>
                                        <td className="px-6 py-3 text-sm font-semibold text-gray-900 text-right">{fmt(Number(inv.balance_due))}</td>
                                        <td className="px-6 py-3 text-sm text-gray-600 text-right">{inv.days_overdue}d</td>
                                        <td className="px-6 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${bucketColor}`}>{inv.aging_bucket}</span></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

function CashFlowReport({ data, fmt, from, to }: { data: any; fmt: (n: number) => string; from: string; to: string }) {
    const daily = data?.daily || [];
    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryCard label="Total Inflow" value={fmt(data?.totalInflow || 0)} color="emerald" />
                <SummaryCard label="Total Outflow" value={fmt(data?.totalOutflow || 0)} color="red" />
                <SummaryCard label="Net Cash Flow" value={fmt(data?.netFlow || 0)} color={(data?.netFlow || 0) >= 0 ? 'emerald' : 'red'} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Daily Cash Flow</h3>
                {daily.length > 0 ? (
                    <ReportChart type="bar"
                        labels={daily.map((d: any) => new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }))}
                        datasets={[
                            { label: 'Inflow', data: daily.map((d: any) => d.inflow) },
                            { label: 'Outflow', data: daily.map((d: any) => d.outflow) },
                        ]} height={300} />
                ) : <div className="text-center py-12 text-gray-400">No cash flow data</div>}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Daily Breakdown</h3>
                    <ExportButton data={daily} filename={`cashflow-${from}-${to}`}
                        columns={[{ key: 'date', label: 'Date' }, { key: 'inflow', label: 'Inflow' }, { key: 'outflow', label: 'Outflow' }, { key: 'net', label: 'Net' }]} />
                </div>
                <table className="w-full">
                    <thead><tr className="bg-gray-50">
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">Date</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-emerald-600">Inflow</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-red-600">Outflow</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">Net</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                        {daily.map((d: any) => (
                            <tr key={d.date} className="hover:bg-gray-50">
                                <td className="px-6 py-3 text-sm text-gray-700">{new Date(d.date).toLocaleDateString('en-GB')}</td>
                                <td className="px-6 py-3 text-sm text-emerald-600 text-right font-medium">{fmt(d.inflow)}</td>
                                <td className="px-6 py-3 text-sm text-red-600 text-right font-medium">{fmt(d.outflow)}</td>
                                <td className={`px-6 py-3 text-sm text-right font-semibold ${d.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(d.net)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

function ProfitLossReport({ data, fmt, from, to }: { data: any; fmt: (n: number) => string; from: string; to: string }) {
    const income = data?.income || [];
    const expenses = data?.expenses || [];

    // Drill-down state: which row is expanded + its loaded breakdown
    const [openKey, setOpenKey] = useState<string | null>(null);
    const [drillData, setDrillData] = useState<any | null>(null);
    const [drillLoading, setDrillLoading] = useState(false);
    // Voucher drill-down: invoice whose accounting voucher is open (null = closed).
    // Held at this level so the modal renders outside the drill-down tables.
    const [voucherInvoiceId, setVoucherInvoiceId] = useState<number | null>(null);

    async function toggleIncome(department: string) {
        const key = `inc:${department}`;
        if (openKey === key) { setOpenKey(null); setDrillData(null); return; }
        setOpenKey(key); setDrillData(null); setDrillLoading(true);
        const res = await getPnLIncomeBreakdown({ department, from, to });
        if (res.success) setDrillData({ type: 'income', ...res.data });
        setDrillLoading(false);
    }

    async function toggleExpense(categoryLabel: string) {
        const key = `exp:${categoryLabel}`;
        if (openKey === key) { setOpenKey(null); setDrillData(null); return; }
        setOpenKey(key); setDrillData(null); setDrillLoading(true);
        const res = await getPnLExpenseBreakdown({ categoryLabel, from, to });
        if (res.success) setDrillData({ type: 'expense', ...res.data });
        setDrillLoading(false);
    }

    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryCard label="Total Income" value={fmt(data?.totalIncome || 0)} color="emerald" />
                <SummaryCard label="Total Expenses" value={fmt(data?.totalExpenses || 0)} color="red" />
                <SummaryCard label="Net Profit" value={fmt(data?.netProfit || 0)} color={(data?.netProfit || 0) >= 0 ? 'emerald' : 'red'} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-4">Income by Department</h3>
                    {income.length > 0 ? (
                        <ReportChart type="bar" labels={income.map((i: any) => i.label)} datasets={[{ label: 'Income', data: income.map((i: any) => i.amount) }]} height={250} />
                    ) : <div className="text-center py-12 text-gray-400">No income data</div>}
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-4">Expenses by Category</h3>
                    {expenses.length > 0 ? (
                        <ReportChart type="doughnut" labels={expenses.map((e: any) => e.label)} datasets={[{ label: 'Expenses', data: expenses.map((e: any) => e.amount) }]} height={250} />
                    ) : <div className="text-center py-12 text-gray-400">No expense data</div>}
                </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">P&L Statement <span className="text-xs font-normal text-gray-400 ml-2">(click any row for breakdown)</span></h3>
                    <ExportButton data={[
                        ...income.map((i: any) => ({ type: 'Income', label: i.label, amount: i.amount })),
                        ...expenses.map((e: any) => ({ type: 'Expense', label: e.label, amount: e.amount })),
                        { type: 'Net Profit', label: '', amount: data?.netProfit || 0 },
                    ]} filename={`pnl-${from}-${to}`} columns={[
                        { key: 'type', label: 'Type' }, { key: 'label', label: 'Category' }, { key: 'amount', label: 'Amount' },
                    ]} />
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <h4 className="text-xs font-bold text-emerald-600 uppercase mb-2">Income</h4>
                        {income.map((i: any) => {
                            const key = `inc:${i.label}`;
                            const open = openKey === key;
                            return (
                                <div key={i.label}>
                                    <button
                                        type="button"
                                        onClick={() => toggleIncome(i.label)}
                                        className={`w-full flex justify-between py-1.5 text-sm hover:bg-emerald-50 px-2 -mx-2 rounded transition ${open ? 'bg-emerald-50' : ''}`}
                                    >
                                        <span className="text-gray-700 flex items-center gap-2">
                                            <span className="text-emerald-500 text-xs">{open ? '▼' : '▶'}</span>
                                            {i.label}
                                        </span>
                                        <span className="font-medium text-gray-900">{fmt(i.amount)}</span>
                                    </button>
                                    {open && (
                                        <DrillPanel loading={drillLoading} data={drillData} fmt={fmt} kind="income" onViewVoucher={setVoucherInvoiceId} />
                                    )}
                                </div>
                            );
                        })}
                        <div className="flex justify-between py-2 text-sm font-bold border-t border-gray-200 mt-2">
                            <span>Total Income</span><span className="text-emerald-600">{fmt(data?.totalIncome || 0)}</span>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-red-600 uppercase mb-2">Expenses</h4>
                        {expenses.map((e: any) => {
                            const key = `exp:${e.label}`;
                            const open = openKey === key;
                            return (
                                <div key={e.label}>
                                    <button
                                        type="button"
                                        onClick={() => toggleExpense(e.label)}
                                        className={`w-full flex justify-between py-1.5 text-sm hover:bg-red-50 px-2 -mx-2 rounded transition ${open ? 'bg-red-50' : ''}`}
                                    >
                                        <span className="text-gray-700 flex items-center gap-2">
                                            <span className="text-red-500 text-xs">{open ? '▼' : '▶'}</span>
                                            {e.label}
                                        </span>
                                        <span className="font-medium text-gray-900">{fmt(e.amount)}</span>
                                    </button>
                                    {open && (
                                        <DrillPanel loading={drillLoading} data={drillData} fmt={fmt} kind="expense" />
                                    )}
                                </div>
                            );
                        })}
                        <div className="flex justify-between py-2 text-sm font-bold border-t border-gray-200 mt-2">
                            <span>Total Expenses</span><span className="text-red-600">{fmt(data?.totalExpenses || 0)}</span>
                        </div>
                    </div>
                    <div className={`flex justify-between py-3 text-lg font-bold border-t-2 border-gray-900 ${(data?.netProfit || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        <span className="text-gray-900">Net Profit / (Loss)</span>
                        <span>{fmt(data?.netProfit || 0)}</span>
                    </div>
                </div>
            </div>

            {voucherInvoiceId != null && (
                <VoucherModal invoiceId={voucherInvoiceId} onClose={() => setVoucherInvoiceId(null)} />
            )}
        </>
    );
}

// ─── Balance Sheet (two presentation formats over the same GL data) ─────────
function BalanceSheetReport({ data, fmt, asOf, format }: { data: any; fmt: (n: number) => string; asOf: string; format: 'normal' | 'schedule3' }) {
    if (format === 'schedule3') return <ScheduleIIIBalanceSheet data={data} fmt={fmt} asOf={asOf} />;
    return <NormalBalanceSheet data={data} fmt={fmt} asOf={asOf} />;
}

function BalanceRow({ label, value, fmt, bold, indent = 0 }: { label: string; value: number; fmt: (n: number) => string; bold?: boolean; indent?: number }) {
    return (
        <div className={`flex justify-between py-1.5 text-sm ${bold ? 'font-bold' : 'text-gray-700'}`} style={{ paddingLeft: indent * 16 }}>
            <span>{label}</span><span className={bold ? '' : 'font-medium text-gray-900'}>{fmt(value)}</span>
        </div>
    );
}

function NormalBalanceSheet({ data, fmt, asOf }: { data: any; fmt: (n: number) => string; asOf: string }) {
    const bs = data?.balance_sheet;
    if (!bs) return <div className="text-center py-24 text-gray-400">No balance sheet data</div>;
    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Balance Sheet <span className="text-xs font-normal text-gray-400 ml-2">as at {new Date(asOf).toLocaleDateString('en-GB')}</span></h3>
            </div>
            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <h4 className="text-xs font-bold text-emerald-600 uppercase mb-2">Assets</h4>
                    {bs.assets.map((a: any) => <BalanceRow key={a.id} label={a.account_name} value={a.balance} fmt={fmt} />)}
                    <div className="flex justify-between py-2 text-sm font-bold border-t-2 border-gray-900 mt-2">
                        <span>Total Assets</span><span>{fmt(bs.total_assets)}</span>
                    </div>
                </div>
                <div>
                    <h4 className="text-xs font-bold text-red-600 uppercase mb-2">Liabilities</h4>
                    {bs.liabilities.map((a: any) => <BalanceRow key={a.id} label={a.account_name} value={Math.abs(a.balance)} fmt={fmt} />)}
                    <div className="flex justify-between py-2 text-sm font-bold border-t border-gray-200 mt-2">
                        <span>Total Liabilities</span><span>{fmt(bs.total_liabilities)}</span>
                    </div>
                    <h4 className="text-xs font-bold text-blue-600 uppercase mb-2 mt-5">Equity</h4>
                    {bs.equity.map((a: any) => <BalanceRow key={a.id} label={a.account_name} value={a.balance} fmt={fmt} />)}
                    <div className="flex justify-between py-2 text-sm font-bold border-t border-gray-200 mt-2">
                        <span>Total Equity</span><span>{fmt(bs.total_equity)}</span>
                    </div>
                    <div className="flex justify-between py-2 text-sm font-bold border-t-2 border-gray-900 mt-2">
                        <span>Total Liabilities + Equity</span><span>{fmt(bs.total_liabilities + bs.total_equity)}</span>
                    </div>
                </div>
            </div>
            {!bs.equation_balanced && (
                <div className="mx-6 mb-6 px-4 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold">
                    Assets does not equal Liabilities + Equity — check for unposted journal entries.
                </div>
            )}
        </div>
    );
}

// Schedule III (Division I) layout — Roman-numeral sections, lettered line
// items, matching the format of a signed Companies Act 2013 financial
// statement. Each lettered total is an aggregation of many GL accounts
// (per app/actions/gl-actions.ts::getScheduleIIIBalanceSheet) — click to see
// which accounts make it up.
function Sch3Line({ label, letter, bucket, fmt }: { label: string; letter: string; bucket: { total: number; items: any[] }; fmt: (n: number) => string }) {
    const [open, setOpen] = useState(false);
    if (!bucket || bucket.items.length === 0) return null;
    return (
        <div>
            <button type="button" onClick={() => setOpen((o) => !o)}
                className="w-full flex justify-between py-1 text-sm hover:bg-gray-50 px-2 -mx-2 rounded transition">
                <span className="text-gray-700 flex gap-1.5">
                    <span className="text-gray-400 text-xs mt-0.5">{open ? '▼' : '▶'}</span>
                    <span className="text-gray-400">({letter})</span> {label}
                </span>
                <span className="font-medium text-gray-900">{fmt(bucket.total)}</span>
            </button>
            {open && (
                <div className="ml-8 mb-1 border-l-2 border-gray-100 pl-3">
                    {bucket.items.map((it: any) => (
                        <div key={it.id} className="flex justify-between py-0.5 text-xs text-gray-500">
                            <span>{it.name}</span><span>{fmt(it.balance)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Sch3Section({ number, title, children, total, fmt }: { number: string; title: string; children: React.ReactNode; total: number; fmt: (n: number) => string }) {
    return (
        <div className="mb-3">
            <div className="text-xs font-bold text-gray-500 mb-1">{number} {title}</div>
            {children}
            <div className="flex justify-between py-1 text-sm font-bold border-t border-gray-200 mt-1">
                <span></span><span>{fmt(total)}</span>
            </div>
        </div>
    );
}

function ScheduleIIIBalanceSheet({ data, fmt, asOf }: { data: any; fmt: (n: number) => string; asOf: string }) {
    const el = data?.equity_and_liabilities;
    const as = data?.assets;
    if (!el || !as) return <div className="text-center py-24 text-gray-400">No balance sheet data</div>;
    const sf = el.shareholders_funds, ncl = el.non_current_liabilities, cl = el.current_liabilities;
    const nca = as.non_current_assets, ca = as.current_assets;
    const anyUnclassified = (sf.unclassified?.items.length || 0) + (cl.unclassified?.items.length || 0) + (as.non_current_assets ? 0 : 0)
        + (as.current_assets?.unclassified?.items.length || 0);

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 text-center">
                <h3 className="font-semibold text-gray-900">Balance Sheet — Schedule III to the Companies Act, 2013</h3>
                <p className="text-xs text-gray-400 mt-0.5">As at {new Date(asOf).toLocaleDateString('en-GB')}</p>
            </div>
            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <h4 className="text-xs font-bold text-gray-700 uppercase mb-2">I. Equity and Liabilities</h4>
                    <Sch3Section number="1" title="Shareholders' Funds" total={sf.total} fmt={fmt}>
                        <Sch3Line letter="a" label="Share Capital" bucket={sf.share_capital} fmt={fmt} />
                        <Sch3Line letter="b" label="Reserves and Surplus" bucket={sf.reserves_and_surplus} fmt={fmt} />
                        <Sch3Line letter="?" label="Unclassified equity — needs review" bucket={sf.unclassified} fmt={fmt} />
                    </Sch3Section>
                    <Sch3Section number="2" title="Non-Current Liabilities" total={ncl.total} fmt={fmt}>
                        <Sch3Line letter="a" label="Long-term borrowings" bucket={ncl.long_term_borrowings} fmt={fmt} />
                        <Sch3Line letter="b" label="Other long-term liabilities" bucket={ncl.other} fmt={fmt} />
                    </Sch3Section>
                    <Sch3Section number="3" title="Current Liabilities" total={cl.total} fmt={fmt}>
                        <Sch3Line letter="a" label="Trade payables" bucket={cl.trade_payables} fmt={fmt} />
                        <Sch3Line letter="b" label="Other current liabilities" bucket={cl.other} fmt={fmt} />
                        <Sch3Line letter="c" label="Short-term provisions" bucket={cl.short_term_provisions} fmt={fmt} />
                        <Sch3Line letter="?" label="Unclassified — needs review" bucket={cl.unclassified} fmt={fmt} />
                    </Sch3Section>
                    <div className="flex justify-between py-2 text-sm font-bold border-t-2 border-gray-900 mt-2">
                        <span>TOTAL</span><span>{fmt(el.total)}</span>
                    </div>
                </div>
                <div>
                    <h4 className="text-xs font-bold text-gray-700 uppercase mb-2">II. Assets</h4>
                    <Sch3Section number="1" title="Non-Current Assets" total={nca.total} fmt={fmt}>
                        <Sch3Line letter="a" label="Property, Plant and Equipment" bucket={nca.ppe} fmt={fmt} />
                        <Sch3Line letter="b" label="Non-current investments" bucket={nca.investments} fmt={fmt} />
                        <Sch3Line letter="c" label="Other non-current assets" bucket={nca.other} fmt={fmt} />
                    </Sch3Section>
                    <Sch3Section number="2" title="Current Assets" total={ca.total} fmt={fmt}>
                        <Sch3Line letter="a" label="Inventories" bucket={ca.inventories} fmt={fmt} />
                        <Sch3Line letter="b" label="Trade receivables" bucket={ca.trade_receivables} fmt={fmt} />
                        <Sch3Line letter="c" label="Cash and cash equivalents" bucket={ca.cash_and_bank} fmt={fmt} />
                        <Sch3Line letter="d" label="Short-term loans and advances" bucket={ca.loans_and_advances} fmt={fmt} />
                        <Sch3Line letter="e" label="Other current assets" bucket={ca.other} fmt={fmt} />
                        <Sch3Line letter="?" label="Unclassified — needs review" bucket={ca.unclassified} fmt={fmt} />
                    </Sch3Section>
                    <div className="flex justify-between py-2 text-sm font-bold border-t-2 border-gray-900 mt-2">
                        <span>TOTAL</span><span>{fmt(as.total)}</span>
                    </div>
                </div>
            </div>
            {!data.equation_balanced && (
                <div className="mx-6 mb-4 px-4 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold">
                    Total Equity &amp; Liabilities does not equal Total Assets — check for unposted journal entries.
                </div>
            )}
            {anyUnclassified > 0 && (
                <div className="mx-6 mb-6 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs">
                    Some accounts couldn't be classified from their chart-of-accounts group and are listed under
                    &quot;Unclassified — needs review&quot; above. Fix their <code>account_group</code> in Chart of Accounts to place them correctly.
                </div>
            )}
        </div>
    );
}

function InvoiceItemsInline({ invoiceId, fmt }: { invoiceId: number; fmt: (n: number) => string }) {
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<any[]>([]);
    const [err, setErr] = useState('');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getInvoiceItemsBrief(invoiceId).then((res) => {
            if (cancelled) return;
            if (res.success) setItems(res.data || []);
            else setErr((res as any).error || 'Failed to load items');
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [invoiceId]);

    if (loading) return (
        <div className="px-4 py-3 bg-emerald-50/50 text-xs text-gray-500 flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading invoice line items...
        </div>
    );
    if (err) return <div className="px-4 py-3 bg-rose-50 text-xs text-rose-700">{err}</div>;
    if (items.length === 0) return <div className="px-4 py-3 bg-emerald-50/50 text-xs text-gray-400">No line items on this invoice.</div>;

    const subtotal = items.reduce((s, it) => s + Number(it.net_price) + Number(it.tax_amount || 0), 0);

    return (
        <div className="bg-emerald-50/40 border-l-4 border-emerald-300 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-2">Invoice line items</p>
            <table className="w-full text-[11px]">
                <thead>
                    <tr className="text-gray-500">
                        <th className="text-left py-1 font-semibold">Description</th>
                        <th className="text-left py-1 font-semibold">Dept / Category</th>
                        <th className="text-right py-1 font-semibold">Qty</th>
                        <th className="text-right py-1 font-semibold">Unit ₹</th>
                        <th className="text-right py-1 font-semibold">GST%</th>
                        <th className="text-right py-1 font-semibold">Net</th>
                        <th className="text-right py-1 font-semibold">Total</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100/70">
                    {items.map((it) => (
                        <tr key={it.id}>
                            <td className="py-1 text-gray-800">{it.description}</td>
                            <td className="py-1 text-gray-500">{it.department}{it.service_category && it.service_category !== it.department ? ` · ${it.service_category}` : ''}</td>
                            <td className="py-1 text-right text-gray-700">{it.quantity}</td>
                            <td className="py-1 text-right text-gray-700">{fmt(it.unit_price)}</td>
                            <td className="py-1 text-right text-gray-500">{it.tax_rate}%</td>
                            <td className="py-1 text-right text-gray-700">{fmt(it.net_price)}</td>
                            <td className="py-1 text-right font-semibold text-gray-900">{fmt(it.net_price + it.tax_amount)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="border-t-2 border-emerald-300">
                        <td colSpan={6} className="py-1.5 text-right font-bold text-emerald-800">Invoice total (incl. GST)</td>
                        <td className="py-1.5 text-right font-bold text-emerald-900">{fmt(subtotal)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}

function IncomeRow({ r, fmt, onViewVoucher }: { r: any; fmt: (n: number) => string; onViewVoucher?: (id: number) => void }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <tr className="hover:bg-white">
                <td className="px-2 py-2 align-top">
                    {r.invoice_id ? (
                        <button
                            type="button"
                            onClick={() => setOpen(!open)}
                            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold w-5"
                            title={open ? 'Hide items' : 'Show line items'}
                        >
                            {open ? '▼' : '▶'}
                        </button>
                    ) : null}
                </td>
                <td className="px-3 py-2 text-gray-500">{new Date(r.date).toLocaleDateString('en-GB')}</td>
                <td className="px-3 py-2 text-gray-900">{r.patient_name}</td>
                <td className="px-3 py-2 font-mono text-gray-600">
                    {r.invoice_id ? (
                        <div className="flex flex-col items-start gap-0.5">
                            <Link
                                href={`/finance/invoices/${r.invoice_id}`}
                                className="text-emerald-700 hover:text-emerald-900 hover:underline font-semibold"
                                title="Open full invoice page"
                            >
                                {r.invoice_number || 'Draft (unsaved)'} ↗
                            </Link>
                            <button
                                type="button"
                                onClick={() => onViewVoucher?.(r.invoice_id)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 hover:text-sky-900"
                                title="View accounting voucher"
                            >
                                <BookOpenCheck className="h-3 w-3" /> Voucher
                            </button>
                        </div>
                    ) : (
                        r.invoice_number || 'Draft (unsaved)'
                    )}
                </td>
                <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.invoice_type === 'IPD' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                        {r.invoice_type}
                    </span>
                </td>
                <td className="px-3 py-2 text-gray-700">{r.description}</td>
                <td className="px-3 py-2 text-right text-gray-600">{r.quantity}</td>
                <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(r.net_price + r.tax_amount)}</td>
            </tr>
            {open && r.invoice_id && (
                <tr>
                    <td colSpan={8} className="p-0">
                        <InvoiceItemsInline invoiceId={r.invoice_id} fmt={fmt} />
                    </td>
                </tr>
            )}
        </>
    );
}

function DrillPanel({ loading, data, fmt, kind, onViewVoucher }: { loading: boolean; data: any; fmt: (n: number) => string; kind: 'income' | 'expense'; onViewVoucher?: (id: number) => void }) {
    if (loading) {
        return (
            <div className="my-2 ml-6 mr-2 py-4 px-3 bg-gray-50 rounded-lg flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading breakdown...
            </div>
        );
    }
    if (!data || (kind === 'income' && data.type !== 'income') || (kind === 'expense' && data.type !== 'expense')) {
        return null;
    }
    const rows = data.rows || [];
    if (rows.length === 0) {
        return (
            <div className="my-2 ml-6 mr-2 py-4 px-3 bg-gray-50 rounded-lg text-xs text-gray-400 text-center">
                No detailed entries found.
            </div>
        );
    }
    return (
        <div className="my-2 ml-6 mr-2 bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead className="bg-white border-b border-gray-200">
                        {kind === 'income' ? (
                            <tr>
                                <th className="px-2 py-2 w-8 text-left font-semibold text-gray-400" title="Click ▶ to expand items"></th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Date</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Patient</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Invoice</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Type</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Description</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-500">Qty</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-500">Amount</th>
                            </tr>
                        ) : (
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Date</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Voucher #</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Vendor</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Description</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Method</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Status</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-500">Amount</th>
                            </tr>
                        )}
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {kind === 'income'
                            ? rows.map((r: any) => <IncomeRow key={r.id} r={r} fmt={fmt} onViewVoucher={onViewVoucher} />)
                            : rows.map((r: any) => (
                                <tr key={r.id} className="hover:bg-white">
                                    <td className="px-3 py-2 text-gray-500">{new Date(r.date).toLocaleDateString('en-GB')}</td>
                                    <td className="px-3 py-2 font-mono text-gray-600">{r.expense_number}</td>
                                    <td className="px-3 py-2 text-gray-900">{r.vendor}</td>
                                    <td className="px-3 py-2 text-gray-700">{r.description}</td>
                                    <td className="px-3 py-2 text-gray-600">{r.payment_method || '-'}</td>
                                    <td className="px-3 py-2">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {r.status}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(r.amount)}</td>
                                </tr>
                            ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-white border-t border-gray-200">
                            <td colSpan={kind === 'income' ? 7 : 6} className="px-3 py-2 text-right font-bold text-gray-600">Subtotal</td>
                            <td className="px-3 py-2 text-right font-bold text-gray-900">{fmt(data.total || 0)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}

function InsuranceReport({ data, fmt, from, to }: { data: any; fmt: (n: number) => string; from: string; to: string }) {
    const summary = data?.summary || {};
    const claims = data?.claims || [];
    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <SummaryCard label="Total Claims" value={String(summary.totalClaims || 0)} color="gray" />
                <SummaryCard label="Claimed" value={fmt(summary.totalClaimed || 0)} color="blue" />
                <SummaryCard label="Approved" value={fmt(summary.totalApproved || 0)} color="emerald" />
                <SummaryCard label="Rejected" value={fmt(summary.totalRejected || 0)} color="red" />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
                <ReportChart type="bar" labels={['Submitted', 'Approved', 'Settled', 'Rejected']}
                    datasets={[{ label: 'Claims', data: [summary.pending || 0, summary.approved || 0, summary.settled || 0, summary.rejected || 0] }]} height={250} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Claims Detail</h3>
                    <ExportButton data={claims.map((c: any) => ({
                        claim: c.claim_number, provider: c.policy?.provider?.provider_name || '-',
                        invoice: c.invoice?.invoice_number, claimed: Number(c.claimed_amount),
                        approved: Number(c.approved_amount || 0), status: c.status,
                    }))} filename={`insurance-${from}-${to}`} columns={[
                        { key: 'claim', label: 'Claim #' }, { key: 'provider', label: 'Provider' },
                        { key: 'invoice', label: 'Invoice' }, { key: 'claimed', label: 'Claimed' },
                        { key: 'approved', label: 'Approved' }, { key: 'status', label: 'Status' },
                    ]} />
                </div>
                <table className="w-full">
                    <thead><tr className="bg-gray-50">
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">Claim #</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">Provider</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">Claimed</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">Approved</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                        {claims.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-400">No claims found</td></tr>
                        ) : claims.map((c: any) => (
                            <tr key={c.id} className="hover:bg-gray-50">
                                <td className="px-6 py-3 text-sm font-mono text-gray-600">{c.claim_number}</td>
                                <td className="px-6 py-3 text-sm text-gray-900">{c.policy?.provider?.provider_name || '-'}</td>
                                <td className="px-6 py-3 text-sm text-gray-900 text-right">{fmt(Number(c.claimed_amount))}</td>
                                <td className="px-6 py-3 text-sm text-emerald-600 text-right font-medium">{fmt(Number(c.approved_amount || 0))}</td>
                                <td className="px-6 py-3"><StatusBadge status={c.status} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

function DepartmentReport({ data, fmt, from, to }: { data: any; fmt: (n: number) => string; from: string; to: string }) {
    const total = data.byDepartment?.reduce((s: number, d: any) => s + d.amount, 0) || 0;
    return (
        <>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Department Revenue Distribution</h3>
                {data.byDepartment?.length > 0 ? (
                    <ReportChart type="bar" labels={data.byDepartment.map((d: any) => d.department)}
                        datasets={[{ label: 'Revenue', data: data.byDepartment.map((d: any) => d.amount) }]} height={300} />
                ) : <div className="text-center py-12 text-gray-400">No data</div>}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Department Details</h3>
                    <ExportButton data={data.byDepartment || []} filename={`dept-revenue-${from}-${to}`}
                        columns={[{ key: 'department', label: 'Department' }, { key: 'amount', label: 'Revenue' }, { key: 'count', label: 'Items' }]} />
                </div>
                <table className="w-full">
                    <thead><tr className="bg-gray-50">
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">Department</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">Revenue</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">Items</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">% Share</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                        {(data.byDepartment || []).sort((a: any, b: any) => b.amount - a.amount).map((d: any) => (
                            <tr key={d.department} className="hover:bg-gray-50">
                                <td className="px-6 py-3 text-sm font-medium text-gray-900">{d.department}</td>
                                <td className="px-6 py-3 text-sm font-semibold text-right">{fmt(d.amount)}</td>
                                <td className="px-6 py-3 text-sm text-gray-600 text-right">{d.count}</td>
                                <td className="px-6 py-3 text-sm text-gray-600 text-right">{total > 0 ? ((d.amount / total) * 100).toFixed(1) : '0'}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
    const colorMap: Record<string, string> = {
        emerald: 'bg-emerald-50 border-emerald-200', red: 'bg-red-50 border-red-200',
        amber: 'bg-amber-50 border-amber-200', blue: 'bg-blue-50 border-blue-200',
        gray: 'bg-gray-50 border-gray-200',
    };
    return (
        <div className={`rounded-xl border p-4 ${colorMap[color] || colorMap.gray}`}>
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        Submitted: 'bg-blue-50 text-blue-700', Approved: 'bg-emerald-50 text-emerald-700',
        Settled: 'bg-orange-50 text-orange-700', Rejected: 'bg-red-50 text-red-700',
    };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>;
}
