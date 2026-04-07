'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { generateInterimBill, settleAndDischarge } from '@/app/actions/ipd-finance-actions';

export default function DischargeSettlementPage() {
    const params = useParams();
    const router = useRouter();
    const admissionId = params.admissionId as string;

    const [billData, setBillData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [settling, setSettling] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Discount
    const [discountAmount, setDiscountAmount] = useState('');
    const [discountReason, setDiscountReason] = useState('');
    const [approvedBy, setApprovedBy] = useState('');

    // Split payment
    const [splits, setSplits] = useState<Array<{ amount: string; method: string; reference: string }>>([]);

    // Deposit application
    const [applyDeposits, setApplyDeposits] = useState(true);

    function showToast(message: string, type: 'success' | 'error' = 'success') {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    }

    useEffect(() => { loadBill(); }, [admissionId]);

    async function loadBill() {
        setLoading(true);
        const res = await generateInterimBill(admissionId);
        if (res.success && res.data) {
            setBillData(res.data);
            // Calculate remaining balance after deposits
            const totalDepositsAvailable = (res.data.deposits || []).reduce(
                (s: number, d: any) => s + (d.available || 0), 0
            );
            const balanceAfterDeposits = Math.max(0, res.data.invoice.balance_due - (applyDeposits ? totalDepositsAvailable : 0));
            if (balanceAfterDeposits > 0) {
                setSplits([{ amount: String(balanceAfterDeposits), method: 'Cash', reference: '' }]);
            }
        }
        setLoading(false);
    }

    const totalDepositsAvailable = (billData?.deposits || []).reduce(
        (s: number, d: any) => s + (d.available || 0), 0
    );

    const insuranceApproved = 0; // Placeholder for insurance integration

    const discount = parseFloat(discountAmount) || 0;
    const netBill = (billData?.invoice?.net_amount || 0) - discount;
    const priorPayments = billData?.invoice?.paid_amount || 0;
    const depositsToApply = applyDeposits ? Math.min(totalDepositsAvailable, netBill - priorPayments) : 0;
    const balanceDue = Math.max(0, netBill - priorPayments - depositsToApply - insuranceApproved);

    const splitTotal = splits.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const isBalanced = balanceDue <= 0 || Math.abs(splitTotal - balanceDue) < 0.01;

    // Group items by category
    const categoryGroups = billData?.items?.reduce((acc: any, item: any) => {
        const cat = item.service_category || item.department || 'Other';
        if (!acc[cat]) acc[cat] = { items: [], total: 0 };
        acc[cat].items.push(item);
        acc[cat].total += (item.net_price || 0) + (item.tax_amount || 0);
        return acc;
    }, {} as Record<string, { items: any[]; total: number }>) || {};

    async function handleSettleAndDischarge() {
        if (!isBalanced && balanceDue > 0) {
            showToast('Payment amount does not match balance due', 'error');
            return;
        }

        if (discount > 0 && discount > (billData?.invoice?.net_amount || 0) * 0.05 && !approvedBy) {
            showToast('Discount > 5% requires approver name', 'error');
            return;
        }

        setSettling(true);
        const res = await settleAndDischarge({
            admission_id: admissionId,
            apply_deposits: applyDeposits,
            discount_amount: discount > 0 ? discount : undefined,
            discount_reason: discountReason || undefined,
            approved_by: approvedBy || undefined,
            splits: balanceDue > 0 ? splits.filter(s => parseFloat(s.amount) > 0).map(s => ({
                amount: parseFloat(s.amount),
                payment_method: s.method,
                reference: s.reference || undefined,
            })) : undefined,
        });
        setSettling(false);

        if (res.success) {
            showToast('Patient discharged and bill settled successfully');
            setTimeout(() => router.push('/ipd'), 2000);
        } else {
            showToast(res.error || 'Settlement failed', 'error');
        }
    }

    if (loading) {
        return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Loading discharge settlement...</div>;
    }

    if (!billData) {
        return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-red-500">No bill data found for this admission</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-5xl mx-auto space-y-4">
                {/* Patient Header */}
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">{billData.admission.patient_name}</h1>
                            <p className="text-sm text-gray-500">
                                UHID: {billData.admission.patient_id} | Admission: {billData.admission.admission_id}
                            </p>
                            <p className="text-sm text-gray-500">
                                Dr. {billData.admission.doctor_name} | {billData.admission.ward_name} | Bed: {billData.admission.bed_id}
                            </p>
                            <p className="text-xs text-gray-400">
                                Admitted: {new Date(billData.admission.admission_date).toLocaleDateString('en-IN')} |
                                Days: {billData.admission.days_admitted} |
                                Diagnosis: {billData.admission.diagnosis || 'N/A'}
                            </p>
                        </div>
                        <span className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm font-bold">
                            DISCHARGE SETTLEMENT
                        </span>
                    </div>
                </div>

                {/* Charge Summary */}
                <div className="bg-white rounded-lg shadow p-4">
                    <h2 className="font-semibold text-sm mb-3">Charge Summary</h2>
                    <div className="space-y-1 mb-3">
                        {Object.entries(categoryGroups).map(([cat, data]: [string, any]) => (
                            <div key={cat} className="flex justify-between text-sm p-2 bg-gray-50 rounded">
                                <span>{cat} <span className="text-gray-400 text-xs">({data.items.length} items)</span></span>
                                <span className="font-medium">{Number(data.total).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                            </div>
                        ))}
                    </div>
                    <div className="border-t pt-2 space-y-1">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Sub-Total</span>
                            <span>{Number(billData.invoice.total_amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">GST</span>
                            <span>{Number(billData.invoice.total_tax || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                        </div>
                        {discount > 0 && (
                            <div className="flex justify-between text-sm text-green-600">
                                <span>Discount</span>
                                <span>-{discount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-sm font-bold border-t pt-1">
                            <span>NET BILL</span>
                            <span>{netBill.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                        </div>
                    </div>
                </div>

                {/* Adjustments */}
                <div className="bg-white rounded-lg shadow p-4">
                    <h2 className="font-semibold text-sm mb-3">Adjustments</h2>
                    <div className="space-y-2">
                        {/* Deposits */}
                        <div className="flex justify-between items-center text-sm p-2 bg-purple-50 rounded">
                            <div className="flex items-center gap-2">
                                <input type="checkbox" checked={applyDeposits} onChange={e => setApplyDeposits(e.target.checked)} />
                                <span>Deposits Held: {totalDepositsAvailable.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                            </div>
                            {applyDeposits && depositsToApply > 0 && (
                                <span className="text-purple-700 font-medium">-{depositsToApply.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                            )}
                        </div>

                        {/* Prior Payments */}
                        {priorPayments > 0 && (
                            <div className="flex justify-between text-sm p-2 bg-green-50 rounded">
                                <span>Prior Payments</span>
                                <span className="text-green-700 font-medium">-{priorPayments.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                            </div>
                        )}

                        {/* Balance Due */}
                        <div className={`flex justify-between text-sm font-bold p-3 rounded ${balanceDue > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                            <span>BALANCE DUE</span>
                            <span>{balanceDue.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                        </div>
                    </div>
                </div>

                {/* Final Payment (Split) */}
                {balanceDue > 0 && (
                    <div className="bg-white rounded-lg shadow p-4">
                        <h2 className="font-semibold text-sm mb-3">Final Payment</h2>
                        <div className="space-y-2 mb-3">
                            {splits.map((split, idx) => (
                                <div key={idx} className="flex gap-2 items-center">
                                    <input
                                        type="number"
                                        value={split.amount}
                                        onChange={(e) => {
                                            const updated = [...splits];
                                            updated[idx].amount = e.target.value;
                                            setSplits(updated);
                                        }}
                                        className="w-32 px-2 py-1.5 border rounded text-sm"
                                        placeholder="Amount"
                                    />
                                    <select
                                        value={split.method}
                                        onChange={(e) => {
                                            const updated = [...splits];
                                            updated[idx].method = e.target.value;
                                            setSplits(updated);
                                        }}
                                        className="flex-1 px-2 py-1.5 border rounded text-sm"
                                    >
                                        <option>Cash</option>
                                        <option>UPI</option>
                                        <option>Card</option>
                                        <option>BankTransfer</option>
                                    </select>
                                    <input
                                        type="text"
                                        value={split.reference}
                                        onChange={(e) => {
                                            const updated = [...splits];
                                            updated[idx].reference = e.target.value;
                                            setSplits(updated);
                                        }}
                                        className="w-36 px-2 py-1.5 border rounded text-sm"
                                        placeholder="Ref / Txn ID"
                                    />
                                    {splits.length > 1 && (
                                        <button onClick={() => setSplits(splits.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 text-lg">&times;</button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => setSplits([...splits, { amount: '', method: 'Cash', reference: '' }])}
                            className="text-sm text-blue-600 hover:underline mb-2"
                        >
                            + Add Payment Method
                        </button>
                        <div className={`flex justify-between items-center p-2 rounded text-sm font-medium ${isBalanced ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                            <span>Total: {splitTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                            <span>{isBalanced ? 'Balanced' : `Remaining: ${(balanceDue - splitTotal).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}`}</span>
                        </div>
                    </div>
                )}

                {/* Discount Entry */}
                <div className="bg-white rounded-lg shadow p-4">
                    <h2 className="font-semibold text-sm mb-3">Discount (Optional)</h2>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs text-gray-500">Amount</label>
                            <input
                                type="number"
                                value={discountAmount}
                                onChange={(e) => setDiscountAmount(e.target.value)}
                                className="w-full px-2 py-1.5 border rounded text-sm"
                                placeholder="0"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500">Reason</label>
                            <input
                                type="text"
                                value={discountReason}
                                onChange={(e) => setDiscountReason(e.target.value)}
                                className="w-full px-2 py-1.5 border rounded text-sm"
                                placeholder="Staff discount, etc."
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500">Approved By {discount > (billData?.invoice?.net_amount || 0) * 0.05 ? '(Required)' : ''}</label>
                            <input
                                type="text"
                                value={approvedBy}
                                onChange={(e) => setApprovedBy(e.target.value)}
                                className="w-full px-2 py-1.5 border rounded text-sm"
                                placeholder="Approver name"
                            />
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="bg-white rounded-lg shadow p-4 flex gap-3">
                    <button
                        onClick={handleSettleAndDischarge}
                        disabled={settling || (!isBalanced && balanceDue > 0)}
                        className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 text-sm"
                    >
                        {settling ? 'Processing...' : 'Finalize & Discharge'}
                    </button>
                    <button
                        onClick={() => {
                            if (billData?.invoice?.id) {
                                window.open(`/api/discharge/${admissionId}/bill`, '_blank');
                            }
                        }}
                        disabled={!billData}
                        className="px-4 py-3 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                        Print Final Bill
                    </button>
                    <button
                        onClick={() => router.back()}
                        className="px-4 py-3 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                    >
                        Back
                    </button>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-white text-sm z-50 ${
                    toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
                }`}>
                    {toast.message}
                </div>
            )}
        </div>
    );
}
