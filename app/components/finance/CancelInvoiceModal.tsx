'use client';

import React, { useState } from 'react';
import { XCircle, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/app/components/ui/Modal';
import { Textarea } from '@/app/components/ui/Input';
import { Button } from '@/app/components/ui/Button';
import { cancelInvoice } from '@/app/actions/finance-actions';

interface CancelInvoiceModalProps {
    invoiceId: number;
    invoiceNumber: string;
    patientName: string;
    /** Invoice total (net amount) — shown for confirmation context */
    amount: number;
    /** Amount already collected — if > 0 cancellation is blocked (use Refund/Credit Note) */
    paidAmount?: number;
    onClose: () => void;
    /** Called after a successful cancellation so the caller can refresh */
    onCancelled?: () => void;
}

const MIN_REASON = 10;

const fmtINR = (n: number) =>
    `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export function CancelInvoiceModal({
    invoiceId,
    invoiceNumber,
    patientName,
    amount,
    paidAmount,
    onClose,
    onCancelled,
}: CancelInvoiceModalProps) {
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [touched, setTouched] = useState(false);

    // Payments already collected → cancellation is not allowed (mirrors the
    // server-side guard). Surfaced here so the validation shows immediately.
    const paid = Number(paidAmount ?? 0);
    const blockedByPayment = paid > 0;

    const trimmed = reason.trim();
    const tooShort = trimmed.length < MIN_REASON;
    const error = touched && tooShort
        ? `Please enter at least ${MIN_REASON} characters.`
        : undefined;

    async function handleConfirm() {
        setTouched(true);
        if (blockedByPayment || tooShort) return;
        setSubmitting(true);
        try {
            const res = await cancelInvoice(invoiceId, trimmed);
            if (res.success) {
                toast.success(`Invoice ${invoiceNumber} cancelled.`);
                onCancelled?.();
                onClose();
            } else {
                // Server-side validation (e.g. already paid) surfaces here
                toast.error(res.error || 'Failed to cancel invoice.', { duration: 6000 });
            }
        } catch (e: any) {
            toast.error(e?.message || 'Failed to cancel invoice.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Modal
            isOpen
            onClose={submitting ? () => {} : onClose}
            title="Cancel Invoice"
            icon={<XCircle className="h-4 w-4" />}
            maxWidth="md"
        >
            <div className="space-y-5">
                {/* Invoice summary */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Invoice #</p>
                        <p className="text-sm font-bold text-gray-900 font-mono truncate" title={invoiceNumber}>{invoiceNumber}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Patient</p>
                        <p className="text-sm font-bold text-gray-900 truncate" title={patientName}>{patientName}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Amount</p>
                        <p className="text-sm font-bold text-gray-900">{fmtINR(amount)}</p>
                    </div>
                </div>

                {/* Warning / blocked notice */}
                {blockedByPayment ? (
                    <div className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-3">
                        <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-rose-700 leading-relaxed">
                            <span className="font-bold">Cannot cancel this invoice.</span> {fmtINR(paid)} has already
                            been collected against it. Reverse the payment via a <span className="font-bold">Refund</span>{' '}
                            or issue a <span className="font-bold">Credit Note</span> instead — cancellation does not
                            return collected money.
                        </p>
                    </div>
                ) : (
                    <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3">
                        <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-rose-700 leading-relaxed">
                            This marks the invoice as <span className="font-bold">Cancelled</span>. The record is kept
                            for audit and stays searchable, but no further payments can be collected against it. This
                            action requires a reason and is logged.
                        </p>
                    </div>
                )}

                {/* Reason (required) — hidden when blocked, nothing to capture */}
                {!blockedByPayment && (
                    <Textarea
                        label="Cancellation reason (required)"
                        placeholder="e.g. Duplicate invoice raised in error for this patient"
                        rows={3}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        onBlur={() => setTouched(true)}
                        error={error}
                        disabled={submitting}
                    />
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-1">
                    <Button variant="secondary" size="md" onClick={onClose} disabled={submitting}>
                        Close
                    </Button>
                    <Button
                        variant="danger"
                        size="md"
                        onClick={handleConfirm}
                        loading={submitting}
                        disabled={submitting || tooShort || blockedByPayment}
                        icon={!submitting ? <XCircle className="h-4 w-4" /> : undefined}
                    >
                        Confirm Cancel
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
