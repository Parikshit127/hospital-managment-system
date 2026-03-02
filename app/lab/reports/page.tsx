'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { FileText, Clock, BarChart } from 'lucide-react';
import { getLabTATReport } from '@/app/actions/lab-actions';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement);

export default function LabReportsPage() {
    const [report, setReport] = useState<any>(null);
    const [days, setDays] = useState(7);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = async () => {
        setRefreshing(true);
        const res = await getLabTATReport(days);
        if (res.success) setReport(res.data);
        setRefreshing(false);
    };

    useEffect(() => { loadData(); }, [days]);

    const chartOptions = { responsive: true, plugins: { legend: { position: 'bottom' as const } } };

    const trendsData = {
        labels: report?.dailyStats?.map((s: any) => s.date) || [],
        datasets: [
            { label: 'Completed', data: report?.dailyStats?.map((s: any) => s.completed) || [], borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.5)', tension: 0.3 },
            { label: 'Total Orders', data: report?.dailyStats?.map((s: any) => s.total) || [], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.5)', tension: 0.3 }
        ]
    };

    const volumeData = {
        labels: report?.testCounts?.slice(0, 5).map((t: any) => t.test) || [],
        datasets: [
            { label: 'Test Volume', data: report?.testCounts?.slice(0, 5).map((t: any) => t.count) || [], backgroundColor: '#6366f1' }
        ]
    };

    return (
        <AppShell
            pageTitle="Laboratory Reports"
            pageIcon={<FileText className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={refreshing}
            headerActions={
                <select value={days} onChange={e => setDays(Number(e.target.value))} className="bg-white border border-gray-200 text-sm font-bold text-gray-700 py-1.5 px-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20">
                    <option value={7}>Last 7 Days</option>
                    <option value={30}>Last 30 Days</option>
                </select>
            }
        >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Clock className="h-5 w-5 text-teal-600" />
                        <h3 className="font-bold text-gray-900">Order Trends</h3>
                    </div>
                    <Line data={trendsData} options={chartOptions} />
                </div>
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <BarChart className="h-5 w-5 text-indigo-600" />
                        <h3 className="font-bold text-gray-900">Top Test Volumes</h3>
                    </div>
                    <Bar data={volumeData} options={chartOptions} />
                </div>
            </div>

            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 text-sm tracking-wide uppercase">Raw Data - Top Ordered Tests</h3>
                </div>
                <div className="p-4">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 text-gray-400">
                                <th className="pb-3 font-bold text-xs uppercase tracking-wider">Test Name</th>
                                <th className="pb-3 font-bold text-xs uppercase tracking-wider text-right">Volume</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {report?.testCounts?.map((t: any) => (
                                <tr key={t.test}>
                                    <td className="py-3 font-medium text-gray-900">{t.test}</td>
                                    <td className="py-3 font-bold text-gray-700 text-right">{t.count}</td>
                                </tr>
                            ))}
                            {report?.testCounts?.length === 0 && (
                                <tr><td colSpan={2} className="py-4 text-center text-gray-400">No data available for selected period.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </AppShell>
    );
}
