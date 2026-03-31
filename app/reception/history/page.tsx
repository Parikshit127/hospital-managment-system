"use client";

import React, { useState, useEffect } from "react";
import { AppShell } from '@/app/components/layout/AppShell';
import {
    Clock,
    Search,
    Calendar,
    Activity,
    CreditCard,
    Stethoscope,
    FileText,
    Pill
} from "lucide-react";
import { getRecentPatientHistory } from "@/app/actions/patient-history-actions";

export default function PatientHistoryPage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async (query?: string) => {
        setIsLoading(true);
        const res = await getRecentPatientHistory(query);
        if (res.success && res.data) {
            setHistoryData(res.data);
        }
        setIsLoading(false);
    };

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchQuery(val);
        // Debounce search
        const timeoutId = setTimeout(() => loadHistory(val), 500);
        return () => clearTimeout(timeoutId);
    };

    const getServiceIcon = (service: string) => {
        const lower = service.toLowerCase();
        if (lower.includes('consultation')) return <Stethoscope className="h-4 w-4 text-emerald-600" />;
        if (lower.includes('x-ray') || lower.includes('test') || lower.includes('blood')) return <Activity className="h-4 w-4 text-blue-600" />;
        if (lower.includes('medicine') || lower.includes('pill')) return <Pill className="h-4 w-4 text-orange-600" />;
        return <FileText className="h-4 w-4 text-gray-500" />;
    };

    return (
        <AppShell pageTitle="Patient History" pageIcon={<Clock className="h-5 w-5" />}>
            <div className="space-y-8 animate-in pb-24">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="p-2.5 bg-blue-100/80 rounded-xl">
                                <Clock className="h-6 w-6 text-blue-600" />
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                                Patient Services History
                            </h1>
                        </div>
                        <p className="text-gray-500 text-sm ml-12">
                            View all past services, consultations, lab tests, and corresponding bills.
                        </p>
                    </div>
                </div>

                {/* Search Master Bar */}
                <div className="bg-white p-2 border border-gray-200 shadow-sm rounded-2xl flex items-center gap-2 max-w-xl">
                    <div className="pl-4 pr-2 text-gray-400">
                        <Search className="h-5 w-5" />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={handleSearch}
                        placeholder="Search by Patient Name, Phone or ID..."
                        className="flex-1 bg-transparent border-none py-3 text-sm font-medium focus:ring-0 outline-none placeholder:text-gray-400"
                    />
                    <button className="px-6 py-2.5 bg-gray-50 text-gray-700 text-sm font-bold rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors">
                        Filter
                    </button>
                </div>

                {/* Patient History Timeline / Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2"><Calendar className="h-4 w-4 text-gray-400" /> Recent Service Records</h3>
                        <span className="text-xs font-bold bg-white border border-gray-200 text-gray-500 px-3 py-1 rounded-full">{historyData.length} records found</span>
                    </div>

                    <div className="p-0">
                        {isLoading ? (
                            <div className="py-24 flex flex-col items-center justify-center text-gray-400">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
                                <p className="text-sm font-medium">Scanning patient records...</p>
                            </div>
                        ) : historyData.length === 0 ? (
                            <div className="py-24 text-center flex flex-col items-center justify-center">
                                <Clock className="h-12 w-12 text-gray-200 mb-3" />
                                <p className="text-gray-500 font-bold">No history records found.</p>
                                <p className="text-gray-400 text-sm mt-1">Generate a receipt for a patient to log services.</p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white border-b border-gray-100">
                                        <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-widest w-40">Date & Time</th>
                                        <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-widest w-64">Patient Details</th>
                                        <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-widest">Services Availed</th>
                                        <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Invoice / Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {historyData.map((record) => (
                                        <tr key={record.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="py-5 px-6 align-top">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-bold text-gray-900">{new Date(record.date).toLocaleDateString()}</p>
                                                    <p className="text-xs font-medium text-gray-500">{new Date(record.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                </div>
                                            </td>
                                            <td className="py-5 px-6 align-top">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-bold text-gray-900">{record.patient.name}</p>
                                                    <p className="text-xs font-mono text-gray-500">{record.patient.id}</p>
                                                    <p className="text-xs font-medium text-gray-400 flex items-center gap-1.5 pt-1">
                                                        {record.patient.phone && record.patient.phone !== "0000000000" ? record.patient.phone : "No Phone"}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="py-5 px-6 align-top">
                                                <div className="flex flex-wrap gap-2">
                                                    {record.services.map((srv: string, idx: number) => (
                                                        <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 shadow-sm">
                                                            {getServiceIcon(srv)} {srv}
                                                        </span>
                                                    ))}
                                                    {record.services.length === 0 && (
                                                        <span className="text-xs text-gray-400 italic">No specific services logged</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-5 px-6 align-top text-right space-y-2">
                                                <p className="text-lg font-black font-mono text-gray-900">₹{Number(record.total_amount).toFixed(0)}</p>
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] uppercase tracking-widest font-black rounded-md flex items-center gap-1">
                                                        <CreditCard className="h-3 w-3" /> {record.status}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 font-mono">Invoice: {record.invoice_number}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
