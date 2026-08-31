'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    BarChart3, TrendingUp, AlertTriangle, IndianRupee, Package,
    ArrowUpRight, ArrowDownRight, Pill, Clock, RotateCcw, Bed, UserRound, Store, Search,
    Loader2, FileSpreadsheet, FileCode, FileText, Eye, X
} from 'lucide-react';
import { getPharmacyAnalytics, getPharmacyRevenueReport, getExpiringBatches, getLowStockAlerts, getInventoryMovements, getNarcoticRegister, getPharmacyBillLines } from '@/app/actions/pharmacy-actions';
import { SkeletonCard } from '@/app/components/ui/Skeleton';

type Preset = 'today' | '7d' | '30d' | 'month' | 'custom';
type Channel = 'all' | 'counter' | 'opd' | 'ipd';

function fmt(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rangeForPreset(preset: Preset, from: string, to: string): { from: string; to: string } {
    const now = new Date();
    const today = fmt(now);
    if (preset === 'today') return { from: today, to: today };
    if (preset === '7d') return { from: fmt(new Date(now.getTime() - 6 * 86400000)), to: today };
    if (preset === '30d') return { from: fmt(new Date(now.getTime() - 29 * 86400000)), to: today };
    if (preset === 'month') return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    return { from, to }; // custom
}

export default function PharmacyReportsPage() {
    const [data, setData] = useState<any>(null);
    const [rev, setRev] = useState<any>(null);
    const [doctorOptions, setDoctorOptions] = useState<string[]>([]);
    const [expiringBatches, setExpiringBatches] = useState<any[]>([]);
    const [lowStock, setLowStock] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'bills' | 'expiry' | 'stock' | 'movements' | 'narcotics'>('overview');
    const [movements, setMovements] = useState<any[]>([]);
    const [movementFilter, setMovementFilter] = useState('');
    const [narcotics, setNarcotics] = useState<any[]>([]);

    const [exportingExcel, setExportingExcel] = useState(false);
    const [exportingXML, setExportingXML] = useState(false);
    const [exportingPDF, setExportingPDF] = useState(false);

    // Filters
    const [preset, setPreset] = useState<Preset>('30d');
    const [customFrom, setCustomFrom] = useState(fmt(new Date(Date.now() - 29 * 86400000)));
    const [customTo, setCustomTo] = useState(fmt(new Date()));
    const [channel, setChannel] = useState<Channel>('all');
    const [doctor, setDoctor] = useState('');
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [doctorIpdOnly, setDoctorIpdOnly] = useState(false);
    const [doctorByMonth, setDoctorByMonth] = useState(false);

    // IPD bill verification drill-down
    const [billDetail, setBillDetail] = useState<any>(null);
    const [billDetailLoading, setBillDetailLoading] = useState(false);

    const dateRange = useMemo(() => rangeForPreset(preset, customFrom, customTo), [preset, customFrom, customTo]);

    // debounce medicine search
    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput), 350);
        return () => clearTimeout(t);
    }, [searchInput]);

    // Doctor-wise rows. "IPD only" re-sorts and hides doctors with no IPD pharmacy
    // billing, which is the doctor-wise IPD report on its own.
    const doctorRows = useMemo(() => {
        const rows = (rev?.byDoctor || []) as any[];
        if (!doctorIpdOnly) return rows;
        return rows.filter(d => d.ipd > 0).sort((a, b) => b.ipd - a.ipd);
    }, [rev, doctorIpdOnly]);

    const doctorTotals = useMemo(() => doctorRows.reduce(
        (t: any, d: any) => ({
            ipd: t.ipd + (d.ipd || 0), opd: t.opd + (d.opd || 0),
            counter: t.counter + (d.counter || 0), revenue: t.revenue + (d.revenue || 0),
            bills: t.bills + (d.bills || 0), ipdBills: t.ipdBills + (d.ipdBills || 0),
        }),
        { ipd: 0, opd: 0, counter: 0, revenue: 0, bills: 0, ipdBills: 0 },
    ), [doctorRows]);

    // Month columns for the matrix; same source as the Monthly Summary table.
    const monthCols = useMemo(() => (rev?.byMonth || []) as any[], [rev]);
    // IPD-only mode shows the IPD figure in each cell so the row ties to its total.
    const cellOf = (d: any, monthKey: string) => {
        const cell = d.months?.[monthKey];
        if (!cell) return 0;
        return doctorIpdOnly ? cell.ipd : cell.total;
    };

    const openBillDetail = async (invoiceId: number) => {
        setBillDetailLoading(true);
        setBillDetail({ loading: true });
        const res = await getPharmacyBillLines(invoiceId);
        setBillDetailLoading(false);
        if ((res as any).success) setBillDetail((res as any).data);
        else { setBillDetail(null); alert((res as any).error || 'Could not load bill detail'); }
    };

    const loadStatic = async () => {
        const [analytics, expiring, low] = await Promise.all([
            getPharmacyAnalytics(),
            getExpiringBatches(90),
            getLowStockAlerts(),
        ]);
        if (analytics.success) setData(analytics.data);
        if (expiring.success) setExpiringBatches(expiring.data);
        if (low.success) setLowStock(low.data);
    };

    const loadRevenue = async () => {
        setRefreshing(true);
        const res = await getPharmacyRevenueReport({
            from: dateRange.from, to: dateRange.to,
            channel, doctor: doctor || undefined, search: search || undefined,
        });
        if (res.success && res.data) {
            const d = res.data;
            setRev(d);
            // capture full doctor list only when unfiltered (so dropdown stays stable)
            if (!doctor && channel === 'all' && !search) {
                setDoctorOptions((d.byDoctor || []).map((x: any) => x.name).filter((n: string) => n && n !== 'Unassigned'));
            }
        }
        setRefreshing(false);
    };

    const loadData = async () => { await Promise.all([loadStatic(), loadRevenue()]); };

    const loadMovements = async (type?: string) => {
        const res = await getInventoryMovements({ movement_type: type || undefined, limit: 200 });
        if (res.success) setMovements(res.data || []);
    };

    const loadNarcotics = async () => {
        const res = await getNarcoticRegister();
        if (res.success) setNarcotics(res.data || []);
    };

    function escapeXML(str: string) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&apos;');
    }

    const handleExportExcel = async () => {
        if (!rev) return;
        setExportingExcel(true);
        try {
            const xlsxModule = await import('xlsx');
            const XLSX = xlsxModule.default ?? xlsxModule;
            const wb = XLSX.utils.book_new();

            // json_to_sheet emits no column widths and no cell formats, so headers
            // were clipped and money rendered as raw floats (19944.86303). Size each
            // column to its widest value and stamp an Indian money format on the
            // amount columns.
            const MONEY_COLS = /amount|revenue|value|total|cogs|counter|ipd|opd/i;
            const addSheet = (name: string, rows: any[], headers?: string[]) => {
                const ws = XLSX.utils.json_to_sheet(rows, headers ? { header: headers } : undefined);
                const cols = headers || Object.keys(rows[0] || {});
                ws['!cols'] = cols.map(c => ({
                    wch: Math.min(38, Math.max(
                        String(c).length + 2,
                        ...rows.map(r => String(r[c] ?? '').length + 2),
                    )),
                }));
                // Money format, header row skipped. Text cells are left alone by the
                // `t === 'n'` check below, so only count-like numeric columns need
                // excluding by name.
                const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
                cols.forEach((c, ci) => {
                    // Word boundaries matter: "Counter Amount" must not be excluded
                    // by a bare /count/.
                    if (!MONEY_COLS.test(String(c)) || /(bills|count|qty|units)/i.test(String(c))) return;
                    for (let r = range.s.r + 1; r <= range.e.r; r++) {
                        const cell = ws[XLSX.utils.encode_cell({ r, c: ci })];
                        if (cell && cell.t === 'n') cell.z = '#,##0.00';
                    }
                });
                XLSX.utils.book_append_sheet(wb, ws, name);
                return ws;
            };

            // Sheet 1: Summary
            const summaryRows = [
                { Metric: 'Total Revenue', Value: Math.round(rev.totalRevenue * 100) / 100 },
                { Metric: 'Total Bills Issued', Value: rev.totalBills },
                { Metric: 'IPD Pharmacy Revenue', Value: rev.byChannel.ipd.revenue },
                { Metric: 'IPD Bills Count', Value: rev.byChannel.ipd.billCount },
                { Metric: 'OPD Pharmacy Revenue', Value: rev.byChannel.opd.revenue },
                { Metric: 'OPD Bills Count', Value: rev.byChannel.opd.billCount },
                { Metric: 'Counter Sales Revenue', Value: rev.byChannel.counter.revenue },
                { Metric: 'Counter Bills Count', Value: rev.byChannel.counter.billCount },
                { Metric: 'Gross Margin %', Value: rev.grossMarginPct == null ? 'n/a (channel filter applied)' : `${rev.grossMarginPct}%` },
                { Metric: 'COGS', Value: rev.cogs },
                { Metric: 'Expiry Write-off Value', Value: data?.expiryWriteOffValue || 0 },
                { Metric: 'Expired Batches Count', Value: data?.expiredCount || 0 },
                { Metric: 'Total Stock Asset Value', Value: data?.totalStockValue || 0 },
            ];
            addSheet('Summary', summaryRows);

            // Sheet 2: Bills List — with per-channel subtotals and a grand total, so the
            // exported sheet closes on the same figures the screen shows.
            const billsRows: any[] = (rev.bills || []).map((b: any) => ({
                'Bill No': b.billNo,
                'Patient': b.patient,
                'UHID': b.patientId === 'WALKIN' ? '' : b.patientId,
                'Channel': b.channel.toUpperCase(),
                'Doctor': b.doctor || 'Self',
                'Date': new Date(b.date).toLocaleDateString('en-GB'),
                'Items': b.items,
                'Revenue': b.revenue,
            }));
            // Summing floats leaves noise (1030504.5040300002); round to paise.
            const money2 = (v: number) => Math.round(v * 100) / 100;
            (['ipd', 'opd', 'counter'] as const).forEach(ch => {
                const g = (rev.bills || []).filter((b: any) => b.channel === ch);
                if (g.length === 0) return;
                billsRows.push({
                    'Bill No': `${ch.toUpperCase()} SUBTOTAL`, 'Patient': '', 'UHID': '', 'Channel': ch.toUpperCase(),
                    'Doctor': '', 'Date': `${g.length} bills`,
                    'Items': g.reduce((t: number, b: any) => t + (b.items || 0), 0),
                    'Revenue': money2(g.reduce((t: number, b: any) => t + (b.revenue || 0), 0)),
                });
            });
            billsRows.push({
                'Bill No': 'GRAND TOTAL', 'Patient': '', 'UHID': '', 'Channel': '', 'Doctor': '',
                'Date': `${(rev.bills || []).length} bills`,
                'Items': (rev.bills || []).reduce((t: number, b: any) => t + (b.items || 0), 0),
                'Revenue': money2((rev.bills || []).reduce((t: number, b: any) => t + (b.revenue || 0), 0)),
            });
            addSheet('Bills List', billsRows);

            // Sheet 3: Top Movers
            const moversRows = (rev.topMovers || []).map((m: any) => ({
                'Medicine Name': m.name,
                'Units Sold': m.qty,
                'Revenue': m.revenue,
            }));
            addSheet('Top Movers', moversRows);

            // Sheet 4: Doctor-wise split — IPD and OPD as their own columns
            const doctorSheet: any[] = (rev.byDoctor || []).map((d: any) => ({
                'Doctor': d.name,
                'Bills': d.bills,
                'IPD Amount': d.ipd,
                'OPD Amount': d.opd,
                'Counter Amount': d.counter,
                'Total': d.revenue,
            }));
            doctorSheet.push({
                'Doctor': 'TOTAL',
                'Bills': (rev.byDoctor || []).reduce((t: number, d: any) => t + (d.bills || 0), 0),
                'IPD Amount': (rev.byDoctor || []).reduce((t: number, d: any) => t + (d.ipd || 0), 0),
                'OPD Amount': (rev.byDoctor || []).reduce((t: number, d: any) => t + (d.opd || 0), 0),
                'Counter Amount': (rev.byDoctor || []).reduce((t: number, d: any) => t + (d.counter || 0), 0),
                'Total': (rev.byDoctor || []).reduce((t: number, d: any) => t + (d.revenue || 0), 0),
            });
            addSheet('Doctor-wise', doctorSheet);

            // Sheet 4b: IPD-only doctor split — the doctor-wise IPD pharmacy report
            const ipdDoctorSheet: any[] = (rev.byDoctor || [])
                .filter((d: any) => d.ipd > 0)
                .sort((a: any, b: any) => b.ipd - a.ipd)
                .map((d: any) => ({ 'Doctor': d.name, 'IPD Bills': d.ipdBills, 'IPD Pharmacy Amount': d.ipd }));
            ipdDoctorSheet.push({
                'Doctor': 'TOTAL IPD',
                'IPD Bills': (rev.byDoctor || []).reduce((t: number, d: any) => t + (d.ipdBills || 0), 0),
                'IPD Pharmacy Amount': (rev.byDoctor || []).reduce((t: number, d: any) => t + (d.ipd || 0), 0),
            });
            addSheet('IPD Doctor-wise', ipdDoctorSheet);

            // Sheet 4c: Monthly summary, ending on the overall total
            const monthSheet: any[] = (rev.byMonth || []).map((m: any) => ({
                'Month': m.month, 'Bills': m.bills,
                'IPD Amount': m.ipd, 'OPD Amount': m.opd, 'Counter Amount': m.counter,
                'Monthly Total': m.total,
            }));
            const gt = rev.grandTotal || { ipd: 0, opd: 0, counter: 0, total: 0, bills: 0 };
            monthSheet.push({
                'Month': 'OVERALL TOTAL', 'Bills': gt.bills,
                'IPD Amount': gt.ipd, 'OPD Amount': gt.opd, 'Counter Amount': gt.counter,
                'Monthly Total': gt.total,
            });
            addSheet('Monthly Summary', monthSheet);

            // Sheet 5: Daily Revenue
            const dailyRows = (rev.revenueByDay || []).map((d: any) => ({
                'Date': d.date,
                'Total Revenue': d.revenue,
                'IPD Revenue': d.ipd,
                'OPD Revenue': d.opd,
                'Counter Revenue': d.counter,
            }));
            addSheet('Daily Revenue', dailyRows);

            XLSX.writeFile(wb, `pharmacy-finance-report-${dateRange.from}-to-${dateRange.to}.xlsx`);
        } catch (err) {
            console.error('Excel export failed:', err);
            alert('Excel export failed. Please try again.');
        } finally {
            setExportingExcel(false);
        }
    };

    const handleExportXML = async () => {
        if (!rev) return;
        setExportingXML(true);
        try {
            let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<PharmacyFinanceReport dateRangeFrom="${dateRange.from}" dateRangeTo="${dateRange.to}">\n`;
            
            // Summary
            xml += `  <Summary>\n`;
            xml += `    <TotalRevenue>${rev.totalRevenue}</TotalRevenue>\n`;
            xml += `    <TotalBills>${rev.totalBills}</TotalBills>\n`;
            xml += `    <IpdRevenue>${rev.byChannel.ipd.revenue}</IpdRevenue>\n`;
            xml += `    <IpdBills>${rev.byChannel.ipd.billCount}</IpdBills>\n`;
            xml += `    <OpdRevenue>${rev.byChannel.opd.revenue}</OpdRevenue>\n`;
            xml += `    <OpdBills>${rev.byChannel.opd.billCount}</OpdBills>\n`;
            xml += `    <CounterRevenue>${rev.byChannel.counter.revenue}</CounterRevenue>\n`;
            xml += `    <CounterBills>${rev.byChannel.counter.billCount}</CounterBills>\n`;
            xml += `    <GrossMarginPct>${rev.grossMarginPct ?? ''}</GrossMarginPct>\n`;
            xml += `    <Cogs>${rev.cogs}</Cogs>\n`;
            xml += `    <ExpiryWriteOffValue>${data?.expiryWriteOffValue || 0}</ExpiryWriteOffValue>\n`;
            xml += `    <TotalStockValue>${data?.totalStockValue || 0}</TotalStockValue>\n`;
            xml += `  </Summary>\n`;
            
            // Bills List
            xml += `  <Bills>\n`;
            (rev.bills || []).forEach((b: any) => {
                xml += `    <Bill>\n`;
                xml += `      <BillNo>${escapeXML(b.billNo)}</BillNo>\n`;
                xml += `      <Patient>${escapeXML(b.patient)}</Patient>\n`;
                xml += `      <Channel>${escapeXML(b.channel)}</Channel>\n`;
                xml += `      <Doctor>${escapeXML(b.doctor)}</Doctor>\n`;
                xml += `      <Date>${escapeXML(b.date)}</Date>\n`;
                xml += `      <Items>${b.items}</Items>\n`;
                xml += `      <Revenue>${b.revenue}</Revenue>\n`;
                xml += `    </Bill>\n`;
            });
            xml += `  </Bills>\n`;
            
            // Top Movers
            xml += `  <TopMovers>\n`;
            (rev.topMovers || []).forEach((m: any) => {
                xml += `    <Mover>\n`;
                xml += `      <Medicine>${escapeXML(m.name)}</Medicine>\n`;
                xml += `      <Quantity>${m.qty}</Quantity>\n`;
                xml += `      <Revenue>${m.revenue}</Revenue>\n`;
                xml += `    </Mover>\n`;
            });
            xml += `  </TopMovers>\n`;
            
            // Doctor Revenue — IPD / OPD / Counter split
            xml += `  <DoctorRevenue>\n`;
            (rev.byDoctor || []).forEach((d: any) => {
                xml += `    <Doctor>\n`;
                xml += `      <Name>${escapeXML(d.name)}</Name>\n`;
                xml += `      <Bills>${d.bills}</Bills>\n`;
                xml += `      <IpdAmount>${d.ipd}</IpdAmount>\n`;
                xml += `      <OpdAmount>${d.opd}</OpdAmount>\n`;
                xml += `      <CounterAmount>${d.counter}</CounterAmount>\n`;
                xml += `      <Revenue>${d.revenue}</Revenue>\n`;
                xml += `    </Doctor>\n`;
            });
            xml += `  </DoctorRevenue>\n`;

            // Monthly summary + the report's closing totals
            xml += `  <MonthlySummary>\n`;
            (rev.byMonth || []).forEach((m: any) => {
                xml += `    <Month>\n`;
                xml += `      <Label>${escapeXML(m.month)}</Label>\n`;
                xml += `      <Bills>${m.bills}</Bills>\n`;
                xml += `      <IpdAmount>${m.ipd}</IpdAmount>\n`;
                xml += `      <OpdAmount>${m.opd}</OpdAmount>\n`;
                xml += `      <CounterAmount>${m.counter}</CounterAmount>\n`;
                xml += `      <MonthlyTotal>${m.total}</MonthlyTotal>\n`;
                xml += `    </Month>\n`;
            });
            xml += `  </MonthlySummary>\n`;
            const gtx = rev.grandTotal || { ipd: 0, opd: 0, counter: 0, total: 0, bills: 0 };
            xml += `  <GrandTotal>\n`;
            xml += `    <TotalIpdAmount>${gtx.ipd}</TotalIpdAmount>\n`;
            xml += `    <TotalOpdAmount>${gtx.opd}</TotalOpdAmount>\n`;
            xml += `    <TotalCounterAmount>${gtx.counter}</TotalCounterAmount>\n`;
            xml += `    <OverallTotal>${gtx.total}</OverallTotal>\n`;
            xml += `    <TotalBills>${gtx.bills}</TotalBills>\n`;
            xml += `  </GrandTotal>\n`;
            
            // Daily Revenue
            xml += `  <DailyRevenue>\n`;
            (rev.revenueByDay || []).forEach((d: any) => {
                xml += `    <Day>\n`;
                xml += `      <Date>${escapeXML(d.date)}</Date>\n`;
                xml += `      <TotalRevenue>${d.revenue}</TotalRevenue>\n`;
                xml += `      <IpdRevenue>${d.ipd}</IpdRevenue>\n`;
                xml += `      <OpdRevenue>${d.opd}</OpdRevenue>\n`;
                xml += `      <CounterRevenue>${d.counter}</CounterRevenue>\n`;
                xml += `    </Day>\n`;
            });
            xml += `  </DailyRevenue>\n`;
            
            xml += `</PharmacyFinanceReport>`;

            const blob = new Blob([xml], { type: 'application/xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pharmacy-finance-report-${dateRange.from}-to-${dateRange.to}.xml`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('XML export failed:', err);
            alert('XML export failed. Please try again.');
        } finally {
            setExportingXML(false);
        }
    };

    const handleExportPDF = async () => {
        if (!rev) return;
        setExportingPDF(true);
        try {
            const [{ pdf }, { PharmacyFinanceReportPDF }] = await Promise.all([
                import('@react-pdf/renderer'),
                import('@/app/components/pharmacy/PharmacyFinanceReportPDF'),
            ]);

            const doc = (
                <PharmacyFinanceReportPDF
                    dateRange={dateRange}
                    rev={rev}
                    data={data}
                />
            );

            const blob = await pdf(doc).toBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pharmacy-finance-report-${dateRange.from}-to-${dateRange.to}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('PDF export failed:', err);
            alert('PDF generation failed. Please try again.');
        } finally {
            setExportingPDF(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'movements') loadMovements(movementFilter);
        if (activeTab === 'narcotics') loadNarcotics();
    }, [activeTab, movementFilter]);

    useEffect(() => { loadStatic(); }, []);
    // reload revenue whenever filters change
    useEffect(() => { loadRevenue(); }, [dateRange.from, dateRange.to, channel, doctor, search]);

    function getExpiryBadge(expiry: Date) {
        const days = Math.floor((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (days < 0) return { label: 'EXPIRED', cls: 'bg-red-500 text-white' };
        if (days <= 30) return { label: `${days}d`, cls: 'bg-red-100 text-red-700 border border-red-200' };
        if (days <= 60) return { label: `${days}d`, cls: 'bg-amber-100 text-amber-700 border border-amber-200' };
        return { label: `${days}d`, cls: 'bg-yellow-50 text-yellow-700 border border-yellow-200' };
    }

    const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

    // Print the bill-wise list in a clean, self-contained window (avoids printing the
    // whole dashboard/sidebar, which is why the plain window.print() looked broken).
    function printBills() {
        const bills = (rev?.bills || []) as any[];
        if (bills.length === 0) { alert('No bills to print for this period / channel.'); return; }
        const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        // Round before formatting — toLocaleString on the raw float printed amounts
        // like "33,123.006" on the printed bill list.
        const n = (v: number) => Math.round(v || 0).toLocaleString('en-IN');
        const chLabel = channel === 'all' ? 'All Channels' : channel === 'counter' ? 'Cash / Counter' : channel.toUpperCase();
        const rows = bills.map((b, i) => `<tr>
            <td>${i + 1}</td><td>${esc(b.billNo || '-')}</td><td>${esc(new Date(b.date).toLocaleDateString('en-GB'))}</td>
            <td>${esc(b.patient)}</td><td>${esc(b.patientId === 'WALKIN' ? '-' : b.patientId)}</td>
            <td>${b.channel === 'counter' ? 'CASH' : esc(String(b.channel).toUpperCase())}</td>
            <td>${esc(b.doctor || '-')}</td>
            <td style="text-align:right">${esc(b.items)}</td>
            <td style="text-align:right">${n(b.revenue)}</td></tr>`).join('');
        const totalItems = bills.reduce((s, b) => s + (b.items || 0), 0);
        const totalRev = bills.reduce((s, b) => s + (b.revenue || 0), 0);
        // IPD / OPD / Counter subtotals so the printed list totals each stream separately.
        const subRows = (['ipd', 'opd', 'counter'] as const)
            .map(ch => ({ ch, rows: bills.filter(b => b.channel === ch) }))
            .filter(g => g.rows.length > 0)
            .map(g => `<tr><td colspan="7">${g.ch === 'counter' ? 'Counter / Cash' : g.ch.toUpperCase()} subtotal — ${g.rows.length} bills</td>
                <td style="text-align:right">${g.rows.reduce((s, b) => s + (b.items || 0), 0)}</td>
                <td style="text-align:right">${n(g.rows.reduce((s, b) => s + (b.revenue || 0), 0))}</td></tr>`).join('');
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Pharmacy Bills — ${esc(chLabel)}</title>
            <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:18px;margin:0}
            .meta{font-size:12px;color:#555;margin:4px 0 16px}table{width:100%;border-collapse:collapse;font-size:12px}
            th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}thead th{background:#f3f4f6}
            tfoot td{font-weight:bold;background:#f9fafb}</style></head><body>
            <h1>Pharmacy Bills — ${esc(chLabel)}</h1>
            <div class="meta">Period: ${esc(dateRange.from)} to ${esc(dateRange.to)} · ${bills.length} bills</div>
            <table><thead><tr><th>#</th><th>Bill No</th><th>Date</th><th>Patient</th><th>UHID</th><th>Type</th><th>Doctor</th>
            <th style="text-align:right">Items</th><th style="text-align:right">Amount (₹)</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot>${subRows}<tr><td colspan="7">GRAND TOTAL — ${bills.length} bills</td>
            <td style="text-align:right">${totalItems}</td><td style="text-align:right">${n(totalRev)}</td></tr></tfoot>
            </table><script>window.onload=function(){window.print();}</script></body></html>`;
        const w = window.open('', '_blank');
        if (!w) { alert('Please allow pop-ups to print the report.'); return; }
        w.document.write(html);
        w.document.close();
    }

    // Doctor-wise print — the deliverable the finance team asks for: one row per
    // consultant with IPD and OPD totalled separately, closing on a grand total.
    function printDoctorWise() {
        const rows = doctorRows as any[];
        if (rows.length === 0) { alert('No doctor-wise data for this period.'); return; }
        const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const n = (v: number) => Math.round(v || 0).toLocaleString('en-IN');
        const body = rows.map((d, i) => doctorIpdOnly
            ? `<tr><td>${i + 1}</td><td>${esc(d.name)}</td>
               <td style="text-align:right">${d.ipdBills}</td>
               <td style="text-align:right">${n(d.ipd)}</td></tr>`
            : `<tr><td>${i + 1}</td><td>${esc(d.name)}</td>
               <td style="text-align:right">${d.bills}</td>
               <td style="text-align:right">${n(d.ipd)}</td>
               <td style="text-align:right">${n(d.opd)}</td>
               <td style="text-align:right">${n(d.counter)}</td>
               <td style="text-align:right">${n(d.revenue)}</td></tr>`).join('');
        const months = ((rev?.byMonth || []) as any[]).map(m => `<tr><td>${esc(m.month)}</td>
            <td style="text-align:right">${m.bills}</td>
            <td style="text-align:right">${n(m.ipd)}</td>
            <td style="text-align:right">${n(m.opd)}</td>
            <td style="text-align:right">${n(m.counter)}</td>
            <td style="text-align:right">${n(m.total)}</td></tr>`).join('');
        const g = rev?.grandTotal || { ipd: 0, opd: 0, counter: 0, total: 0, bills: 0 };
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Doctor-wise Pharmacy Billing</title>
            <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:18px;margin:0}
            h2{font-size:14px;margin:22px 0 6px}.meta{font-size:12px;color:#555;margin:4px 0 16px}
            table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
            thead th{background:#f3f4f6}tfoot td{font-weight:bold;background:#f9fafb}
            .grand{margin-top:18px;border:2px solid #111;padding:10px 12px;font-size:13px}
            .grand div{display:flex;justify-content:space-between;padding:3px 0}
            .grand .h{display:block;font-weight:bold;font-size:11px;text-transform:uppercase;
              letter-spacing:.05em;color:#555;margin-bottom:6px}
            .grand .t{border-top:1px solid #111;margin-top:6px;padding-top:6px;font-size:15px;font-weight:bold}</style></head><body>
            <h1>Doctor-wise Pharmacy Billing${doctorIpdOnly ? ' — IPD only' : ''}</h1>
            <div class="meta">Period: ${esc(dateRange.from)} to ${esc(dateRange.to)} &middot; ${rows.length} doctors
              &middot; Channel: ${channel === 'all' ? 'All' : channel.toUpperCase()}</div>
            <table><thead><tr><th>#</th><th>Doctor</th>
            <th style="text-align:right">${doctorIpdOnly ? 'IPD Bills' : 'Bills'}</th>
            <th style="text-align:right">IPD (₹)</th>
            ${doctorIpdOnly ? '' : `<th style="text-align:right">OPD (₹)</th>
            <th style="text-align:right">Counter (₹)</th><th style="text-align:right">Total (₹)</th>`}</tr></thead>
            <tbody>${body}</tbody>
            <tfoot><tr><td colspan="2">${doctorIpdOnly ? 'Total IPD' : 'Total'} — ${rows.length} doctors</td>
            <td style="text-align:right">${doctorIpdOnly ? doctorTotals.ipdBills : doctorTotals.bills}</td>
            <td style="text-align:right">${n(doctorTotals.ipd)}</td>
            ${doctorIpdOnly ? '' : `<td style="text-align:right">${n(doctorTotals.opd)}</td>
            <td style="text-align:right">${n(doctorTotals.counter)}</td>
            <td style="text-align:right">${n(doctorTotals.revenue)}</td>`}</tr></tfoot></table>
            <h2>Monthly Summary</h2>
            <table><thead><tr><th>Month</th><th style="text-align:right">Bills</th>
            <th style="text-align:right">IPD (₹)</th><th style="text-align:right">OPD (₹)</th>
            <th style="text-align:right">Counter (₹)</th><th style="text-align:right">Monthly Total (₹)</th></tr></thead>
            <tbody>${months || '<tr><td colspan="6">No billing in this period</td></tr>'}</tbody></table>
            <div class="grand">
              <div class="h">Period Totals — all channels${channel === 'all' ? '' : ` (channel filter: ${channel.toUpperCase()})`}</div>
              <div><span>Total IPD Amount</span><span>₹${n(g.ipd)}</span></div>
              <div><span>Total OPD Amount</span><span>₹${n(g.opd)}</span></div>
              <div><span>Counter Sales</span><span>₹${n(g.counter)}</span></div>
              <div class="t"><span>OVERALL TOTAL (${g.bills} bills)</span><span>₹${n(g.total)}</span></div>
            </div>
            <script>window.onload=function(){window.print();}</script></body></html>`;
        const w = window.open('', '_blank');
        if (!w) { alert('Please allow pop-ups to print the report.'); return; }
        w.document.write(html);
        w.document.close();
    }

    const CHANNEL_META: Record<'counter' | 'opd' | 'ipd', { label: string; bar: string; chip: string; icon: any }> = {
        counter: { label: 'Counter', bar: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700', icon: Store },
        opd: { label: 'OPD', bar: 'bg-blue-500', chip: 'bg-blue-100 text-blue-700', icon: UserRound },
        ipd: { label: 'IPD', bar: 'bg-violet-500', chip: 'bg-violet-100 text-violet-700', icon: Bed },
    };

    return (
        <AppShell pageTitle="Pharmacy Analytics" pageIcon={<BarChart3 className="h-5 w-5" />} onRefresh={loadData} refreshing={refreshing}>
            {/* ===== Filter Bar ===== */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                    {([['today', 'Today'], ['7d', '7 Days'], ['30d', '30 Days'], ['month', 'This Month'], ['custom', 'Custom']] as [Preset, string][]).map(([id, label]) => (
                        <button key={id} onClick={() => setPreset(id)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${preset === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                {preset === 'custom' && (
                    <div className="flex items-center gap-2">
                        <DateField value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg" />
                        <span className="text-gray-400 text-xs">→</span>
                        <DateField value={customTo} onChange={e => setCustomTo(e.target.value)}
                            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg" />
                    </div>
                )}

                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                    {([['all', 'All'], ['ipd', 'IPD'], ['opd', 'OPD'], ['counter', 'Counter']] as [Channel, string][]).map(([id, label]) => (
                        <button key={id} onClick={() => setChannel(id)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${channel === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                <div className="relative">
                    <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search medicine…"
                        className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-44" />
                </div>

                <select value={doctor} onChange={e => setDoctor(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg max-w-[180px]">
                    <option value="">All Doctors</option>
                    {doctorOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>

                {refreshing && <span className="text-[10px] text-gray-400 font-medium ml-auto">Updating…</span>}
            </div>

            {!rev ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
            ) : (
                <>
                    {/* ===== Segmented KPI cards ===== */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <IndianRupee className="h-4 w-4 text-emerald-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Total Revenue</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{inr(rev.totalRevenue)}</p>
                            <p className="text-xs text-gray-400 mt-1">{rev.totalBills} bills</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <Bed className="h-4 w-4 text-violet-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">IPD Pharmacy</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{inr(rev.byChannel.ipd.revenue)}</p>
                            <p className="text-xs text-gray-400 mt-1">{rev.byChannel.ipd.pct}% · {rev.byChannel.ipd.billCount} bills</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <UserRound className="h-4 w-4 text-blue-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">OPD Pharmacy</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{inr(rev.byChannel.opd.revenue)}</p>
                            <p className="text-xs text-gray-400 mt-1">{rev.byChannel.opd.pct}% · {rev.byChannel.opd.billCount} bills</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <Store className="h-4 w-4 text-teal-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Counter Sales</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{inr(rev.byChannel.counter.revenue)}</p>
                            <p className="text-xs text-gray-400 mt-1">{rev.byChannel.counter.pct}% · {rev.byChannel.counter.billCount} bills</p>
                        </div>
                    </div>

                    {rev.truncated && (
                        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            <p className="text-xs font-semibold text-amber-800">{rev.truncatedNote}</p>
                        </div>
                    )}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <TrendingUp className="h-4 w-4 text-violet-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Gross Margin</span>
                            </div>
                            {rev.grossMarginPct == null ? (
                                <>
                                    <p className="text-2xl font-black text-gray-300">&mdash;</p>
                                    <p className="text-xs text-gray-400 mt-1">Not measurable per channel &mdash; clear the channel filter</p>
                                </>
                            ) : (
                                <>
                                    <p className="text-2xl font-black text-gray-900">{rev.grossMarginPct}%</p>
                                    <p className="text-xs text-gray-400 mt-1">COGS {inr(rev.cogs)}</p>
                                </>
                            )}
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Expiry Write-off</span>
                            </div>
                            <p className="text-2xl font-black text-red-600">{inr(data?.expiryWriteOffValue || 0)}</p>
                            <p className="text-xs text-gray-400 mt-1">{data?.expiredCount || 0} expired batches</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <RotateCcw className="h-4 w-4 text-blue-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Returns (30d)</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{data?.totalReturns30d || 0}</p>
                            <p className="text-xs text-gray-400 mt-1">{data?.patientReturnsCount || 0} patient, {data?.expiryWriteOffsCount || 0} expiry</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <Package className="h-4 w-4 text-amber-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Stock Value</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{inr(data?.totalStockValue || 0)}</p>
                            <p className="text-xs text-gray-400 mt-1">{(data?.lowStockCount || 0) + (data?.outOfStockCount || 0)} alerts</p>
                        </div>
                    </div>

                    {/* Tab navigation */}
                    <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl border border-gray-200 w-fit">
                        {[
                            { id: 'overview', label: 'Revenue & Movers' },
                            { id: 'bills', label: `Bills — Cash / IPD (${(rev?.bills || []).length})` },
                            { id: 'expiry', label: `Expiry Alerts (${(data?.expiring30Count || 0) + (data?.expiring60Count || 0) + (data?.expiring90Count || 0) + (data?.expiredCount || 0)})` },
                            { id: 'stock', label: `Stock Alerts (${(data?.lowStockCount || 0) + (data?.outOfStockCount || 0)})` },
                            { id: 'movements', label: 'Movement Ledger' },
                            { id: 'narcotics', label: 'Controlled Drugs' },
                        ].map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                                className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            {/* ===== Financial Export Bar ===== */}
                            <div className="bg-gradient-to-r from-indigo-50/50 via-violet-50/50 to-indigo-50/50 border border-indigo-100/80 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-black text-indigo-900 flex items-center gap-1.5">
                                        <FileSpreadsheet className="h-4 w-4 text-indigo-600" />
                                        Finance Reports & Exports
                                    </h4>
                                    <p className="text-xs text-indigo-700 font-medium leading-relaxed max-w-xl">
                                        Export compiled revenue breakdowns, drug sales volume, prescriber splits, and full transaction history for the selected date range.
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2 sm:self-center">
                                    {/* Excel Export Button */}
                                    <button
                                        onClick={handleExportExcel}
                                        disabled={exportingExcel || !rev}
                                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                                    >
                                        {exportingExcel ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <FileSpreadsheet className="h-3.5 w-3.5" />
                                        )}
                                        {exportingExcel ? 'Exporting...' : 'Export Excel'}
                                    </button>

                                    {/* XML Export Button */}
                                    <button
                                        onClick={handleExportXML}
                                        disabled={exportingXML || !rev}
                                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                                    >
                                        {exportingXML ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <FileCode className="h-3.5 w-3.5" />
                                        )}
                                        {exportingXML ? 'Exporting...' : 'Export XML'}
                                    </button>

                                    {/* PDF Export Button */}
                                    <button
                                        onClick={handleExportPDF}
                                        disabled={exportingPDF || !rev}
                                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                                    >
                                        {exportingPDF ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <FileText className="h-3.5 w-3.5" />
                                        )}
                                        {exportingPDF ? 'Generating...' : 'Export PDF'}
                                    </button>
                                </div>
                            </div>

                            {/* Channel breakdown table */}
                            <div className="bg-white border border-gray-200 rounded-2xl p-6">
                                <h3 className="text-sm font-black text-gray-700 mb-4">Revenue by Channel</h3>
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            {['Channel', 'Bills', 'Items', 'Revenue', '% Share'].map((h, i) => (
                                                <th key={i} className={`pb-2 text-[10px] font-black text-gray-400 uppercase tracking-wider ${i > 0 ? 'text-right' : ''}`}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {(['ipd', 'opd', 'counter'] as const).map(ch => {
                                            const c = rev.byChannel[ch];
                                            const meta = CHANNEL_META[ch];
                                            const Icon = meta.icon;
                                            return (
                                                <tr key={ch}>
                                                    <td className="py-3">
                                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-bold ${meta.chip}`}>
                                                            <Icon className="h-3.5 w-3.5" />{meta.label}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 text-right text-sm font-bold text-gray-700">{c.billCount}</td>
                                                    <td className="py-3 text-right text-sm text-gray-500">{c.itemCount}</td>
                                                    <td className="py-3 text-right text-sm font-black text-gray-900">{inr(c.revenue)}</td>
                                                    <td className="py-3 text-right text-sm font-bold text-emerald-600">{c.pct}%</td>
                                                </tr>
                                            );
                                        })}
                                        <tr className="border-t-2 border-gray-100">
                                            <td className="py-3 text-sm font-black text-gray-900">Total</td>
                                            <td className="py-3 text-right text-sm font-black text-gray-900">{rev.totalBills}</td>
                                            <td className="py-3 text-right text-sm text-gray-500">
                                                {rev.byChannel.ipd.itemCount + rev.byChannel.opd.itemCount + rev.byChannel.counter.itemCount}
                                            </td>
                                            <td className="py-3 text-right text-sm font-black text-gray-900">{inr(rev.totalRevenue)}</td>
                                            <td className="py-3 text-right text-sm font-black text-gray-900">100%</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Bills list */}
                            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                                    <h3 className="text-sm font-black text-gray-700">Bills ({rev.bills?.length || 0})</h3>
                                    <span className="text-[10px] text-gray-400 font-medium">Newest first · max 500</span>
                                </div>
                                <div className="max-h-[420px] overflow-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                                            <tr>
                                                {['Bill No', 'Patient', 'Channel', 'Doctor', 'Date', 'Items', 'Revenue'].map((h, i) => (
                                                    <th key={i} className={`px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-wider ${i >= 5 ? 'text-right' : ''}`}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {(!rev.bills || rev.bills.length === 0) ? (
                                                <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">No bills in this period</td></tr>
                                            ) : rev.bills.map((b: any, i: number) => {
                                                const meta = CHANNEL_META[b.channel as 'counter' | 'opd' | 'ipd'];
                                                const Icon = meta.icon;
                                                return (
                                                    <tr key={i} className="hover:bg-gray-50/50">
                                                        <td className="px-4 py-2.5"><span className="font-mono text-xs text-gray-600">{b.billNo}</span></td>
                                                        <td className="px-4 py-2.5 text-sm font-bold text-gray-700">{b.patient}</td>
                                                        <td className="px-4 py-2.5">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${meta.chip}`}>
                                                                <Icon className="h-3 w-3" />{meta.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2.5 text-xs text-gray-500">{b.doctor}</td>
                                                        <td className="px-4 py-2.5 text-xs text-gray-500">{new Date(b.date).toLocaleDateString('en-GB')}</td>
                                                        <td className="px-4 py-2.5 text-right text-sm text-gray-500">{b.items}</td>
                                                        <td className="px-4 py-2.5 text-right text-sm font-black text-gray-900">{inr(b.revenue)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Stacked daily revenue */}
                                <div className="bg-white border border-gray-200 rounded-2xl p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-black text-gray-700">Daily Revenue by Channel</h3>
                                        <div className="flex gap-3">
                                            {(['ipd', 'opd', 'counter'] as const).map(ch => (
                                                <span key={ch} className="flex items-center gap-1 text-[10px] font-bold text-gray-500">
                                                    <span className={`h-2.5 w-2.5 rounded-sm ${CHANNEL_META[ch].bar}`} />{CHANNEL_META[ch].label}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-end gap-1.5 h-48">
                                        {rev.revenueByDay?.map((day: any, i: number) => {
                                            const maxRev = Math.max(...rev.revenueByDay.map((d: any) => d.revenue), 1);
                                            const h = (v: number) => `${(v / maxRev) * 100}%`;
                                            return (
                                                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                                                    <div className="w-full flex flex-col justify-end h-full rounded-t-md overflow-hidden" title={`${day.date}: ${inr(day.revenue)}`}>
                                                        <div className="w-full bg-violet-500" style={{ height: h(day.ipd) }} />
                                                        <div className="w-full bg-blue-500" style={{ height: h(day.opd) }} />
                                                        <div className="w-full bg-emerald-500" style={{ height: h(day.counter) }} />
                                                    </div>
                                                    {rev.revenueByDay.length <= 31 && (
                                                        <span className="text-[8px] text-gray-400 font-medium whitespace-nowrap rotate-0">{day.date.split(' ')[0]}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Top movers */}
                                <div className="bg-white border border-gray-200 rounded-2xl p-6">
                                    <h3 className="text-sm font-black text-gray-700 mb-4">Top 10 Movers (by revenue)</h3>
                                    {rev.topMovers?.length === 0 ? (
                                        <div className="text-center py-12 text-gray-400 text-sm">No sales data</div>
                                    ) : (
                                        <div className="space-y-2.5">
                                            {rev.topMovers?.map((item: any, i: number) => {
                                                const maxRev = rev.topMovers[0]?.revenue || 1;
                                                const pct = (item.revenue / maxRev) * 100;
                                                return (
                                                    <div key={i}>
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-sm text-gray-700 font-medium flex items-center gap-2">
                                                                <span className="text-xs text-gray-400 w-4 text-right">{i + 1}.</span>
                                                                <span className="truncate max-w-[160px]">{item.name}</span>
                                                            </span>
                                                            <span className="text-xs font-bold text-emerald-600">{item.qty} units · {inr(item.revenue)}</span>
                                                        </div>
                                                        <div className="w-full bg-gray-100 rounded-full h-1.5 ml-6">
                                                            <div className="h-1.5 rounded-full bg-gradient-to-r from-teal-400 to-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Doctor-wise revenue — IPD / OPD / Counter split */}
                            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b border-gray-100">
                                    <div>
                                        <h3 className="text-sm font-black text-gray-700">Doctor-wise Pharmacy Billing</h3>
                                        <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                                            IPD attributed to the admission&rsquo;s treating consultant &middot; sorted by total
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 cursor-pointer">
                                            <input type="checkbox" checked={doctorIpdOnly} onChange={e => setDoctorIpdOnly(e.target.checked)} className="accent-violet-600" />
                                            IPD only
                                        </label>
                                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 cursor-pointer">
                                            <input type="checkbox" checked={doctorByMonth} onChange={e => setDoctorByMonth(e.target.checked)} className="accent-violet-600" />
                                            Month-wise
                                        </label>
                                        <button onClick={printDoctorWise} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-[11px] font-bold rounded-lg hover:bg-gray-50">
                                            <FileText className="h-3.5 w-3.5" /> Print
                                        </button>
                                    </div>
                                </div>
                                {doctorRows.length === 0 ? (
                                    <div className="text-center py-10 text-gray-400 text-sm">No data</div>
                                ) : doctorByMonth ? (
                                    /* Doctor x month matrix. Columns come from byMonth so the
                                       column totals match the Monthly Summary exactly. */
                                    <div className="max-h-[420px] overflow-auto">
                                        <table className="w-full text-left">
                                            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                                                <tr>
                                                    <th className="px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">#</th>
                                                    <th className="px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Doctor</th>
                                                    {monthCols.map((m: any) => (
                                                        <th key={m.key} className="px-4 py-2.5 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider">{m.month}</th>
                                                    ))}
                                                    <th className="px-4 py-2.5 text-right text-[10px] font-black text-gray-400 uppercase tracking-wider">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {doctorRows.map((d: any, i: number) => (
                                                    <tr key={i} className="hover:bg-gray-50/50">
                                                        <td className="px-4 py-2.5 text-xs text-gray-400">{i + 1}</td>
                                                        <td className="px-4 py-2.5 text-sm font-bold text-gray-700">{d.name}</td>
                                                        {monthCols.map((m: any) => (
                                                            <td key={m.key} className="px-4 py-2.5 text-right text-sm text-gray-700">{inr(cellOf(d, m.key))}</td>
                                                        ))}
                                                        <td className="px-4 py-2.5 text-right text-sm font-black text-gray-900">
                                                            {inr(doctorIpdOnly ? d.ipd : d.revenue)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-gray-50 sticky bottom-0">
                                                <tr className="border-t-2 border-gray-200">
                                                    <td className="px-4 py-3 text-sm font-black text-gray-900" colSpan={2}>
                                                        {doctorIpdOnly ? 'Total IPD' : 'Total'} &mdash; {doctorRows.length} doctors
                                                    </td>
                                                    {monthCols.map((m: any) => (
                                                        <td key={m.key} className="px-4 py-3 text-right text-sm font-black text-gray-900">
                                                            {inr(doctorRows.reduce((t: number, d: any) => t + cellOf(d, m.key), 0))}
                                                        </td>
                                                    ))}
                                                    <td className="px-4 py-3 text-right text-sm font-black text-gray-900">
                                                        {inr(doctorIpdOnly ? doctorTotals.ipd : doctorTotals.revenue)}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="max-h-[420px] overflow-auto">
                                        <table className="w-full text-left">
                                            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                                                <tr>
                                                    {(doctorIpdOnly
                                                        ? ['#', 'Doctor', 'IPD Bills', 'IPD Amount']
                                                        : ['#', 'Doctor', 'Bills', 'IPD Amount', 'OPD Amount', 'Counter', 'Total']
                                                    ).map((h, i) => (
                                                        <th key={i} className={`px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-wider ${i >= 2 ? 'text-right' : ''}`}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {doctorRows.map((d: any, i: number) => (
                                                    <tr key={i} className="hover:bg-gray-50/50">
                                                        <td className="px-4 py-2.5 text-xs text-gray-400">{i + 1}</td>
                                                        <td className="px-4 py-2.5 text-sm font-bold text-gray-700">{d.name}</td>
                                                        {/* In IPD-only mode the OPD/Counter columns are dropped rather than
                                                            shown alongside a "Total" that silently includes them. */}
                                                        <td className="px-4 py-2.5 text-right text-xs text-gray-500">{doctorIpdOnly ? d.ipdBills : d.bills}</td>
                                                        <td className="px-4 py-2.5 text-right text-sm font-bold text-violet-700">{inr(d.ipd)}</td>
                                                        {!doctorIpdOnly && <td className="px-4 py-2.5 text-right text-sm text-blue-700">{inr(d.opd)}</td>}
                                                        {!doctorIpdOnly && <td className="px-4 py-2.5 text-right text-sm text-emerald-700">{inr(d.counter)}</td>}
                                                        {!doctorIpdOnly && <td className="px-4 py-2.5 text-right text-sm font-black text-gray-900">{inr(d.revenue)}</td>}
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-gray-50 sticky bottom-0">
                                                <tr className="border-t-2 border-gray-200">
                                                    <td className="px-4 py-3 text-sm font-black text-gray-900" colSpan={2}>
                                                        {doctorIpdOnly ? 'Total IPD' : 'Total'} &mdash; {doctorRows.length} doctors
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-sm font-black text-gray-900">{doctorIpdOnly ? doctorTotals.ipdBills : doctorTotals.bills}</td>
                                                    <td className="px-4 py-3 text-right text-sm font-black text-violet-700">{inr(doctorTotals.ipd)}</td>
                                                    {!doctorIpdOnly && <td className="px-4 py-3 text-right text-sm font-black text-blue-700">{inr(doctorTotals.opd)}</td>}
                                                    {!doctorIpdOnly && <td className="px-4 py-3 text-right text-sm font-black text-emerald-700">{inr(doctorTotals.counter)}</td>}
                                                    {!doctorIpdOnly && <td className="px-4 py-3 text-right text-sm font-black text-gray-900">{inr(doctorTotals.revenue)}</td>}
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Monthly summary — closes the report on a final total */}
                            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b border-gray-100">
                                    <h3 className="text-sm font-black text-gray-700">Monthly Summary &mdash; IPD / OPD / Counter</h3>
                                    <span className="text-[10px] text-gray-400 font-medium">
                                        {dateRange.from} to {dateRange.to}
                                    </span>
                                </div>
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            {['Month', 'Bills', 'IPD Amount', 'OPD Amount', 'Counter', 'Monthly Total'].map((h, i) => (
                                                <th key={i} className={`px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-wider ${i > 0 ? 'text-right' : ''}`}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {(rev.byMonth || []).length === 0 ? (
                                            <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">No billing in this period</td></tr>
                                        ) : (rev.byMonth as any[]).map((m, i) => (
                                            <tr key={i} className="hover:bg-gray-50/50">
                                                <td className="px-4 py-2.5 text-sm font-bold text-gray-700">{m.month}</td>
                                                <td className="px-4 py-2.5 text-right text-xs text-gray-500">{m.bills}</td>
                                                <td className="px-4 py-2.5 text-right text-sm font-bold text-violet-700">{inr(m.ipd)}</td>
                                                <td className="px-4 py-2.5 text-right text-sm text-blue-700">{inr(m.opd)}</td>
                                                <td className="px-4 py-2.5 text-right text-sm text-emerald-700">{inr(m.counter)}</td>
                                                <td className="px-4 py-2.5 text-right text-sm font-black text-gray-900">{inr(m.total)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {/* Grand total block — the final calculation the report ends on */}
                                <div className="border-t-2 border-gray-200 bg-gray-50 px-6 py-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Total IPD Amount</p>
                                        <p className="text-lg font-black text-violet-700">{inr(rev.grandTotal?.ipd ?? rev.byChannel.ipd.revenue)}</p>
                                        <p className="text-[10px] text-gray-400 font-medium">{rev.grandTotal?.ipdBills ?? rev.byChannel.ipd.billCount} bills</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Total OPD Amount</p>
                                        <p className="text-lg font-black text-blue-700">{inr(rev.grandTotal?.opd ?? rev.byChannel.opd.revenue)}</p>
                                        <p className="text-[10px] text-gray-400 font-medium">{rev.grandTotal?.opdBills ?? rev.byChannel.opd.billCount} bills</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Counter Sales</p>
                                        <p className="text-lg font-black text-emerald-700">{inr(rev.grandTotal?.counter ?? rev.byChannel.counter.revenue)}</p>
                                        <p className="text-[10px] text-gray-400 font-medium">{rev.grandTotal?.counterBills ?? rev.byChannel.counter.billCount} bills</p>
                                    </div>
                                    <div className="border-l-2 border-gray-300 pl-4">
                                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Overall Total</p>
                                        <p className="text-2xl font-black text-gray-900">{inr(rev.grandTotal?.total ?? rev.totalRevenue)}</p>
                                        <p className="text-[10px] text-gray-400 font-medium">{rev.grandTotal?.bills ?? rev.totalBills} bills</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'bills' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-bold text-gray-700">
                                    Bill-wise Pharmacy Sales — {channel === 'all' ? 'All channels' : channel === 'counter' ? 'Cash / Counter' : channel.toUpperCase()}
                                </p>
                                <button onClick={printBills} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50">
                                    <FileText className="h-3.5 w-3.5" /> Print
                                </button>
                            </div>
                            <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white">
                                <table className="w-full text-xs">
                                    <thead className="bg-gray-50">
                                        <tr className="text-gray-500">
                                            <th className="px-4 py-2 text-left">Bill No</th>
                                            <th className="px-4 py-2 text-left">Date</th>
                                            <th className="px-4 py-2 text-left">Patient</th>
                                            <th className="px-4 py-2 text-left">UHID</th>
                                            <th className="px-4 py-2 text-left">Type</th>
                                            <th className="px-4 py-2 text-left">Doctor</th>
                                            <th className="px-4 py-2 text-right">Items</th>
                                            <th className="px-4 py-2 text-right">Amount</th>
                                            <th className="px-4 py-2 text-center">Verify</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {(rev?.bills || []).length === 0 ? (
                                            <tr><td colSpan={9} className="text-center py-10 text-gray-400">No bills for this period / channel</td></tr>
                                        ) : (rev.bills as any[]).map((b, i) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 font-mono text-gray-800">{b.billNo || '—'}</td>
                                                <td className="px-4 py-2 text-gray-500">{new Date(b.date).toLocaleDateString('en-GB')}</td>
                                                <td className="px-4 py-2 text-gray-800">{b.patient}</td>
                                                <td className="px-4 py-2 font-mono text-[11px] text-gray-500">{b.patientId === 'WALKIN' ? '—' : b.patientId}</td>
                                                <td className="px-4 py-2">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${b.channel === 'ipd' ? 'bg-violet-50 text-violet-700' : b.channel === 'opd' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                        {b.channel === 'counter' ? 'CASH' : String(b.channel).toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2 text-gray-500">{b.doctor || '—'}</td>
                                                <td className="px-4 py-2 text-right">{b.items}</td>
                                                <td className="px-4 py-2 text-right font-bold text-gray-900">{inr(b.revenue)}</td>
                                                <td className="px-4 py-2 text-center">
                                                    <button onClick={() => openBillDetail(b.id)} title="Verify bill lines"
                                                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100">
                                                        <Eye className="h-3 w-3" /> View
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {(rev?.bills || []).length > 0 && (
                                        <tfoot className="bg-gray-50 font-black text-gray-800">
                                            {/* Per-channel subtotals, so IPD and OPD are totalled separately
                                                and not just rolled into one figure. */}
                                            {(['ipd', 'opd', 'counter'] as const)
                                                .filter(ch => (rev.bills as any[]).some(b => b.channel === ch))
                                                .map(ch => {
                                                    const rows = (rev.bills as any[]).filter(b => b.channel === ch);
                                                    return (
                                                        <tr key={ch} className="text-gray-600 border-t border-gray-200">
                                                            <td className="px-4 py-1.5" colSpan={6}>
                                                                {ch === 'counter' ? 'Counter / Cash' : ch.toUpperCase()} subtotal — {rows.length} bills
                                                            </td>
                                                            <td className="px-4 py-1.5 text-right">{rows.reduce((s, b) => s + (b.items || 0), 0)}</td>
                                                            <td className="px-4 py-1.5 text-right">{inr(rows.reduce((s, b) => s + (b.revenue || 0), 0))}</td>
                                                            <td />
                                                        </tr>
                                                    );
                                                })}
                                            <tr className="border-t-2 border-gray-300 text-gray-900">
                                                <td className="px-4 py-2" colSpan={6}>Grand Total — {(rev.bills as any[]).length} bills</td>
                                                <td className="px-4 py-2 text-right">{(rev.bills as any[]).reduce((s, b) => s + (b.items || 0), 0)}</td>
                                                <td className="px-4 py-2 text-right">{inr((rev.bills as any[]).reduce((s, b) => s + (b.revenue || 0), 0))}</td>
                                                <td />
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'expiry' && (
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        {['Medicine', 'Batch', 'Stock', 'Expiry', 'Days Left', 'Value at Risk'].map((h, i) => (
                                            <th key={i} className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {expiringBatches.length === 0 ? (
                                        <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">No expiring batches within 90 days</td></tr>
                                    ) : expiringBatches.map((batch: any, i: number) => {
                                        const badge = getExpiryBadge(batch.expiry_date);
                                        const price = Number(batch.medicine?.selling_price) || Number(batch.medicine?.price_per_unit) || 0;
                                        const atRisk = price * batch.current_stock;
                                        return (
                                            <tr key={i} className="hover:bg-gray-50/50">
                                                <td className="px-5 py-3 text-sm font-bold text-gray-700">{batch.medicine?.brand_name}</td>
                                                <td className="px-5 py-3"><span className="font-mono text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">{batch.batch_no}</span></td>
                                                <td className="px-5 py-3 text-sm font-bold text-gray-700">{batch.current_stock}</td>
                                                <td className="px-5 py-3 text-xs text-gray-500">{new Date(batch.expiry_date).toLocaleDateString('en-GB')}</td>
                                                <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge.cls}`}>{badge.label}</span></td>
                                                <td className="px-5 py-3 text-sm font-bold text-red-600">{inr(atRisk)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'stock' && (
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        {['Medicine', 'Current Stock', 'Min Threshold', 'Status'].map((h, i) => (
                                            <th key={i} className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {lowStock.length === 0 ? (
                                        <tr><td colSpan={4} className="text-center py-12 text-gray-400 text-sm">All medicines are well-stocked</td></tr>
                                    ) : lowStock.map((med: any, i: number) => (
                                        <tr key={i} className="hover:bg-gray-50/50">
                                            <td className="px-5 py-3">
                                                <span className="text-sm font-bold text-gray-700">{med.brand_name}</span>
                                                {med.generic_name && <span className="block text-[10px] text-gray-400">{med.generic_name}</span>}
                                            </td>
                                            <td className="px-5 py-3 text-sm font-black text-gray-700">{med.total_stock}</td>
                                            <td className="px-5 py-3 text-sm text-gray-500">{med.min_threshold}</td>
                                            <td className="px-5 py-3">
                                                {med.total_stock === 0 ? (
                                                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">OUT OF STOCK</span>
                                                ) : (
                                                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">LOW STOCK</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Movement Ledger Tab */}
                    {activeTab === 'movements' && (
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                            <div className="p-4 border-b border-gray-200 flex gap-2 flex-wrap items-center">
                                <span className="text-xs font-black text-gray-400 uppercase">Filter:</span>
                                {['', 'GRN_RECEIPT', 'DISPENSE', 'PATIENT_RETURN', 'SUPPLIER_RETURN', 'EXPIRY_WRITEOFF', 'ADJUSTMENT'].map(t => (
                                    <button key={t} onClick={() => setMovementFilter(t)}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${movementFilter === t ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                        {t || 'All'}
                                    </button>
                                ))}
                            </div>
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Date</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Medicine</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Batch</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Type</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">In</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Out</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Cost</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {movements.length === 0 ? (
                                        <tr><td colSpan={8} className="text-center py-8 text-gray-400">No movements found</td></tr>
                                    ) : movements.map((m: any) => {
                                        const typeColors: Record<string, string> = {
                                            GRN_RECEIPT: 'bg-emerald-100 text-emerald-700',
                                            DISPENSE: 'bg-blue-100 text-blue-700',
                                            PATIENT_RETURN: 'bg-purple-100 text-purple-700',
                                            SUPPLIER_RETURN: 'bg-orange-100 text-orange-700',
                                            EXPIRY_WRITEOFF: 'bg-red-100 text-red-700',
                                            ADJUSTMENT: 'bg-amber-100 text-amber-700',
                                        };
                                        return (
                                            <tr key={m.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 text-gray-500">{new Date(m.created_at).toLocaleDateString('en-GB')} {new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                                                <td className="px-4 py-2 font-bold text-gray-900">{m.medicine?.brand_name}</td>
                                                <td className="px-4 py-2 font-mono text-gray-500">{m.batch?.batch_no || '—'}</td>
                                                <td className="px-4 py-2"><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${typeColors[m.movement_type] || 'bg-gray-100 text-gray-600'}`}>{m.movement_type}</span></td>
                                                <td className="px-4 py-2 text-right font-bold text-emerald-600">{m.quantity_in > 0 ? `+${m.quantity_in}` : ''}</td>
                                                <td className="px-4 py-2 text-right font-bold text-red-600">{m.quantity_out > 0 ? `-${m.quantity_out}` : ''}</td>
                                                <td className="px-4 py-2 text-right text-gray-500">{m.unit_cost ? `₹${Number(m.unit_cost).toFixed(2)}` : '—'}</td>
                                                <td className="px-4 py-2 text-right font-black text-gray-900">{m.balance_after}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Controlled Drug Register Tab */}
                    {activeTab === 'narcotics' && (
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Date</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Drug</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Batch</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Source</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Patient</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Prescriber</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">In</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Out</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Balance</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Witness</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {narcotics.length === 0 ? (
                                        <tr><td colSpan={10} className="text-center py-8 text-gray-400">No controlled drug entries</td></tr>
                                    ) : narcotics.map((n: any) => (
                                        <tr key={n.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 text-gray-500">{new Date(n.created_at).toLocaleDateString('en-GB')}</td>
                                            <td className="px-4 py-2 font-bold text-gray-900">{n.drug_name}</td>
                                            <td className="px-4 py-2 font-mono text-gray-500">{n.batch_no || '—'}</td>
                                            <td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-100 text-gray-600">{n.source_type || n.transaction_type}</span></td>
                                            <td className="px-4 py-2 text-gray-600">{n.patient_name || '—'}</td>
                                            <td className="px-4 py-2 text-gray-600">{n.prescriber_name || '—'}</td>
                                            <td className="px-4 py-2 text-right font-bold text-emerald-600">{n.quantity_in > 0 ? `+${n.quantity_in}` : ''}</td>
                                            <td className="px-4 py-2 text-right font-bold text-red-600">{n.quantity_out > 0 ? `-${n.quantity_out}` : ''}</td>
                                            <td className="px-4 py-2 text-right font-black text-gray-900">{n.balance}</td>
                                            <td className="px-4 py-2 text-gray-500">{n.witness_name || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* ===== IPD / OPD bill verification drill-down ===== */}
            {billDetail && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-auto"
                    onClick={() => setBillDetail(null)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-8" onClick={e => e.stopPropagation()}>
                        {billDetailLoading || billDetail.loading ? (
                            <div className="p-10 flex items-center justify-center gap-2 text-gray-500 text-sm font-bold">
                                <Loader2 className="h-4 w-4 animate-spin" /> Loading bill…
                            </div>
                        ) : (
                            <>
                                <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-100">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${billDetail.channel === 'ipd' ? 'bg-violet-100 text-violet-700' : billDetail.channel === 'opd' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                {billDetail.channel === 'counter' ? 'CASH' : String(billDetail.channel).toUpperCase()}
                                            </span>
                                            <h3 className="text-sm font-black text-gray-900">{billDetail.billNo || 'Draft bill (no number yet)'}</h3>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {billDetail.patientName}
                                            {billDetail.patientId !== 'WALKIN' && <span className="font-mono text-gray-400"> · {billDetail.patientId}</span>}
                                            {billDetail.doctor && <span> · {billDetail.doctor}</span>}
                                        </p>
                                        {billDetail.channel === 'ipd' && (
                                            <p className="text-[11px] text-gray-400 mt-0.5">
                                                {billDetail.ward ? `${billDetail.ward} · ` : ''}{billDetail.bed ? `Bed ${billDetail.bed} · ` : ''}
                                                Admitted {billDetail.admissionDate ? new Date(billDetail.admissionDate).toLocaleDateString('en-GB') : '—'}
                                                {' · '}{billDetail.events.length} dispensing{billDetail.events.length === 1 ? '' : 's'}
                                            </p>
                                        )}
                                    </div>
                                    <button onClick={() => setBillDetail(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>

                                <div className="max-h-[60vh] overflow-auto px-6 py-4 space-y-5">
                                    {billDetail.events.length === 0 ? (
                                        <p className="text-center py-8 text-gray-400 text-sm">No pharmacy lines on this bill.</p>
                                    ) : billDetail.events.map((ev: any, i: number) => (
                                        <div key={i}>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <p className="text-[11px] font-black text-gray-500 uppercase tracking-wider">
                                                    Dispense {i + 1} · {new Date(ev.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                                <p className="text-xs font-black text-gray-800">{inr(ev.amount)}</p>
                                            </div>
                                            <table className="w-full text-xs border border-gray-100 rounded-lg overflow-hidden">
                                                <thead className="bg-gray-50 text-gray-500">
                                                    <tr>
                                                        <th className="px-3 py-1.5 text-left">Medicine</th>
                                                        <th className="px-3 py-1.5 text-left">Batch</th>
                                                        <th className="px-3 py-1.5 text-left">Expiry</th>
                                                        <th className="px-3 py-1.5 text-right">Qty</th>
                                                        <th className="px-3 py-1.5 text-right">Rate</th>
                                                        <th className="px-3 py-1.5 text-right">Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {ev.lines.map((l: any, j: number) => (
                                                        <tr key={j}>
                                                            <td className="px-3 py-1.5 text-gray-800 font-medium">{l.medicine}</td>
                                                            <td className="px-3 py-1.5 font-mono text-[11px] text-gray-500">{l.batchNo || '—'}</td>
                                                            <td className="px-3 py-1.5 text-[11px] text-gray-500">{l.expiry ? new Date(l.expiry).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—'}</td>
                                                            <td className="px-3 py-1.5 text-right text-gray-600">{l.quantity}</td>
                                                            <td className="px-3 py-1.5 text-right text-gray-600">{inr(l.unitPrice)}</td>
                                                            <td className="px-3 py-1.5 text-right font-bold text-gray-900">{inr(l.amount)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ))}
                                </div>

                                <div className="border-t-2 border-gray-200 bg-gray-50 px-6 py-4 flex flex-wrap items-end justify-between gap-4 rounded-b-2xl">
                                    <div className="text-[11px] text-gray-500 font-medium space-y-0.5">
                                        <p>{billDetail.lineCount} pharmacy line{billDetail.lineCount === 1 ? '' : 's'}</p>
                                        {billDetail.channel === 'ipd' && (
                                            // The IPD invoice covers the whole stay; only the pharmacy slice
                                            // belongs to this report, so both figures are shown side by side.
                                            <p>Full IPD bill (all departments): <span className="font-bold text-gray-700">{inr(billDetail.invoiceNet)}</span>
                                                {' · '}Balance due {inr(billDetail.balanceDue)}</p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                            {billDetail.channel === 'ipd' ? 'Pharmacy Total (this bill)' : 'Bill Total'}
                                        </p>
                                        <p className="text-xl font-black text-gray-900">{inr(billDetail.pharmacyTotal)}</p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </AppShell>
    );
}
