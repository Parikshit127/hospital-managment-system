"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/app/components/layout/AppShell";
import { LayoutDashboard, Users, CreditCard, Activity, TrendingUp } from "lucide-react";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { getReceptionDashboardStats } from "@/app/actions/dashboard-actions";

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend
);

export default function ReceptionDashboard() {
    const [stats, setStats] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        getReceptionDashboardStats().then(res => {
            if (res.success && res.data) {
                setStats(res.data);
            }
            setIsLoading(false);
        });
    }, []);

    if (isLoading) {
        return (
            <AppShell pageTitle="Dashboard" pageIcon={<LayoutDashboard className="h-5 w-5" />}>
                <div className="flex h-[60vh] items-center justify-center animate-pulse">
                    <p className="text-gray-500 font-medium">Loading Real-Time Analytics...</p>
                </div>
            </AppShell>
        );
    }

    if (!stats) {
        return (
            <AppShell pageTitle="Dashboard" pageIcon={<LayoutDashboard className="h-5 w-5" />}>
                <div className="flex h-[60vh] items-center justify-center">
                    <p className="text-red-500 font-medium">Failed to load analytics.</p>
                </div>
            </AppShell>
        );
    }

    const revenueOptions = {
        responsive: true,
        plugins: {
            legend: { display: false },
            title: { display: false }
        },
        scales: {
            y: { beginAtZero: true, grid: { color: '#f3f4f6' }, border: { dash: [4, 4] } },
            x: { grid: { display: false } }
        }
    };

    const revenueChartData = {
        labels: stats.chartLabels,
        datasets: [
            {
                label: 'Revenue (₹)',
                data: stats.revenueData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                fill: true,
            }
        ],
    };

    const visitsChartData = {
        labels: stats.chartLabels,
        datasets: [
            {
                label: 'Visits Logged',
                data: stats.visitsData,
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }
        ],
    };

    return (
        <AppShell pageTitle="Analytics Dashboard" pageIcon={<LayoutDashboard className="h-5 w-5" />}>
            <div className="max-w-6xl mx-auto space-y-6 animate-in pb-20">

                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Hospital Command Center</h1>
                    <p className="text-sm text-gray-500 mt-1">Live metrics strictly fetched from actual database entries.</p>
                </div>

                {/* Stat Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between overflow-hidden relative">
                        <div className="absolute -right-6 -top-6 text-emerald-50 opacity-50"><CreditCard className="w-32 h-32" /></div>
                        <div className="relative z-10">
                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Total Revenue</h3>
                            <h2 className="text-4xl font-black text-emerald-600 font-mono">₹{stats.totalRevenue.toLocaleString()}</h2>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between overflow-hidden relative">
                        <div className="absolute -right-6 -top-6 text-blue-50 opacity-50"><Users className="w-32 h-32" /></div>
                        <div className="relative z-10">
                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Total Patients</h3>
                            <h2 className="text-4xl font-black text-gray-900 font-mono">{stats.totalPatients.toLocaleString()}</h2>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between overflow-hidden relative">
                        <div className="absolute -right-6 -top-6 text-purple-50 opacity-50"><Activity className="w-32 h-32" /></div>
                        <div className="relative z-10">
                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Generated Bills</h3>
                            <h2 className="text-4xl font-black text-gray-900 font-mono">{stats.totalInvoices.toLocaleString()}</h2>
                        </div>
                    </div>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                        <h3 className="font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-emerald-500" /> Revenue Timeline (7 Days)
                        </h3>
                        <div className="h-72 w-full">
                            <Line options={revenueOptions} data={revenueChartData} />
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                        <h3 className="font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center gap-2">
                            <Users className="h-4 w-4 text-blue-500" /> Daily Patient Visits Logged (7 Days)
                        </h3>
                        <div className="h-72 w-full">
                            <Bar options={revenueOptions} data={visitsChartData} />
                        </div>
                    </div>
                </div>

                {/* Top Services */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <h3 className="font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center gap-2">
                        <Activity className="h-4 w-4 text-indigo-500" /> Most Frequent Services Billed
                    </h3>
                    <div className="space-y-4">
                        {stats.topServices.length === 0 ? (
                            <p className="text-sm text-gray-400 p-4 text-center">No service data available yet.</p>
                        ) : (
                            stats.topServices.map((svc: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center font-bold text-indigo-600 text-xs">#{idx + 1}</div>
                                        <span className="font-medium text-gray-700">{svc.name}</span>
                                    </div>
                                    <span className="text-sm font-black bg-gray-100 text-gray-600 px-3 py-1 rounded-full">{svc.count} logs</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </AppShell>
    );
}
