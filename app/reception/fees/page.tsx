"use client";

import React, { useState, useEffect } from "react";
import { AppShell } from '@/app/components/layout/AppShell';
import {
    FileText,
    Search,
    Plus,
    Trash2,
    Printer,
    User,
    CreditCard,
    DollarSign,
    Loader2,
    CheckCircle2,
    X
} from "lucide-react";
import { searchPatientsForReceipt, getAvailableServicesList, saveFeeReceipt } from "@/app/actions/fee-receipt-actions";

export default function GenerateReceiptPage() {
    const [patientId, setPatientId] = useState<string>("");
    const [patientName, setPatientName] = useState("");
    const [patientPhone, setPatientPhone] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [patientResults, setPatientResults] = useState<any[]>([]);

    const [isSaving, setIsSaving] = useState(false);

    const [items, setItems] = useState([{ id: 1, description: "", amount: "", quantity: "1", isLocked: false }]);
    const [paymentMethod, setPaymentMethod] = useState("Cash");

    const [availableServices, setAvailableServices] = useState<{ label: string, price: number, type: string, doctor_id?: string, fee_type?: string }[]>([]);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [lastReceipt, setLastReceipt] = useState<any>(null);

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
        setItems([...items, { id: Date.now(), description: "", amount: "", quantity: "1", isLocked: false }]);
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
                newItems[itemIdx].isLocked = match.type === 'Doctors';
            } else {
                newItems[itemIdx].isLocked = false;
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
            setLastReceipt({
                id: res.receipt_number,
                invoice: res.invoice_number,
                name: patientName,
                phone: patientPhone,
                method: paymentMethod,
                amount: totalAmount,
                items: items.map(i => ({
                    desc: i.description || "Misc Fee",
                    qty: Number(i.quantity) || 1,
                    amt: Number(i.amount) || 0
                }))
            });
            setShowSuccessModal(true);
        } else {
            alert("Failed to save receipt to Database: " + res.error);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <AppShell pageTitle="Log Patient Details" pageIcon={<FileText className="h-5 w-5" />}>
            <datalist id="services-list">
                {availableServices.map((srv, i) => (
                    <option key={i} value={srv.label} />
                ))}
            </datalist>

            <div className="max-w-4xl mx-auto space-y-6 animate-in pb-24">
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
                                            onChange={(e) => !item.isLocked && handleItemChange(item.id, 'amount', e.target.value)}
                                            readOnly={item.isLocked}
                                            placeholder="0.00"
                                            className={`w-full px-4 py-2.5 border rounded-xl text-sm outline-none text-right font-mono transition-colors print:border-0 print:bg-white print:px-0 ${item.isLocked ? 'bg-gray-50 text-gray-600 cursor-not-allowed border-gray-200' : 'bg-gray-50 border-gray-200 focus:bg-white focus:border-emerald-500'}`}
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

            {/* Success & Print Modal */}
            {showSuccessModal && lastReceipt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col no-print">
                        <div className="p-6 bg-emerald-600 text-white flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="h-8 w-8 text-emerald-100" />
                                <div>
                                    <h2 className="text-xl font-bold">Receipt Generated</h2>
                                    <p className="text-emerald-100/80 text-xs font-medium">Internal Record: {lastReceipt.id}</p>
                                </div>
                            </div>
                            <button onClick={() => window.location.href = "/reception/history"} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-8 flex-1 space-y-6">
                            <div className="text-center space-y-1">
                                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Amount Collected</p>
                                <h3 className="text-5xl font-black text-gray-900 font-mono">₹{lastReceipt.amount.toLocaleString()}</h3>
                                <p className="text-emerald-600 text-[10px] font-black uppercase tracking-widest bg-emerald-50 inline-block px-3 py-1 rounded-full mt-2">Paid via {lastReceipt.method}</p>
                            </div>

                            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500 font-medium">Patient</span>
                                    <span className="text-gray-900 font-bold">{lastReceipt.name}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500 font-medium">Invoice No</span>
                                    <span className="text-gray-900 font-mono font-bold">{lastReceipt.invoice}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500 font-medium">Date</span>
                                    <span className="text-gray-900 font-bold">{new Date().toLocaleDateString()}</span>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handlePrint}
                                    className="flex-1 flex items-center justify-center gap-2 py-4 bg-gray-900 text-white font-bold rounded-2xl hover:bg-black transition-all active:scale-[0.98] shadow-lg shadow-gray-200"
                                >
                                    <Printer className="h-5 w-5 text-emerald-400" />
                                    Print Receipt
                                </button>
                                <button
                                    onClick={() => window.location.href = "/reception/history"}
                                    className="px-8 py-4 bg-gray-100 text-gray-700 font-bold rounded-2xl hover:bg-gray-200 transition-all active:scale-[0.98]"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Hidden Printable Area */}
                    <div className="hidden print:block fixed inset-0 bg-white p-10 z-[100] text-black">
                        <div className="max-w-3xl mx-auto space-y-10">
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
                                    <p className="text-xl font-bold">{lastReceipt.invoice}</p>
                                    <p className="text-sm font-bold text-gray-600">Receipt No: {lastReceipt.id}</p>
                                    <p className="text-sm font-medium">{new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                            </div>

                            {/* Patient Info */}
                            <div className="grid grid-cols-2 gap-8 py-4">
                                <div className="space-y-1">
                                    <p className="text-xs font-bold text-gray-500 uppercase">Patient Name</p>
                                    <p className="text-lg font-bold">{lastReceipt.name}</p>
                                </div>
                                <div className="space-y-1 text-right">
                                    <p className="text-xs font-bold text-gray-500 uppercase">Contact</p>
                                    <p className="text-lg font-bold">{lastReceipt.phone || "N/A"}</p>
                                </div>
                            </div>

                            {/* Bill Items */}
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="border-y-2 border-black">
                                        <th className="py-3 text-left font-black uppercase tracking-widest text-sm">Description of Services</th>
                                        <th className="py-3 text-center font-black uppercase tracking-widest text-sm w-24">Qty</th>
                                        <th className="py-3 text-right font-black uppercase tracking-widest text-sm w-32">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {lastReceipt.items.map((srv: any, i: number) => (
                                        <tr key={i}>
                                            <td className="py-4 font-bold text-gray-800">{srv.desc}</td>
                                            <td className="py-4 text-center font-mono font-bold">{srv.qty}</td>
                                            <td className="py-4 text-right font-mono font-bold text-lg">₹{srv.amt.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-black">
                                        <td colSpan={2} className="py-6 text-right font-black uppercase tracking-widest text-lg">Total Payable</td>
                                        <td className="py-6 text-right font-black text-2xl font-mono">₹{lastReceipt.amount.toFixed(2)}</td>
                                    </tr>
                                </tfoot>
                            </table>

                            {/* Footer */}
                            <div className="pt-20 flex justify-between items-end">
                                <div className="space-y-1 text-xs font-bold text-gray-400">
                                    <p>Payment Method: {lastReceipt.method}</p>
                                    <p>Status: FULLY PAID</p>
                                </div>
                                <div className="text-center w-64 border-t-2 border-dashed border-gray-900 pt-3">
                                    <p className="text-sm font-black uppercase tracking-widest">Authorized Signatory</p>
                                    <p className="text-[10px] font-medium text-gray-500 mt-1">Computer Generated Digital Receipt</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
