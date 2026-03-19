'use client';

import { StatusBadge } from './StatusBadge';

interface InvoiceDetailModalProps {
    invoice: any;
    onClose: () => void;
}

export function InvoiceDetailModal({ invoice, onClose }: InvoiceDetailModalProps) {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-auto p-6 space-y-5">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black text-gray-900">Invoice: {invoice.invoice_number}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-xl">&times;</button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="bg-gray-100 rounded-xl p-3">
                        <p className="text-gray-400 font-bold mb-1">Patient</p>
                        <p className="text-gray-900 font-bold">{invoice.patient?.full_name || invoice.patient_id}</p>
                    </div>
                    <div className="bg-gray-100 rounded-xl p-3">
                        <p className="text-gray-400 font-bold mb-1">Status</p>
                        <StatusBadge status={invoice.status} />
                    </div>
                </div>

                {/* Line Items */}
                <div>
                    <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Line Items</h4>
                    <div className="space-y-1.5">
                        {invoice.items?.map((item: any) => (
                            <div key={item.id} className="flex items-center justify-between p-3 bg-gray-100 rounded-xl text-xs">
                                <div>
                                    <p className="font-bold text-gray-700">{item.description}</p>
                                    <p className="text-[10px] text-gray-400">{item.department} &bull; Qty: {item.quantity}</p>
                                </div>
                                <span className="font-black text-gray-700">{'\u20B9'}{Number(item.net_price).toLocaleString()}</span>
                            </div>
                        ))}
                        {(!invoice.items || invoice.items.length === 0) && (
                            <p className="text-xs text-gray-300 py-4 text-center">No line items</p>
                        )}
                    </div>
                </div>

                {/* Payments */}
                <div>
                    <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Payments</h4>
                    <div className="space-y-1.5">
                        {invoice.payments?.map((pay: any) => (
                            <div key={pay.id} className="flex items-center justify-between p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-xs">
                                <div>
                                    <p className="font-bold text-emerald-400">{pay.receipt_number}</p>
                                    <p className="text-[10px] text-gray-400">{pay.payment_method} &bull; {pay.payment_type}</p>
                                </div>
                                <span className="font-black text-emerald-400">{'\u20B9'}{Number(pay.amount).toLocaleString()}</span>
                            </div>
                        ))}
                        {(!invoice.payments || invoice.payments.length === 0) && (
                            <p className="text-xs text-gray-300 py-4 text-center">No payments recorded</p>
                        )}
                    </div>
                </div>

                {/* Summary */}
                <div className="bg-gray-100 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-xs"><span className="text-gray-500">Total</span><span className="font-black text-gray-900">{'\u20B9'}{Number(invoice.net_amount).toLocaleString()}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-gray-500">Paid</span><span className="font-bold text-emerald-400">{'\u20B9'}{Number(invoice.paid_amount).toLocaleString()}</span></div>
                    <div className="flex justify-between text-xs border-t border-gray-200 pt-2"><span className="text-gray-500 font-bold">Balance Due</span><span className="font-black text-amber-400">{'\u20B9'}{Number(invoice.balance_due).toLocaleString()}</span></div>
                </div>
            </div>
        </div>
    );
}
