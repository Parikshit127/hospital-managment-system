"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
    ArrowLeft,
    CheckCircle2,
    Loader2,
    Receipt,
    Search,
    Undo2,
    X,
} from "lucide-react";
import {
    searchPatientsForBilling,
    getRefundablePayments,
    processRefund,
} from "@/app/actions/finance-actions";

type PaymentRow = {
    id: number;
    receipt_number: string;
    amount: number;
    payment_method: string;
    status: string;
    created_at: string;
    refunded_amount: number;
    refundable_amount: number;
};

type InvoiceRow = {
    id: number;
    invoice_number: string;
    invoice_type: string;
    net_amount: number;
    paid_amount: number;
    balance_due: number;
    status: string;
    created_at: string;
    payments: PaymentRow[];
};

type Patient = {
    patient_id: string;
    full_name: string;
    phone?: string | null;
};

function fmt(n: number) {
    return Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}
function fmtDate(iso: string) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function RefundModal({
    open,
    onClose,
    onRefunded,
    initialPatient,
}: {
    open: boolean;
    onClose: () => void;
    onRefunded?: () => void;
    initialPatient?: Patient | null;
}) {
    const [step, setStep] = useState<"patient" | "receipt" | "confirm">("patient");
    const [patient, setPatient] = useState<Patient | null>(initialPatient || null);

    // Patient search
    const [query, setQuery] = useState("");
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<Patient[]>([]);

    // Invoices/payments
    const [loadingInvoices, setLoadingInvoices] = useState(false);
    const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
    const [selectedPayment, setSelectedPayment] = useState<{ inv: InvoiceRow; pay: PaymentRow } | null>(null);

    // Refund form
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{ receipt_number: string } | null>(null);

    // Reset whenever opened
    useEffect(() => {
        if (!open) return;
        setError(null);
        setSuccess(null);
        setSelectedPayment(null);
        setAmount("");
        setReason("");
        if (initialPatient) {
            setPatient(initialPatient);
            setStep("receipt");
        } else {
            setPatient(null);
            setQuery("");
            setResults([]);
            setStep("patient");
        }
    }, [open, initialPatient]);

    // Patient search effect
    useEffect(() => {
        if (step !== "patient" || query.trim().length < 2) {
            setResults([]);
            return;
        }
        let cancelled = false;
        setSearching(true);
        const t = setTimeout(async () => {
            const res = await searchPatientsForBilling(query.trim());
            if (cancelled) return;
            if (res.success) setResults(res.data || []);
            setSearching(false);
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [query, step]);

    // Load invoices when patient selected
    useEffect(() => {
        if (!open || !patient || step !== "receipt") return;
        let cancelled = false;
        (async () => {
            setLoadingInvoices(true);
            const res = await getRefundablePayments(patient.patient_id);
            if (cancelled) return;
            if (res.success) setInvoices(res.data || []);
            else setError(res.error || "Failed to load patient receipts.");
            setLoadingInvoices(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [open, patient, step]);

    const refundable = selectedPayment?.pay.refundable_amount || 0;

    function selectPayment(inv: InvoiceRow, pay: PaymentRow) {
        setSelectedPayment({ inv, pay });
        setAmount(pay.refundable_amount.toString());
        setReason("");
        setError(null);
        setStep("confirm");
    }

    async function submitRefund(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedPayment) return;
        setError(null);
        const amt = Number(amount);
        if (!Number.isFinite(amt) || amt <= 0) {
            setError("Enter a refund amount greater than zero.");
            return;
        }
        if (amt > refundable + 0.01) {
            setError(`Cannot exceed refundable amount ₹${fmt(refundable)}.`);
            return;
        }
        if (!reason.trim()) {
            setError("Reason is required.");
            return;
        }
        setSubmitting(true);
        const res = await processRefund({
            payment_id: selectedPayment.pay.id,
            amount: amt,
            reason: reason.trim(),
        });
        setSubmitting(false);
        if (!res.success) {
            setError(res.error || "Refund failed.");
            return;
        }
        setSuccess({ receipt_number: res.data?.receipt_number || selectedPayment.pay.receipt_number });
        if (onRefunded) onRefunded();
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
            <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                        <Undo2 className="h-4 w-4 text-rose-600" />
                        Process Refund
                        {patient && (
                            <span className="ml-2 text-xs font-bold text-gray-500">
                                · {patient.full_name} <span className="font-mono">({patient.patient_id})</span>
                            </span>
                        )}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Steps body */}
                <div className="p-5 overflow-y-auto flex-1">
                    {/* SUCCESS */}
                    {success ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                            <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
                            <p className="text-base font-bold text-gray-900">Refund processed</p>
                            <p className="text-sm text-gray-500 mt-1">
                                Receipt <span className="font-mono">{success.receipt_number}</span> marked refunded and balance updated.
                            </p>
                            <button
                                onClick={onClose}
                                className="mt-6 px-5 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-black"
                            >
                                Done
                            </button>
                        </div>
                    ) : step === "patient" ? (
                        <div className="space-y-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    autoFocus
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search patient by name, UHID, or phone…"
                                    className="w-full pl-10 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-400/10 outline-none"
                                />
                                {searching && (
                                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
                                )}
                            </div>
                            <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                                {query.trim().length < 2 && (
                                    <p className="text-xs text-gray-400 text-center py-8">Type at least 2 characters to search.</p>
                                )}
                                {query.trim().length >= 2 && !searching && results.length === 0 && (
                                    <p className="text-xs text-gray-400 text-center py-8">No patients match.</p>
                                )}
                                {results.map((p) => (
                                    <button
                                        key={p.patient_id}
                                        onClick={() => {
                                            setPatient(p);
                                            setStep("receipt");
                                        }}
                                        className="w-full text-left p-3 bg-white border border-gray-200 rounded-xl hover:border-rose-300 hover:bg-rose-50/40 transition-all"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-900 truncate">{p.full_name}</p>
                                                <p className="text-[10px] text-gray-400 font-mono">
                                                    {p.patient_id} · {p.phone || "no phone"}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : step === "receipt" ? (
                        <div>
                            {!initialPatient && (
                                <button
                                    onClick={() => {
                                        setPatient(null);
                                        setStep("patient");
                                    }}
                                    className="text-xs font-bold text-gray-500 hover:text-gray-900 flex items-center gap-1 mb-3"
                                >
                                    <ArrowLeft className="h-3 w-3" /> Change patient
                                </button>
                            )}
                            {loadingInvoices ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                                </div>
                            ) : invoices.length === 0 ? (
                                <p className="text-sm text-gray-500 text-center py-10">
                                    No paid receipts found for this patient.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    <p className="text-xs uppercase tracking-widest font-bold text-gray-500">
                                        Select a paid receipt to refund
                                    </p>
                                    {invoices.map((inv) => (
                                        <div key={inv.id} className="border border-gray-200 rounded-xl overflow-hidden">
                                            <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 font-mono">
                                                        {inv.invoice_number}
                                                    </p>
                                                    <p className="text-[10px] text-gray-500">
                                                        {inv.invoice_type} · {fmtDate(inv.created_at)}
                                                    </p>
                                                </div>
                                                <div className="text-right text-[11px]">
                                                    <p className="font-bold text-gray-700">
                                                        ₹{fmt(inv.paid_amount)} / ₹{fmt(inv.net_amount)}
                                                    </p>
                                                    <p className="text-gray-400">Balance ₹{fmt(inv.balance_due)}</p>
                                                </div>
                                            </div>
                                            <div className="divide-y divide-gray-100">
                                                {inv.payments.map((p) => {
                                                    const disabled = p.refundable_amount <= 0;
                                                    return (
                                                        <button
                                                            key={p.id}
                                                            disabled={disabled}
                                                            onClick={() => selectPayment(inv, p)}
                                                            className={`w-full flex items-center justify-between px-3 py-2.5 text-left text-xs ${disabled
                                                                ? "bg-gray-50 text-gray-400 cursor-not-allowed"
                                                                : "hover:bg-rose-50/40"
                                                                }`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <Receipt className="h-3.5 w-3.5 text-gray-400" />
                                                                <div>
                                                                    <p className="font-mono font-bold text-gray-800">
                                                                        {p.receipt_number}
                                                                    </p>
                                                                    <p className="text-[10px] text-gray-400">
                                                                        {p.payment_method} · {fmtDate(p.created_at)} · {p.status}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="font-bold text-gray-900">₹{fmt(p.amount)}</p>
                                                                <p className="text-[10px] text-gray-400">
                                                                    {p.refunded_amount > 0
                                                                        ? `₹${fmt(p.refunded_amount)} refunded`
                                                                        : disabled
                                                                            ? "Fully refunded"
                                                                            : `Refundable ₹${fmt(p.refundable_amount)}`}
                                                                </p>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : selectedPayment ? (
                        <form onSubmit={submitRefund} className="space-y-4">
                            <button
                                type="button"
                                onClick={() => setStep("receipt")}
                                className="text-xs font-bold text-gray-500 hover:text-gray-900 flex items-center gap-1"
                            >
                                <ArrowLeft className="h-3 w-3" /> Back to receipts
                            </button>

                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-1 text-xs">
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-500 font-bold">Receipt</span>
                                    <span className="font-mono font-bold">{selectedPayment.pay.receipt_number}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-500 font-bold">Invoice</span>
                                    <span className="font-mono">{selectedPayment.inv.invoice_number}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-500 font-bold">Method</span>
                                    <span>{selectedPayment.pay.payment_method}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-500 font-bold">Paid amount</span>
                                    <span className="font-bold">₹{fmt(selectedPayment.pay.amount)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-500 font-bold">Refundable</span>
                                    <span className="font-bold text-rose-600">₹{fmt(refundable)}</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] uppercase tracking-widest font-bold text-gray-500 mb-1">
                                    Refund amount (₹)
                                </label>
                                <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    max={refundable}
                                    required
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-400/10 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] uppercase tracking-widest font-bold text-gray-500 mb-1">
                                    Reason
                                </label>
                                <textarea
                                    required
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Why is this being refunded?"
                                    className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-400/10 outline-none min-h-[80px]"
                                />
                            </div>

                            {error && (
                                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                                    {error}
                                </p>
                            )}

                            <div className="flex items-center gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                                    Process Refund
                                </button>
                            </div>
                        </form>
                    ) : null}

                    {step !== "confirm" && error && (
                        <p className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                            {error}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
