"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { AppShell } from "@/app/components/layout/AppShell";
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
    X,
    ArrowLeft,
    History,
    Eye,
    Ban,
    Calendar,
    StickyNote,
    Percent,
    Filter,
    RotateCcw,
    AlertCircle,
} from "lucide-react";
import {
    searchPatientsForReceipt,
    getAvailableServicesList,
    saveFeeReceipt,
    listFeeReceipts,
    getFeeReceiptDetail,
    voidFeeReceipt,
} from "@/app/actions/fee-receipt-actions";
import { PrintLetterhead } from "@/app/components/print/PrintLetterhead";
import Link from "next/link";

const sanitizePhone = (v: string) => v.replace(/\D/g, "").slice(0, 10);
const sanitizePatientName = (v: string) => v.replace(/[^a-zA-Z\s.'-]/g, "");
const sanitizeDecimal = (v: string) => v.replace(/[^\d.]/g, "");
const fmtMoney = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

interface ReceiptItem {
    id: number;
    description: string;
    amount: string;
    quantity: string;
    discount: string;
    isLocked: boolean;
}

interface SavedReceiptView {
    id: string;
    invoice: string;
    name: string;
    phone: string;
    method: string;
    amount: number;
    gross: number;
    discount: number;
    items: { desc: string; qty: number; amt: number; discount: number }[];
    notes?: string;
    created_at: string;
}

export default function FeeReceiptPage() {
    const [activeTab, setActiveTab] = useState<"new" | "history">("new");

    return (
        <AppShell pageTitle="Fee Receipts" pageIcon={<FileText className="h-5 w-5" />}>
            <style>{`
                @media print {
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            `}</style>
            <div className="max-w-6xl mx-auto pb-24 print:max-w-full">
                <div className="flex items-center justify-between mb-5 print:hidden">
                    <div>
                        <Link href="/billing" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 font-medium mb-2 transition-colors">
                            <ArrowLeft className="h-3.5 w-3.5" /> Master Billing
                        </Link>
                        <h1 className="text-2xl font-bold text-gray-900">Fee Receipt Management</h1>
                        <p className="text-sm text-gray-500 mt-1">Issue, search and reprint OPD service receipts.</p>
                    </div>
                    <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
                        <button
                            onClick={() => setActiveTab("new")}
                            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg transition-colors ${activeTab === "new" ? "bg-white shadow-sm text-emerald-700" : "text-gray-600 hover:text-gray-900"}`}
                        >
                            <Plus className="h-4 w-4" /> New Receipt
                        </button>
                        <button
                            onClick={() => setActiveTab("history")}
                            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg transition-colors ${activeTab === "history" ? "bg-white shadow-sm text-emerald-700" : "text-gray-600 hover:text-gray-900"}`}
                        >
                            <History className="h-4 w-4" /> History
                        </button>
                    </div>
                </div>

                {activeTab === "new" ? <NewReceiptForm /> : <ReceiptHistory />}
            </div>
        </AppShell>
    );
}

/* ──────────────────────────────────────────────────────────── NEW RECEIPT */

function NewReceiptForm() {
    const [patientId, setPatientId] = useState("");
    const [patientName, setPatientName] = useState("");
    const [patientPhone, setPatientPhone] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [patientResults, setPatientResults] = useState<any[]>([]);

    const [isSaving, setIsSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [items, setItems] = useState<ReceiptItem[]>([
        { id: 1, description: "", amount: "", quantity: "1", discount: "0", isLocked: false },
    ]);
    const [paymentMethod, setPaymentMethod] = useState("Cash");
    const [notes, setNotes] = useState("");
    const [receiptDate, setReceiptDate] = useState("");
    const [showDateField, setShowDateField] = useState(false);

    const [availableServices, setAvailableServices] = useState<{ label: string; price: number; type: string }[]>([]);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [lastReceipt, setLastReceipt] = useState<SavedReceiptView | null>(null);

    useEffect(() => {
        getAvailableServicesList().then(res => {
            if (res.success && res.data) setAvailableServices(res.data);
        });
    }, []);

    const handleSearch = async (q: string) => {
        setSearchQuery(q);
        if (q.length < 2) {
            setPatientResults([]);
            return;
        }
        setIsSearching(true);
        const res = await searchPatientsForReceipt(q);
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
        setItems([...items, { id: Date.now(), description: "", amount: "", quantity: "1", discount: "0", isLocked: false }]);
    };

    const handleRemoveItem = (id: number) => {
        if (items.length > 1) setItems(items.filter(i => i.id !== id));
    };

    const handleItemChange = (id: number, field: keyof ReceiptItem, value: string) => {
        const next = items.map(item => {
            if (item.id !== id) return item;
            const updated = { ...item, [field]: value };
            if (field === "description") {
                const match = availableServices.find(s => s.label === value);
                if (match) {
                    updated.amount = match.price.toString();
                    updated.isLocked = match.type === "Doctors";
                } else {
                    updated.isLocked = false;
                }
            }
            return updated;
        });
        setItems(next);
    };

    const totals = useMemo(() => {
        const gross = items.reduce((s, i) => s + (Number(i.amount) || 0) * (Number(i.quantity) || 1), 0);
        const discount = items.reduce((s, i) => s + (Number(i.discount) || 0), 0);
        const net = Math.max(0, gross - discount);
        return { gross, discount, net };
    }, [items]);

    const resetForm = () => {
        setPatientId("");
        setPatientName("");
        setPatientPhone("");
        setSearchQuery("");
        setItems([{ id: 1, description: "", amount: "", quantity: "1", discount: "0", isLocked: false }]);
        setPaymentMethod("Cash");
        setNotes("");
        setReceiptDate("");
        setShowDateField(false);
        setErrorMsg(null);
    };

    const handleSave = async () => {
        setErrorMsg(null);
        if (!patientName.trim()) {
            setErrorMsg("Patient name is required.");
            return;
        }
        const validItems = items.filter(i => (Number(i.amount) || 0) > 0);
        if (validItems.length === 0) {
            setErrorMsg("Add at least one line item with a non-zero amount.");
            return;
        }
        setIsSaving(true);
        const res = await saveFeeReceipt({
            patient_id: patientId,
            patient_name: patientName,
            patient_phone: patientPhone,
            payment_method: paymentMethod,
            notes: notes.trim() || undefined,
            receipt_date: receiptDate || undefined,
            items: items.map(i => ({
                description: i.description || "Misc Fee",
                amount: Number(i.amount) || 0,
                quantity: Number(i.quantity) || 1,
                discount: Number(i.discount) || 0,
            })),
        });

        setIsSaving(false);
        if (res.success) {
            setLastReceipt({
                id: res.receipt_number || "",
                invoice: res.invoice_number || "",
                name: patientName,
                phone: patientPhone,
                method: paymentMethod,
                amount: totals.net,
                gross: totals.gross,
                discount: totals.discount,
                items: items
                    .filter(i => (Number(i.amount) || 0) > 0)
                    .map(i => ({
                        desc: i.description || "Misc Fee",
                        qty: Number(i.quantity) || 1,
                        amt: Number(i.amount) || 0,
                        discount: Number(i.discount) || 0,
                    })),
                notes: notes.trim() || undefined,
                created_at: receiptDate || new Date().toISOString(),
            });
            setShowSuccessModal(true);
        } else {
            setErrorMsg(res.error || "Failed to save receipt.");
        }
    };

    const handlePrint = () => window.print();

    return (
        <>
            <datalist id="services-list">
                {availableServices.map((srv, i) => (
                    <option key={i} value={srv.label} />
                ))}
            </datalist>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
                {/* Patient + Payment */}
                <div className="md:col-span-1 space-y-4">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
                        <h3 className="font-bold text-gray-900 border-b border-gray-100 pb-2">Patient</h3>

                        <div className="space-y-1.5 relative">
                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Search Registered</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => handleSearch(e.target.value)}
                                    placeholder="Name, phone or UHID…"
                                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-gray-50 hover:bg-white focus:bg-white"
                                />
                                {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 animate-spin" />}
                            </div>
                            {patientResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 shadow-xl rounded-xl z-20 max-h-56 overflow-y-auto">
                                    {patientResults.map(p => (
                                        <button
                                            type="button"
                                            key={p.patient_id}
                                            className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 border-b border-gray-50 last:border-0 transition-colors"
                                            onClick={() => selectPatient(p)}
                                        >
                                            <p className="text-sm font-bold text-gray-900">{p.full_name}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">{p.phone || "—"} • {p.patient_id}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="relative py-1">
                            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-100"></span></div>
                            <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-white px-2 text-gray-400 font-bold tracking-wider">or manual</span></div>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Patient Name *</label>
                                <div className="relative mt-1">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={patientName}
                                        onChange={e => { setPatientName(sanitizePatientName(e.target.value)); setPatientId(""); }}
                                        maxLength={60}
                                        placeholder="Enter full name"
                                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Phone</label>
                                <input
                                    type="tel"
                                    value={patientPhone}
                                    onChange={e => { setPatientPhone(sanitizePhone(e.target.value)); setPatientId(""); }}
                                    inputMode="numeric"
                                    maxLength={10}
                                    placeholder="10-digit mobile"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 outline-none mt-1"
                                />
                            </div>
                            {patientId && (
                                <div className="flex items-center justify-between text-[11px] font-medium bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-100">
                                    <span>UHID: <strong>{patientId}</strong></span>
                                    <button type="button" onClick={() => setPatientId("")} className="text-emerald-700 hover:text-emerald-900">
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
                        <h3 className="font-bold text-gray-900 border-b border-gray-100 pb-2">Payment Method</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {["Cash", "Card", "UPI", "Bank"].map(m => (
                                <label
                                    key={m}
                                    className={`flex items-center justify-center gap-1.5 px-3 py-2.5 border rounded-xl cursor-pointer text-xs font-bold transition-colors ${paymentMethod === m ? "bg-emerald-50 border-emerald-400 text-emerald-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
                                >
                                    <input type="radio" name="payment" value={m} checked={paymentMethod === m} onChange={e => setPaymentMethod(e.target.value)} className="sr-only" />
                                    {m === "Cash" && <DollarSign className="h-3.5 w-3.5" />}
                                    {m === "Card" && <CreditCard className="h-3.5 w-3.5" />}
                                    {m}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
                        <h3 className="font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center justify-between">
                            <span>Receipt Options</span>
                        </h3>
                        <div>
                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                                <StickyNote className="h-3 w-3" /> Notes / Remarks
                            </label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={2}
                                maxLength={300}
                                placeholder="Optional remarks for the receipt"
                                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:border-emerald-500 outline-none resize-none"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowDateField(s => !s)}
                            className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 hover:text-emerald-700 uppercase tracking-widest"
                        >
                            <Calendar className="h-3 w-3" /> {showDateField ? "Use current date" : "Backdate receipt"}
                        </button>
                        {showDateField && (
                            <input
                                type="datetime-local"
                                value={receiptDate}
                                onChange={e => setReceiptDate(e.target.value)}
                                max={new Date().toISOString().slice(0, 16)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:border-emerald-500 outline-none"
                            />
                        )}
                    </div>
                </div>

                {/* Items */}
                <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                    <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-2xl">
                        <h3 className="font-bold text-gray-900">Line Items</h3>
                        <button onClick={handleAddItem} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-bold rounded-lg">
                            <Plus className="h-3.5 w-3.5" /> Add Row
                        </button>
                    </div>

                    <div className="flex-1 p-5 space-y-3">
                        <div className="flex gap-3 px-1 pb-1">
                            <span className="flex-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Description / Service</span>
                            <span className="w-16 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Qty</span>
                            <span className="w-24 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Rate</span>
                            <span className="w-20 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Disc.</span>
                            <span className="w-10"></span>
                        </div>

                        {items.map(item => (
                            <div key={item.id} className="flex gap-3 items-center group">
                                <div className="flex-1">
                                    <input
                                        type="text"
                                        list="services-list"
                                        value={item.description}
                                        onChange={e => handleItemChange(item.id, "description", e.target.value)}
                                        placeholder="Type or select…"
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white rounded-xl text-sm focus:border-emerald-500 outline-none"
                                    />
                                </div>
                                <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={e => handleItemChange(item.id, "quantity", e.target.value.replace(/\D/g, ""))}
                                    inputMode="numeric"
                                    min="1"
                                    className="w-16 px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white rounded-xl text-sm focus:border-emerald-500 outline-none text-center font-mono"
                                />
                                <input
                                    type="number"
                                    value={item.amount}
                                    onChange={e => !item.isLocked && handleItemChange(item.id, "amount", sanitizeDecimal(e.target.value))}
                                    inputMode="decimal"
                                    readOnly={item.isLocked}
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    className={`w-24 px-3 py-2.5 border rounded-xl text-sm outline-none text-right font-mono ${item.isLocked ? "bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200" : "bg-gray-50 border-gray-200 focus:bg-white focus:border-emerald-500"}`}
                                />
                                <input
                                    type="number"
                                    value={item.discount}
                                    onChange={e => handleItemChange(item.id, "discount", sanitizeDecimal(e.target.value))}
                                    inputMode="decimal"
                                    min="0"
                                    step="0.01"
                                    placeholder="0"
                                    className="w-20 px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white rounded-xl text-sm outline-none text-right font-mono focus:border-emerald-500"
                                />
                                <button
                                    onClick={() => handleRemoveItem(item.id)}
                                    disabled={items.length <= 1}
                                    className={`p-2 rounded-xl transition-colors ${items.length > 1 ? "text-gray-400 hover:bg-red-50 hover:text-red-500" : "text-gray-200 cursor-not-allowed"}`}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="p-5 border-t border-gray-100 bg-gray-50 rounded-b-2xl space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-500 font-medium">Subtotal</span>
                            <span className="font-mono text-gray-700">{fmtMoney(totals.gross)}</span>
                        </div>
                        {totals.discount > 0 && (
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500 font-medium flex items-center gap-1"><Percent className="h-3 w-3" />Discount</span>
                                <span className="font-mono text-rose-600">– {fmtMoney(totals.discount)}</span>
                            </div>
                        )}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                            <span className="text-base font-bold text-gray-900 uppercase tracking-widest">Total Payable</span>
                            <span className="text-2xl font-black font-mono text-emerald-600">{fmtMoney(totals.net)}</span>
                        </div>

                        {errorMsg && (
                            <div className="mt-3 flex items-start gap-2 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-lg">
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        <div className="flex gap-3 pt-3">
                            <button
                                onClick={resetForm}
                                disabled={isSaving}
                                className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-50 disabled:opacity-50"
                            >
                                Reset
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className={`flex-[2] flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md transition-all ${isSaving ? "opacity-70 cursor-not-allowed" : ""}`}
                            >
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                {isSaving ? "Saving…" : "Save & Generate Receipt"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {showSuccessModal && lastReceipt && (
                <SuccessAndPrintModal
                    receipt={lastReceipt}
                    onClose={() => { setShowSuccessModal(false); resetForm(); }}
                    onPrint={handlePrint}
                />
            )}
        </>
    );
}

/* ──────────────────────────────────────────────────────────── HISTORY */

function ReceiptHistory() {
    const [rows, setRows] = useState<any[]>([]);
    const [meta, setMeta] = useState<{ total: number; page: number; limit: number; totalPages: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("");
    const [status, setStatus] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [page, setPage] = useState(1);
    const [showFilters, setShowFilters] = useState(false);

    const [viewReceipt, setViewReceipt] = useState<SavedReceiptView | null>(null);
    const [voidingId, setVoidingId] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await listFeeReceipts({ search, payment_method: paymentMethod, status, from, to, page, limit: 25 });
        if (res.success) {
            setRows(res.data);
            setMeta(res.meta);
        }
        setLoading(false);
    }, [search, paymentMethod, status, from, to, page]);

    useEffect(() => {
        const t = setTimeout(load, 200);
        return () => clearTimeout(t);
    }, [load]);

    const clearFilters = () => {
        setSearch("");
        setPaymentMethod("");
        setStatus("");
        setFrom("");
        setTo("");
        setPage(1);
    };

    const totalsRow = useMemo(() => {
        const gross = rows.reduce((s, r) => s + r.total_amount, 0);
        const net = rows.reduce((s, r) => s + r.net_amount, 0);
        const count = rows.length;
        return { gross, net, count };
    }, [rows]);

    const handleView = async (invoice_id: number) => {
        const res = await getFeeReceiptDetail(invoice_id);
        if (res.success && res.data) {
            const d = res.data;
            setViewReceipt({
                id: d.receipt_number || "",
                invoice: d.invoice_number,
                name: d.patient_name,
                phone: d.patient_phone,
                method: d.payment_method,
                amount: d.net_amount,
                gross: d.total_amount,
                discount: d.total_discount,
                items: d.items.map((it: any) => ({
                    desc: it.description,
                    qty: it.quantity,
                    amt: it.unit_price,
                    discount: it.discount,
                })),
                notes: d.notes || undefined,
                created_at: d.created_at,
            });
        } else {
            alert(res.error || "Failed to load receipt.");
        }
    };

    const handleVoid = async (invoice_id: number) => {
        const reason = prompt("Reason for voiding this receipt?");
        if (!reason || !reason.trim()) return;
        setVoidingId(invoice_id);
        const res = await voidFeeReceipt(invoice_id, reason.trim());
        setVoidingId(null);
        if (res.success) load();
        else alert(res.error || "Failed to void receipt.");
    };

    return (
        <>
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden print:hidden">
                <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                            placeholder="Search invoice #, receipt #, patient name or UHID…"
                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 outline-none"
                        />
                    </div>
                    <button
                        onClick={() => setShowFilters(s => !s)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg ${showFilters ? "bg-emerald-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    >
                        <Filter className="h-3.5 w-3.5" /> Filters
                    </button>
                    {(search || paymentMethod || status || from || to) && (
                        <button onClick={clearFilters} className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-bold text-gray-500 hover:bg-gray-100 rounded-lg">
                            <RotateCcw className="h-3 w-3" /> Reset
                        </button>
                    )}
                </div>

                {showFilters && (
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Method</label>
                            <select
                                value={paymentMethod}
                                onChange={e => { setPaymentMethod(e.target.value); setPage(1); }}
                                className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
                            >
                                <option value="">All</option>
                                <option value="Cash">Cash</option>
                                <option value="Card">Card</option>
                                <option value="UPI">UPI</option>
                                <option value="Bank">Bank</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Status</label>
                            <select
                                value={status}
                                onChange={e => { setStatus(e.target.value); setPage(1); }}
                                className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
                            >
                                <option value="">All</option>
                                <option value="Paid">Paid</option>
                                <option value="Voided">Voided</option>
                                <option value="Completed">Completed</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">From</label>
                            <input
                                type="date"
                                value={from}
                                onChange={e => { setFrom(e.target.value); setPage(1); }}
                                className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">To</label>
                            <input
                                type="date"
                                value={to}
                                onChange={e => { setTo(e.target.value); setPage(1); }}
                                className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
                            />
                        </div>
                    </div>
                )}

                <div className="px-4 py-2 border-b border-gray-100 bg-emerald-50/30 flex items-center gap-6 text-[11px] font-medium text-gray-600">
                    <span><strong className="text-gray-900">{meta?.total ?? 0}</strong> receipts</span>
                    <span>Showing total: <strong className="text-gray-900 font-mono">{fmtMoney(totalsRow.net)}</strong></span>
                    {totalsRow.gross !== totalsRow.net && (
                        <span className="text-gray-400">Gross: <span className="font-mono">{fmtMoney(totalsRow.gross)}</span></span>
                    )}
                </div>

                {loading ? (
                    <div className="py-20 flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                ) : rows.length === 0 ? (
                    <div className="py-16 text-center">
                        <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm text-gray-400 font-medium">No receipts match the current filters.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                                <tr>
                                    <th className="px-3 py-2 text-left">Date</th>
                                    <th className="px-3 py-2 text-left">Receipt #</th>
                                    <th className="px-3 py-2 text-left">Invoice #</th>
                                    <th className="px-3 py-2 text-left">Patient</th>
                                    <th className="px-3 py-2 text-left">Phone</th>
                                    <th className="px-3 py-2 text-left">Method</th>
                                    <th className="px-3 py-2 text-right">Total</th>
                                    <th className="px-3 py-2 text-right">Disc.</th>
                                    <th className="px-3 py-2 text-right">Net</th>
                                    <th className="px-3 py-2 text-center">Status</th>
                                    <th className="px-3 py-2 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.invoice_id} className={`border-t border-gray-100 hover:bg-emerald-50/30 ${r.status === "Voided" ? "opacity-60" : ""}`}>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <div className="font-medium text-gray-700">{fmtDate(r.created_at)}</div>
                                            <div className="text-[10px] text-gray-400">{fmtTime(r.created_at)}</div>
                                        </td>
                                        <td className="px-3 py-2 font-mono text-gray-700">{r.receipt_number || "—"}</td>
                                        <td className="px-3 py-2 font-mono text-gray-700">{r.invoice_number}</td>
                                        <td className="px-3 py-2">
                                            <div className="font-bold text-gray-800">{r.patient_name}</div>
                                            <div className="text-[10px] text-gray-400 font-mono">{r.patient_id}</div>
                                        </td>
                                        <td className="px-3 py-2 text-gray-600">{r.patient_phone || "—"}</td>
                                        <td className="px-3 py-2">
                                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-[10px] font-bold">{r.payment_method}</span>
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-gray-700">{fmtMoney(r.total_amount)}</td>
                                        <td className="px-3 py-2 text-right font-mono text-gray-500">{r.total_discount > 0 ? fmtMoney(r.total_discount) : "—"}</td>
                                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{fmtMoney(r.net_amount)}</td>
                                        <td className="px-3 py-2 text-center">
                                            <StatusBadge status={r.status} />
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => handleView(r.invoice_id)}
                                                    className="p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-lg"
                                                    title="View / Reprint"
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                </button>
                                                {r.status !== "Voided" && (
                                                    <button
                                                        onClick={() => handleVoid(r.invoice_id)}
                                                        disabled={voidingId === r.invoice_id}
                                                        className="p-1.5 text-gray-500 hover:bg-rose-50 hover:text-rose-600 rounded-lg disabled:opacity-40"
                                                        title="Void"
                                                    >
                                                        {voidingId === r.invoice_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {meta && meta.totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-xs text-gray-500 bg-gray-50">
                        <div>Page {meta.page} of {meta.totalPages}</div>
                        <div className="flex items-center gap-1">
                            <button
                                disabled={meta.page <= 1}
                                onClick={() => setPage(meta.page - 1)}
                                className="px-2 py-1 rounded bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-100 font-bold"
                            >
                                Prev
                            </button>
                            <button
                                disabled={meta.page >= meta.totalPages}
                                onClick={() => setPage(meta.page + 1)}
                                className="px-2 py-1 rounded bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-100 font-bold"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {viewReceipt && (
                <SuccessAndPrintModal
                    receipt={viewReceipt}
                    title="Receipt Detail"
                    onClose={() => setViewReceipt(null)}
                    onPrint={() => window.print()}
                />
            )}
        </>
    );
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        Paid: "bg-emerald-100 text-emerald-700",
        Completed: "bg-emerald-100 text-emerald-700",
        Voided: "bg-gray-200 text-gray-500 line-through",
        Cancelled: "bg-gray-200 text-gray-500 line-through",
        Draft: "bg-amber-100 text-amber-700",
    };
    return (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
            {status}
        </span>
    );
}

/* ──────────────────────────────────────────────────────────── PRINT MODAL */

function SuccessAndPrintModal({
    receipt,
    onClose,
    onPrint,
    title = "Receipt Generated",
}: {
    receipt: SavedReceiptView;
    onClose: () => void;
    onPrint: () => void;
    title?: string;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col no-print print:hidden">
                <div className="p-6 bg-emerald-600 text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-8 w-8 text-emerald-100" />
                        <div>
                            <h2 className="text-xl font-bold">{title}</h2>
                            <p className="text-emerald-100/80 text-xs font-medium">Receipt: {receipt.id || "—"}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-8 flex-1 space-y-5">
                    <div className="text-center space-y-1">
                        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Amount Collected</p>
                        <h3 className="text-5xl font-black text-gray-900 font-mono">{fmtMoney(receipt.amount)}</h3>
                        <p className="text-emerald-600 text-[10px] font-black uppercase tracking-widest bg-emerald-50 inline-block px-3 py-1 rounded-full mt-2">
                            Paid via {receipt.method}
                        </p>
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-2 text-sm">
                        <Row label="Patient" value={receipt.name} />
                        {receipt.phone && <Row label="Phone" value={receipt.phone} />}
                        <Row label="Invoice No" value={<span className="font-mono">{receipt.invoice}</span>} />
                        <Row label="Date" value={fmtDate(receipt.created_at)} />
                        {receipt.discount > 0 && (
                            <>
                                <Row label="Gross" value={<span className="font-mono">{fmtMoney(receipt.gross)}</span>} />
                                <Row label="Discount" value={<span className="font-mono text-rose-600">– {fmtMoney(receipt.discount)}</span>} />
                            </>
                        )}
                    </div>

                    {receipt.notes && (
                        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-2 text-xs text-amber-800">
                            <p className="font-bold uppercase tracking-wider text-[10px] text-amber-600 mb-0.5">Notes</p>
                            <p>{receipt.notes}</p>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={onPrint}
                            className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-gray-900 text-white font-bold rounded-2xl hover:bg-black transition-all active:scale-[0.98] shadow-lg shadow-gray-200"
                        >
                            <Printer className="h-5 w-5 text-emerald-400" />
                            Print
                        </button>
                        <button
                            onClick={onClose}
                            className="px-8 py-3.5 bg-gray-100 text-gray-700 font-bold rounded-2xl hover:bg-gray-200 transition-all active:scale-[0.98]"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>

            <div className="hidden print:block fixed inset-0 z-[100] text-black" style={{ padding: '130px 60px 80px 60px' }}>
                {/* Letterhead background image — full page */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/letter head.png"
                    alt=""
                    aria-hidden="true"
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        zIndex: -1,
                        pointerEvents: "none",
                    }}
                />
                <div className="max-w-3xl mx-auto space-y-6">
                    {/* Invoice number top-right */}
                    <div className="flex justify-end">
                        <div className="text-right">
                            <p className="text-base font-bold" style={{ color: "#1e3a6e" }}>{receipt.invoice}</p>
                            <p className="text-xs font-bold text-gray-600">Receipt: {receipt.id || "—"}</p>
                            <p className="text-xs text-gray-500">
                                {fmtDate(receipt.created_at)} {fmtTime(receipt.created_at)}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 py-2">
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-gray-500 uppercase">Patient Name</p>
                            <p className="text-lg font-bold">{receipt.name}</p>
                        </div>
                        <div className="space-y-1 text-right">
                            <p className="text-xs font-bold text-gray-500 uppercase">Contact</p>
                            <p className="text-lg font-bold">{receipt.phone || "N/A"}</p>
                        </div>
                    </div>

                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="border-y-2 border-black">
                                <th className="py-3 text-left font-black uppercase tracking-widest text-sm">Description</th>
                                <th className="py-3 text-center font-black uppercase tracking-widest text-sm w-20">Qty</th>
                                <th className="py-3 text-right font-black uppercase tracking-widest text-sm w-28">Rate</th>
                                <th className="py-3 text-right font-black uppercase tracking-widest text-sm w-24">Disc.</th>
                                <th className="py-3 text-right font-black uppercase tracking-widest text-sm w-28">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {receipt.items.map((srv, i) => {
                                const lineGross = srv.amt * srv.qty;
                                const lineNet = lineGross - (srv.discount || 0);
                                return (
                                    <tr key={i}>
                                        <td className="py-3 font-bold text-gray-800">{srv.desc}</td>
                                        <td className="py-3 text-center font-mono font-bold">{srv.qty}</td>
                                        <td className="py-3 text-right font-mono">₹{srv.amt.toFixed(2)}</td>
                                        <td className="py-3 text-right font-mono">{srv.discount > 0 ? `– ₹${srv.discount.toFixed(2)}` : "—"}</td>
                                        <td className="py-3 text-right font-mono font-bold">₹{lineNet.toFixed(2)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            {receipt.discount > 0 && (
                                <>
                                    <tr>
                                        <td colSpan={4} className="py-2 text-right font-medium uppercase tracking-wider text-xs text-gray-600">Subtotal</td>
                                        <td className="py-2 text-right font-mono">₹{receipt.gross.toFixed(2)}</td>
                                    </tr>
                                    <tr>
                                        <td colSpan={4} className="py-2 text-right font-medium uppercase tracking-wider text-xs text-gray-600">Discount</td>
                                        <td className="py-2 text-right font-mono">– ₹{receipt.discount.toFixed(2)}</td>
                                    </tr>
                                </>
                            )}
                            <tr className="border-t-2 border-black">
                                <td colSpan={4} className="py-5 text-right font-black uppercase tracking-widest text-lg">Total Payable</td>
                                <td className="py-5 text-right font-black text-2xl font-mono">₹{receipt.amount.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>

                    {receipt.notes && (
                        <div className="border border-gray-300 rounded p-3 text-sm">
                            <p className="text-xs font-bold text-gray-500 uppercase mb-1">Remarks</p>
                            <p>{receipt.notes}</p>
                        </div>
                    )}

                    <div className="pt-16 flex justify-between items-end">
                        <div className="space-y-1 text-xs font-bold text-gray-500">
                            <p>Payment Method: {receipt.method}</p>
                            <p>Status: FULLY PAID</p>
                        </div>
                        <div className="text-center w-64 border-t-2 border-dashed border-gray-900 pt-2">
                            <p className="text-sm font-black uppercase tracking-widest">Authorized Signatory</p>
                            <p className="text-[10px] font-medium text-gray-500 mt-1">Computer Generated Digital Receipt</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex justify-between">
            <span className="text-gray-500 font-medium">{label}</span>
            <span className="text-gray-900 font-bold">{value}</span>
        </div>
    );
}
