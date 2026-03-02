'use client';

import React, { useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { BarChart3, TrendingUp, Users, ShieldAlert, Download, CalendarClock } from 'lucide-react';
import { generateAdminReport } from '@/app/actions/admin-actions';
import * as XLSX from 'xlsx';

export default function ReportsHub() {
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
        const res = await generateAdminReport(reportType, dateRange);
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

        let formattedData: any[] = [];

        if (reportType === 'revenue') {
            formattedData = data.map(d => ({
                Date: new Date(d.created_at).toLocaleDateString(),
                Time: new Date(d.created_at).toLocaleTimeString(),
                Type: d.invoice_type,
                Amount_Collected: d.net_amount
            }));
        } else if (reportType === 'footfall') {
            formattedData = data.map(d => ({
                Appointment_Date: new Date(d.appointment_date).toLocaleDateString(),
                Department: d.department
            }));
        } else if (reportType === 'staff_activity') {
            formattedData = data.map(d => ({
                Timestamp: new Date(d.created_at).toLocaleString(),
                User: d.username,
                Action: d.action
            }));
        }

        const ws = XLSX.utils.json_to_sheet(formattedData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Report Data");
        XLSX.writeFile(wb, `${reportType}_report_${dateRange.start}_to_${dateRange.end}.xlsx`);
    };

    return (
        <AppShell
            pageTitle="Analytics & Reports Hub"
            pageIcon={<BarChart3 className="h-5 w-5" />}
        >
            <div className="grid lg:grid-cols-4 gap-8">
                {/* Left Controls */}
                <div className="lg:col-span-1">
                    <form onSubmit={handleGenerate} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6 sticky top-24">
                        <div>
                            <h3 className="font-black text-gray-900 mb-1">Report Parameters</h3>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-100 pb-4 mb-4">Query Builder</p>
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-3">Report Type</label>
                            <div className="space-y-3">
                                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${reportType === 'revenue' ? 'bg-emerald-50 border-emerald-500 text-emerald-900' : 'bg-white border-gray-200 hover:border-emerald-300'}`}>
                                    <input type="radio" name="type" value="revenue" checked={reportType === 'revenue'} onChange={e => setReportType(e.target.value)} className="hidden" />
                                    <TrendingUp className={`h-5 w-5 ${reportType === 'revenue' ? 'text-emerald-500' : 'text-gray-400'}`} />
                                    <span className="text-sm font-bold">Revenue & Collections</span>
                                </label>

                                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${reportType === 'footfall' ? 'bg-indigo-50 border-indigo-500 text-indigo-900' : 'bg-white border-gray-200 hover:border-indigo-300'}`}>
                                    <input type="radio" name="type" value="footfall" checked={reportType === 'footfall'} onChange={e => setReportType(e.target.value)} className="hidden" />
                                    <Users className={`h-5 w-5 ${reportType === 'footfall' ? 'text-indigo-500' : 'text-gray-400'}`} />
                                    <span className="text-sm font-bold">OPD Footfall Trends</span>
                                </label>

                                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${reportType === 'staff_activity' ? 'bg-rose-50 border-rose-500 text-rose-900' : 'bg-white border-gray-200 hover:border-rose-300'}`}>
                                    <input type="radio" name="type" value="staff_activity" checked={reportType === 'staff_activity'} onChange={e => setReportType(e.target.value)} className="hidden" />
                                    <ShieldAlert className={`h-5 w-5 ${reportType === 'staff_activity' ? 'text-rose-500' : 'text-gray-400'}`} />
                                    <span className="text-sm font-bold">System Audit / Activity</span>
                                </label>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2 mt-6 border-t border-gray-100 pt-6">Time Horizon</label>
                            <div className="space-y-4">
                                <div>
                                    <span className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">Start Date</span>
                                    <input required type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors" />
                                </div>
                                <div>
                                    <span className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">End Date (Inclusive)</span>
                                    <input required type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors" />
                                </div>
                            </div>
                        </div>

                        <button disabled={loading} type="submit" className="w-full mt-6 py-4 bg-gray-900 hover:bg-black text-white font-black rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2">
                            {loading ? 'Crunching Data...' : <><BarChart3 className="h-5 w-5" /> Generate Report</>}
                        </button>
                    </form>
                </div>

                {/* Right Viewport */}
                <div className="lg:col-span-3">
                    {generated ? (
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                                <div>
                                    <h2 className="text-xl font-black text-gray-900 capitalize px-2 inline-flex border-l-4 border-indigo-500 ml-[-24px]">{reportType.replace('_', ' ')} Data</h2>
                                    <p className="text-sm text-gray-500 font-medium mt-1">Found {data.length} records matching criteria.</p>
                                </div>
                                <button onClick={handleExport} className="bg-white border border-gray-200 text-gray-700 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 px-4 py-2 rounded-xl font-bold flex items-center gap-2 shadow-sm transition-colors text-sm">
                                    <Download className="h-4 w-4" /> Download .XLSX
                                </button>
                            </div>

                            <div className="overflow-x-auto">
                                {data.length === 0 ? (
                                    <div className="p-16 text-center text-gray-500">
                                        <CalendarClock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                                        <h3 className="font-bold">No results found in this timeframe.</h3>
                                        <p className="text-sm">Try expanding your search parameters.</p>
                                    </div>
                                ) : (
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        {reportType === 'revenue' && (
                                            <>
                                                <thead className="bg-white border-b border-gray-100 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                                                    <tr>
                                                        <th className="px-6 py-4">Transaction Date</th>
                                                        <th className="px-6 py-4">Invoice Type</th>
                                                        <th className="px-6 py-4 text-right">Net Collection (₹)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {data.map((d: any, i) => (
                                                        <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                                            <td className="px-6 py-4 font-bold text-gray-700">{new Date(d.created_at).toLocaleString()}</td>
                                                            <td className="px-6 py-4 font-bold text-indigo-700 bg-indigo-50/30 uppercase tracking-widest text-[10px]">{d.invoice_type}</td>
                                                            <td className="px-6 py-4 font-black text-gray-900 text-right">₹{Number(d.net_amount).toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </>
                                        )}

                                        {reportType === 'footfall' && (
                                            <>
                                                <thead className="bg-white border-b border-gray-100 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                                                    <tr>
                                                        <th className="px-6 py-4">Appointment Date</th>
                                                        <th className="px-6 py-4">Department / Cohort</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {data.map((d: any, i) => (
                                                        <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                                            <td className="px-6 py-4 font-bold text-gray-700">{new Date(d.appointment_date).toLocaleDateString()}</td>
                                                            <td className="px-6 py-4 font-black text-gray-900 relative pl-10">
                                                                <div className="absolute left-6 h-2 w-2 rounded-full bg-indigo-500 top-1/2 -mt-1"></div>
                                                                {d.department}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </>
                                        )}

                                        {reportType === 'staff_activity' && (
                                            <>
                                                <thead className="bg-white border-b border-gray-100 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                                                    <tr>
                                                        <th className="px-6 py-4">Timestamp</th>
                                                        <th className="px-6 py-4">Auth Name</th>
                                                        <th className="px-6 py-4">Action Payload</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {data.map((d: any, i) => (
                                                        <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                                            <td className="px-6 py-4 font-bold text-gray-700">{new Date(d.created_at).toLocaleString()}</td>
                                                            <td className="px-6 py-4 font-bold text-rose-700 max-w-[150px] truncate">{d.username}</td>
                                                            <td className="px-6 py-4 font-black text-gray-900 text-[10px] uppercase font-mono tracking-wider">{d.action}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </>
                                        )}
                                    </table>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-3xl p-16 text-center bg-gray-50/30 text-gray-500 min-h-[500px]">
                            <BarChart3 className="h-20 w-20 mx-auto mb-6 text-gray-300" />
                            <h2 className="text-2xl font-black text-gray-900 mb-2">Reports Hub Engine</h2>
                            <p className="text-sm font-medium leading-relaxed max-w-md mx-auto text-gray-500">Configure your report parameters in the left panel to execute complex read sequences across the Multi-Tenant architecture and export results securely.</p>
                        </div>
                    )}
                </div>
            </div>
        </AppShell>
    );
}
