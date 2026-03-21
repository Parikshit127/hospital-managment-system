'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { FileText, ArrowLeft, Printer } from 'lucide-react';
import { getInvoiceDetail } from '@/app/actions/finance-actions';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function InvoiceDetailPage() {
    const params = useParams();
    const invoiceId = Number(params.id);
    const [invoice, setInvoice] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!invoiceId) return;
        (async () => {
            const res = await getInvoiceDetail(invoiceId);
            if (res.success) setInvoice(res.data);
            setLoading(false);
        })();
    }, [invoiceId]);

    if (loading) return <AppShell pageTitle="Loading..."><div className="p-12 text-center text-gray-400">Loading invoice...</div></AppShell>;
    if (!invoice) return <AppShell pageTitle="Not Found"><div className="p-12 text-center text-red-500">Invoice not found.</div></AppShell>;

    const statusStyle = invoice.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
        invoice.status === 'Partial' ? 'bg-amber-100 text-amber-700' :
            invoice.status === 'Draft' ? 'bg-gray-100 text-gray-700' :
                invoice.status === 'Cancelled' ? 'bg-rose-100 text-rose-700' :
                    'bg-indigo-100 text-indigo-700';

    return (
        <AppShell
            pageTitle={`Invoice ${invoice.invoice_number}`}
            pageIcon={<FileText className="h-5 w-5" />}
        >
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <Link href="/finance/invoices" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors">
                        <ArrowLeft className="h-4 w-4" /> Back to Invoices
                    </Link>
                    <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-colors">
                        <Printer className="h-4 w-4" /> Print
                    </button>
                </div>

                {/* Header Card */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 mb-6">
                    <div className="flex flex-col sm:flex-row justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">{invoice.invoice_number}</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                {invoice.invoice_type} Invoice &bull; Created {new Date(invoice.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                        </div>
                        <span className={`self-start px-4 py-1.5 text-xs uppercase tracking-wider font-bold rounded-full ${statusStyle}`}>
                            {invoice.status}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-gray-100">
                        <div>
                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Patient</p>
                            <p className="font-bold text-gray-900 text-sm mt-0.5">{invoice.patient?.full_name || '—'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Patient ID</p>
                            <p className="font-mono text-gray-700 text-sm mt-0.5">{invoice.patient_id}</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Amount</p>
                            <p className="font-black text-gray-900 text-lg mt-0.5">₹{Number(invoice.net_amount).toFixed(2)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Balance Due</p>
                            <p className={`font-black text-lg mt-0.5 ${Number(invoice.balance_due) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                ₹{Number(invoice.balance_due).toFixed(2)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Line Items */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden mb-6">
                    <div className="px-6 py-4 border-b border-gray-100">
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Line Items</h3>
                    </div>
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                            <tr>
                                <th className="px-6 py-3 font-bold text-xs uppercase tracking-wider">Description</th>
                                <th className="px-6 py-3 font-bold text-xs uppercase tracking-wider">Dept</th>
                                <th className="px-6 py-3 font-bold text-xs uppercase tracking-wider text-right">Qty</th>
                                <th className="px-6 py-3 font-bold text-xs uppercase tracking-wider text-right">Unit Price</th>
                                <th className="px-6 py-3 font-bold text-xs uppercase tracking-wider text-right">Discount</th>
                                <th className="px-6 py-3 font-bold text-xs uppercase tracking-wider text-right">Net</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {invoice.items?.map((item: any) => (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 font-medium text-gray-900">{item.description}</td>
                                    <td className="px-6 py-3 text-gray-500">{item.department}</td>
                                    <td className="px-6 py-3 text-right text-gray-700">{item.quantity}</td>
                                    <td className="px-6 py-3 text-right text-gray-700">₹{Number(item.unit_price).toFixed(2)}</td>
                                    <td className="px-6 py-3 text-right text-gray-500">₹{Number(item.discount).toFixed(2)}</td>
                                    <td className="px-6 py-3 text-right font-bold text-gray-900">₹{Number(item.net_price).toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                            <tr>
                                <td colSpan={5} className="px-6 py-3 text-right font-bold text-gray-500 text-xs uppercase">Total</td>
                                <td className="px-6 py-3 text-right font-black text-gray-900">₹{Number(invoice.total_amount).toFixed(2)}</td>
                            </tr>
                            {Number(invoice.total_discount) > 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-2 text-right font-bold text-gray-500 text-xs uppercase">Discount</td>
                                    <td className="px-6 py-2 text-right font-bold text-emerald-600">-₹{Number(invoice.total_discount).toFixed(2)}</td>
                                </tr>
                            )}
                            <tr>
                                <td colSpan={5} className="px-6 py-3 text-right font-black text-gray-900 text-sm uppercase">Net Amount</td>
                                <td className="px-6 py-3 text-right font-black text-gray-900 text-lg">₹{Number(invoice.net_amount).toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* Payments */}
                {invoice.payments?.length > 0 && (
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden mb-6">
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Payments</h3>
                        </div>
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                                <tr>
                                    <th className="px-6 py-3 font-bold text-xs uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 font-bold text-xs uppercase tracking-wider">Method</th>
                                    <th className="px-6 py-3 font-bold text-xs uppercase tracking-wider">Reference</th>
                                    <th className="px-6 py-3 font-bold text-xs uppercase tracking-wider text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {invoice.payments.map((p: any) => (
                                    <tr key={p.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-3 text-gray-700">{new Date(p.created_at).toLocaleDateString('en-IN')}</td>
                                        <td className="px-6 py-3 text-gray-700 capitalize">{p.payment_method}</td>
                                        <td className="px-6 py-3 text-gray-500 font-mono text-xs">{p.transaction_ref || '—'}</td>
                                        <td className="px-6 py-3 text-right font-bold text-emerald-600">₹{Number(p.amount).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Notes */}
                {invoice.notes && (
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2">Notes</h3>
                        <p className="text-sm text-gray-600">{invoice.notes}</p>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
