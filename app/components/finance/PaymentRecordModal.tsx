'use client';

import { CreditCard, Loader2 } from 'lucide-react';

interface PaymentRecordModalProps {
    invoice: any;
    form: { amount: string; method: string; type: string; notes: string };
    onFormChange: (form: { amount: string; method: string; type: string; notes: string }) => void;
    onSubmit: () => void;
    onClose: () => void;
    loading: boolean;
}

export function PaymentRecordModal({ invoice, form, onFormChange, onSubmit, onClose, loading }: PaymentRecordModalProps) {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl w-full max-w-md p-6 space-y-5">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-emerald-400" /> Record Payment
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-xl">&times;</button>
                </div>
                <div className="text-xs text-gray-500 font-mono bg-gray-100 p-3 rounded-xl">
                    Invoice: {invoice.invoice_number} &bull; Balance: {'\u20B9'}{Number(invoice.balance_due).toLocaleString()}
                </div>
                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Amount</label>
                        <input type="number" value={form.amount} onChange={e => onFormChange({ ...form, amount: e.target.value })}
                            className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:border-emerald-500/50 focus:outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Method</label>
                            <select value={form.method} onChange={e => onFormChange({ ...form, method: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none">
                                {['Cash', 'UPI', 'Card', 'Razorpay', 'BankTransfer'].map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Type</label>
                            <select value={form.type} onChange={e => onFormChange({ ...form, type: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none">
                                {['Advance', 'Settlement', 'PartialPayment', 'Refund'].map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Notes</label>
                        <input type="text" value={form.notes} onChange={e => onFormChange({ ...form, notes: e.target.value })}
                            className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:border-emerald-500/50 focus:outline-none" placeholder="Optional" />
                    </div>
                </div>
                {form.method === 'Razorpay' && (
                    <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-600">
                        <CreditCard className="h-4 w-4 flex-shrink-0" />
                        You will be redirected to Razorpay&apos;s secure payment page to complete the transaction.
                    </div>
                )}
                <button onClick={onSubmit} disabled={loading || !form.amount}
                    className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-black rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    {form.method === 'Razorpay' ? 'Pay with Razorpay' : 'Record Payment'}
                </button>
            </div>
        </div>
    );
}
