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
    Pill,
    Filter,
    X,
    Printer
} from "lucide-react";
import { getRecentPatientHistory } from "@/app/actions/patient-history-actions";

export default function PatientHistoryPage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showFilter, setShowFilter] = useState(false);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [printingRecord, setPrintingRecord] = useState<any>(null);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async (query?: string, from?: string, to?: string) => {
        setIsLoading(true);
        const res = await getRecentPatientHistory(query, from, to);
        if (res.success && res.data) {
            setHistoryData(res.data);
        }
        setIsLoading(false);
    };

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchQuery(val);
        const timeoutId = setTimeout(() => loadHistory(val, dateFrom, dateTo), 500);
        return () => clearTimeout(timeoutId);
    };

    const applyFilter = () => {
        setShowFilter(false);
        loadHistory(searchQuery, dateFrom, dateTo);
    };

    const clearFilter = () => {
        setDateFrom("");
        setDateTo("");
        setShowFilter(false);
        loadHistory(searchQuery, "", "");
    };

    const hasActiveFilter = !!(dateFrom || dateTo);

    const getServiceIcon = (service: string) => {
        const lower = service.toLowerCase();
        if (lower.includes('consultation')) return <Stethoscope className="h-4 w-4 text-emerald-600" />;
        if (lower.includes('x-ray') || lower.includes('test') || lower.includes('blood')) return <Activity className="h-4 w-4 text-blue-600" />;
        if (lower.includes('medicine') || lower.includes('pill')) return <Pill className="h-4 w-4 text-orange-600" />;
        return <FileText className="h-4 w-4 text-gray-500" />;
    };

    const handlePrintRecord = (record: any) => {
        setPrintingRecord(record);
        setTimeout(() => {
            window.print();
            setPrintingRecord(null);
        }, 100);
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
                <div className="relative max-w-xl">
                    <div className="bg-white p-2 border border-gray-200 shadow-sm rounded-2xl flex items-center gap-2">
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
                        {hasActiveFilter && (
                            <button onClick={clearFilter} className="p-1.5 text-gray-400 hover:text-gray-600">
                                <X className="h-4 w-4" />
                            </button>
                        )}
                        <button
                            onClick={() => setShowFilter(v => !v)}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl border transition-colors ${hasActiveFilter ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}`}
                        >
                            <Filter className="h-3.5 w-3.5" />
                            Filter{hasActiveFilter ? ' ✓' : ''}
                        </button>
                    </div>

                    {/* Filter dropdown */}
                    {showFilter && (
                        <div className="absolute top-full left-0 mt-2 z-20 bg-white border border-gray-200 rounded-2xl shadow-xl p-4 w-80 space-y-3">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Date Range</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">From</label>
                                    <input
                                        type="date"
                                        value={dateFrom}
                                        onChange={e => setDateFrom(e.target.value)}
                                        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-blue-400"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">To</label>
                                    <input
                                        type="date"
                                        value={dateTo}
                                        onChange={e => setDateTo(e.target.value)}
                                        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-blue-400"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button onClick={applyFilter} className="flex-1 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700">Apply</button>
                                <button onClick={clearFilter} className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-200">Clear</button>
                            </div>
                        </div>
                    )}
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
                                                <div className="flex flex-col items-end gap-1.5">
                                                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] uppercase tracking-widest font-black rounded-md flex items-center gap-1">
                                                        <CreditCard className="h-3 w-3" /> {record.status}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 font-mono">Invoice: {record.invoice_number}</span>
                                                    <button 
                                                        onClick={() => handlePrintRecord(record)}
                                                        className="mt-1 p-2 text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 rounded-lg transition-all no-print flex items-center gap-1.5"
                                                    >
                                                        <Printer className="h-3.5 w-3.5" />
                                                        <span className="text-[10px] font-black uppercase tracking-wider">Print</span>
                                                    </button>
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

            {/* Hidden Printing Area for History */}
            {printingRecord && (
                <div className="hidden print:block fixed inset-0 bg-white p-10 z-[100] text-black">
                    <div className="max-w-3xl mx-auto space-y-8">
                        {/* Hospital Header */}
                        <div className="flex justify-between items-start border-b-2 border-black pb-8">
                            <div className="space-y-2">
                                <h1 className="text-3xl font-black uppercase tracking-tighter">HOSPITAL RECEIPT</h1>
                                <div className="space-y-0.5 text-sm font-medium">
                                    <p>Medical Center Address Line 1</p>
                                    <p>City, State, PIN - 000000</p>
                                    <p>Contact: +91 00000 00000</p>
                                </div>
                            </div>
                            <div className="text-right space-y-1">
                                <p className="text-xl font-bold">{printingRecord.invoice_number}</p>
                                <p className="text-sm font-medium">{new Date(printingRecord.date).toLocaleDateString()} {new Date(printingRecord.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                        </div>

                        {/* Patient Info */}
                        <div className="grid grid-cols-2 gap-8 py-4">
                            <div className="space-y-1">
                                <p className="text-xs font-bold text-gray-400 uppercase">Patient Name</p>
                                <p className="text-lg font-bold">{printingRecord.patient.name}</p>
                                <p className="text-sm font-mono text-gray-500">{printingRecord.patient.id}</p>
                            </div>
                            <div className="space-y-1 text-right">
                                <p className="text-xs font-bold text-gray-400 uppercase">Contact</p>
                                <p className="text-lg font-bold">{printingRecord.patient.phone || "N/A"}</p>
                            </div>
                        </div>

                        {/* Services List */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-widest border-b border-gray-100 pb-2">Services Availed</h3>
                            <div className="space-y-3">
                                {printingRecord.services.map((srv: string, i: number) => (
                                    <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-sm">
                                        <span className="font-bold text-gray-800">{srv}</span>
                                        <span className="font-bold">1</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Totals Section */}
                        <div className="border-t-2 border-black pt-6">
                            <div className="flex justify-between items-center">
                                <span className="text-lg font-black uppercase tracking-widest">Total Amount</span>
                                <span className="text-2xl font-black font-mono">₹{Number(printingRecord.total_amount).toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="pt-24 flex justify-between items-end">
                            <div className="space-y-1 text-xs font-bold text-gray-400">
                                <p>Status: {printingRecord.status}</p>
                                <p>Payment: {printingRecord.payment_method || "Paid"}</p>
                            </div>
                            <div className="text-center w-64 border-t-2 border-dashed border-gray-900 pt-3">
                                <p className="text-sm font-black uppercase tracking-widest text-gray-900">Authorized Signatory</p>
                                <p className="text-[10px] font-medium text-gray-500 mt-1">Computer Generated Digital Receipt</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
