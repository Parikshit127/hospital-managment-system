'use client';

import React, { useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { BarChart3, TrendingUp, CalendarClock, Download, DollarSign, Wallet } from 'lucide-react';
import { generateAdminReport } from '@/app/actions/admin-actions';
import * as XLSX from 'xlsx';

export default function FinanceReportsHub() {
    const [reportType, setReportType] = useState('revenue');

    // Default to last 30 days
    const defaultEnd = new Date().toISOString().split('T')[0];
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 30);

    const [dateRange, setDateRange] = useState({
        start: defaultStart.toISOString().split('T')[0],
        end: defaultEnd
    });

    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any[]>([]);
    const [generated, setGenerated] = useState(false);

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        // We will repurpose Admin Revenue report as the primary Finance collection Report
        const res = await generateAdminReport('revenue', dateRange);
        setLoading(false);
        if (res.success) {
            setData(res.data);
            setGenerated(true);
        } else {
            alert('Failed to generate report: ' + res.error);
        }
    };

    const handleExport = () => {
        if (data.length === 0) return alert('No data to export.');

        const formattedData = data.map(d => ({
            Date: new Date(d.created_at).toLocaleDateString(),
            Time: new Date(d.created_at).toLocaleTimeString(),
            Type: d.invoice_type,
            Amount_Collected: d.net_amount
        }));

        const ws = XLSX.utils.json_to_sheet(formattedData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Financial_Data");
        XLSX.writeFile(wb, `Finance_Report_${dateRange.start}_to_${dateRange.end}.xlsx`);
    };

    return (
        <AppShell
            pageTitle="Financial Statements & Analytics"
            pageIcon={<DollarSign className="h-5 w-5" />}
        >
            <div className="grid lg:grid-cols-4 gap-8">
                {/* Left Controls */}
                <div className="lg:col-span-1">
                    <form onSubmit={handleGenerate} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6 sticky top-24">
                        <div>
                            <h3 className="font-black text-gray-900 mb-1">Report Builder</h3>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-100 pb-4 mb-4">Select Template</p>
                        </div>

                        <div>
                            <div className="space-y-3">
                                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${reportType === 'revenue' ? 'bg-indigo-50 border-indigo-500 text-indigo-900' : 'bg-white border-gray-200 hover:border-indigo-300'}`}>
                                    <input type="radio" name="type" value="revenue" checked={reportType === 'revenue'} onChange={e => setReportType(e.target.value)} className="hidden" />
                                    <TrendingUp className={`h-5 w-5 ${reportType === 'revenue' ? 'text-indigo-500' : 'text-gray-400'}`} />
                                    <div className="leading-tight">
                                        <span className="text-sm font-bold block">Collections Report</span>
                                        <span className="text-[10px] text-gray-500 font-medium">Daily net revenue ledger</span>
                                    </div>
                                </label>

                                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${reportType === 'aging' ? 'bg-gray-100 border-gray-300 text-gray-400 opacity-60' : 'bg-white border-gray-200 opacity-60'}`}>
                                    <input type="radio" name="type" value="aging" disabled className="hidden" />
                                    <CalendarClock className={`h-5 w-5 text-gray-400`} />
                                    <div className="leading-tight">
                                        <span className="text-sm font-bold block">A/R Aging Summary</span>
                                        <span className="text-[10px] text-gray-500 font-medium">Coming soon</span>
                                    </div>
                                </label>

                                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${reportType === 'cashflow' ? 'bg-gray-100 border-gray-300 text-gray-400 opacity-60' : 'bg-white border-gray-200 opacity-60'}`}>
                                    <input type="radio" name="type" value="cashflow" disabled className="hidden" />
                                    <Wallet className={`h-5 w-5 text-gray-400`} />
                                    <div className="leading-tight">
                                        <span className="text-sm font-bold block">Cash Flow Statement</span>
                                        <span className="text-[10px] text-gray-500 font-medium">Coming soon</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2 mt-6 border-t border-gray-100 pt-6">Time Horizon</label>
                            <div className="space-y-4">
                                <div>
                                    <span className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">Start Period</span>
                                    <input required type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors" />
                                </div>
                                <div>
                                    <span className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">End Period (Inclusive)</span>
                                    <input required type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors" />
                                </div>
                            </div>
                        </div>

                        <button disabled={loading} type="submit" className="w-full mt-6 py-4 bg-gray-900 hover:bg-black text-white font-black rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2">
                            {loading ? 'Compiling Statement...' : <><DollarSign className="h-5 w-5" /> Execute Report</>}
                        </button>
                    </form>
                </div>

                {/* Right Viewport */}
                <div className="lg:col-span-3">
                    {generated ? (
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                                <div>
                                    <h2 className="text-xl font-black text-gray-900 capitalize px-2 inline-flex border-l-4 border-indigo-500 ml-[-24px]">{reportType.replace('_', ' ')} Register</h2>
                                    <p className="text-sm text-gray-500 font-medium mt-1">Compiled {data.length} general ledger entries.</p>
                                </div>
                                <button onClick={handleExport} className="bg-white border border-gray-200 text-gray-700 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 px-4 py-2 rounded-xl font-bold flex items-center gap-2 shadow-sm transition-colors text-sm">
                                    <Download className="h-4 w-4" /> Export .XLSX Excel
                                </button>
                            </div>

                            <div className="overflow-x-auto">
                                {data.length === 0 ? (
                                    <div className="p-16 text-center text-gray-500">
                                        <CalendarClock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                                        <h3 className="font-bold">No ledger activities found in this period.</h3>
                                        <p className="text-sm">Try expanding your reporting timeframe.</p>
                                    </div>
                                ) : (
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-white border-b border-gray-100 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                                            <tr>
                                                <th className="px-6 py-4">Transaction / Posting Date</th>
                                                <th className="px-6 py-4">Financial Class</th>
                                                <th className="px-6 py-4 text-right">Net Collection (₹)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {data.map((d: any, i) => (
                                                <tr key={i} className="hover:bg-gray-50/50 transition-colors group">
                                                    <td className="px-6 py-4 font-bold text-gray-700">{new Date(d.created_at).toLocaleString()}</td>
                                                    <td className="px-6 py-4">
                                                        <span className="font-bold text-indigo-700 bg-indigo-50/30 uppercase tracking-widest text-[10px] px-2 py-1 rounded inline-block">{d.invoice_type}</span>
                                                    </td>
                                                    <td className="px-6 py-4 font-black text-green-700 text-right text-lg">₹{Number(d.net_amount).toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-3xl p-16 text-center bg-gray-50/30 text-gray-500 min-h-[500px]">
                            <DollarSign className="h-20 w-20 mx-auto mb-6 text-gray-300" />
                            <h2 className="text-2xl font-black text-gray-900 mb-2">Financial Engine Ready</h2>
                            <p className="text-sm font-medium leading-relaxed max-w-md mx-auto text-gray-500">Select a report template and define your fiscal boundaries on the left to generate certified accounting outputs.</p>
                        </div>
                    )}
                </div>
            </div>
        </AppShell>
    );
}
