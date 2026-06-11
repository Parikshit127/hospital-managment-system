'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { getMISReport } from '@/app/actions/report-actions';
import {
    FileSpreadsheet, Download, Loader2, Search, Filter,
    TrendingUp, IndianRupee, Building2, ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

const fmt = (n: number) => Number(n || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const fmtNum = (n: number) => {
    if (!n || n === 0) return '-';
    return Number(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
};
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

// All 30 MIS columns definition
const MIS_COLUMNS: { key: string; label: string; type: 'text' | 'currency' | 'date'; width: string }[] = [
    { key: 'bill_type', label: 'Visit Type', type: 'text', width: '80px' },
    { key: 'bill_date', label: 'Bill Date', type: 'date', width: '100px' },
    { key: 'bill_no', label: 'Bill No.', type: 'text', width: '140px' },
    { key: 'uhid', label: 'UHID / MRN', type: 'text', width: '130px' },
    { key: 'patient_name', label: 'Patient Name', type: 'text', width: '180px' },
    { key: 'phone', label: 'Phone', type: 'text', width: '110px' },
    { key: 'doctor_name', label: 'Doctor / Consultant', type: 'text', width: '180px' },
    { key: 'department', label: 'Department', type: 'text', width: '150px' },
    { key: 'admission_category', label: 'Category', type: 'text', width: '100px' },
    { key: 'tpa_corporate_name', label: 'TPA / Corporate', type: 'text', width: '150px' },
    { key: 'admission_date', label: 'Admission Date', type: 'date', width: '100px' },
    { key: 'discharge_date', label: 'Discharge Date', type: 'date', width: '100px' },
    { key: 'room_category', label: 'Room Category', type: 'text', width: '110px' },
    { key: 'package_vs_nonpackage', label: 'Pkg / Non-Pkg', type: 'text', width: '100px' },
    { key: 'package_income', label: 'Package', type: 'currency', width: '100px' },
    { key: 'consultation_income', label: 'Consultation', type: 'currency', width: '100px' },
    { key: 'room_rent_income', label: 'Room Rent', type: 'currency', width: '100px' },
    { key: 'procedure_income', label: 'OT / Procedure', type: 'currency', width: '110px' },
    { key: 'pharma_income', label: 'Pharmacy', type: 'currency', width: '100px' },
    { key: 'lab_income', label: 'Lab', type: 'currency', width: '100px' },
    { key: 'radiology_income', label: 'Radiology', type: 'currency', width: '100px' },
    { key: 'ct_mri_income', label: 'CT / MRI', type: 'currency', width: '100px' },
    { key: 'nursing_income', label: 'Nursing', type: 'currency', width: '100px' },
    { key: 'consumables_income', label: 'Consumables', type: 'currency', width: '100px' },
    { key: 'implant_income', label: 'Implant / Stent', type: 'currency', width: '110px' },
    { key: 'credit_note', label: 'Credit Note', type: 'currency', width: '100px' },
    { key: 'gross_amount', label: 'Gross Amount', type: 'currency', width: '110px' },
    { key: 'discount', label: 'Discount', type: 'currency', width: '100px' },
    { key: 'net_amount', label: 'Net Amount', type: 'currency', width: '110px' },
    { key: 'gross_net_diff', label: 'Gross − Net Diff', type: 'currency', width: '110px' },
    { key: 'received_amount', label: 'Received', type: 'currency', width: '110px' },
    { key: 'outstanding_amount', label: 'Outstanding', type: 'currency', width: '110px' },
    { key: 'patient_receipt', label: 'Patient Receipt', type: 'currency', width: '110px' },
    { key: 'referral_source', label: 'Referral Source', type: 'text', width: '120px' },
    { key: 'status', label: 'Status', type: 'text', width: '90px' },
    { key: 'remarks', label: 'Remarks', type: 'text', width: '150px' },
];

export default function MISReportPage() {
    const today = new Date().toISOString().slice(0, 10);
    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

    const [from, setFrom] = useState(firstOfMonth);
    const [to, setTo] = useState(today);
    const [billType, setBillType] = useState('all');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [exporting, setExporting] = useState(false);

    const loadReport = useCallback(async () => {
        setLoading(true);
        setData(null);
        const res = await getMISReport({ from, to, billType });
        if (res.success && 'data' in res) setData(res.data);
        setLoading(false);
    }, [from, to, billType]);

    useEffect(() => { loadReport(); }, []);

    const rows = data?.rows || [];
    const summary = data?.summary || {};

    const filtered = rows.filter((r: any) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (
            r.patient_name?.toLowerCase().includes(s) ||
            r.bill_no?.toLowerCase().includes(s) ||
            r.uhid?.toLowerCase().includes(s) ||
            r.doctor_name?.toLowerCase().includes(s) ||
            r.phone?.includes(s) ||
            r.tpa_corporate_name?.toLowerCase().includes(s)
        );
    });

    async function handleExportExcel() {
        if (!filtered.length) return;
        setExporting(true);
        try {
            const xlsxModule = await import('xlsx');
            const XLSX = xlsxModule.default ?? xlsxModule;

            const exportRows = filtered.map((r: any) => {
                const row: Record<string, any> = {};
                MIS_COLUMNS.forEach(col => {
                    if (col.type === 'date') {
                        row[col.label] = r[col.key] ? new Date(r[col.key]).toLocaleDateString('en-GB') : '';
                    } else if (col.type === 'currency') {
                        row[col.label] = Number(r[col.key] || 0);
                    } else {
                        row[col.label] = r[col.key] || '';
                    }
                });
                return row;
            });

            // Add totals row
            const totalsRow: Record<string, any> = {};
            MIS_COLUMNS.forEach(col => {
                if (col.type === 'currency') {
                    totalsRow[col.label] = filtered.reduce((s: number, r: any) => s + Number(r[col.key] || 0), 0);
                } else if (col.key === 'patient_name') {
                    totalsRow[col.label] = `TOTAL (${filtered.length} Bills)`;
                } else {
                    totalsRow[col.label] = '';
                }
            });
            exportRows.push(totalsRow);

            const ws = XLSX.utils.json_to_sheet(exportRows);

            // Set column widths
            ws['!cols'] = MIS_COLUMNS.map(col => ({
                wch: col.type === 'currency' ? 14 : col.key === 'patient_name' ? 25 : 18,
            }));

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'MIS Report');
            XLSX.writeFile(wb, `MIS-Report-${from}-to-${to}.xlsx`);
        } catch (err) {
            console.error('Export failed:', err);
            alert('Export failed. Please try again.');
        } finally {
            setExporting(false);
        }
    }

    // Column totals for footer
    const colTotals: Record<string, number> = {};
    MIS_COLUMNS.filter(c => c.type === 'currency').forEach(col => {
        colTotals[col.key] = filtered.reduce((s: number, r: any) => s + Number(r[col.key] || 0), 0);
    });

    return (
        <AppShell pageTitle="MIS Report" pageIcon={<FileSpreadsheet className="h-5 w-5" />} onRefresh={loadReport} refreshing={loading}>
            <div className="space-y-4">

                {/* Back Link */}
                <Link href="/finance/reports" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-emerald-700 transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to Financial Reports
                </Link>

                {/* Filters Bar */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                        <div className="flex flex-col sm:flex-row gap-3 flex-1">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">From Date</label>
                                <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">To Date</label>
                                <input type="date" value={to} onChange={e => setTo(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Bill Type</label>
                                <select value={billType} onChange={e => setBillType(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                                    <option value="all">All Types</option>
                                    <option value="IPD">IPD Only</option>
                                    <option value="OPD">OPD Only</option>
                                    <option value="Pharmacy">Pharmacy Only</option>
                                    <option value="Lab">Lab Only</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={loadReport}
                                className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition flex items-center gap-2">
                                <Filter className="h-4 w-4" /> Generate
                            </button>
                            <button onClick={handleExportExcel} disabled={exporting || !filtered.length}
                                className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                {exporting ? 'Exporting...' : 'Download Excel'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Summary Cards */}
                {data && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <SummaryCard label="Total Bills" value={String(summary.total_bills || 0)} sub={`IPD: ${summary.ipd_count || 0} | OPD: ${summary.opd_count || 0}`} color="emerald" />
                        <SummaryCard label="Gross Revenue" value={fmt(summary.total_gross || 0)} color="blue" />
                        <SummaryCard label="Net Revenue" value={fmt(summary.total_net || 0)} color="emerald" />
                        <SummaryCard label="Received" value={fmt(summary.total_received || 0)} color="emerald" />
                        <SummaryCard label="Outstanding" value={fmt(summary.total_outstanding || 0)} color="red" />
                        <SummaryCard label="Discount" value={fmt(summary.total_discount || 0)} color="amber" />
                    </div>
                )}

                {/* Search */}
                {data && rows.length > 0 && (
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search patient, bill no, UHID, doctor, phone..."
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none" />
                    </div>
                )}

                {/* Data Table */}
                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                    </div>
                ) : !data ? (
                    <div className="text-center py-24 text-gray-400">
                        <FileSpreadsheet className="h-10 w-10 mx-auto mb-3" />
                        <p className="font-medium">Select date range and click Generate</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-24 text-gray-400">
                        <FileSpreadsheet className="h-10 w-10 mx-auto mb-3" />
                        <p className="font-medium">No bills found for selected filters</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                            <span className="text-sm font-semibold text-gray-700">
                                Showing {filtered.length} of {rows.length} bills
                            </span>
                            <span className="text-xs text-gray-400">
                                {from} to {to} | Scroll horizontally for all columns
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="text-xs" style={{ minWidth: '3200px' }}>
                                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-3 py-2.5 text-center text-[10px] font-black text-gray-400 uppercase tracking-wider w-10">#</th>
                                        {MIS_COLUMNS.map(col => (
                                            <th key={col.key}
                                                className={`px-3 py-2.5 text-[10px] font-black uppercase tracking-wider ${col.type === 'currency' ? 'text-right text-emerald-600' : 'text-left text-gray-500'}`}
                                                style={{ minWidth: col.width }}>
                                                {col.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filtered.map((row: any, idx: number) => (
                                        <tr key={`${row.bill_no}-${idx}`} className="hover:bg-emerald-50/30 transition-colors">
                                            <td className="px-3 py-2 text-center text-gray-400 font-mono">{idx + 1}</td>
                                            {MIS_COLUMNS.map(col => (
                                                <td key={col.key}
                                                    className={`px-3 py-2 ${col.type === 'currency' ? 'text-right font-mono tabular-nums' : 'text-left'} ${
                                                        col.key === 'patient_name' ? 'font-medium text-gray-900' :
                                                        col.key === 'bill_no' ? 'font-mono font-bold text-emerald-700' :
                                                        col.key === 'outstanding_amount' && Number(row[col.key]) > 0 ? 'text-rose-600 font-bold' :
                                                        col.type === 'currency' ? 'text-gray-700' : 'text-gray-600'
                                                    }`}>
                                                    {col.key === 'bill_type' ? (
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                            row.bill_type === 'IPD' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'
                                                        }`}>{row.bill_type}</span>
                                                    ) : col.key === 'admission_category' ? (
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                            row.admission_category === 'Cash' ? 'bg-emerald-100 text-emerald-700' :
                                                            row.admission_category === 'TPA/Insurance' ? 'bg-blue-100 text-blue-700' :
                                                            'bg-orange-100 text-orange-700'
                                                        }`}>{row.admission_category}</span>
                                                    ) : col.key === 'status' ? (
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                            row.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                                                            row.status === 'Unpaid' ? 'bg-red-100 text-red-700' :
                                                            row.status === 'Partially Paid' ? 'bg-amber-100 text-amber-700' :
                                                            'bg-gray-100 text-gray-600'
                                                        }`}>{row.status}</span>
                                                    ) : col.type === 'date' ? (
                                                        fmtDate(row[col.key])
                                                    ) : col.type === 'currency' ? (
                                                        fmtNum(row[col.key])
                                                    ) : (
                                                        row[col.key] || '-'
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                                {/* Totals Footer */}
                                <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                                    <tr className="font-bold">
                                        <td className="px-3 py-3 text-center text-gray-500"></td>
                                        {MIS_COLUMNS.map(col => (
                                            <td key={col.key}
                                                className={`px-3 py-3 ${col.type === 'currency' ? 'text-right font-mono tabular-nums text-gray-900' : 'text-left text-gray-500'}`}>
                                                {col.key === 'patient_name' ? `TOTAL (${filtered.length})` :
                                                 col.type === 'currency' ? fmt(colTotals[col.key] || 0) : ''}
                                            </td>
                                        ))}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </AppShell>
    );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
    const bg: Record<string, string> = {
        emerald: 'bg-emerald-50 border-emerald-200',
        red: 'bg-red-50 border-red-200',
        amber: 'bg-amber-50 border-amber-200',
        blue: 'bg-blue-50 border-blue-200',
    };
    return (
        <div className={`rounded-xl border p-3 ${bg[color] || bg.emerald}`}>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{value}</p>
            {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
        </div>
    );
}
