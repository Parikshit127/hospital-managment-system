'use client';

import React, { useState, useEffect } from 'react';
import { getIPDAdmissions } from '@/app/actions/ipd-actions';
import { generateInterimBill, postChargeToIpdBill, getGstSummary, getAbsorbedCharges, removeAbsorbedCharge } from '@/app/actions/ipd-finance-actions';
import { recordPayment, recordSplitPayment, removeInvoiceItem, updateInvoiceItem, updateInvoiceHeader } from '@/app/actions/finance-actions';
import { getCashComplianceConfig } from '@/app/actions/cash-compliance-actions';
import { CASH_COMPLIANCE_DEFAULTS, isValidPan, normalizePan, resolveRegisteredPan } from '@/app/lib/cash-compliance';
import { collectDeposit, getPatientDeposits, applyDepositToInvoice } from '@/app/actions/deposit-actions';
import { getIpdServices } from '@/app/actions/ipd-master-actions';
import { DepositTracker } from '@/app/components/ipd/DepositTracker';
import { formatDoctorName } from '@/app/lib/format-name';

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
    // Skip PAN capture when the patient already has a valid PAN on file from registration.
    const ipdRegisteredPan = resolveRegisteredPan(selectedAdmission?.patient);
    const ipdHasRegisteredPan = isValidPan(ipdRegisteredPan);
    const ipdPanNeedsCapture = ipdPanRequired && !ipdHasRegisteredPan;
    const ipdPanValid = isValidPan(panNumber) && panName.trim().length > 0;
    const ipdPaymentBlocked = ipdCashBlocked || (ipdPanNeedsCapture && !ipdPanValid);

    // Charge entry state
    const [showChargeModal, setShowChargeModal] = useState(false);
    const [chargeServiceId, setChargeServiceId] = useState<number | null>(null);
    const [chargeDesc, setChargeDesc] = useState('');
    const [chargeQty, setChargeQty] = useState(1);
    const [chargeRate, setChargeRate] = useState('');
    const [chargeCategory, setChargeCategory] = useState('');
    const [chargeTaxRate, setChargeTaxRate] = useState(0);
    const [chargeDateTime, setChargeDateTime] = useState('');
    const [removingItemId, setRemovingItemId] = useState<number | null>(null);

    // Inline edit of a charge row (service name, qty, discount, service date).
    // Rate stays locked to the master — a discount is how the amount comes down.
    const [editingItemId, setEditingItemId] = useState<number | null>(null);
    const [editDesc, setEditDesc] = useState('');
    const [editQty, setEditQty] = useState(1);
    const [editDiscount, setEditDiscount] = useState('');
    const [editDate, setEditDate] = useState('');
    const [savingItem, setSavingItem] = useState(false);

    // Bill-level discount — a flat ₹ off the whole IPD bill, on top of any line
    // discounts, same as the counter/OPD bill offers via EditInvoiceModal.
    const [showDiscountModal, setShowDiscountModal] = useState(false);
    const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount');
    const [discountInput, setDiscountInput] = useState('');
    const [discountRemark, setDiscountRemark] = useState('');
    const [savingDiscount, setSavingDiscount] = useState(false);

    // Deposit state
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [depositAmount, setDepositAmount] = useState('');
    const [depositMethod, setDepositMethod] = useState('Cash');
    const [depositPanNumber, setDepositPanNumber] = useState('');
    const [depositPanName, setDepositPanName] = useState('');
    const [deposits, setDeposits] = useState<any[]>([]);

    // Absorbed (package_consumed) charges viewer — read-only, never on the bill.
    const [showAbsorbedModal, setShowAbsorbedModal] = useState(false);
    const [absorbedData, setAbsorbedData] = useState<any>(null);
    const [absorbedLoading, setAbsorbedLoading] = useState(false);
    const openAbsorbedModal = async () => {
        if (!selectedAdmission) return;
        setShowAbsorbedModal(true);
        setAbsorbedLoading(true);
        setAbsorbedData(null);
        const res = await getAbsorbedCharges(selectedAdmission.admission_id);
        setAbsorbedLoading(false);
        if (res.success) setAbsorbedData(res.data);
        else setToast({ message: res.error || 'Failed to load absorbed charges', type: 'error' });
    };
    const [removingAbsorbedId, setRemovingAbsorbedId] = useState<number | null>(null);
    const handleRemoveAbsorbed = async (chargeId: number) => {
        if (!confirm('Remove this absorbed charge? This deletes it from the absorbed list and the hospital expense.')) return;
        setRemovingAbsorbedId(chargeId);
        const res = await removeAbsorbedCharge(chargeId);
        setRemovingAbsorbedId(null);
        if (res.success) {
            const r = await getAbsorbedCharges(selectedAdmission.admission_id);
            if (r.success) setAbsorbedData(r.data);
            setBillData(null); refreshBill();
        } else {
            setToast({ message: res.error || 'Failed to remove charge', type: 'error' });
        }
    };

    // Deposit cash compliance — same rules apply to a cash deposit (reuses registered PAN).
    const depositAmt = parseFloat(depositAmount) || 0;
    const depositIsCash = depositMethod === 'Cash';
    const depositCashBlocked = depositIsCash && depositAmt > cashThresholds.cash_limit;
    const depositPanRequired = depositIsCash && depositAmt >= cashThresholds.pan_threshold && !depositCashBlocked;
    const depositPanNeedsCapture = depositPanRequired && !ipdHasRegisteredPan;
    const depositPanProvidedValid = isValidPan(depositPanNumber) && depositPanName.trim().length > 0;
    const depositBlocked = depositCashBlocked || (depositPanNeedsCapture && !depositPanProvidedValid);

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
            posted_at: chargeDateTime ? new Date(chargeDateTime) : undefined,
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
            setChargeDateTime('');
            showToast('Charge added to bill');
            await refreshBill();
        } else {
            showToast(res.error || 'Failed to add charge', 'error');
        }
    }

    function startEditItem(item: any) {
        setEditingItemId(item.id);
        setEditDesc(item.description || '');
        setEditQty(Number(item.quantity) || 1);
        setEditDiscount(Number(item.discount) > 0 ? String(Number(item.discount)) : '');
        // created_at is the service date the bill shows this charge against.
        setEditDate(item.created_at ? new Date(item.created_at).toISOString().slice(0, 10) : '');
    }

    function cancelEditItem() {
        setEditingItemId(null);
        setEditDesc('');
        setEditQty(1);
        setEditDiscount('');
        setEditDate('');
    }

    async function handleSaveItem(item: any) {
        if (!billData?.invoice?.id) return;
        if (!editDesc.trim()) { showToast('Service name cannot be empty', 'error'); return; }
        if (!editQty || editQty < 1) { showToast('Quantity must be at least 1', 'error'); return; }
        // A line discount comes off the line's gross (qty × rate). More than that
        // would push the line negative, which the server would happily store.
        const lineDiscount = parseFloat(editDiscount) || 0;
        const lineGross = editQty * Number(item.unit_price || 0);
        if (lineDiscount < 0) { showToast('Discount cannot be negative', 'error'); return; }
        if (lineDiscount > lineGross) {
            showToast(`Discount cannot exceed the line amount of ₹${lineGross.toLocaleString('en-IN')}`, 'error');
            return;
        }
        setSavingItem(true);
        const res = await updateInvoiceItem(item.id, {
            description: editDesc.trim(),
            quantity: editQty,
            discount: lineDiscount,
            service_date: editDate || undefined,
        });
        setSavingItem(false);
        if (res.success) {
            cancelEditItem();
            showToast('Charge updated');
            await refreshBill();
        } else {
            showToast(res.error || 'Failed to update charge', 'error');
        }
    }

    async function handleRemoveCharge(item: any) {
        if (!billData?.invoice?.id) return;
        const label = item.description || 'this charge';
        if (!confirm(`Remove "${label}" from the bill?`)) return;
        setRemovingItemId(item.id);
        const res = await removeInvoiceItem(item.id, billData.invoice.id);
        setRemovingItemId(null);
        if (res.success) {
            showToast('Charge removed from bill');
            await refreshBill();
        } else {
            showToast(res.error || 'Failed to remove charge', 'error');
        }
    }

    // ── Bill-level discount ────────────────────────────────────────────────────
    // The base a % is taken on, and the ceiling for a flat ₹: what the bill is
    // worth before this discount. net_amount already has the current bill discount
    // taken off, so adding it back is what keeps re-editing an existing discount
    // from shrinking its own base every time it is saved.
    const billDiscountApplied = Number(billData?.invoice?.bill_discount ?? 0);
    const discountBase = Number(billData?.invoice?.net_amount ?? 0) + billDiscountApplied;
    const discountEntered = parseFloat(discountInput) || 0;
    const discountAmountResolved = discountMode === 'percent'
        ? Math.round(discountBase * Math.min(100, Math.max(0, discountEntered))) / 100
        : discountEntered;

    function openDiscountModal() {
        // Prefill with what is already on the bill so the dialog edits the running
        // discount instead of silently replacing it with a blank.
        setDiscountMode('amount');
        setDiscountInput(billDiscountApplied > 0 ? String(billDiscountApplied) : '');
        setDiscountRemark(billData?.invoice?.discount_remark || '');
        setShowDiscountModal(true);
    }

    async function handleApplyBillDiscount() {
        if (!billData?.invoice?.id) return;
        if (discountAmountResolved < 0) { showToast('Discount cannot be negative', 'error'); return; }
        if (discountAmountResolved > discountBase) {
            showToast(`Discount cannot exceed the bill amount of ₹${discountBase.toLocaleString('en-IN')}`, 'error');
            return;
        }
        // A discount on a hospital bill is a write-off — it needs a stated reason on
        // the record, the same as the discharge settlement asks for one.
        if (discountAmountResolved > 0 && !discountRemark.trim()) {
            showToast('Enter a reason for the discount', 'error');
            return;
        }
        setSavingDiscount(true);
        const res = await updateInvoiceHeader(billData.invoice.id, {
            bill_discount: discountAmountResolved,
            discount_remark: discountRemark.trim() || null,
        });
        setSavingDiscount(false);
        if (res.success) {
            setShowDiscountModal(false);
            showToast(
                discountAmountResolved > 0
                    ? `Discount of ₹${discountAmountResolved.toLocaleString('en-IN')} applied to the bill`
                    : 'Bill discount removed',
            );
            await refreshBill();
        } else {
            showToast(res.error || 'Failed to apply discount', 'error');
        }
    }

    async function handleCollectDeposit() {
        if (!selectedAdmission || !depositAmount) return;
        // Cash compliance guard (server re-validates as the source of truth)
        if (depositBlocked) {
            showToast(
                depositCashBlocked
                    ? `Cash deposits above ₹${cashThresholds.cash_limit.toLocaleString('en-IN')} are not permitted. Use UPI/Card/Bank.`
                    : 'PAN Number and PAN Holder Name are required for this cash deposit.',
                'error',
            );
            return;
        }
        setActionLoading(true);
        const res = await collectDeposit({
            patient_id: selectedAdmission.patient_id,
            admission_id: selectedAdmission.admission_id,
            amount: parseFloat(depositAmount),
            payment_method: depositMethod,
            payer_pan_number: depositIsCash ? depositPanNumber.trim().toUpperCase() || undefined : undefined,
            payer_pan_name: depositIsCash ? depositPanName.trim() || undefined : undefined,
        });
        setActionLoading(false);
        if (res.success) {
            setShowDepositModal(false);
            setDepositAmount('');
            setDepositPanNumber(''); setDepositPanName('');
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
            <div className="max-w-[1680px] mx-auto">
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
                    <div className="col-span-3 bg-white rounded-lg shadow p-4 max-h-[88vh] overflow-y-auto">
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
                    <div className="col-span-7 bg-white rounded-lg shadow">
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
                                                {billData.admission.admission_id} | {formatDoctorName(billData.admission.doctor_name)}
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                {billData.admission.ward_name} | Bed: {billData.admission.bed_id} |
                                                Day {billData.admission.days_admitted} |
                                                {billData.admission.diagnosis}
                                            </p>
                                        </div>
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
                                <div className="p-4 max-h-[55vh] overflow-y-auto">
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
                                                        <span className="font-mono">{billData.invoice.invoice_number || 'Draft (unsaved)'}</span>
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
                                                        <span className="text-gray-500">
                                                            Discount
                                                            {billDiscountApplied > 0 && (
                                                                <span className="text-gray-400"> (incl. ₹{billDiscountApplied.toLocaleString('en-IN')} on bill)</span>
                                                            )}
                                                        </span>
                                                        <span>₹{(billData.invoice.total_discount || 0).toLocaleString('en-IN')}</span>
                                                    </div>
                                                    {billData.invoice.discount_remark && (
                                                        <div className="flex justify-between p-2 bg-gray-50 rounded col-span-2">
                                                            <span className="text-gray-500">Discount Reason</span>
                                                            <span className="text-gray-700">{billData.invoice.discount_remark}</span>
                                                        </div>
                                                    )}
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
                                                                <th className="p-2 text-right">Disc</th>
                                                                <th className="p-2 text-right">GST%</th>
                                                                <th className="p-2 text-right">Amount</th>
                                                                <th className="p-2 text-center w-16"></th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {items.map((item: any) => (
                                                                editingItemId === item.id ? (
                                                                    <tr key={item.id} className="border-b bg-amber-50/60">
                                                                        <td className="p-1.5">
                                                                            <input
                                                                                type="text"
                                                                                value={editDesc}
                                                                                onChange={(e) => setEditDesc(e.target.value)}
                                                                                className="w-full px-2 py-1 border rounded text-xs"
                                                                                placeholder="Service name"
                                                                            />
                                                                        </td>
                                                                        <td className="p-1.5">
                                                                            <input
                                                                                type="date"
                                                                                value={editDate}
                                                                                max={new Date().toISOString().slice(0, 10)}
                                                                                onChange={(e) => setEditDate(e.target.value)}
                                                                                className="w-full px-1.5 py-1 border rounded text-xs"
                                                                            />
                                                                        </td>
                                                                        <td className="p-1.5">
                                                                            <input
                                                                                type="number"
                                                                                min="1"
                                                                                value={editQty}
                                                                                onChange={(e) => setEditQty(parseInt(e.target.value) || 1)}
                                                                                className="w-16 px-2 py-1 border rounded text-xs text-right ml-auto block"
                                                                            />
                                                                        </td>
                                                                        <td className="p-2 text-right text-gray-400" title="Rate is locked to the master. Apply a discount or re-add the service to change the amount.">
                                                                            ₹{item.unit_price?.toLocaleString('en-IN')}
                                                                        </td>
                                                                        <td className="p-1.5">
                                                                            <input
                                                                                type="number"
                                                                                min="0"
                                                                                step="0.01"
                                                                                max={editQty * Number(item.unit_price || 0)}
                                                                                value={editDiscount}
                                                                                onChange={(e) => setEditDiscount(e.target.value)}
                                                                                title="Discount in ₹ on this line"
                                                                                placeholder="0"
                                                                                className="w-20 px-2 py-1 border rounded text-xs text-right ml-auto block"
                                                                            />
                                                                        </td>
                                                                        <td className="p-2 text-right text-gray-400">{item.tax_rate}%</td>
                                                                        <td className="p-2 text-right text-gray-400">₹{(item.net_price + item.tax_amount)?.toLocaleString('en-IN')}</td>
                                                                        <td className="p-2 text-center whitespace-nowrap">
                                                                            <button
                                                                                onClick={() => handleSaveItem(item)}
                                                                                disabled={savingItem}
                                                                                title="Save changes"
                                                                                className="text-emerald-600 hover:text-emerald-800 disabled:opacity-40 text-sm font-bold mr-1.5"
                                                                            >
                                                                                {savingItem ? '…' : '✓'}
                                                                            </button>
                                                                            <button
                                                                                onClick={cancelEditItem}
                                                                                disabled={savingItem}
                                                                                title="Cancel"
                                                                                className="text-gray-400 hover:text-gray-700 disabled:opacity-40 text-sm font-bold"
                                                                            >
                                                                                ✕
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                ) : (
                                                                    <tr key={item.id} className="border-b group">
                                                                        <td className="p-2">{item.description}</td>
                                                                        <td className="p-2 text-gray-400">{new Date(item.created_at).toLocaleDateString('en-GB')}</td>
                                                                        <td className="p-2 text-right">{item.quantity}</td>
                                                                        <td className="p-2 text-right">₹{item.unit_price?.toLocaleString('en-IN')}</td>
                                                                        <td className={`p-2 text-right ${Number(item.discount) > 0 ? 'text-emerald-600 font-medium' : 'text-gray-300'}`}>
                                                                            {Number(item.discount) > 0 ? `-₹${Number(item.discount).toLocaleString('en-IN')}` : '—'}
                                                                        </td>
                                                                        <td className="p-2 text-right">{item.tax_rate}%</td>
                                                                        <td className="p-2 text-right">₹{(item.net_price + item.tax_amount)?.toLocaleString('en-IN')}</td>
                                                                        <td className="p-2 text-center whitespace-nowrap">
                                                                            <button
                                                                                onClick={() => startEditItem(item)}
                                                                                disabled={editingItemId !== null}
                                                                                title="Edit service name, quantity, discount or date"
                                                                                className="text-gray-300 hover:text-blue-600 disabled:opacity-40 text-sm leading-none mr-1.5 transition-colors"
                                                                            >
                                                                                ✎
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleRemoveCharge(item)}
                                                                                disabled={removingItemId === item.id || editingItemId !== null}
                                                                                title="Remove this charge from the bill"
                                                                                className="text-gray-300 hover:text-red-600 disabled:opacity-40 text-base leading-none font-bold transition-colors"
                                                                            >
                                                                                {removingItemId === item.id ? '…' : '×'}
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                )
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
                    <div className="col-span-2 space-y-3">
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
                                    onClick={openDiscountModal}
                                    disabled={!billData?.invoice?.id}
                                    className="w-full px-3 py-2 bg-amber-600 text-white rounded-md text-sm hover:bg-amber-700 disabled:opacity-50"
                                    title="Apply a discount to this IPD bill"
                                >
                                    {billDiscountApplied > 0 ? `Discount (₹${billDiscountApplied.toLocaleString('en-IN')})` : 'Apply Discount'}
                                </button>
                                <button
                                    onClick={() => {
                                        // Use the same server-rendered bill layout as Master Billing → "Print Bill",
                                        // so an IPD bill prints identically wherever it's opened from.
                                        if (billData?.invoice?.id) window.open(`/api/invoice/${billData.invoice.id}/summary-bill`, '_blank');
                                    }}
                                    disabled={!billData}
                                    className="w-full px-3 py-2 bg-gray-600 text-white rounded-md text-sm hover:bg-gray-700 disabled:opacity-50"
                                >
                                    Print Bill
                                </button>
                                <button
                                    onClick={() => {
                                        if (billData?.invoice?.id) window.open(`/api/invoice/${billData.invoice.id}/summary-bill?detailed=true`, '_blank');
                                    }}
                                    disabled={!billData}
                                    className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Print Detailed Bill
                                </button>
                                <button
                                    onClick={openAbsorbedModal}
                                    disabled={!selectedAdmission}
                                    className="w-full px-3 py-2 border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-md text-sm hover:bg-indigo-100 disabled:opacity-50"
                                    title="Charges absorbed under the package (not on the patient/TPA bill)"
                                >
                                    View Absorbed Charges
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
                                <p><span className="text-gray-500">Invoice:</span> {billData.invoice.invoice_number || 'Draft (unsaved)'}</p>
                                <p><span className="text-gray-500">Admitted:</span> {new Date(billData.admission.admission_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                {billData.admission.discharge_date && (
                                    <p><span className="text-gray-500">Discharged:</span> {new Date(billData.admission.discharge_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                )}
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
                        {ipdPanRequired && ipdHasRegisteredPan && (
                            <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium rounded">
                                PAN on file from registration ({normalizePan(ipdRegisteredPan)}) will be recorded on this receipt — no re-entry needed.
                            </div>
                        )}
                        {ipdPanNeedsCapture && (
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
                                        readOnly
                                        title="Item prices cannot be edited. To change the amount, apply a discount or cancel the service and add it again."
                                        className="w-full px-3 py-2 border rounded-md bg-gray-100 text-gray-500 cursor-not-allowed"
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

                            <div>
                                <label className="text-sm text-gray-600">
                                    Service Date <span className="text-xs text-gray-400">(optional — leave blank for today)</span>
                                </label>
                                <input
                                    type="datetime-local"
                                    value={chargeDateTime}
                                    max={new Date().toISOString().slice(0, 16)}
                                    onChange={(e) => setChargeDateTime(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-md"
                                />
                                <p className="text-xs text-gray-500 mt-1">Backdate up to 1 year. For services performed on an earlier date.</p>
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

                            {/* Cash compliance — block over limit / capture PAN at threshold */}
                            {depositCashBlocked && (
                                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded">
                                    Cash deposits above ₹{cashThresholds.cash_limit.toLocaleString('en-IN')} are not permitted. Please use UPI, Card, Bank Transfer, or another approved method.
                                </div>
                            )}
                            {depositPanRequired && ipdHasRegisteredPan && (
                                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium rounded">
                                    PAN on file from registration ({normalizePan(ipdRegisteredPan)}) will be recorded on this deposit — no re-entry needed.
                                </div>
                            )}
                            {depositPanNeedsCapture && (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded space-y-2">
                                    <p className="text-xs font-medium text-amber-800">
                                        PAN details are mandatory for cash deposits of ₹{cashThresholds.pan_threshold.toLocaleString('en-IN')} or more.
                                    </p>
                                    <div>
                                        <input
                                            type="text"
                                            value={depositPanNumber}
                                            onChange={(e) => setDepositPanNumber(e.target.value.toUpperCase())}
                                            placeholder="PAN Number * (ABCDE1234F)"
                                            maxLength={10}
                                            className="w-full px-2 py-1.5 border rounded text-sm font-mono uppercase"
                                        />
                                        {depositPanNumber.length > 0 && !isValidPan(depositPanNumber) && (
                                            <p className="text-[11px] text-rose-500 mt-1">Invalid PAN format.</p>
                                        )}
                                    </div>
                                    <input
                                        type="text"
                                        value={depositPanName}
                                        onChange={(e) => setDepositPanName(e.target.value)}
                                        placeholder="PAN Holder Name *"
                                        className="w-full px-2 py-1.5 border rounded text-sm"
                                    />
                                </div>
                            )}

                            <div className="flex gap-2">
                                <button
                                    onClick={handleCollectDeposit}
                                    disabled={actionLoading || depositBlocked}
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

            {/* Bill Discount Modal — flat ₹ off the whole IPD bill, entered as an
                amount or a % of the bill. Sits on the invoice header (bill_discount),
                so line rates stay locked to the master and the GST already charged on
                each line is untouched, exactly like the counter/OPD bill. */}
            {showDiscountModal && billData && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-96">
                        <h3 className="text-lg font-semibold">Apply Discount</h3>
                        <p className="text-xs text-gray-500 mt-0.5 mb-4">
                            {billData.admission?.patient_name} · Bill before discount ₹{discountBase.toLocaleString('en-IN')}
                        </p>
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                {([['amount', '₹ Amount'], ['percent', '% of Bill']] as const).map(([mode, label]) => (
                                    <button
                                        key={mode}
                                        onClick={() => { setDiscountMode(mode); setDiscountInput(''); }}
                                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold border ${
                                            discountMode === mode
                                                ? 'bg-amber-600 text-white border-amber-600'
                                                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div>
                                <label className="text-sm text-gray-600">
                                    {discountMode === 'percent' ? 'Discount (%)' : 'Discount (₹)'}
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step={discountMode === 'percent' ? '0.1' : '1'}
                                    max={discountMode === 'percent' ? 100 : discountBase}
                                    value={discountInput}
                                    onChange={(e) => setDiscountInput(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-md"
                                    placeholder="0"
                                />
                                {/* Entering 0 is the way to take an existing discount back off. */}
                                <p className="text-[11px] text-gray-400 mt-1">
                                    {billDiscountApplied > 0
                                        ? 'This replaces the discount currently on the bill. Set 0 to remove it.'
                                        : 'Applies on top of any line-level discounts already on the charges.'}
                                </p>
                            </div>
                            <div>
                                <label className="text-sm text-gray-600">Reason *</label>
                                <input
                                    type="text"
                                    value={discountRemark}
                                    onChange={(e) => setDiscountRemark(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-md"
                                    placeholder="Staff discount, management approval, etc."
                                />
                            </div>

                            <div className="p-3 bg-gray-50 border rounded-md text-xs space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Bill before discount</span>
                                    <span>₹{discountBase.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between text-amber-700">
                                    <span>Discount</span>
                                    <span>-₹{discountAmountResolved.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t">
                                    <span>Net payable</span>
                                    <span>₹{Math.max(0, discountBase - discountAmountResolved).toLocaleString('en-IN')}</span>
                                </div>
                            </div>
                            {discountAmountResolved > discountBase && (
                                <p className="text-xs text-rose-600">Discount cannot exceed the bill amount.</p>
                            )}

                            <div className="flex gap-2">
                                <button
                                    onClick={handleApplyBillDiscount}
                                    disabled={savingDiscount || discountAmountResolved > discountBase}
                                    className="flex-1 px-3 py-2 bg-amber-600 text-white rounded-md text-sm disabled:opacity-50"
                                >
                                    {savingDiscount ? 'Applying...' : 'Apply Discount'}
                                </button>
                                <button
                                    onClick={() => setShowDiscountModal(false)}
                                    disabled={savingDiscount}
                                    className="flex-1 px-3 py-2 border rounded-md text-sm disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Absorbed Charges Modal (read-only — package-consumed, not on the bill) */}
            {showAbsorbedModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
                        <div className="p-4 border-b flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-gray-900">Absorbed Charges (under package)</h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {selectedAdmission?.patient?.full_name} · {selectedAdmission?.admission_id}
                                    {absorbedData?.package_name ? ` · ${absorbedData.package_name}` : ''}
                                </p>
                                <p className="text-[11px] text-indigo-600 mt-1">These are NOT on the patient/TPA bill — the hospital absorbs them (booked as expense).</p>
                            </div>
                            <button onClick={() => setShowAbsorbedModal(false)} className="text-gray-400 hover:text-gray-800 text-xl font-bold leading-none">&times;</button>
                        </div>

                        <div className="p-4 overflow-y-auto flex-1">
                            {absorbedLoading ? (
                                <p className="text-center text-sm text-gray-400 py-10">Loading…</p>
                            ) : !absorbedData || absorbedData.count === 0 ? (
                                <p className="text-center text-sm text-gray-400 py-10">No absorbed charges yet for this admission.</p>
                            ) : (
                                <>
                                    {/* Category breakup */}
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {Object.entries(absorbedData.byCategory || {}).map(([cat, amt]: any) => (
                                            <span key={cat} className="text-[11px] font-semibold bg-gray-100 text-gray-700 rounded-full px-2.5 py-1">
                                                {cat}: ₹{Number(amt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase font-bold">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Date</th>
                                                    <th className="px-3 py-2 text-left">Description</th>
                                                    <th className="px-3 py-2 text-left">Category</th>
                                                    <th className="px-3 py-2 text-center">Qty</th>
                                                    <th className="px-3 py-2 text-right">Amount</th>
                                                    <th className="px-3 py-2 text-center"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {absorbedData.items.map((it: any) => (
                                                    <tr key={it.id}>
                                                        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{new Date(it.posted_at).toLocaleDateString('en-GB')}</td>
                                                        <td className="px-3 py-2 text-gray-800">{it.description}</td>
                                                        <td className="px-3 py-2 text-xs text-gray-500">{it.category}</td>
                                                        <td className="px-3 py-2 text-center text-gray-600">{it.quantity}</td>
                                                        <td className="px-3 py-2 text-right font-semibold text-gray-900">₹{Number(it.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                        <td className="px-3 py-2 text-center">
                                                            <button
                                                                onClick={() => handleRemoveAbsorbed(it.id)}
                                                                disabled={removingAbsorbedId === it.id}
                                                                title="Remove (added by mistake)"
                                                                className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded px-1.5 py-0.5 text-sm font-bold disabled:opacity-40"
                                                            >
                                                                {removingAbsorbedId === it.id ? '…' : '✕'}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-gray-50">
                                                <tr>
                                                    <td colSpan={4} className="px-3 py-2 text-right font-bold text-gray-600 text-xs">Total absorbed:</td>
                                                    <td className="px-3 py-2 text-right font-black text-gray-900">₹{Number(absorbedData.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                    <td></td>
                                                </tr>
                                                {absorbedData.package_amount > 0 && (
                                                    <tr>
                                                        <td colSpan={4} className="px-3 py-1.5 text-right text-[11px] text-gray-500">Package amount (billed):</td>
                                                        <td className="px-3 py-1.5 text-right text-[11px] font-bold text-emerald-700">₹{Number(absorbedData.package_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                        <td></td>
                                                    </tr>
                                                )}
                                            </tfoot>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="p-3 border-t flex justify-end gap-2">
                            {selectedAdmission && absorbedData && absorbedData.count > 0 && (
                                <button
                                    onClick={() => window.open(`/api/ipd/${selectedAdmission.admission_id}/absorbed-charges`, '_blank')}
                                    className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl"
                                >
                                    Print
                                </button>
                            )}
                            <button onClick={() => setShowAbsorbedModal(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl">Close</button>
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
