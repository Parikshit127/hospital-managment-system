"use client";

import React, { useState, useEffect } from 'react';
import {
    DollarSign, FileText, Clock, Search, Plus, Trash2, User, CreditCard,
    Calendar, Activity, Stethoscope, Pill, Loader2, Save, Inbox, Settings2
} from 'lucide-react';
import { ModuleHubLayout } from '../components/ModuleHubLayout';
import { searchPatientsForReceipt, getAvailableServicesList, saveFeeReceipt } from "@/app/actions/fee-receipt-actions";
import { getRecentPatientHistory } from "@/app/actions/patient-history-actions";
import { getFinanceConfig, saveFinanceConfig } from "@/app/actions/finance-config-actions";

const TABS = [
    { key: 'generate-receipt', label: 'Generate Receipt', icon: FileText },
    { key: 'patient-history', label: 'Patient History', icon: Clock },
    { key: 'finance-config', label: 'Fees & Configuration', icon: Settings2 },
];

function GenerateReceiptTab({ onSuccess }: { onSuccess: () => void }) {
    const [patientId, setPatientId] = useState<string>("");
    const [patientName, setPatientName] = useState("");
    const [patientPhone, setPatientPhone] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [patientResults, setPatientResults] = useState<any[]>([]);

    const [isSaving, setIsSaving] = useState(false);

    const [items, setItems] = useState([{ id: 1, description: "", amount: "", quantity: "1" }]);
    const [paymentMethod, setPaymentMethod] = useState("Cash");

    const [availableServices, setAvailableServices] = useState<{ label: string, price: number, type: string }[]>([]);

    useEffect(() => {
        getAvailableServicesList().then(res => {
            if (res.success && res.data) setAvailableServices(res.data);
        });
    }, []);

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.length < 2) {
            setPatientResults([]);
            return;
        }
        setIsSearching(true);
        const res = await searchPatientsForReceipt(query);
        if (res.success && res.data) setPatientResults(res.data);
        setIsSearching(false);
    };

    const selectPatient = (p: any) => {
        setPatientId(p.patient_id);
        setPatientName(p.full_name || "");
        setPatientPhone(p.phone || "");
        setSearchQuery("");
        setPatientResults([]);
    };

    const handleAddItem = () => {
        setItems([...items, { id: Date.now(), description: "", amount: "", quantity: "1" }]);
    };

    const handleRemoveItem = (id: number) => {
        if (items.length > 1) {
            setItems(items.filter(item => item.id !== id));
        }
    };

    const handleItemChange = (id: number, field: string, value: string) => {
        let newItems = [...items];
        const itemIdx = newItems.findIndex(i => i.id === id);
        if (itemIdx === -1) return;

        newItems[itemIdx] = { ...newItems[itemIdx], [field]: value };

        // Auto-fill price if description matches a service map
        if (field === 'description') {
            const match = availableServices.find(s => s.label === value);
            if (match) {
                newItems[itemIdx].amount = match.price.toString();
            }
        }

        setItems(newItems);
    };

    const totalAmount = items.reduce((sum, item) => sum + ((Number(item.amount) || 0) * (Number(item.quantity) || 1)), 0);

    const handleSave = async () => {
        if (!patientName.trim()) {
            alert("Patient Name is required");
            return;
        }
        setIsSaving(true);
        const res = await saveFeeReceipt({
            patient_id: patientId,
            patient_name: patientName,
            payment_method: paymentMethod,
            total_amount: totalAmount,
            items: items.map(i => ({
                description: i.description || "Misc Fee",
                amount: Number(i.amount) || 0,
                quantity: Number(i.quantity) || 1
            }))
        });

        setIsSaving(false);

        if (res.success) {
            alert("Record correctly logged inside Patient History.");
            // Reset form
            setPatientId("");
            setPatientName("");
            setPatientPhone("");
            setItems([{ id: Date.now(), description: "", amount: "", quantity: "1" }]);
            onSuccess();
        } else {
            alert("Failed to save receipt to Database: " + res.error);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-in pb-24">
            <datalist id="services-list">
                {availableServices.map((srv, i) => (
                    <option key={i} value={srv.label} />
                ))}
            </datalist>

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 border-b-2 border-transparent">Log Patient Services</h1>
                    <p className="text-sm text-gray-500 mt-1">Search an existing patient or quickly type their name to track their billable items.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md transition-all ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    {isSaving ? "Saving to Database..." : "Save Record"}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Patient Details Panel */}
                <div className="md:col-span-1 space-y-6 print:hidden">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
                        <h3 className="font-bold text-gray-900 border-b border-gray-100 pb-2">Patient Details</h3>

                        <div className="space-y-4 relative">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Search Real User</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={e => handleSearch(e.target.value)}
                                        placeholder="Search Name or Phone..."
                                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow bg-gray-50 hover:bg-white focus:bg-white"
                                    />
                                    {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 animate-spin" />}
                                </div>

                                {/* Search Dropdown */}
                                {patientResults.length > 0 && (
                                    <div className="absolute top-16 left-0 right-0 bg-white border border-gray-200 shadow-xl rounded-xl z-20 max-h-48 overflow-y-auto">
                                        {patientResults.map(p => (
                                            <div
                                                key={p.patient_id}
                                                className="px-4 py-3 hover:bg-emerald-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors"
                                                onClick={() => selectPatient(p)}
                                            >
                                                <p className="text-sm font-bold text-gray-900">{p.full_name}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">{p.phone} • {p.patient_id}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="relative py-2">
                                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-100"></span></div>
                                <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-400 font-bold tracking-wider">Or Manual Entry</span></div>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Patient Name</label>
                                    <div className="relative mt-1">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={patientName}
                                            onChange={e => { setPatientName(e.target.value); setPatientId(""); }}
                                            placeholder="Enter full name"
                                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 outline-none"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Phone Number (Optional)</label>
                                    <input
                                        type="tel"
                                        value={patientPhone}
                                        onChange={e => { setPatientPhone(e.target.value); setPatientId(""); }}
                                        placeholder="Mobile number"
                                        className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 outline-none mt-1"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-5">
                        <h3 className="font-bold text-emerald-900 border-b border-emerald-200/50 pb-2 mb-4">Payment Method</h3>
                        <div className="space-y-3">
                            <label className="flex items-center p-3 bg-white border border-emerald-200 rounded-xl cursor-pointer hover:border-emerald-500 transition-colors shadow-sm">
                                <input type="radio" name="payment" value="Cash" checked={paymentMethod === "Cash"} onChange={e => setPaymentMethod(e.target.value)} className="h-4 w-4 text-emerald-600 focus:ring-emerald-500" />
                                <span className="ml-3 text-sm font-bold text-gray-900 flex items-center gap-2"><DollarSign className="h-4 w-4 text-emerald-500" /> Cash / UPI</span>
                            </label>
                            <label className="flex items-center p-3 bg-white border border-transparent rounded-xl cursor-pointer hover:border-gray-300 transition-colors shadow-[0_0_0_1px_#f3f4f6]">
                                <input type="radio" name="payment" value="Card" checked={paymentMethod === "Card"} onChange={e => setPaymentMethod(e.target.value)} className="h-4 w-4 text-emerald-600 focus:ring-emerald-500" />
                                <span className="ml-3 text-sm font-bold text-gray-900 flex items-center gap-2"><CreditCard className="h-4 w-4 text-gray-400" /> Card / Bank</span>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Receipt Items Panel */}
                <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col print:col-span-3 print:shadow-none print:border-none">
                    <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-2xl print:hidden">
                        <h3 className="font-bold text-gray-900">Line Items & Services</h3>
                        <button onClick={handleAddItem} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-bold rounded-lg transition-colors">
                            <Plus className="h-3.5 w-3.5" /> Add Row
                        </button>
                    </div>

                    <div className="flex-1 p-5 space-y-3 print:p-0">
                        {/* Table Headers */}
                        <div className="flex gap-4 px-2 mb-2">
                            <span className="flex-1 text-[11px] font-bold text-gray-400 uppercase tracking-widest print:text-gray-900">Description / Service</span>
                            <span className="w-20 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-center print:text-gray-900">Qty</span>
                            <span className="w-28 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-right print:text-gray-900 print:pr-0 mr-10">Amount (₹)</span>
                        </div>

                        {/* Dynamically added rows */}
                        {items.map((item, index) => (
                            <div key={item.id} className="flex gap-4 items-center group print:gap-2">
                                <div className="flex-1">
                                    <input
                                        type="text"
                                        list="services-list"
                                        value={item.description}
                                        onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                                        placeholder="Type or select from DB..."
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white rounded-xl text-sm font-medium focus:border-emerald-500 outline-none transition-colors print:border-0 print:bg-white print:px-0"
                                    />
                                </div>
                                <div className="w-20">
                                    <input
                                        type="number"
                                        value={item.quantity}
                                        onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                                        min="1"
                                        className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white rounded-xl text-sm focus:border-emerald-500 outline-none text-center font-mono transition-colors print:border-0 print:bg-white"
                                    />
                                </div>
                                <div className="w-28">
                                    <input
                                        type="number"
                                        value={item.amount}
                                        onChange={(e) => handleItemChange(item.id, 'amount', e.target.value)}
                                        placeholder="0.00"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white rounded-xl text-sm focus:border-emerald-500 outline-none text-right font-mono transition-colors print:border-0 print:bg-white print:px-0"
                                    />
                                </div>
                                <button
                                    onClick={() => handleRemoveItem(item.id)}
                                    className={`p-2 rounded-xl transition-colors print:hidden ${items.length > 1 ? 'text-gray-400 hover:bg-red-50 hover:text-red-500' : 'text-gray-200 cursor-not-allowed'}`}
                                    disabled={items.length <= 1}
                                >
                                    <Trash2 className="h-5 w-5" />
                                </button>
                            </div>
                        ))}

                        {/* Blank spaces filler */}
                        <div className="py-8 print:py-4"></div>
                    </div>

                    {/* Totals Section */}
                    <div className="p-5 border-t border-gray-100 bg-gray-50 rounded-b-2xl print:bg-white print:border-t-2 print:border-gray-900 print:mt-10">
                        <div className="flex items-center justify-between mb-2 px-2 print:hidden">
                            <span className="text-sm font-medium text-gray-500">Subtotal</span>
                            <span className="text-sm font-mono text-gray-700">₹{totalAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between px-2 pt-3 border-t border-gray-200/80 print:border-none">
                            <span className="text-base font-bold text-gray-900 uppercase tracking-widest">Total Amount</span>
                            <span className="text-2xl font-black font-mono text-emerald-600 print:text-black">₹{totalAmount.toFixed(2)}</span>
                        </div>
                        <div className="hidden print:block mt-8 text-right">
                            <p className="text-sm font-bold border-t border-dashed border-gray-400 inline-block pt-2 w-48 mx-auto text-center">Authorized Signatory</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


function PatientHistoryTab() {
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
        <div className="space-y-8 animate-in pb-24">
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
    );
}

function FinanceConfigTab() {
    const [activeSubTab, setActiveSubTab] = useState("doctors");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Dynamic State for User Input
    const [doctors, setDoctors] = useState<any[]>([]);
    const [checkups, setCheckups] = useState<any[]>([]);
    const [medicines, setMedicines] = useState<any[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        const res = await getFinanceConfig();
        if (res.success && res.data) {
            setDoctors(res.data.doctors || []);
            setCheckups(res.data.checkups || []);
            setMedicines(res.data.medicines || []);
        }
        setIsLoading(false);
    };

    const handleSave = async () => {
        setIsSaving(true);
        const res = await saveFinanceConfig({ doctors, checkups, medicines });
        if (res.success) {
            alert("Configuration saved successfully!");
            await loadData(); // reload actual IDs generated by server
        } else {
            alert("Failed to save: " + res.error);
        }
        setIsSaving(false);
    };

    const addCheckupRow = () => {
        setCheckups([{ id: "temp_" + Date.now(), name: "", code: "", price: "" }, ...checkups]);
    };

    const addMedicineRow = () => {
        setMedicines([{ id: "temp_" + Date.now(), name: "", comp: "", price: "" }, ...medicines]);
    };

    const updateItem = (setter: any, list: any[], id: any, field: string, value: string) => {
        setter(list.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const removeItem = (setter: any, list: any[], id: any) => {
        setter(list.filter(item => item.id !== id));
    };

    return (
        <div className="space-y-8 animate-in pb-24">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <div className="p-2.5 bg-emerald-100/80 rounded-xl">
                            <DollarSign className="h-6 w-6 text-emerald-600" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900 border-b-2 border-transparent">
                            Finance Configuration
                        </h1>
                    </div>
                    <p className="text-gray-500 text-sm ml-12">
                        Configure dynamic doctor fees, generic test costs, and pharmacy pricing.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSave}
                        disabled={isLoading || isSaving}
                        className={`flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-md transition-all ${isSaving ? 'opacity-75 cursor-not-allowed' : ''}`}
                    >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {isSaving ? "Saving..." : "Save Configuration"}
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-h-[500px]">
                {/* Custom Tabs Navigation */}
                <div className="flex border-b border-gray-100 px-2 overflow-x-auto hide-scrollbar bg-gray-50/50">
                    <button
                        onClick={() => setActiveSubTab("doctors")}
                        className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-colors whitespace-nowrap border-b-[3px] ${activeSubTab === "doctors" ? "border-emerald-500 text-emerald-600 bg-white" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200"}`}
                    >
                        <Stethoscope className="h-4 w-4" /> Doctor Fees
                    </button>
                    <button
                        onClick={() => setActiveSubTab("checkups")}
                        className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-colors whitespace-nowrap border-b-[3px] ${activeSubTab === "checkups" ? "border-emerald-500 text-emerald-600 bg-white" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200"}`}
                    >
                        <Activity className="h-4 w-4" /> Tests & Standard Services
                    </button>
                    <button
                        onClick={() => setActiveSubTab("medicines")}
                        className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-colors whitespace-nowrap border-b-[3px] ${activeSubTab === "medicines" ? "border-emerald-500 text-emerald-600 bg-white" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200"}`}
                    >
                        <Pill className="h-4 w-4" /> Pharmacy Pricing
                    </button>
                </div>

                <div className="p-6">
                    {isLoading ? (
                        <div className="py-24 flex flex-col items-center justify-center text-gray-400">
                            <Loader2 className="h-10 w-10 animate-spin text-emerald-500 mb-4" />
                            <p className="text-sm font-medium">Fetching active database configuration...</p>
                        </div>
                    ) : (
                        <>
                            {/* DOC FEES TAB */}
                            {activeSubTab === "doctors" && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">Doctor Fees Database</h3>
                                            <p className="text-xs text-gray-500 mt-1">Note: Doctors are auto-synced from HR / User logs.</p>
                                        </div>
                                    </div>

                                    {doctors.length === 0 ? (
                                        <div className="py-16 text-center border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center justify-center">
                                            <div className="bg-gray-50 p-4 rounded-full mb-3"><Inbox className="h-8 w-8 text-gray-300" /></div>
                                            <p className="text-gray-500 font-medium text-sm">No doctors found in the system.</p>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                                            <table className="w-full text-left border-collapse bg-white">
                                                <thead>
                                                    <tr className="bg-gray-50/80 border-b border-gray-200">
                                                        <th className="py-3.5 px-5 text-xs font-bold text-gray-500 uppercase tracking-widest">Doctor Name</th>
                                                        <th className="py-3.5 px-5 text-xs font-bold text-gray-500 uppercase tracking-widest">Department</th>
                                                        <th className="py-3.5 px-5 text-xs font-bold text-gray-500 uppercase tracking-widest text-emerald-700">First Visit Fee (₹)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {doctors.map((doc) => (
                                                        <tr key={doc.id} className="hover:bg-gray-50/50 transition-colors">
                                                            <td className="py-4 px-5">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">
                                                                        {doc.name ? doc.name.charAt(0).toUpperCase() : 'Dr'}
                                                                    </div>
                                                                    <span className="font-semibold text-gray-900">{doc.name || "Unnamed Doctor"}</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-4 px-5"><span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-black rounded-md">{doc.dept || "General"}</span></td>
                                                            <td className="py-4 px-5">
                                                                <div className="flex items-center gap-2 max-w-[140px]">
                                                                    <span className="text-gray-400 font-medium">₹</span>
                                                                    <input type="number" placeholder="500" value={doc.first} onChange={e => updateItem(setDoctors, doctors, doc.id, 'first', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-bold text-emerald-700 outline-none" />
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* CHECKUPS TAB */}
                            {activeSubTab === "checkups" && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-bold text-gray-900">Standard Tests & OPD Costs</h3>
                                        <button onClick={addCheckupRow} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 text-sm font-bold rounded-xl hover:bg-emerald-100 transition-all border border-emerald-100">
                                            <Plus className="h-4 w-4" /> Add Service Cost
                                        </button>
                                    </div>

                                    {checkups.length === 0 ? (
                                        <div className="py-16 text-center border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center justify-center">
                                            <div className="bg-gray-50 p-4 rounded-full mb-3"><Activity className="h-8 w-8 text-gray-300" /></div>
                                            <p className="text-gray-500 font-medium text-sm">No OPD services configured.</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {checkups.map((item) => (
                                                <div key={item.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-2xl hover:border-emerald-300 hover:shadow-md transition-all bg-white shadow-sm group">
                                                    <div className="flex-1 space-y-2 pr-4">
                                                        <input type="text" placeholder="Service / Test Name" value={item.name} onChange={e => updateItem(setCheckups, checkups, item.id, 'name', e.target.value)} className="w-full px-3 py-1.5 border border-transparent bg-gray-50/50 hover:bg-white focus:bg-white focus:border-emerald-500 rounded-lg text-sm font-bold text-gray-900 outline-none" />
                                                        <input type="text" placeholder="Service Code" value={item.code} onChange={e => updateItem(setCheckups, checkups, item.id, 'code', e.target.value)} className="w-1/2 px-3 py-1 border border-transparent bg-gray-50/50 hover:bg-white focus:bg-white focus:border-emerald-500 rounded-lg text-xs font-mono text-gray-500 outline-none" />
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl overflow-hidden focus-within:border-emerald-500 transition-all">
                                                            <span className="pl-3 pr-1 text-gray-400 text-sm font-medium">₹</span>
                                                            <input type="number" placeholder="0" value={item.price} onChange={e => updateItem(setCheckups, checkups, item.id, 'price', e.target.value)} className="w-24 py-2.5 pr-3 bg-transparent outline-none text-sm font-black text-emerald-700 font-mono" />
                                                        </div>
                                                        <button onClick={() => removeItem(setCheckups, checkups, item.id)} className="p-2.5 text-red-300 opacity-50 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="h-5 w-5" /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* MEDICINES TAB */}
                            {activeSubTab === "medicines" && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">Pharmacy Retail Pricing</h3>
                                            <p className="text-xs text-gray-500 mt-1">Manage local medicine overrides.</p>
                                        </div>
                                        <button onClick={addMedicineRow} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 text-sm font-bold rounded-xl hover:bg-emerald-100 transition-all border border-emerald-100">
                                            <Plus className="h-4 w-4" /> Add Custom Price
                                        </button>
                                    </div>

                                    {medicines.length === 0 ? (
                                        <div className="py-16 text-center border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center justify-center">
                                            <div className="bg-gray-50 p-4 rounded-full mb-3"><Pill className="h-8 w-8 text-gray-300" /></div>
                                            <p className="text-gray-500 font-medium text-sm">No local medicine overrides.</p>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                                            <table className="w-full text-left border-collapse bg-white">
                                                <thead>
                                                    <tr className="bg-gray-50/80 border-b border-gray-200">
                                                        <th className="py-3.5 px-5 text-xs font-bold text-gray-500 uppercase tracking-widest w-1/3">Medicine Brand</th>
                                                        <th className="py-3.5 px-5 text-xs font-bold text-gray-500 uppercase tracking-widest w-1/3">Composition</th>
                                                        <th className="py-3.5 px-5 text-xs font-bold text-gray-500 uppercase tracking-widest text-emerald-700">Unit Price (₹)</th>
                                                        <th className="py-3.5 px-5 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Delete</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {medicines.map((med) => (
                                                        <tr key={med.id} className="hover:bg-gray-50/50 transition-colors group">
                                                            <td className="py-3 px-5"><input type="text" placeholder="Brand Name" value={med.name} onChange={e => updateItem(setMedicines, medicines, med.id, 'name', e.target.value)} className="w-full px-3 py-2 border border-transparent bg-transparent hover:bg-white focus:bg-white focus:border-emerald-500 rounded-lg text-sm font-semibold text-gray-900 outline-none transition-all" /></td>
                                                            <td className="py-3 px-5"><input type="text" placeholder="Composition" value={med.comp} onChange={e => updateItem(setMedicines, medicines, med.id, 'comp', e.target.value)} className="w-full px-3 py-2 border border-transparent bg-transparent hover:bg-white focus:bg-white focus:border-emerald-500 rounded-lg text-sm text-gray-600 outline-none transition-all" /></td>
                                                            <td className="py-3 px-5">
                                                                <div className="flex items-center gap-2 max-w-[140px]">
                                                                    <span className="text-gray-400 font-medium">₹</span>
                                                                    <input type="number" placeholder="Rs" value={med.price} onChange={e => updateItem(setMedicines, medicines, med.id, 'price', e.target.value)} step="0.5" className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg text-sm font-bold text-emerald-700 font-mono outline-none" />
                                                                </div>
                                                            </td>
                                                            <td className="py-3 px-5 text-right">
                                                                <button onClick={() => removeItem(setMedicines, medicines, med.id)} className="p-2 text-red-300 opacity-50 group-hover:opacity-100 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="h-4 w-4" /></button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function AdminFinanceHub() {
    const [activeTab, setActiveTab] = useState('generate-receipt');

    return (
        <ModuleHubLayout
            moduleKey="finance"
            moduleTitle="Finance Module"
            moduleDescription="Billing, invoicing, payments & revenue management"
            moduleIcon={<DollarSign className="h-5 w-5" />}
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
        >
            {activeTab === 'generate-receipt' && <GenerateReceiptTab onSuccess={() => setActiveTab('patient-history')} />}
            {activeTab === 'patient-history' && <PatientHistoryTab />}
            {activeTab === 'finance-config' && <FinanceConfigTab />}
        </ModuleHubLayout>
    );
}

