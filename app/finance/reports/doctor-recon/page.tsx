'use client';

/**
 * Doctor Revenue Recon
 * --------------------
 * Reproduces the hospital's monthly recon workbook: one spotlighted doctor vs.
 * every other doctor (bucketed as "Axten"), each split into IPD TPA / IPD Cash
 * / OPD Cash, plus the SNAPSHOT summary and Billed Rev. total from the source
 * file. See getDoctorRevenueRecon in report-actions.ts for the exact formulas.
 */

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AppShell } from '@/app/components/layout/AppShell';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { getDoctorRevenueRecon } from '@/app/actions/report-actions';
import { getDoctorsForDropdown } from '@/app/actions/admin-actions';
import { ArrowLeft, FileSpreadsheet, Loader2, Printer, Stethoscope } from 'lucide-react';

const fmt = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtCur = (n: number) => '₹' + fmt(n);

type Category = { patients: number; gross: number; discount: number; net: number; approved?: number; collection: number; patient_paid?: number; outstanding: number };
type Row = { label: string; doctor_id: string | null; ipd_tpa: Category; ipd_cash: Category; opd_cash: Category };
type SnapshotCell = { net: number; collection: number; credit: number };
type SnapshotRow = { label: string; ipd_tpa: SnapshotCell; ipd_cash: SnapshotCell; opd_cash: SnapshotCell; total: SnapshotCell };

export function DoctorReconContent({ shell = 'app' }: { shell?: 'app' | 'admin' }) {
    const adminMode = shell === 'admin';
    const Shell = adminMode ? AdminPage : AppShell;
    const _now = new Date();
    const _ld = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const firstOfMonth = _ld(new Date(_now.getFullYear(), _now.getMonth(), 1));
    const lastOfMonth = _ld(new Date(_now.getFullYear(), _now.getMonth() + 1, 0));

    const [from, setFrom] = useState(firstOfMonth);
    const [to, setTo] = useState(lastOfMonth);
    const [doctors, setDoctors] = useState<{ id: string; name: string | null; specialty: string | null }[]>([]);
    const [doctorId, setDoctorId] = useState('');
    const [rows, setRows] = useState<Row[] | null>(null);
    const [snapshot, setSnapshot] = useState<SnapshotRow[] | null>(null);
    const [billedRev, setBilledRev] = useState(0);
    const [excludedDraftIpd, setExcludedDraftIpd] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getDoctorsForDropdown().then((res) => {
            if (res.success && res.data) {
                setDoctors(res.data as any);
                if (!doctorId && res.data.length) setDoctorId((res.data[0] as any).id);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const load = useCallback(async () => {
        if (!doctorId) return;
        setLoading(true);
        setError(null);
        const res = await getDoctorRevenueRecon({ from, to, spotlightDoctorId: doctorId });
        if (res.success && res.data) {
            setRows(res.data.rows as any);
            setSnapshot(res.data.snapshot as any);
            setBilledRev(res.data.billedRev);
            setExcludedDraftIpd((res.data as any).excludedDraftIpd ?? 0);
        } else {
            setRows(null);
            setSnapshot(null);
            setError(res.error || 'Failed to load report');
        }
        setLoading(false);
    }, [from, to, doctorId]);

    useEffect(() => { if (doctorId) load(); }, [doctorId, load]);

    async function handleExportExcel() {
        if (!rows || !snapshot) return;
        const xlsxModule = await import('xlsx');
        const XLSX = xlsxModule.default ?? xlsxModule;

        const aoa: any[][] = [];
        aoa.push(['', 'IPD TPA', '', '', '', '', '', '', '', 'IPD CASH', '', '', '', '', '', 'OPD', '', '', '', '', '']);
        aoa.push(['', 'No. of Patients', 'Gross Rev.', 'Discount', 'IPD TPA Net Rev', 'Approved Amount', 'TPA Settled', 'Patient Paid', 'Outstanding',
            'No. of Patients', 'Gross Rev.', 'Discount', 'IPD CASH Net Rev', 'Collection', 'Outstanding',
            'No. of Patients', 'OPD Cash Gross Rev', 'Discount', 'OPD Cash Net Rev', 'Collection', 'Outstanding']);
        const rowLine = (r: Row) => [
            r.label,
            r.ipd_tpa.patients, r.ipd_tpa.gross, r.ipd_tpa.discount, r.ipd_tpa.net, r.ipd_tpa.approved, r.ipd_tpa.collection, r.ipd_tpa.patient_paid ?? 0, r.ipd_tpa.outstanding,
            r.ipd_cash.patients, r.ipd_cash.gross, r.ipd_cash.discount, r.ipd_cash.net, r.ipd_cash.collection, r.ipd_cash.outstanding,
            r.opd_cash.patients, r.opd_cash.gross, r.opd_cash.discount, r.opd_cash.net, r.opd_cash.collection, r.opd_cash.outstanding,
        ];
        rows.slice(0, 2).forEach((r) => aoa.push(rowLine(r)));
        aoa.push([]);
        aoa.push(rowLine(rows[2]));
        aoa.push([]);
        aoa.push([]);
        aoa.push(['SNAPSHOT']);
        aoa.push(['', snapshot[0].label, '', '', snapshot[1].label, '', '', 'BOTH', '', '']);
        aoa.push(['', 'Net Rev', 'Collection', 'Credit', 'Net Rev', 'Collection', 'Credit', 'Net Rev', 'Collection', 'Credit']);
        (['ipd_tpa', 'ipd_cash', 'opd_cash'] as const).forEach((k, i) => {
            const label = k === 'ipd_tpa' ? 'Rev IPD TPA (Approved)' : k === 'ipd_cash' ? 'Rev IPD CASH' : 'Rev OPD CASH';
            aoa.push([label, snapshot[0][k].net, snapshot[0][k].collection, snapshot[0][k].credit, snapshot[1][k].net, snapshot[1][k].collection, snapshot[1][k].credit, snapshot[2][k].net, snapshot[2][k].collection, snapshot[2][k].credit]);
        });
        aoa.push(['', snapshot[0].total.net, snapshot[0].total.collection, snapshot[0].total.credit, snapshot[1].total.net, snapshot[1].total.collection, snapshot[1].total.credit, snapshot[2].total.net, snapshot[2].total.collection, snapshot[2].total.credit]);
        aoa.push([]);
        aoa.push(['', '', '', '', '', '', '', '', 'Billed Rev.', billedRev]);

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        XLSX.writeFile(wb, `Doctor-Recon-${from}-to-${to}.xlsx`);
    }

    const spotlight = rows?.[0];
    const axten = rows?.[1];
    const total = rows?.[2];

    return (
        <Shell pageTitle="Doctor Revenue Recon" pageIcon={<Stethoscope className="h-5 w-5" />} onRefresh={load} refreshing={loading}>
            <div className="max-w-7xl mx-auto print:max-w-none">
                <div className="flex items-center justify-between mb-4 print:hidden">
                    <Link href={adminMode ? '/admin/finance/reports' : '/finance/reports'}
                        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600">
                        <ArrowLeft className="h-4 w-4" /> Back to reports
                    </Link>
                    <div className="flex items-center gap-2">
                        <button onClick={handleExportExcel} disabled={!rows}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50">
                            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Export Excel
                        </button>
                        <button onClick={() => window.print()} disabled={!rows}
                            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50">
                            <Printer className="h-4 w-4" /> Print
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-wrap items-end gap-3 print:hidden">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase">Spotlight doctor</label>
                        <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}
                            className="block px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white min-w-[220px]">
                            {doctors.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}{d.specialty ? ` — ${d.specialty}` : ''}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase">From</label>
                        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase">To</label>
                        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <button onClick={load} className="px-4 py-2 rounded-lg bg-indigo-500 text-white font-bold text-sm hover:bg-indigo-600">
                        Generate
                    </button>
                    <p className="w-full text-[11px] text-gray-400">
                        IPD bills count on discharge date; OPD bills count on bill date. Everyone except the spotlighted doctor rolls into &quot;Axten&quot;.
                    </p>
                </div>

                {error && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-600">{error}</div>}

                {/* Draft bills discharged in the period are excluded from the figures —
                    surface the count so staff know to finalise them, not lose them. */}
                {rows && excludedDraftIpd > 0 && (
                    <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                        <b>{excludedDraftIpd}</b> IPD bill{excludedDraftIpd === 1 ? '' : 's'} discharged in this period {excludedDraftIpd === 1 ? 'is' : 'are'} still
                        in <b>Draft</b> and excluded from the figures below. Finalise them to have their revenue counted.
                    </div>
                )}

                {loading && !rows ? (
                    <div className="p-10 text-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin inline" /> Loading…</div>
                ) : !spotlight || !axten || !total ? (
                    <div className="p-10 text-center text-gray-400">Pick a doctor and date range, then Generate.</div>
                ) : (
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                                <thead>
                                    <tr className="text-center">
                                        <th className="border border-gray-200 p-1.5 bg-gray-50"></th>
                                        <th className="border border-gray-200 p-1.5 bg-indigo-50 font-black" colSpan={8}>IPD TPA</th>
                                        <th className="border border-gray-200 p-1.5 bg-emerald-50 font-black" colSpan={6}>IPD CASH</th>
                                        <th className="border border-gray-200 p-1.5 bg-amber-50 font-black" colSpan={6}>OPD</th>
                                    </tr>
                                    <tr className="text-center text-[10px] text-gray-500">
                                        <th className="border border-gray-200 p-1.5"></th>
                                        <th className="border border-gray-200 p-1.5">No. of Patients</th>
                                        <th className="border border-gray-200 p-1.5">Gross Rev.</th>
                                        <th className="border border-gray-200 p-1.5">Discount</th>
                                        <th className="border border-gray-200 p-1.5">Net Rev</th>
                                        <th className="border border-gray-200 p-1.5">Approved Amount</th>
                                        <th className="border border-gray-200 p-1.5">TPA Settled</th>
                                        <th className="border border-gray-200 p-1.5">Patient Paid</th>
                                        <th className="border border-gray-200 p-1.5">Outstanding</th>
                                        <th className="border border-gray-200 p-1.5">No. of Patients</th>
                                        <th className="border border-gray-200 p-1.5">Gross Rev.</th>
                                        <th className="border border-gray-200 p-1.5">Discount</th>
                                        <th className="border border-gray-200 p-1.5">Net Rev</th>
                                        <th className="border border-gray-200 p-1.5">Collection</th>
                                        <th className="border border-gray-200 p-1.5">Outstanding</th>
                                        <th className="border border-gray-200 p-1.5">No. of Patients</th>
                                        <th className="border border-gray-200 p-1.5">Gross Rev.</th>
                                        <th className="border border-gray-200 p-1.5">Discount</th>
                                        <th className="border border-gray-200 p-1.5">Net Rev</th>
                                        <th className="border border-gray-200 p-1.5">Collection</th>
                                        <th className="border border-gray-200 p-1.5">Outstanding</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[spotlight, axten].map((r) => (
                                        <tr key={r.label} className="text-right">
                                            <td className="border border-gray-200 p-1.5 text-left font-bold">{r.label}</td>
                                            <td className="border border-gray-200 p-1.5">{fmt(r.ipd_tpa.patients)}</td>
                                            <td className="border border-gray-200 p-1.5">{fmtCur(r.ipd_tpa.gross)}</td>
                                            <td className="border border-gray-200 p-1.5">{fmtCur(r.ipd_tpa.discount)}</td>
                                            <td className="border border-gray-200 p-1.5">{fmtCur(r.ipd_tpa.net)}</td>
                                            <td className="border border-gray-200 p-1.5">{fmtCur(r.ipd_tpa.approved || 0)}</td>
                                            <td className="border border-gray-200 p-1.5">{fmtCur(r.ipd_tpa.collection)}</td>
                                            <td className="border border-gray-200 p-1.5 text-emerald-700">{fmtCur(r.ipd_tpa.patient_paid || 0)}</td>
                                            <td className="border border-gray-200 p-1.5 font-bold text-amber-700">{fmtCur(r.ipd_tpa.outstanding)}</td>
                                            <td className="border border-gray-200 p-1.5">{fmt(r.ipd_cash.patients)}</td>
                                            <td className="border border-gray-200 p-1.5">{fmtCur(r.ipd_cash.gross)}</td>
                                            <td className="border border-gray-200 p-1.5">{fmtCur(r.ipd_cash.discount)}</td>
                                            <td className="border border-gray-200 p-1.5">{fmtCur(r.ipd_cash.net)}</td>
                                            <td className="border border-gray-200 p-1.5">{fmtCur(r.ipd_cash.collection)}</td>
                                            <td className="border border-gray-200 p-1.5 font-bold text-amber-700">{fmtCur(r.ipd_cash.outstanding)}</td>
                                            <td className="border border-gray-200 p-1.5">{fmt(r.opd_cash.patients)}</td>
                                            <td className="border border-gray-200 p-1.5">{fmtCur(r.opd_cash.gross)}</td>
                                            <td className="border border-gray-200 p-1.5">{fmtCur(r.opd_cash.discount)}</td>
                                            <td className="border border-gray-200 p-1.5">{fmtCur(r.opd_cash.net)}</td>
                                            <td className="border border-gray-200 p-1.5">{fmtCur(r.opd_cash.collection)}</td>
                                            <td className="border border-gray-200 p-1.5 font-bold text-amber-700">{fmtCur(r.opd_cash.outstanding)}</td>
                                        </tr>
                                    ))}
                                    <tr className="text-right bg-gray-50 font-black">
                                        <td className="border border-gray-200 p-1.5 text-left">Total</td>
                                        <td className="border border-gray-200 p-1.5">{fmt(total.ipd_tpa.patients)}</td>
                                        <td className="border border-gray-200 p-1.5">{fmtCur(total.ipd_tpa.gross)}</td>
                                        <td className="border border-gray-200 p-1.5">{fmtCur(total.ipd_tpa.discount)}</td>
                                        <td className="border border-gray-200 p-1.5">{fmtCur(total.ipd_tpa.net)}</td>
                                        <td className="border border-gray-200 p-1.5">{fmtCur(total.ipd_tpa.approved || 0)}</td>
                                        <td className="border border-gray-200 p-1.5">{fmtCur(total.ipd_tpa.collection)}</td>
                                        <td className="border border-gray-200 p-1.5 text-emerald-700">{fmtCur(total.ipd_tpa.patient_paid || 0)}</td>
                                        <td className="border border-gray-200 p-1.5 text-amber-700">{fmtCur(total.ipd_tpa.outstanding)}</td>
                                        <td className="border border-gray-200 p-1.5">{fmt(total.ipd_cash.patients)}</td>
                                        <td className="border border-gray-200 p-1.5">{fmtCur(total.ipd_cash.gross)}</td>
                                        <td className="border border-gray-200 p-1.5">{fmtCur(total.ipd_cash.discount)}</td>
                                        <td className="border border-gray-200 p-1.5">{fmtCur(total.ipd_cash.net)}</td>
                                        <td className="border border-gray-200 p-1.5">{fmtCur(total.ipd_cash.collection)}</td>
                                        <td className="border border-gray-200 p-1.5 text-amber-700">{fmtCur(total.ipd_cash.outstanding)}</td>
                                        <td className="border border-gray-200 p-1.5">{fmt(total.opd_cash.patients)}</td>
                                        <td className="border border-gray-200 p-1.5">{fmtCur(total.opd_cash.gross)}</td>
                                        <td className="border border-gray-200 p-1.5">{fmtCur(total.opd_cash.discount)}</td>
                                        <td className="border border-gray-200 p-1.5">{fmtCur(total.opd_cash.net)}</td>
                                        <td className="border border-gray-200 p-1.5">{fmtCur(total.opd_cash.collection)}</td>
                                        <td className="border border-gray-200 p-1.5 text-amber-700">{fmtCur(total.opd_cash.outstanding)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {snapshot && (
                            <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-x-auto">
                                <h3 className="font-black text-gray-700 mb-3 text-sm uppercase tracking-wide">Snapshot</h3>
                                <table className="text-xs border-collapse">
                                    <thead>
                                        <tr className="text-center">
                                            <th className="border border-gray-200 p-1.5"></th>
                                            <th className="border border-gray-200 p-1.5 bg-indigo-50 font-black" colSpan={3}>{snapshot[0].label}</th>
                                            <th className="border border-gray-200 p-1.5 bg-emerald-50 font-black" colSpan={3}>{snapshot[1].label}</th>
                                            <th className="border border-gray-200 p-1.5 bg-gray-100 font-black" colSpan={3}>BOTH</th>
                                        </tr>
                                        <tr className="text-center text-[10px] text-gray-500">
                                            <th className="border border-gray-200 p-1.5"></th>
                                            {[0, 1, 2].map((i) => (
                                                <React.Fragment key={i}>
                                                    <th className="border border-gray-200 p-1.5">Net Rev</th>
                                                    <th className="border border-gray-200 p-1.5">Collection</th>
                                                    <th className="border border-gray-200 p-1.5">Credit</th>
                                                </React.Fragment>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {([
                                            ['ipd_tpa', 'Rev IPD TPA (Approved)'],
                                            ['ipd_cash', 'Rev IPD CASH'],
                                            ['opd_cash', 'Rev OPD CASH'],
                                        ] as const).map(([key, label]) => (
                                            <tr key={key} className="text-right">
                                                <td className="border border-gray-200 p-1.5 text-left font-bold">{label}</td>
                                                {snapshot.map((s) => (
                                                    <React.Fragment key={s.label + key}>
                                                        <td className="border border-gray-200 p-1.5">{fmtCur((s as any)[key].net)}</td>
                                                        <td className="border border-gray-200 p-1.5">{fmtCur((s as any)[key].collection)}</td>
                                                        <td className="border border-gray-200 p-1.5 text-amber-700">{fmtCur((s as any)[key].credit)}</td>
                                                    </React.Fragment>
                                                ))}
                                            </tr>
                                        ))}
                                        <tr className="text-right bg-gray-50 font-black">
                                            <td className="border border-gray-200 p-1.5 text-left"></td>
                                            {snapshot.map((s) => (
                                                <React.Fragment key={s.label + 'total'}>
                                                    <td className="border border-gray-200 p-1.5">{fmtCur(s.total.net)}</td>
                                                    <td className="border border-gray-200 p-1.5">{fmtCur(s.total.collection)}</td>
                                                    <td className="border border-gray-200 p-1.5 text-amber-700">{fmtCur(s.total.credit)}</td>
                                                </React.Fragment>
                                            ))}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                            <span className="font-black text-gray-700 text-sm uppercase tracking-wide">Billed Rev.</span>
                            <span className="text-xl font-black text-gray-900">{fmtCur(billedRev)}</span>
                        </div>
                    </div>
                )}
            </div>
        </Shell>
    );
}

export default function DoctorReconPage() {
    return <DoctorReconContent />;
}
