'use client';

import React, { useState, useMemo } from 'react';
import { Activity, Heart, Thermometer, Wind, RefreshCw, ChevronLeft, ChevronRight, BarChart3, Table2, TrendingUp, TrendingDown } from 'lucide-react';
import { usePatientRecords } from '@/app/lib/hooks/usePatientData';
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const PAGE_SIZE = 10;

type TimeRange = '7d' | '30d' | '90d' | '1y';

const NORMAL_RANGES = {
    heart_rate: { min: 60, max: 100, unit: 'bpm' },
    temperature: { min: 97, max: 99.5, unit: '°F' },
    oxygen_sat: { min: 95, max: 100, unit: '%' },
    systolic: { min: 90, max: 120, unit: 'mmHg' },
    diastolic: { min: 60, max: 80, unit: 'mmHg' },
};

function parseBP(bp: string): { systolic: number; diastolic: number } | null {
    if (!bp) return null;
    const match = bp.match(/(\d+)\s*[/]\s*(\d+)/);
    if (!match) return null;
    return { systolic: parseInt(match[1]), diastolic: parseInt(match[2]) };
}

function getTrend(values: number[]): 'up' | 'down' | 'stable' {
    if (values.length < 2) return 'stable';
    const recent = values.slice(-3);
    const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
    const older = values.slice(0, Math.max(1, values.length - 3));
    const oldAvg = older.reduce((s, v) => s + v, 0) / older.length;
    const diff = ((avg - oldAvg) / oldAvg) * 100;
    if (Math.abs(diff) < 3) return 'stable';
    return diff > 0 ? 'up' : 'down';
}

export default function VitalsPage() {
    const { data, isLoading: loading, isValidating, refresh } = usePatientRecords();
    const [page, setPage] = useState(0);
    const [viewMode, setViewMode] = useState<'charts' | 'table'>('charts');
    const [timeRange, setTimeRange] = useState<TimeRange>('30d');

    const vitals = data?.vitals || [];
    const latest = vitals.length > 0 ? vitals[0] : null;

    // Filter vitals by time range
    const filteredVitals = useMemo(() => {
        const now = new Date();
        const cutoff = new Date();
        switch (timeRange) {
            case '7d': cutoff.setDate(now.getDate() - 7); break;
            case '30d': cutoff.setDate(now.getDate() - 30); break;
            case '90d': cutoff.setDate(now.getDate() - 90); break;
            case '1y': cutoff.setFullYear(now.getFullYear() - 1); break;
        }
        return vitals.filter((v: any) => new Date(v.recorded_at || v.created_at) >= cutoff).reverse();
    }, [vitals, timeRange]);

    // Chart data
    const chartLabels = filteredVitals.map((v: any) =>
        new Date(v.recorded_at || v.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    );

    const hrValues = filteredVitals.map((v: any) => v.heart_rate || null);
    const tempValues = filteredVitals.map((v: any) => v.temperature || null);
    const spo2Values = filteredVitals.map((v: any) => v.oxygen_sat || v.oxygen_saturation || null);
    const systolicValues = filteredVitals.map((v: any) => parseBP(v.blood_pressure)?.systolic || null);
    const diastolicValues = filteredVitals.map((v: any) => parseBP(v.blood_pressure)?.diastolic || null);

    const hrTrend = getTrend(hrValues.filter(Boolean) as number[]);
    const tempTrend = getTrend(tempValues.filter(Boolean) as number[]);

    const makeChartData = (label: string, values: (number | null)[], color: string, fillColor: string) => ({
        labels: chartLabels,
        datasets: [{
            label,
            data: values,
            borderColor: color,
            backgroundColor: fillColor,
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointBackgroundColor: values.map((v, i) => {
                if (v === null) return color;
                // Color anomalies red
                if (label === 'Heart Rate' && (v < NORMAL_RANGES.heart_rate.min || v > NORMAL_RANGES.heart_rate.max)) return '#ef4444';
                if (label === 'Temperature' && (v < NORMAL_RANGES.temperature.min || v > NORMAL_RANGES.temperature.max)) return '#ef4444';
                if (label === 'SpO2' && v < NORMAL_RANGES.oxygen_sat.min) return '#ef4444';
                return color;
            }),
        }],
    });

    const chartOptions = (min: number, max: number) => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: 'index' as const, intersect: false } },
        scales: {
            y: { suggestedMin: min, suggestedMax: max, grid: { color: '#f3f4f6' } },
            x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
        },
    });

    // Table pagination
    const historyVitals = vitals.slice(1);
    const totalPages = Math.ceil(historyVitals.length / PAGE_SIZE);
    const pagedVitals = historyVitals.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    if (loading) {
        return (
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="animate-pulse space-y-6">
                    <div className="h-6 w-48 bg-gray-200 rounded-lg" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-gray-200 rounded-2xl" />)}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                        <Activity className="h-6 w-6 text-emerald-500" /> My Vitals History
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Track your health measurements over time.</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* View toggle */}
                    <div className="flex bg-gray-100 p-0.5 rounded-lg">
                        <button onClick={() => setViewMode('charts')}
                            className={`p-1.5 rounded-md transition ${viewMode === 'charts' ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-400'}`}>
                            <BarChart3 className="h-4 w-4" />
                        </button>
                        <button onClick={() => setViewMode('table')}
                            className={`p-1.5 rounded-md transition ${viewMode === 'table' ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-400'}`}>
                            <Table2 className="h-4 w-4" />
                        </button>
                    </div>
                    <button onClick={refresh} disabled={isValidating} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition disabled:opacity-50">
                        <RefreshCw className={`h-5 w-5 ${isValidating ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Summary cards with trend arrows */}
            {latest ? (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-3">
                                <div className="h-10 w-10 bg-rose-100 rounded-full flex items-center justify-center">
                                    <Heart className="h-5 w-5 text-rose-600" />
                                </div>
                            </div>
                            <p className="text-xs uppercase tracking-widest font-bold text-rose-400 mb-1">Blood Pressure</p>
                            <p className="text-2xl font-black text-rose-900">{latest.blood_pressure || '--'}</p>
                            <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase">mmHg</p>
                        </div>
                        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-3">
                                <div className="h-10 w-10 bg-orange-100 rounded-full flex items-center justify-center">
                                    <Activity className="h-5 w-5 text-orange-600" />
                                </div>
                                {hrTrend !== 'stable' && (
                                    <span className={`text-xs font-bold flex items-center gap-0.5 ${hrTrend === 'up' ? 'text-red-500' : 'text-emerald-500'}`}>
                                        {hrTrend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs uppercase tracking-widest font-bold text-orange-400 mb-1">Heart Rate</p>
                            <p className="text-2xl font-black text-orange-900">{latest.heart_rate || '--'}</p>
                            <p className="text-[10px] font-bold text-orange-500 mt-1 uppercase">BPM</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-3">
                                <div className="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center">
                                    <Thermometer className="h-5 w-5 text-amber-600" />
                                </div>
                                {tempTrend !== 'stable' && (
                                    <span className={`text-xs font-bold flex items-center gap-0.5 ${tempTrend === 'up' ? 'text-red-500' : 'text-emerald-500'}`}>
                                        {tempTrend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs uppercase tracking-widest font-bold text-amber-400 mb-1">Temperature</p>
                            <p className="text-2xl font-black text-amber-900">{latest.temperature || '--'}</p>
                            <p className="text-[10px] font-bold text-amber-500 mt-1 uppercase">°F</p>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 hover:shadow-md transition-shadow">
                            <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                                <Wind className="h-5 w-5 text-blue-600" />
                            </div>
                            <p className="text-xs uppercase tracking-widest font-bold text-blue-400 mb-1">Oxygen (SpO2)</p>
                            <p className="text-2xl font-black text-blue-900">{latest.oxygen_sat || latest.oxygen_saturation || '--'}</p>
                            <p className="text-[10px] font-bold text-blue-500 mt-1 uppercase">%</p>
                        </div>
                    </div>
                </>
            ) : (
                <div className="border border-dashed border-gray-200 rounded-3xl p-16 text-center text-gray-500 bg-gray-50/50">
                    <Activity className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-lg font-black text-gray-800">No Vitals Recorded</p>
                    <p className="text-sm">We don&apos;t have any vital signs on file for you.</p>
                </div>
            )}

            {/* Charts View */}
            {viewMode === 'charts' && filteredVitals.length >= 2 && (
                <>
                    {/* Time range selector */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 uppercase">Range:</span>
                        {(['7d', '30d', '90d', '1y'] as TimeRange[]).map(r => (
                            <button key={r} onClick={() => setTimeRange(r)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                                    timeRange === r ? 'bg-emerald-100 text-emerald-700' : 'text-gray-400 hover:bg-gray-100'
                                }`}>
                                {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : r === '90d' ? '90 Days' : '1 Year'}
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Blood Pressure Chart */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-4">
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Blood Pressure</h4>
                            <div className="h-48">
                                <Line
                                    data={{
                                        labels: chartLabels,
                                        datasets: [
                                            { label: 'Systolic', data: systolicValues, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.05)', fill: true, tension: 0.4, pointRadius: 3 },
                                            { label: 'Diastolic', data: diastolicValues, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.05)', fill: true, tension: 0.4, pointRadius: 3 },
                                        ],
                                    }}
                                    options={chartOptions(50, 160)}
                                />
                            </div>
                        </div>

                        {/* Heart Rate Chart */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-4">
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Heart Rate</h4>
                            <div className="h-48">
                                <Line data={makeChartData('Heart Rate', hrValues, '#f97316', 'rgba(249,115,22,0.05)')} options={chartOptions(40, 130)} />
                            </div>
                        </div>

                        {/* Temperature Chart */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-4">
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Temperature</h4>
                            <div className="h-48">
                                <Line data={makeChartData('Temperature', tempValues, '#f59e0b', 'rgba(245,158,11,0.05)')} options={chartOptions(95, 104)} />
                            </div>
                        </div>

                        {/* SpO2 Chart */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-4">
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Oxygen Saturation (SpO2)</h4>
                            <div className="h-48">
                                <Line data={makeChartData('SpO2', spo2Values, '#3b82f6', 'rgba(59,130,246,0.05)')} options={chartOptions(85, 100)} />
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Table View */}
            {(viewMode === 'table' || filteredVitals.length < 2) && historyVitals.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                        <h3 className="font-bold text-gray-900 uppercase tracking-widest text-xs">Historical Readings</h3>
                        {totalPages > 1 && (
                            <div className="flex items-center gap-2">
                                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition">
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="text-xs font-bold text-gray-500">{page + 1} / {totalPages}</span>
                                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition">
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-white border-b border-gray-100 text-gray-500 text-xs uppercase">
                                <tr>
                                    <th className="px-6 py-4 font-bold">Date / Time</th>
                                    <th className="px-6 py-4 font-bold text-rose-500">BP</th>
                                    <th className="px-6 py-4 font-bold text-orange-500">HR</th>
                                    <th className="px-6 py-4 font-bold text-amber-500">Temp</th>
                                    <th className="px-6 py-4 font-bold text-blue-500">SpO2</th>
                                    <th className="px-6 py-4 font-bold text-gray-400">Weight</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {pagedVitals.map((v: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 font-bold text-gray-900">{new Date(v.recorded_at || v.created_at).toLocaleString()}</td>
                                        <td className="px-6 py-4 font-bold text-gray-800">{v.blood_pressure || '-'}</td>
                                        <td className="px-6 py-4 font-bold text-gray-800">{v.heart_rate || '-'}</td>
                                        <td className="px-6 py-4 font-bold text-gray-800">{v.temperature || '-'}</td>
                                        <td className="px-6 py-4 font-bold text-gray-800">{v.oxygen_sat || v.oxygen_saturation || '-'}</td>
                                        <td className="px-6 py-4 font-medium text-gray-500">{v.weight || '-'} kg</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
