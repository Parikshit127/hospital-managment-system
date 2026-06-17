'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Banknote, CheckCircle2, FileText, Receipt } from 'lucide-react';
import { Modal } from '@/app/components/ui/Modal';
import { Input, Textarea } from '@/app/components/ui/Input';
import { Button } from '@/app/components/ui/Button';
import { useToast } from '@/app/components/ui/Toast';
import { recordTpaPaymentReceived } from '@/app/actions/insurance-corporate-actions';

export type RecordTpaPaymentModalProps = {
    open: boolean;
    onClose: () => void;
    onRecorded?: (paymentId: number) => void;
    invoice: {
        id: number;
        version: number;
        invoice_number: string;
        patient_name?: string | null;
        tpa_provider_name?: string | null;
        tpa_approved_amount: number;
        tpa_settled_amount: number;
    };
};

type PaymentMethod = 'NEFT' | 'RTGS' | 'Cheque' | 'UPI' | 'Other';

const PAYMENT_METHODS: PaymentMethod[] = ['NEFT', 'RTGS', 'Cheque', 'UPI', 'Other'];

const fmtINR = (n: number) =>
    `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function todayIso(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function RecordTpaPaymentModal({
    open,
    onClose,
    onRecorded,
    invoice,
}: RecordTpaPaymentModalProps) {
    const toast = useToast();

    const approved = Number(invoice.tpa_approved_amount || 0);
    const received = Number(invoice.tpa_settled_amount || 0);
    const outstanding = Math.max(0, approved - received);

    const [amount, setAmount] = useState<number>(outstanding);
    const [receivedDate, setReceivedDate] = useState<string>(todayIso());
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('NEFT');
    const [referenceNumber, setReferenceNumber] = useState<string>('');
    const [remarks, setRemarks] = useState<string>('');
    const [isPartial, setIsPartial] = useState<boolean>(false);
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Reset form whenever the modal is (re)opened or invoice context changes.
    useEffect(() => {
        if (!open) return;
        setAmount(outstanding);
        setReceivedDate(todayIso());
        setPaymentMethod('NEFT');
        setReferenceNumber('');
        setRemarks('');
        setIsPartial(false);
        setError(null);
        setSubmitting(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, invoice.id]);

    const validation = useMemo(() => {
        const amt = Number(amount);
        if (!Number.isFinite(amt) || amt <= 0) {
            return { ok: false, msg: 'Amount received must be greater than 0.' };
        }
        if (amt > outstanding + 0.01) {
            return {
                ok: false,
                msg: `Amount cannot exceed outstanding TPA balance of ${fmtINR(outstanding)}.`,
            };
        }
        if (amt < outstanding - 0.01 && !isPartial) {
            return {
                ok: false,
                msg: 'Tick "Partial settlement" when receiving less than the outstanding balance.',
            };
        }
        if (!referenceNumber.trim()) {
            return { ok: false, msg: 'Reference number is required.' };
        }
        if (!receivedDate) {
            return { ok: false, msg: 'Received date is required.' };
        }
        return { ok: true as const, msg: null };
    }, [amount, outstanding, isPartial, referenceNumber, receivedDate]);

    async function handleSubmit() {
        setError(null);
        if (!validation.ok) {
            setError(validation.msg || 'Please fix the form before submitting.');
            return;
        }
        setSubmitting(true);
        try {
            const res = await recordTpaPaymentReceived({
                invoice_id: invoice.id,
                expected_version: invoice.version,
                amount_received: Number(amount),
                received_date: receivedDate,
                payment_method: paymentMethod,
                reference_number: referenceNumber.trim(),
                remarks: remarks.trim() || undefined,
                is_partial: isPartial,
            });
            if (!res.success || !res.payment_id) {
                setError(res.error || 'Failed to record TPA payment.');
                setSubmitting(false);
                return;
            }
            toast.success(`TPA payment of ${fmtINR(Number(amount))} recorded.`);
            onRecorded?.(res.payment_id);
            // Open receipt PDF in a new tab.
            if (typeof window !== 'undefined') {
                window.open(`/api/payment/${res.payment_id}/receipt`, '_blank', 'noopener,noreferrer');
            }
            onClose();
        } catch (e: any) {
            setError(e?.message || 'Failed to record TPA payment.');
        } finally {
            setSubmitting(false);
        }
    }

    if (!open) return null;

    return (
        <Modal
            isOpen
            onClose={submitting ? () => {} : onClose}
            title={`Record TPA Payment — ${invoice.invoice_number}`}
            icon={<Banknote className="h-4 w-4" />}
            maxWidth="xl"
        >
            <div className="space-y-5">
                {/* Header strip: patient, invoice, provider, money summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Patient</p>
                        <p className="text-sm font-bold text-gray-900 truncate">
                            {invoice.patient_name || '—'}
                        </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Invoice</p>
                        <p className="text-sm font-bold text-gray-900 truncate flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            {invoice.invoice_number}
                        </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">TPA Provider</p>
                        <p className="text-sm font-bold text-gray-900 truncate">
                            {invoice.tpa_provider_name || '—'}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3.5 py-3 text-xs">
                    <div>
                        <span className="text-amber-700 font-bold uppercase tracking-wide text-[10px]">Approved</span>
                        <p className="text-sm font-bold text-gray-900 font-mono">{fmtINR(approved)}</p>
                    </div>
                    <div>
                        <span className="text-amber-700 font-bold uppercase tracking-wide text-[10px]">Received</span>
                        <p className="text-sm font-bold text-gray-900 font-mono">{fmtINR(received)}</p>
                    </div>
                    <div>
                        <span className="text-amber-700 font-bold uppercase tracking-wide text-[10px]">Outstanding</span>
                        <p className="text-sm font-bold text-amber-700 font-mono">{fmtINR(outstanding)}</p>
                    </div>
                </div>

                {outstanding <= 0.01 ? (
                    <div className="flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-3">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-emerald-700 leading-relaxed">
                            This claim is fully settled. Nothing more to record.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Form fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Input
                                label="Amount Received (₹)"
                                type="number"
                                min={0}
                                step="any"
                                value={amount}
                                onChange={e => setAmount(Number(e.target.value))}
                                disabled={submitting}
                                placeholder="0.00"
                            />
                            <Input
                                label="Received Date"
                                type="date"
                                value={receivedDate}
                                onChange={e => setReceivedDate(e.target.value)}
                                max={todayIso()}
                                disabled={submitting}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                    Payment Method
                                </label>
                                <select
                                    value={paymentMethod}
                                    onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                                    disabled={submitting}
                                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/15 focus:border-orange-500 transition-all duration-200 shadow-sm hover:border-gray-300"
                                >
                                    {PAYMENT_METHODS.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>
                            <Input
                                label="Reference Number"
                                type="text"
                                value={referenceNumber}
                                onChange={e => setReferenceNumber(e.target.value)}
                                disabled={submitting}
                                placeholder="UTR / Cheque # / Txn ID"
                            />
                        </div>

                        <Textarea
                            label="Remarks"
                            rows={2}
                            value={remarks}
                            onChange={e => setRemarks(e.target.value)}
                            disabled={submitting}
                            placeholder="Optional notes"
                        />

                        <label className="flex items-start gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isPartial}
                                onChange={e => setIsPartial(e.target.checked)}
                                disabled={submitting}
                                className="mt-0.5"
                            />
                            <div className="flex-1">
                                <p className="text-xs font-bold text-gray-800">Partial settlement</p>
                                <p className="text-[11px] text-gray-500 leading-snug">
                                    Tick when the TPA is paying less than the full outstanding balance.
                                </p>
                            </div>
                        </label>

                        {error && (
                            <div className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-3">
                                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-rose-700 leading-relaxed">{error}</p>
                            </div>
                        )}
                    </>
                )}

                <div className="flex items-center justify-end gap-3 pt-1">
                    <Button variant="secondary" size="md" onClick={onClose} disabled={submitting}>
                        Close
                    </Button>
                    {outstanding > 0.01 && (
                        <Button
                            variant="primary"
                            size="md"
                            onClick={handleSubmit}
                            loading={submitting}
                            disabled={submitting || !validation.ok}
                            icon={!submitting ? <Receipt className="h-4 w-4" /> : undefined}
                        >
                            Record Payment
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
}

export default RecordTpaPaymentModal;
