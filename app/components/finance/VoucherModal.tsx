'use client';

import React, { useEffect, useState } from 'react';
import { BookOpenCheck, Loader2, XCircle } from 'lucide-react';
import { Modal } from '@/app/components/ui/Modal';
import { getInvoiceVoucher } from '@/app/actions/report-actions';

const fmtINR = (n: number) =>
    `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d: any) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const PAYER_LABEL: Record<string, string> = {
    cash: 'Cash',
    corporate: 'Corporate',
    tpa_insurance: 'TPA / Insurance',
};

interface VoucherModalProps {
    invoiceId: number;
    onClose: () => void;
}

/**
 * Read-only accounting voucher viewer for the P&L drill-down. Fetches the
 * voucher (reused GL journal entry + income-head breakdown) for one invoice and
 * renders it as a classic Dr/Cr journal: payer ledger debited, income heads +
 * GST credited.
 */
export function VoucherModal({ invoiceId, onClose }: VoucherModalProps) {
    const [loading, setLoading] = useState(true);
    const [voucher, setVoucher] = useState<any | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        getInvoiceVoucher(invoiceId).then((res) => {
            if (cancelled) return;
            if (res.success) setVoucher(res.data);
            else setError((res as any).error || 'Failed to load voucher');
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [invoiceId]);

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="Accounting Voucher"
            icon={<BookOpenCheck className="h-4 w-4" />}
            maxWidth="2xl"
        >
            {loading ? (
                <div className="py-12 flex items-center justify-center text-gray-400 gap-2 text-sm">
                    <Loader2 className="h-5 w-5 animate-spin" /> Loading voucher…
                </div>
            ) : error ? (
                <div className="py-10 text-center text-sm text-rose-600">{error}</div>
            ) : voucher ? (
                <VoucherBody v={voucher} />
            ) : null}
        </Modal>
    );
}

function VoucherBody({ v }: { v: any }) {
    const payer = PAYER_LABEL[v.patient_type] || v.patient_type;
    const credits: { head: string; amount: number }[] = v.credits || [];

    return (
        <div className="space-y-5">
            {/* Meta grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Meta label="Voucher Type" value={v.voucher_type} />
                <Meta label="Voucher No." value={v.voucher_number || (v.posted ? '—' : 'Not posted')} mono />
                <Meta label="Date" value={fmtDate(v.voucher_date)} />
                <Meta label="Reference Invoice" value={v.invoice_number} mono />
                <Meta label="Patient" value={v.patient_name} />
                <Meta label="Patient Type" value={payer} />
            </div>

            {v.invoice_status === 'Cancelled' && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
                    <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
                    <span>
                        The source invoice has been <span className="font-bold">cancelled</span>. This voucher
                        reflects the original posting and is shown for reference.
                    </span>
                </div>
            )}

            {/* Journal entries */}
            <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Journal Entries</h4>
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                            <tr>
                                <th className="px-4 py-2 text-left font-semibold">Account / Ledger</th>
                                <th className="px-4 py-2 text-right font-semibold">Debit</th>
                                <th className="px-4 py-2 text-right font-semibold">Credit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {/* Debit: payer ledger */}
                            <tr>
                                <td className="px-4 py-2.5 font-semibold text-gray-900">
                                    {v.debit_ledger} <span className="text-gray-400 font-normal">Dr</span>
                                    {v.debit_account_code && (
                                        <span className="ml-1.5 text-[10px] text-gray-400 font-mono">[{v.debit_account_code}]</span>
                                    )}
                                </td>
                                <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmtINR(v.total_debit)}</td>
                                <td className="px-4 py-2.5 text-right text-gray-300">—</td>
                            </tr>
                            {/* Credits: income heads */}
                            {credits.map((c) => (
                                <tr key={c.head}>
                                    <td className="px-4 py-2 text-gray-700 pl-10">To {c.head}</td>
                                    <td className="px-4 py-2 text-right text-gray-300">—</td>
                                    <td className="px-4 py-2 text-right text-gray-700">{fmtINR(c.amount)}</td>
                                </tr>
                            ))}
                            {/* Credit: GST */}
                            {v.gst_amount > 0 && (
                                <tr>
                                    <td className="px-4 py-2 text-gray-700 pl-10">To GST Payable</td>
                                    <td className="px-4 py-2 text-right text-gray-300">—</td>
                                    <td className="px-4 py-2 text-right text-gray-700">{fmtINR(v.gst_amount)}</td>
                                </tr>
                            )}
                            {credits.length === 0 && !(v.gst_amount > 0) && (
                                <tr>
                                    <td colSpan={3} className="px-4 py-3 text-center text-xs text-gray-400">
                                        No revenue lines on this invoice.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-900">
                                <td className="px-4 py-2.5 text-right">Total</td>
                                <td className="px-4 py-2.5 text-right">{fmtINR(v.total_debit)}</td>
                                <td className="px-4 py-2.5 text-right">{fmtINR(v.total_credit)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <p className="mt-2 text-[11px] text-gray-400 leading-relaxed">
                    {v.posted ? (
                        <>
                            Posted to General Ledger as{' '}
                            <span className="font-mono text-gray-500">{v.voucher_number}</span>
                            {v.gl_status ? ` · ${v.gl_status}` : ''}. Income heads are itemised from the invoice
                            line items; the ledger posts revenue in aggregate.
                        </>
                    ) : (
                        <>Not yet posted to the General Ledger (auto-posting pending). Voucher derived from invoice line items.</>
                    )}
                </p>
            </div>
        </div>
    );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
            <p className={`text-sm font-bold text-gray-900 truncate ${mono ? 'font-mono' : ''}`} title={value}>
                {value}
            </p>
        </div>
    );
}
