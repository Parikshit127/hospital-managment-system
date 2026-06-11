'use client';

import React, { useState, useEffect } from 'react';
import { getIPDAdmissions } from '@/app/actions/ipd-actions';
import { generateInterimBill, postChargeToIpdBill, getGstSummary } from '@/app/actions/ipd-finance-actions';
import { recordPayment, recordSplitPayment } from '@/app/actions/finance-actions';
import { getCashComplianceConfig } from '@/app/actions/cash-compliance-actions';
import { CASH_COMPLIANCE_DEFAULTS, isValidPan } from '@/app/lib/cash-compliance';
import { collectDeposit, getPatientDeposits, applyDepositToInvoice } from '@/app/actions/deposit-actions';
import { getIpdServices } from '@/app/actions/ipd-master-actions';
import { DepositTracker } from '@/app/components/ipd/DepositTracker';
import { fetchBillBranding } from '@/app/actions/branding-actions';
import type { BillBranding } from '@/app/lib/bill-branding';

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

    // Cash compliance (PAN capture + limit) — thresholds from Finance Settings
    const [panNumber, setPanNumber] = useState('');
    const [panName, setPanName] = useState('');
    const [cashThresholds, setCashThresholds] = useState<{ pan_threshold: number; cash_limit: number }>(CASH_COMPLIANCE_DEFAULTS);
    useEffect(() => {
        getCashComplianceConfig().then((res) => {
            if (res.success && res.data) setCashThresholds({ pan_threshold: res.data.pan_threshold, cash_limit: res.data.cash_limit });
        });
    }, []);
    const ipdCashTotal = paymentSplits
        .filter((s) => s.method === 'Cash')
        .reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    const ipdCashBlocked = ipdCashTotal > cashThresholds.cash_limit;
    const ipdPanRequired = ipdCashTotal >= cashThresholds.pan_threshold && !ipdCashBlocked;
    const ipdPanValid = isValidPan(panNumber) && panName.trim().length > 0;
    const ipdPaymentBlocked = ipdCashBlocked || (ipdPanRequired && !ipdPanValid);

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
    const [branding, setBranding] = useState<BillBranding | null>(null);

    function showToast(message: string, type: 'success' | 'error' = 'success') {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }

    useEffect(() => {
        loadAdmissions();
        loadServices();
        fetchBillBranding().then(r => r.success && r.data && setBranding(r.data));
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

        // Cash compliance guard (server re-validates as the source of truth)
        if (ipdPaymentBlocked) {
            showToast(
                ipdCashBlocked
                    ? `Cash receipts above ₹${cashThresholds.cash_limit.toLocaleString('en-IN')} are not permitted. Use UPI/Card/Bank.`
                    : 'PAN Number and PAN Holder Name are required for this cash amount.',
                'error',
            );
            return;
        }

        const panArgs = {
            payer_pan_number: panNumber.trim().toUpperCase() || undefined,
            payer_pan_name: panName.trim() || undefined,
        };

        setActionLoading(true);
        const totalAmount = validSplits.reduce((sum, s) => sum + parseFloat(s.amount), 0);

        if (validSplits.length === 1) {
            // Single payment - use existing method
            const res = await recordPayment({
                invoice_id: billData.invoice.id,
                amount: parseFloat(validSplits[0].amount),
                payment_method: validSplits[0].method,
                payment_type: 'Settlement',
                ...panArgs,
            });
            setActionLoading(false);
            if (res.success) {
                setShowPaymentModal(false);
                setPaymentSplits([{ amount: '', method: 'Cash', reference: '' }]);
                setPanNumber(''); setPanName('');
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
                ...panArgs,
            });
            setActionLoading(false);
            if (res.success) {
                setShowPaymentModal(false);
                setPaymentSplits([{ amount: '', method: 'Cash', reference: '' }]);
                setPanNumber(''); setPanName('');
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
            service_id: String(chargeServiceId),
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
            (a.patient?.full_name || '').toLowerCase().includes(q) ||
            (a.patient?.phone || '').includes(q) ||
            (a.admission_id || '').toLowerCase().includes(q) ||
            (a.patient?.patient_id || '').toLowerCase().includes(q)
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
            <style jsx global>{`
                @media print {
                  body * { visibility: hidden; }
                  .ipd-print-view, .ipd-print-view * { visibility: visible !important; }
                  .ipd-print-view {
                    display: block !important;
                    position: fixed !important;
                    inset: 0 !important;
                    z-index: 9999 !important;
                    background: white !important;
                    padding: 0 !important;
                    overflow: visible !important;
                  }
                  .no-print { display: none !important; }
                }
            `}</style>
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center gap-3 mb-4">
                    <a
                        href="/reception/dashboard"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-bold rounded-lg transition"
                    >
                        ← Reception
                    </a>
                    <h1 className="text-2xl font-bold text-gray-900">IPD Billing Counter</h1>
                </div>

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
                                            {/* KPI Cards */}
                                            <div className="grid grid-cols-4 gap-2">
                                                {[
                                                    { label: 'Days', value: billData.admission?.days_admitted ?? 0, suffix: 'd', color: 'text-blue-700' },
                                                    { label: 'Charges', value: `₹${Number(billData.invoice?.net_amount ?? 0).toLocaleString('en-IN')}`, color: 'text-gray-900' },
                                                    { label: 'Paid', value: `₹${Number(billData.invoice?.paid_amount ?? 0).toLocaleString('en-IN')}`, color: 'text-emerald-700' },
                                                    { label: 'Due', value: `₹${Number(billData.invoice?.balance_due ?? 0).toLocaleString('en-IN')}`, color: 'text-red-700' },
                                                ].map(kpi => (
                                                    <div key={kpi.label} className="bg-gray-50 border rounded-xl p-2.5 text-center">
                                                        <p className="text-[10px] text-gray-400 font-medium">{kpi.label}</p>
                                                        <p className={`text-sm font-black mt-0.5 ${kpi.color}`}>{kpi.value}{kpi.suffix ?? ''}</p>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Deposit Tracker */}
                                            <DepositTracker
                                                totalDeposit={deposits.reduce((s: number, d: any) => s + Number(d.amount || 0), 0)}
                                                totalCharged={Number(billData.invoice?.net_amount ?? 0)}
                                            />

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
                                                                    <td className="p-2 text-gray-400">{new Date(item.created_at).toLocaleDateString('en-GB')}</td>
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
                                                        <td className="p-2">{new Date(p.created_at).toLocaleDateString('en-GB')}</td>
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
                                <p><span className="text-gray-500">Admitted:</span> {new Date(billData.admission.admission_date).toLocaleDateString('en-GB')}</p>
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

                        {/* Cash compliance — block over limit / capture PAN at threshold (cash portion) */}
                        {ipdCashBlocked && (
                            <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded">
                                Cash receipts above ₹{cashThresholds.cash_limit.toLocaleString('en-IN')} are not permitted. Please use UPI, Card, Bank Transfer, or another approved method.
                            </div>
                        )}
                        {ipdPanRequired && (
                            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded space-y-2">
                                <p className="text-xs font-medium text-amber-800">
                                    PAN details are mandatory for cash payments of ₹{cashThresholds.pan_threshold.toLocaleString('en-IN')} or more (cash portion: ₹{ipdCashTotal.toLocaleString('en-IN')}).
                                </p>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <input
                                            type="text"
                                            value={panNumber}
                                            onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                                            placeholder="PAN Number * (ABCDE1234F)"
                                            maxLength={10}
                                            className="w-full px-2 py-1.5 border rounded text-sm font-mono uppercase"
                                        />
                                        {panNumber.length > 0 && !isValidPan(panNumber) && (
                                            <p className="text-[11px] text-rose-500 mt-1">Invalid PAN format.</p>
                                        )}
                                    </div>
                                    <input
                                        type="text"
                                        value={panName}
                                        onChange={(e) => setPanName(e.target.value)}
                                        placeholder="PAN Holder Name *"
                                        className="flex-1 px-2 py-1.5 border rounded text-sm"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={handleRecordPayment}
                                disabled={actionLoading || ipdPaymentBlocked}
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

                            {/* Category + GST stay locked (tax compliance); Rate editable per bill */}
                            {chargeServiceId && (
                                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                                    <div><span className="font-medium">Category:</span> {chargeCategory}</div>
                                    <div><span className="font-medium">GST:</span> {chargeTaxRate}%</div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-sm text-gray-600">Rate (₹)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        inputMode="decimal"
                                        value={chargeRate}
                                        onFocus={e => e.target.select()}
                                        onChange={e => setChargeRate(e.target.value)}
                                        className="w-full px-3 py-2 border rounded-md"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-600">Qty</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={chargeQty}
                                        onChange={(e) => setChargeQty(parseInt(e.target.value) || 1)}
                                        className="w-full px-3 py-2 border rounded-md"
                                    />
                                </div>
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

            {/* ── PRINT VIEW (pharmacy-style full-page overlay) ── */}
            {billData && (
                <div className="ipd-print-view" style={{ display: 'none', position: 'relative' }}>
                    {/* Full letterhead as background — same as pharmacy */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={branding?.letterheadUrl || '/letter head.png'} alt="" aria-hidden="true" style={{
                        position: 'absolute', top: 0, left: 0,
                        width: '100%', height: '100%',
                        objectFit: 'fill',
                        zIndex: 0, pointerEvents: 'none',
                    }} />
                    {/* Content on top of letterhead */}
                    <div style={{ position: 'relative', zIndex: 1, padding: '130px 60px 80px 60px' }}>
                        <div className="max-w-3xl mx-auto space-y-4">

                            {/* Invoice header row */}
                            <div className="flex justify-between items-start border-b-2 pb-3" style={{ borderColor: branding?.accentColor || '#1e3a6e' }}>
                                <div>
                                    <p className="text-lg font-black text-gray-900">{billData.admission.patient_name}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{billData.admission.admission_id} | Dr. {billData.admission.doctor_name}</p>
                                    <p className="text-xs text-gray-400">{billData.admission.ward_name} | Bed: {billData.admission.bed_id} | Day {billData.admission.days_admitted}</p>
                                    {billData.admission.diagnosis && (
                                        <p className="text-xs text-gray-400">Dx: {billData.admission.diagnosis}</p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-black uppercase tracking-widest" style={{ color: branding?.accentColor || '#1e3a6e' }}>Interim Bill</p>
                                    <p className="text-xs font-mono text-gray-600 mt-0.5">{billData.invoice.invoice_number}</p>
                                    <p className="text-xs text-gray-500">Admitted: {new Date(billData.admission.admission_date).toLocaleDateString('en-GB')}</p>
                                    <p className="text-xs text-gray-500">Printed: {new Date().toLocaleDateString('en-GB')}</p>
                                </div>
                            </div>

                            {/* Charges table — grouped by category */}
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="border-y-2 border-black">
                                        <th className="py-2 text-left font-black uppercase tracking-wider text-xs">Description</th>
                                        <th className="py-2 text-left font-black uppercase tracking-wider text-xs">Category</th>
                                        <th className="py-2 text-right font-black uppercase tracking-wider text-xs">Qty</th>
                                        <th className="py-2 text-right font-black uppercase tracking-wider text-xs">Rate (₹)</th>
                                        <th className="py-2 text-right font-black uppercase tracking-wider text-xs">GST%</th>
                                        <th className="py-2 text-right font-black uppercase tracking-wider text-xs">Amount (₹)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {Object.entries(categoryGroups).map(([cat, items]: [string, any]) => (
                                        <React.Fragment key={cat}>
                                            <tr>
                                                <td colSpan={6} className="pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
                                                    {cat}
                                                </td>
                                            </tr>
                                            {items.map((item: any, i: number) => (
                                                <tr key={`${cat}-${i}`}>
                                                    <td className="py-1.5 font-medium text-gray-800 pl-2">{item.description}</td>
                                                    <td className="py-1.5 text-gray-400 text-xs">{item.service_category}</td>
                                                    <td className="py-1.5 text-right">{item.quantity}</td>
                                                    <td className="py-1.5 text-right">{Number(item.unit_price).toLocaleString('en-IN')}</td>
                                                    <td className="py-1.5 text-right">{item.tax_rate}%</td>
                                                    <td className="py-1.5 text-right font-bold">{(Number(item.net_price) + Number(item.tax_amount || 0)).toLocaleString('en-IN')}</td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                                <tfoot>
                                    {/* Subtotal row */}
                                    <tr className="border-t border-gray-300">
                                        <td colSpan={5} className="py-2 text-right text-gray-500 text-xs">Subtotal (excl. GST)</td>
                                        <td className="py-2 text-right">₹{Number(billData.invoice.total_amount || 0).toLocaleString('en-IN')}</td>
                                    </tr>
                                    {/* CGST */}
                                    {Number(billData.invoice.total_tax) > 0 && (
                                        <>
                                            <tr>
                                                <td colSpan={5} className="py-1 text-right text-gray-400 text-xs">CGST</td>
                                                <td className="py-1 text-right text-xs">₹{(Number(billData.invoice.total_tax) / 2).toFixed(2)}</td>
                                            </tr>
                                            <tr>
                                                <td colSpan={5} className="py-1 text-right text-gray-400 text-xs">SGST</td>
                                                <td className="py-1 text-right text-xs">₹{(Number(billData.invoice.total_tax) / 2).toFixed(2)}</td>
                                            </tr>
                                        </>
                                    )}
                                    {/* Discount */}
                                    {Number(billData.invoice.total_discount) > 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-1 text-right text-gray-400 text-xs">Discount</td>
                                            <td className="py-1 text-right text-xs text-emerald-600">− ₹{Number(billData.invoice.total_discount).toLocaleString('en-IN')}</td>
                                        </tr>
                                    )}
                                    {/* Net Bill */}
                                    <tr className="border-t-2 border-black">
                                        <td colSpan={5} className="py-3 text-right font-black uppercase tracking-wider">Net Bill</td>
                                        <td className="py-3 text-right font-black text-xl">₹{Number(billData.invoice.net_amount || 0).toLocaleString('en-IN')}</td>
                                    </tr>
                                    {/* Deposits */}
                                    {deposits.length > 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-1 text-right text-gray-500 text-xs">Deposits Collected</td>
                                            <td className="py-1 text-right text-xs text-purple-700 font-bold">
                                                ₹{deposits.reduce((s: number, d: any) => s + Number(d.amount || 0), 0).toLocaleString('en-IN')}
                                            </td>
                                        </tr>
                                    )}
                                    {/* Amount Paid */}
                                    {Number(billData.invoice.paid_amount) > 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-1 text-right text-gray-500 text-xs">Amount Paid</td>
                                            <td className="py-1 text-right text-emerald-600 font-bold text-xs">₹{Number(billData.invoice.paid_amount).toLocaleString('en-IN')}</td>
                                        </tr>
                                    )}
                                    {/* Balance Due */}
                                    <tr>
                                        <td colSpan={5} className="py-1 text-right font-bold text-red-600">Balance Due</td>
                                        <td className="py-1 text-right font-black text-red-600">₹{Number(billData.invoice.balance_due || 0).toLocaleString('en-IN')}</td>
                                    </tr>
                                </tfoot>
                            </table>

                            {/* GST summary table (if any tax) */}
                            {billData.gst_summary && Number(billData.gst_summary.total_tax) > 0 && (
                                <div className="mt-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">GST Summary</p>
                                    <table className="w-full text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-gray-100">
                                                <th className="p-1.5 text-left">SAC/HSN (Rate%)</th>
                                                <th className="p-1.5 text-right">Taxable</th>
                                                <th className="p-1.5 text-right">CGST</th>
                                                <th className="p-1.5 text-right">SGST</th>
                                                <th className="p-1.5 text-right">Total Tax</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {billData.gst_summary.rows?.map((row: any, i: number) => (
                                                <tr key={i} className="border-b border-gray-200">
                                                    <td className="p-1.5">{row.hsn_sac || '—'} ({row.tax_rate}%)</td>
                                                    <td className="p-1.5 text-right">₹{row.taxable_amount?.toLocaleString('en-IN')}</td>
                                                    <td className="p-1.5 text-right">₹{row.cgst?.toFixed(2)}</td>
                                                    <td className="p-1.5 text-right">₹{row.sgst?.toFixed(2)}</td>
                                                    <td className="p-1.5 text-right">₹{row.total_tax?.toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="font-semibold bg-gray-50">
                                            <tr>
                                                <td className="p-1.5">Total</td>
                                                <td className="p-1.5 text-right">₹{billData.gst_summary.total_taxable?.toLocaleString('en-IN')}</td>
                                                <td className="p-1.5 text-right">₹{billData.gst_summary.total_cgst?.toFixed(2)}</td>
                                                <td className="p-1.5 text-right">₹{billData.gst_summary.total_sgst?.toFixed(2)}</td>
                                                <td className="p-1.5 text-right">₹{billData.gst_summary.total_tax?.toFixed(2)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}

                            {/* Footer */}
                            <div className="pt-10 flex justify-between items-end">
                                <div className="text-xs text-gray-500 space-y-1">
                                    <p className="font-bold text-gray-600">This is an INTERIM bill.</p>
                                    <p>Final bill will be generated at discharge.</p>
                                    <p>Admitted: {new Date(billData.admission.admission_date).toLocaleDateString('en-GB')}</p>
                                </div>
                                <div className="text-center">
                                    <div className="border-t border-gray-400 w-40 mb-1" />
                                    <p className="text-xs font-bold uppercase tracking-wider">Authorized Signatory</p>
                                    <p className="text-[10px] text-gray-400">Computer Generated Digital Receipt</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
