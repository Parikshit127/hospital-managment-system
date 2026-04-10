'use client';

import { useState, useEffect } from 'react';
import { getIPDAdmissions } from '@/app/actions/ipd-actions';
import { generateInterimBill, postChargeToIpdBill, getGstSummary } from '@/app/actions/ipd-finance-actions';
import { recordPayment, recordSplitPayment } from '@/app/actions/finance-actions';
import { collectDeposit, getPatientDeposits, applyDepositToInvoice } from '@/app/actions/deposit-actions';
import { getIpdServices } from '@/app/actions/ipd-master-actions';

export default function IpdBillingPage() {
    const [admissions, setAdmissions] = useState<any[]>([]);
    const [selectedAdmission, setSelectedAdmission] = useState<any>(null);
    const [billData, setBillData] = useState<any>(null);
    const [services, setServices] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [activeTab, setActiveTab] = useState<'summary' | 'charges' | 'payments' | 'deposits'>('summary');

    // Split Payment modal state
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentSplits, setPaymentSplits] = useState<Array<{ amount: string; method: string; reference: string }>>([{ amount: '', method: 'Cash', reference: '' }]);

    // Charge entry state
    const [showChargeModal, setShowChargeModal] = useState(false);
    const [chargeServiceId, setChargeServiceId] = useState<number | null>(null);
    const [chargeDesc, setChargeDesc] = useState('');
    const [chargeQty, setChargeQty] = useState(1);
    const [chargeRate, setChargeRate] = useState('');
    const [chargeCategory, setChargeCategory] = useState('');
    const [chargeTaxRate, setChargeTaxRate] = useState(0);

    // Deposit state
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [depositAmount, setDepositAmount] = useState('');
    const [depositMethod, setDepositMethod] = useState('Cash');
    const [deposits, setDeposits] = useState<any[]>([]);

    function showToast(message: string, type: 'success' | 'error' = 'success') {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }

    useEffect(() => {
        loadAdmissions();
        loadServices();
    }, []);

    async function loadAdmissions() {
        const res = await getIPDAdmissions('Admitted');
        if (res.success) setAdmissions(res.data);
    }

    async function loadServices() {
        const res = await getIpdServices();
        if (res.success) setServices(res.data);
    }

    async function selectAdmission(admission: any) {
        setSelectedAdmission(admission);
        setLoading(true);
        const res = await generateInterimBill(admission.admission_id);
        if (res.success && res.data) {
            setBillData(res.data);
            setDeposits(res.data.deposits || []);
        }
        setLoading(false);
    }

    async function refreshBill() {
        if (!selectedAdmission) return;
        const res = await generateInterimBill(selectedAdmission.admission_id);
        if (res.success && res.data) {
            setBillData(res.data);
            setDeposits(res.data.deposits || []);
        }
    }

    async function handleRecordPayment() {
        if (!billData) return;
        const validSplits = paymentSplits.filter(s => parseFloat(s.amount) > 0);
        if (validSplits.length === 0) return;

        setActionLoading(true);
        const totalAmount = validSplits.reduce((sum, s) => sum + parseFloat(s.amount), 0);

        if (validSplits.length === 1) {
            // Single payment - use existing method
            const res = await recordPayment({
                invoice_id: billData.invoice.id,
                amount: parseFloat(validSplits[0].amount),
                payment_method: validSplits[0].method,
                payment_type: 'Settlement',
            });
            setActionLoading(false);
            if (res.success) {
                setShowPaymentModal(false);
                setPaymentSplits([{ amount: '', method: 'Cash', reference: '' }]);
                showToast(`Payment of ₹${totalAmount.toLocaleString('en-IN')} recorded`);
                await refreshBill();
            } else {
                showToast(res.error || 'Payment failed', 'error');
            }
        } else {
            // Split payment
            const res = await recordSplitPayment({
                invoice_id: billData.invoice.id,
                splits: validSplits.map(s => ({
                    amount: parseFloat(s.amount),
                    payment_method: s.method,
                    reference: s.reference || undefined,
                })),
            });
            setActionLoading(false);
            if (res.success) {
                setShowPaymentModal(false);
                setPaymentSplits([{ amount: '', method: 'Cash', reference: '' }]);
                showToast(`Split payment of ₹${totalAmount.toLocaleString('en-IN')} recorded (${validSplits.length} methods)`);
                await refreshBill();
            } else {
                showToast(res.error || 'Split payment failed', 'error');
            }
        }
    }

    async function handleAddCharge() {
        if (!selectedAdmission || !chargeServiceId) return;
        setActionLoading(true);
        const res = await postChargeToIpdBill({
            admission_id: selectedAdmission.admission_id,
            source_module: 'manual',
            source_ref_id: String(chargeServiceId),
            description: chargeDesc,
            quantity: chargeQty,
            unit_price: parseFloat(chargeRate),
            service_category: chargeCategory || 'Misc',
            tax_rate: chargeTaxRate,
        });
        setActionLoading(false);
        if (res.success) {
            setShowChargeModal(false);
            setChargeServiceId(null);
            setChargeDesc('');
            setChargeRate('');
            setChargeQty(1);
            setChargeCategory('');
            setChargeTaxRate(0);
            showToast('Charge added to bill');
            await refreshBill();
        } else {
            showToast(res.error || 'Failed to add charge', 'error');
        }
    }

    async function handleCollectDeposit() {
        if (!selectedAdmission || !depositAmount) return;
        setActionLoading(true);
        const res = await collectDeposit({
            patient_id: selectedAdmission.patient_id,
            admission_id: selectedAdmission.admission_id,
            amount: parseFloat(depositAmount),
            payment_method: depositMethod,
        });
        setActionLoading(false);
        if (res.success) {
            setShowDepositModal(false);
            setDepositAmount('');
            showToast(`Deposit of ₹${parseFloat(depositAmount).toLocaleString('en-IN')} collected`);
            await refreshBill();
        } else {
            showToast(res.error || 'Failed to collect deposit', 'error');
        }
    }

    async function handleApplyDeposit(depositId: number) {
        if (!billData) return;
        if (!confirm('Apply this deposit to the current bill?')) return;
        const res = await applyDepositToInvoice(depositId, billData.invoice.id, billData.invoice.balance_due);
        if (res.success) {
            showToast('Deposit applied to bill');
            await refreshBill();
        } else {
            showToast(res.error || 'Failed to apply deposit', 'error');
        }
    }

    function openPaymentModalWithBalance() {
        if (!billData) return;
        setPaymentSplits([{ amount: String(billData.invoice.balance_due || ''), method: 'Cash', reference: '' }]);
        setShowPaymentModal(true);
    }

    function handleServiceSelect(service: any) {
        setChargeDesc(service.service_name);
        setChargeRate(String(service.default_rate));
        setChargeCategory(service.service_category);
        setChargeTaxRate(Number(service.tax_rate || 0));
    }

    const filteredAdmissions = admissions.filter((a: any) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            a.patient?.full_name?.toLowerCase().includes(q) ||
            a.patient?.phone?.includes(q) ||
            a.admission_id?.toLowerCase().includes(q) ||
            a.patient?.patient_id?.toLowerCase().includes(q)
        );
    });

    const categoryGroups = billData?.items?.reduce((acc: any, item: any) => {
        const cat = item.service_category || item.department || 'Other';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
    }, {} as Record<string, any[]>) || {};

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-900 mb-4">IPD Billing Counter</h1>

                <div className="grid grid-cols-12 gap-4">
                    {/* Left: Patient List */}
                    <div className="col-span-3 bg-white rounded-lg shadow p-4 max-h-[85vh] overflow-y-auto">
                        <input
                            type="text"
                            placeholder="Search patient, phone, ID..."
                            className="w-full px-3 py-2 border rounded-md text-sm mb-3"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <div className="space-y-2">
                            {filteredAdmissions.map((a: any) => (
                                <div
                                    key={a.admission_id}
                                    onClick={() => selectAdmission(a)}
                                    className={`p-3 rounded-lg cursor-pointer border transition-colors ${
                                        selectedAdmission?.admission_id === a.admission_id
                                            ? 'bg-emerald-50 border-emerald-500'
                                            : 'hover:bg-gray-50 border-gray-200'
                                    }`}
                                >
                                    <p className="font-medium text-sm">{a.patient?.full_name}</p>
                                    <p className="text-xs text-gray-500">{a.admission_id}</p>
                                    <p className="text-xs text-gray-400">
                                        {a.wardName} | Bed: {a.bed_id} | Day {a.daysAdmitted}
                                    </p>
                                </div>
                            ))}
                            {filteredAdmissions.length === 0 && (
                                <p className="text-sm text-gray-400 text-center py-4">No admissions found</p>
                            )}
                        </div>
                    </div>

                    {/* Center: Bill View */}
                    <div className="col-span-6 bg-white rounded-lg shadow">
                        {!selectedAdmission ? (
                            <div className="flex items-center justify-center h-96 text-gray-400">
                                Select a patient to view their bill
                            </div>
                        ) : loading ? (
                            <div className="flex items-center justify-center h-96 text-gray-400">Loading bill...</div>
                        ) : billData ? (
                            <div>
                                {/* Patient Header */}
                                <div className="p-4 border-b bg-gray-50 rounded-t-lg">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h2 className="text-lg font-semibold">{billData.admission.patient_name}</h2>
                                            <p className="text-sm text-gray-500">
                                                {billData.admission.admission_id} | Dr. {billData.admission.doctor_name}
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                {billData.admission.ward_name} | Bed: {billData.admission.bed_id} |
                                                Day {billData.admission.days_admitted} |
                                                {billData.admission.diagnosis}
                                            </p>
                                        </div>
                                        <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs font-medium">
                                            INTERIM
                                        </span>
                                    </div>
                                </div>

                                {/* Summary Cards */}
                                <div className="grid grid-cols-4 gap-3 p-4">
                                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                                        <p className="text-xs text-blue-600">Total Charges</p>
                                        <p className="text-lg font-bold text-blue-900">
                                            ₹{(billData.invoice.net_amount || 0).toLocaleString('en-IN')}
                                        </p>
                                    </div>
                                    <div className="bg-green-50 rounded-lg p-3 text-center">
                                        <p className="text-xs text-green-600">Paid</p>
                                        <p className="text-lg font-bold text-green-900">
                                            ₹{(billData.invoice.paid_amount || 0).toLocaleString('en-IN')}
                                        </p>
                                    </div>
                                    <div className="bg-purple-50 rounded-lg p-3 text-center">
                                        <p className="text-xs text-purple-600">GST</p>
                                        <p className="text-lg font-bold text-purple-900">
                                            ₹{(billData.invoice.total_tax || 0).toLocaleString('en-IN')}
                                        </p>
                                    </div>
                                    <div className={`rounded-lg p-3 text-center ${
                                        billData.invoice.balance_due > 0 ? 'bg-red-50' : 'bg-green-50'
                                    }`}>
                                        <p className={`text-xs ${billData.invoice.balance_due > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            Balance Due
                                        </p>
                                        <p className={`text-lg font-bold ${billData.invoice.balance_due > 0 ? 'text-red-900' : 'text-green-900'}`}>
                                            ₹{(billData.invoice.balance_due || 0).toLocaleString('en-IN')}
                                        </p>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className="flex border-b px-4">
                                    {([
                                        { key: 'summary', label: 'Summary', count: null },
                                        { key: 'charges', label: 'Charges', count: billData.items?.length || 0 },
                                        { key: 'payments', label: 'Payments', count: billData.payments?.length || 0 },
                                        { key: 'deposits', label: 'Deposits', count: deposits?.length || 0 },
                                    ] as const).map((tab) => (
                                        <button
                                            key={tab.key}
                                            onClick={() => setActiveTab(tab.key as any)}
                                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                                                activeTab === tab.key
                                                    ? 'border-emerald-500 text-emerald-700'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            {tab.label}
                                            {tab.count !== null && tab.count > 0 && (
                                                <span className="bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5 text-[10px] leading-none">
                                                    {tab.count}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>

                                {/* Tab Content */}
                                <div className="p-4 max-h-[45vh] overflow-y-auto">
                                    {activeTab === 'summary' && (
                                        <div className="space-y-4">
                                            {/* Bill Overview */}
                                            <div>
                                                <h3 className="font-semibold text-sm mb-2">Bill Overview</h3>
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                                                        <span className="text-gray-500">Invoice #</span>
                                                        <span className="font-mono">{billData.invoice.invoice_number}</span>
                                                    </div>
                                                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                                                        <span className="text-gray-500">Days Admitted</span>
                                                        <span>{billData.admission.days_admitted}</span>
                                                    </div>
                                                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                                                        <span className="text-gray-500">Subtotal (excl. GST)</span>
                                                        <span>₹{(billData.invoice.total_amount || 0).toLocaleString('en-IN')}</span>
                                                    </div>
                                                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                                                        <span className="text-gray-500">Discount</span>
                                                        <span>₹{(billData.invoice.total_discount || 0).toLocaleString('en-IN')}</span>
                                                    </div>
                                                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                                                        <span className="text-gray-500">Total GST</span>
                                                        <span>₹{(billData.invoice.total_tax || 0).toLocaleString('en-IN')}</span>
                                                    </div>
                                                    <div className="flex justify-between p-2 bg-blue-50 rounded font-semibold">
                                                        <span className="text-blue-700">Net Amount</span>
                                                        <span className="text-blue-900">₹{(billData.invoice.net_amount || 0).toLocaleString('en-IN')}</span>
                                                    </div>
                                                    <div className="flex justify-between p-2 bg-green-50 rounded">
                                                        <span className="text-green-700">Amount Paid</span>
                                                        <span className="text-green-900">₹{(billData.invoice.paid_amount || 0).toLocaleString('en-IN')}</span>
                                                    </div>
                                                    <div className={`flex justify-between p-2 rounded font-semibold ${billData.invoice.balance_due > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                                                        <span className={billData.invoice.balance_due > 0 ? 'text-red-700' : 'text-green-700'}>Balance Due</span>
                                                        <span className={billData.invoice.balance_due > 0 ? 'text-red-900' : 'text-green-900'}>₹{(billData.invoice.balance_due || 0).toLocaleString('en-IN')}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Charge Breakdown by Category */}
                                            {Object.keys(categoryGroups).length > 0 && (
                                                <div>
                                                    <h3 className="font-semibold text-sm mb-2">Category Breakdown</h3>
                                                    <div className="space-y-1">
                                                        {Object.entries(categoryGroups).map(([cat, items]: [string, any]) => {
                                                            const catTotal = items.reduce((s: number, i: any) => s + (i.net_price || 0) + (i.tax_amount || 0), 0);
                                                            return (
                                                                <div key={cat} className="flex justify-between text-xs p-2 bg-gray-50 rounded">
                                                                    <span>{cat} <span className="text-gray-400">({items.length} items)</span></span>
                                                                    <span className="font-medium">₹{catTotal.toLocaleString('en-IN')}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* GST Summary */}
                                            {billData.gst_summary && billData.gst_summary.total_tax > 0 && (
                                            <div>
                                            <h3 className="font-semibold text-sm mb-2">GST Summary</h3>
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="bg-gray-50">
                                                        <th className="p-2 text-left">SAC/HSN</th>
                                                        <th className="p-2 text-right">Taxable</th>
                                                        <th className="p-2 text-right">CGST</th>
                                                        <th className="p-2 text-right">SGST</th>
                                                        <th className="p-2 text-right">Total Tax</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {billData.gst_summary.rows?.map((row: any, i: number) => (
                                                        <tr key={i} className="border-b">
                                                            <td className="p-2">{row.hsn_sac || '-'} ({row.tax_rate}%)</td>
                                                            <td className="p-2 text-right">₹{row.taxable_amount?.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right">₹{row.cgst?.toFixed(2)}</td>
                                                            <td className="p-2 text-right">₹{row.sgst?.toFixed(2)}</td>
                                                            <td className="p-2 text-right">₹{row.total_tax?.toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot className="font-semibold bg-gray-50">
                                                    <tr>
                                                        <td className="p-2">Total</td>
                                                        <td className="p-2 text-right">₹{billData.gst_summary.total_taxable?.toLocaleString('en-IN')}</td>
                                                        <td className="p-2 text-right">₹{billData.gst_summary.total_cgst?.toFixed(2)}</td>
                                                        <td className="p-2 text-right">₹{billData.gst_summary.total_sgst?.toFixed(2)}</td>
                                                        <td className="p-2 text-right">₹{billData.gst_summary.total_tax?.toFixed(2)}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                            )}
                                        </div>
                                    )}

                                    {activeTab === 'charges' && (
                                        <div className="space-y-4">
                                            {Object.entries(categoryGroups).map(([cat, items]: [string, any]) => (
                                                <div key={cat}>
                                                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">{cat}</h4>
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="bg-gray-50">
                                                                <th className="p-2 text-left">Description</th>
                                                                <th className="p-2 text-left">Date</th>
                                                                <th className="p-2 text-right">Qty</th>
                                                                <th className="p-2 text-right">Rate</th>
                                                                <th className="p-2 text-right">GST%</th>
                                                                <th className="p-2 text-right">Amount</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {items.map((item: any) => (
                                                                <tr key={item.id} className="border-b">
                                                                    <td className="p-2">{item.description}</td>
                                                                    <td className="p-2 text-gray-400">{new Date(item.created_at).toLocaleDateString('en-IN')}</td>
                                                                    <td className="p-2 text-right">{item.quantity}</td>
                                                                    <td className="p-2 text-right">₹{item.unit_price?.toLocaleString('en-IN')}</td>
                                                                    <td className="p-2 text-right">{item.tax_rate}%</td>
                                                                    <td className="p-2 text-right">₹{(item.net_price + item.tax_amount)?.toLocaleString('en-IN')}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {activeTab === 'payments' && (
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-gray-50">
                                                    <th className="p-2 text-left">Receipt</th>
                                                    <th className="p-2 text-left">Method</th>
                                                    <th className="p-2 text-left">Type</th>
                                                    <th className="p-2 text-right">Amount</th>
                                                    <th className="p-2 text-left">Date</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(billData.payments || []).map((p: any, i: number) => (
                                                    <tr key={i} className="border-b">
                                                        <td className="p-2">{p.receipt_number}</td>
                                                        <td className="p-2">{p.payment_method}</td>
                                                        <td className="p-2">{p.payment_type}</td>
                                                        <td className="p-2 text-right">₹{p.amount?.toLocaleString('en-IN')}</td>
                                                        <td className="p-2">{new Date(p.created_at).toLocaleDateString('en-IN')}</td>
                                                    </tr>
                                                ))}
                                                {(billData.payments || []).length === 0 && (
                                                    <tr><td colSpan={5} className="p-4 text-center text-gray-400">No payments recorded</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    )}

                                    {activeTab === 'deposits' && (
                                        <div>
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="bg-gray-50">
                                                        <th className="p-2 text-left">Deposit #</th>
                                                        <th className="p-2 text-right">Amount</th>
                                                        <th className="p-2 text-right">Applied</th>
                                                        <th className="p-2 text-right">Available</th>
                                                        <th className="p-2 text-left">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(deposits || []).map((d: any, i: number) => (
                                                        <tr key={i} className="border-b">
                                                            <td className="p-2">{d.deposit_number}</td>
                                                            <td className="p-2 text-right">₹{d.amount?.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right">₹{d.applied_amount?.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right">₹{d.available?.toLocaleString('en-IN')}</td>
                                                            <td className="p-2">
                                                                {d.available > 0 && d.status === 'Active' && (
                                                                    <button
                                                                        onClick={() => handleApplyDeposit(d.id)}
                                                                        className="text-emerald-600 hover:underline text-xs"
                                                                    >
                                                                        Apply to Bill
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {(deposits || []).length === 0 && (
                                                        <tr><td colSpan={5} className="p-4 text-center text-gray-400">No deposits</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {/* Right: Actions */}
                    <div className="col-span-3 space-y-3">
                        <div className="bg-white rounded-lg shadow p-4">
                            <h3 className="font-semibold text-sm mb-3">Quick Actions</h3>
                            <div className="space-y-2">
                                <button
                                    onClick={() => setShowChargeModal(true)}
                                    disabled={!selectedAdmission}
                                    className="w-full px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Add Charge
                                </button>
                                <button
                                    onClick={openPaymentModalWithBalance}
                                    disabled={!selectedAdmission}
                                    className="w-full px-3 py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    Record Payment
                                </button>
                                <button
                                    onClick={() => setShowDepositModal(true)}
                                    disabled={!selectedAdmission}
                                    className="w-full px-3 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 disabled:opacity-50"
                                >
                                    Collect Deposit
                                </button>
                                <button
                                    onClick={() => window.print()}
                                    disabled={!billData}
                                    className="w-full px-3 py-2 bg-gray-600 text-white rounded-md text-sm hover:bg-gray-700 disabled:opacity-50"
                                >
                                    Print Interim Bill
                                </button>
                                <button
                                    onClick={refreshBill}
                                    disabled={!selectedAdmission}
                                    className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Refresh Bill
                                </button>
                            </div>
                        </div>

                        {/* Bill Invoice # */}
                        {billData && (
                            <div className="bg-white rounded-lg shadow p-4 text-xs space-y-1">
                                <p><span className="text-gray-500">Invoice:</span> {billData.invoice.invoice_number}</p>
                                <p><span className="text-gray-500">Admitted:</span> {new Date(billData.admission.admission_date).toLocaleDateString('en-IN')}</p>
                                <p><span className="text-gray-500">Items:</span> {billData.items?.length || 0}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Split Payment Modal */}
            {showPaymentModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-[520px]">
                        <h3 className="text-lg font-semibold mb-1">Record Payment</h3>
                        <p className="text-xs text-gray-500 mb-4">Balance Due: ₹{(billData?.invoice?.balance_due || 0).toLocaleString('en-IN')}</p>
                        <div className="space-y-2 mb-3">
                            {paymentSplits.map((split, idx) => (
                                <div key={idx} className="flex gap-2 items-center">
                                    <input
                                        type="number"
                                        value={split.amount}
                                        onChange={(e) => {
                                            const updated = [...paymentSplits];
                                            updated[idx].amount = e.target.value;
                                            setPaymentSplits(updated);
                                        }}
                                        className="w-28 px-2 py-1.5 border rounded text-sm"
                                        placeholder="Amount"
                                    />
                                    <select
                                        value={split.method}
                                        onChange={(e) => {
                                            const updated = [...paymentSplits];
                                            updated[idx].method = e.target.value;
                                            setPaymentSplits(updated);
                                        }}
                                        className="flex-1 px-2 py-1.5 border rounded text-sm"
                                    >
                                        <option>Cash</option>
                                        <option>UPI</option>
                                        <option>Card</option>
                                        <option>BankTransfer</option>
                                        <option>Deposit</option>
                                    </select>
                                    <input
                                        type="text"
                                        value={split.reference}
                                        onChange={(e) => {
                                            const updated = [...paymentSplits];
                                            updated[idx].reference = e.target.value;
                                            setPaymentSplits(updated);
                                        }}
                                        className="w-32 px-2 py-1.5 border rounded text-sm"
                                        placeholder="Ref / Txn ID"
                                    />
                                    {paymentSplits.length > 1 && (
                                        <button
                                            onClick={() => setPaymentSplits(paymentSplits.filter((_, i) => i !== idx))}
                                            className="text-red-400 hover:text-red-600 text-lg leading-none"
                                        >
                                            &times;
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => setPaymentSplits([...paymentSplits, { amount: '', method: 'Cash', reference: '' }])}
                            className="text-sm text-blue-600 hover:underline mb-3"
                        >
                            + Add Payment Method
                        </button>
                        {/* Running total */}
                        {(() => {
                            const splitTotal = paymentSplits.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
                            const balanceDue = billData?.invoice?.balance_due || 0;
                            const isBalanced = Math.abs(splitTotal - balanceDue) < 0.01;
                            return (
                                <div className={`flex justify-between items-center p-2 rounded text-sm font-medium mb-3 ${isBalanced ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                                    <span>Total: ₹{splitTotal.toLocaleString('en-IN')}</span>
                                    <span>{isBalanced ? 'Balanced' : `Remaining: ₹${(balanceDue - splitTotal).toLocaleString('en-IN')}`}</span>
                                </div>
                            );
                        })()}
                        <div className="flex gap-2">
                            <button
                                onClick={handleRecordPayment}
                                disabled={actionLoading}
                                className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-md text-sm disabled:opacity-50"
                            >
                                {actionLoading ? 'Processing...' : 'Confirm & Print Receipt'}
                            </button>
                            <button
                                onClick={() => setShowPaymentModal(false)}
                                className="flex-1 px-3 py-2 border rounded-md text-sm"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Charge Modal */}
            {showChargeModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-96">
                        <h3 className="text-lg font-semibold mb-4">Add Charge</h3>
                        <div className="space-y-3">
                            {/* Service Picker */}
                            <div className="col-span-2">
                                <label className="text-sm text-gray-600">Service *</label>
                                <select
                                    value={chargeServiceId ?? ''}
                                    onChange={e => {
                                        const id = parseInt(e.target.value);
                                        const svc = services.find((s: any) => s.id === id);
                                        if (svc) {
                                            setChargeServiceId(id);
                                            setChargeDesc(svc.service_name);
                                            setChargeRate(String(svc.default_rate));
                                            setChargeCategory(svc.service_category);
                                            setChargeTaxRate(Number(svc.tax_rate || 0));
                                        } else {
                                            setChargeServiceId(null);
                                            setChargeDesc('');
                                            setChargeRate('');
                                            setChargeCategory('');
                                            setChargeTaxRate(0);
                                        }
                                    }}
                                    className="w-full px-3 py-2 border rounded-md"
                                >
                                    <option value="">— Select service —</option>
                                    {services.filter((s: any) => s.is_active).map((s: any) => (
                                        <option key={s.id} value={s.id}>
                                            {s.service_name} ({s.service_category}) — ₹{Number(s.default_rate).toLocaleString('en-IN')}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Read-only rate display once service is selected */}
                            {chargeServiceId && (
                                <div className="grid grid-cols-3 gap-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                                    <div><span className="font-medium">Rate:</span> ₹{chargeRate}</div>
                                    <div><span className="font-medium">Category:</span> {chargeCategory}</div>
                                    <div><span className="font-medium">GST:</span> {chargeTaxRate}%</div>
                                </div>
                            )}

                            <div>
                                <label className="text-sm text-gray-600">Qty</label>
                                <input
                                    type="number"
                                    value={chargeQty}
                                    onChange={(e) => setChargeQty(parseInt(e.target.value) || 1)}
                                    className="w-full px-3 py-2 border rounded-md"
                                />
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={handleAddCharge}
                                    disabled={actionLoading || !chargeServiceId}
                                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50"
                                >
                                    {actionLoading ? 'Adding...' : 'Add'}
                                </button>
                                <button
                                    onClick={() => { setShowChargeModal(false); setChargeServiceId(null); }}
                                    className="flex-1 px-3 py-2 border rounded-md text-sm"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Deposit Modal */}
            {showDepositModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-96">
                        <h3 className="text-lg font-semibold mb-4">Collect Deposit</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-sm text-gray-600">Amount (₹)</label>
                                <input
                                    type="number"
                                    value={depositAmount}
                                    onChange={(e) => setDepositAmount(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-md"
                                />
                            </div>
                            <div>
                                <label className="text-sm text-gray-600">Payment Method</label>
                                <select
                                    value={depositMethod}
                                    onChange={(e) => setDepositMethod(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-md"
                                >
                                    <option>Cash</option>
                                    <option>UPI</option>
                                    <option>Card</option>
                                    <option>BankTransfer</option>
                                </select>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleCollectDeposit}
                                    disabled={actionLoading}
                                    className="flex-1 px-3 py-2 bg-purple-600 text-white rounded-md text-sm disabled:opacity-50"
                                >
                                    {actionLoading ? 'Processing...' : 'Collect'}
                                </button>
                                <button
                                    onClick={() => setShowDepositModal(false)}
                                    className="flex-1 px-3 py-2 border rounded-md text-sm"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm text-white transition-all ${
                    toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
                }`}>
                    {toast.message}
                </div>
            )}
        </div>
    );
}
