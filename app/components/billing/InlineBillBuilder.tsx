'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Stethoscope, Trash2, X, Receipt, ShieldAlert, Building2, AlertCircle, Printer } from 'lucide-react';
import { ServicePicker, type CatalogService } from './ServicePicker';
import {
  createInvoice,
  addInvoiceItem,
  getSuggestedOpdDoctor,
  recordPayment,
  recordSplitPayment,
} from '@/app/actions/finance-actions';
import { getDoctorsForDropdown } from '@/app/actions/admin-actions';
import { getCashComplianceConfig } from '@/app/actions/cash-compliance-actions';
import { CASH_COMPLIANCE_DEFAULTS, isValidPan } from '@/app/lib/cash-compliance';
import { useToast } from '@/app/components/ui/Toast';

type Patient = {
  patient_id: string;
  full_name?: string | null;
  patient_type?: string | null;
  corporate_id?: string | null;
  tpa_provider_id?: number | null;
  pre_auth_approved?: boolean | null;
};

type LineItem = {
  key: string;             // local UI key (uuid-ish)
  service_id?: string;     // catalog id (omitted for misc)
  description: string;
  service_category: string;
  hsn_sac_code?: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_discount: number;
  source?: CatalogService['source'];
};

type PaymentSplit = { amount: string; method: string; reference: string };

type Props = {
  patient: Patient;
  onCreated?: (invoiceId: number) => void;
  onCancel?: () => void;
  autoPrint?: boolean;
};

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'BankTransfer', 'NEFT_RTGS', 'Cheque'];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function InlineBillBuilder({ patient, onCreated, onCancel, autoPrint = true }: Props) {
  const toast = useToast();

  // ── Doctor ──
  const [doctors, setDoctors] = useState<Array<{ id: string; name: string; specialty?: string | null }>>([]);
  const [doctorId, setDoctorId] = useState('');
  const [doctorName, setDoctorName] = useState('');

  // ── Lines ──
  const [lines, setLines] = useState<LineItem[]>([]);
  const [billDiscountPct, setBillDiscountPct] = useState(0);

  // ── Cash compliance thresholds ──
  const [cashThresholds, setCashThresholds] = useState<{ pan_threshold: number; cash_limit: number }>(CASH_COMPLIANCE_DEFAULTS);

  // ── Payment (Cash patients only) ──
  const [splits, setSplits] = useState<PaymentSplit[]>([{ amount: '', method: 'Cash', reference: '' }]);
  const [panNumber, setPanNumber] = useState('');
  const [panName, setPanName] = useState('');

  // ── Submit ──
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patientType = (patient.patient_type || 'cash').toLowerCase();
  const isCash = patientType === 'cash';
  const isCorporate = patientType === 'corporate';
  const isTpa = patientType === 'tpa_insurance' || patientType === 'tpa';
  const tpaBlocked = isTpa && !patient.pre_auth_approved;

  // ── Bootstrap: load doctors + suggested doctor + thresholds ──
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getDoctorsForDropdown(),
      getSuggestedOpdDoctor(patient.patient_id),
      getCashComplianceConfig(),
    ]).then(([docsRes, suggested, thresholdsRes]) => {
      if (cancelled) return;
      if (docsRes.success && Array.isArray(docsRes.data)) {
        setDoctors(docsRes.data as any);
        if (suggested.success && suggested.data) {
          const { doctor_id, doctor_name } = suggested.data;
          if (doctor_id) setDoctorId(doctor_id);
          else if (doctor_name) {
            const hit = (docsRes.data as any[]).find((d) =>
              (d.name || '').toLowerCase() === doctor_name.toLowerCase(),
            );
            if (hit) setDoctorId(hit.id);
            else setDoctorName(doctor_name);
          }
        }
      }
      if (thresholdsRes.success && thresholdsRes.data) {
        setCashThresholds({
          pan_threshold: thresholdsRes.data.pan_threshold,
          cash_limit: thresholdsRes.data.cash_limit,
        });
      }
    });
    return () => { cancelled = true; };
  }, [patient.patient_id]);

  // ── Derived totals ──
  const totals = useMemo(() => {
    const afterLine = lines.reduce(
      (s, l) => s + (l.unit_price * l.quantity - l.line_discount),
      0,
    );
    const overall = Math.max(0, Math.min(100, billDiscountPct)) / 100;
    const overallDiscount = afterLine * overall;
    const taxable = afterLine - overallDiscount;
    // Each line's taxable share is proportional, simplify:
    const tax = lines.reduce((s, l) => {
      const lineAfterDisc = l.unit_price * l.quantity - l.line_discount;
      const share = afterLine > 0 ? lineAfterDisc / afterLine : 0;
      const lineTaxable = taxable * share;
      return s + lineTaxable * (l.tax_rate / 100);
    }, 0);
    const net = taxable + tax;
    return {
      gross: afterLine,
      overallDiscount,
      taxable,
      tax,
      net,
    };
  }, [lines, billDiscountPct]);

  // ── Cash compliance derived ──
  const cashTotal = splits
    .filter((s) => s.method === 'Cash')
    .reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const cashBlocked = cashTotal > cashThresholds.cash_limit;
  const panRequired = cashTotal >= cashThresholds.pan_threshold && !cashBlocked;
  const panValid = isValidPan(panNumber) && panName.trim().length > 0;
  const cashGuardBlocked = isCash && (cashBlocked || (panRequired && !panValid));

  const splitTotal = splits.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const splitsBalanced = Math.abs(splitTotal - totals.net) < 0.01;

  // ── Picker handlers ──
  const handlePickService = useCallback((s: CatalogService) => {
    setLines((prev) => [
      ...prev,
      {
        key: uid(),
        service_id: s.id,
        description: s.service_name,
        service_category: s.service_category,
        hsn_sac_code: s.hsn_sac_code,
        quantity: 1,
        unit_price: s.default_rate,
        tax_rate: s.tax_rate,
        line_discount: 0,
        source: s.source,
      },
    ]);
  }, []);

  const handleAddMisc = useCallback(() => {
    setLines((prev) => [
      ...prev,
      {
        key: uid(),
        description: '',
        service_category: 'Misc',
        quantity: 1,
        unit_price: 0,
        tax_rate: 0,
        line_discount: 0,
      },
    ]);
  }, []);

  const updateLine = (key: string, patch: Partial<LineItem>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  // ── Auto-balance single split row with net ──
  useEffect(() => {
    if (!isCash) return;
    setSplits((prev) => {
      if (prev.length > 1) return prev;
      if (totals.net <= 0) return prev.length === 0 ? prev : [{ amount: '', method: prev[0]?.method || 'Cash', reference: '' }];
      const target = String(Number(totals.net.toFixed(2)));
      if (prev.length === 1 && prev[0].amount === target) return prev;
      return [{ amount: target, method: prev[0]?.method || 'Cash', reference: prev[0]?.reference || '' }];
    });
  }, [totals.net, isCash]);

  // ── Submit ──
  const handleSubmit = async () => {
    setError(null);
    if (tpaBlocked) {
      setError('TPA patient — pre-authorization required before generating a Cash bill.');
      return;
    }
    if (lines.length === 0) {
      setError('Add at least one service before generating the bill.');
      return;
    }
    if (!doctorId && !doctorName.trim()) {
      setError('Consulting doctor is required.');
      return;
    }
    for (const l of lines) {
      if (!l.description.trim()) {
        setError('Every line item needs a description.');
        return;
      }
      if (l.quantity <= 0 || l.unit_price < 0) {
        setError('Quantity must be > 0 and unit price must be ≥ 0.');
        return;
      }
    }

    if (isCash) {
      if (cashGuardBlocked) {
        setError(
          cashBlocked
            ? `Cash receipts above ₹${cashThresholds.cash_limit.toLocaleString('en-IN')} are not permitted. Use UPI/Card/Bank.`
            : 'PAN Number and PAN Holder Name are required for this cash amount.',
        );
        return;
      }
      if (!splitsBalanced && totals.net > 0) {
        setError('Payment splits must match the net bill amount.');
        return;
      }
    }

    setSubmitting(true);

    // 1. Create invoice
    const inv = await createInvoice({
      patient_id: patient.patient_id,
      invoice_type: 'OPD_FEE',
      doctor_id: doctorId || undefined,
      doctor_name: doctorName || doctors.find((d) => d.id === doctorId)?.name || undefined,
      require_doctor: true,
      billing_patient_type: isCorporate ? 'corporate' : isTpa ? 'tpa_insurance' : 'cash',
      corporate_id: isCorporate ? (patient.corporate_id || undefined) : undefined,
      tpa_provider_id: isTpa ? (patient.tpa_provider_id || undefined) : undefined,
    });
    if (!inv.success || !inv.data) {
      setSubmitting(false);
      setError(inv.error || 'Failed to create invoice.');
      return;
    }
    const invoiceId = (inv.data as any).id;

    // 2. Apply bill-level percentage discount proportionally to line discounts
    const billDiscFactor = Math.max(0, Math.min(100, billDiscountPct)) / 100;
    for (const l of lines) {
      const lineAfter = l.unit_price * l.quantity - l.line_discount;
      const share = totals.gross > 0 ? lineAfter / totals.gross : 0;
      const extraDiscount = totals.overallDiscount * share;
      const finalDiscount = l.line_discount + extraDiscount;
      const itemRes = await addInvoiceItem({
        invoice_id: invoiceId,
        department: l.service_category || 'General',
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount: finalDiscount,
        tax_rate: l.tax_rate,
        hsn_sac_code: l.hsn_sac_code,
        service_category: l.service_category,
        ref_id: l.service_id,
      });
      if (!itemRes.success) {
        setSubmitting(false);
        setError(`Failed to add "${l.description}": ${itemRes.error || 'unknown error'}`);
        return;
      }
    }

    // 3. Payment (Cash only — Corporate posts to balance, TPA already blocked)
    if (isCash && totals.net > 0) {
      const validSplits = splits.filter((s) => parseFloat(s.amount) > 0);
      const panArgs = {
        payer_pan_number: panNumber.trim().toUpperCase() || undefined,
        payer_pan_name: panName.trim() || undefined,
      };
      let payRes: { success: boolean; error?: string };
      if (validSplits.length === 1) {
        payRes = await recordPayment({
          invoice_id: invoiceId,
          amount: parseFloat(validSplits[0].amount),
          payment_method: validSplits[0].method,
          payment_type: 'Settlement',
          ...panArgs,
        });
      } else {
        payRes = await recordSplitPayment({
          invoice_id: invoiceId,
          splits: validSplits.map((s) => ({
            amount: parseFloat(s.amount),
            payment_method: s.method,
            reference: s.reference || undefined,
          })),
          ...panArgs,
        });
      }
      if (!payRes.success) {
        setSubmitting(false);
        setError(payRes.error || 'Payment failed. Invoice was created — collect from Master Billing.');
        return;
      }
    }

    setSubmitting(false);
    toast.success('Bill generated' + (isCash && totals.net > 0 ? ' & payment recorded' : ''));

    // Auto-print receipt
    if (autoPrint) {
      try {
        window.open(`/api/invoices/${invoiceId}/print`, '_blank');
      } catch { /* popup blocked — user can print manually */ }
    }

    onCreated?.(invoiceId);
  };

  // ── Render ──
  const excludeIds = useMemo(() => lines.map((l) => l.service_id).filter((x): x is string => !!x), [lines]);

  return (
    <div className="bg-white border border-orange-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-orange-600" />
          <h3 className="text-sm font-black text-gray-900">New Bill</h3>
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-white border border-orange-200 text-orange-700">
            {isCash ? 'Cash' : isCorporate ? 'Corporate' : 'TPA / Insurance'}
          </span>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-white/60">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {tpaBlocked ? (
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black text-amber-900">Pre-authorization required</p>
              <p className="text-xs text-amber-700 mt-1">
                This patient is enrolled with a TPA / insurance provider. A Cash bill cannot be generated until pre-auth is approved.
                Open the TPA / Insurance workflow to submit or check the pre-auth request.
              </p>
              <div className="mt-3 flex gap-2">
                <a
                  href={`/reception/finance/tpa-insurance?patientId=${patient.patient_id}`}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white inline-flex items-center gap-1.5"
                >
                  Open Pre-Auth
                </a>
                {onCancel && (
                  <button onClick={onCancel} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-700">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5 space-y-5">
          {/* Doctor */}
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Consulting Doctor *</label>
            <div className="relative">
              <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                value={doctorId}
                onChange={(e) => { setDoctorId(e.target.value); setDoctorName(''); }}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 outline-none appearance-none"
              >
                <option value="">Select consulting doctor</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}{d.specialty ? ` · ${d.specialty}` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Service picker */}
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Add Services</label>
            <ServicePicker onPick={handlePickService} onAddMisc={handleAddMisc} excludeIds={excludeIds} />
          </div>

          {/* Line items */}
          {lines.length > 0 && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Line Items ({lines.length})</label>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-2 font-bold">Description</th>
                      <th className="text-right px-3 py-2 font-bold w-16">Qty</th>
                      <th className="text-right px-3 py-2 font-bold w-24">Rate</th>
                      <th className="text-right px-3 py-2 font-bold w-24">Discount</th>
                      <th className="text-right px-3 py-2 font-bold w-16">GST</th>
                      <th className="text-right px-3 py-2 font-bold w-24">Total</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const lineTotal = l.unit_price * l.quantity - l.line_discount;
                      return (
                        <tr key={l.key} className="border-t border-gray-100">
                          <td className="px-3 py-2">
                            <input
                              value={l.description}
                              onChange={(e) => updateLine(l.key, { description: e.target.value })}
                              placeholder={l.service_id ? l.description : 'Misc charge description'}
                              className="w-full bg-transparent border-0 focus:outline-none text-gray-900 font-medium"
                            />
                            <span className="text-[10px] text-gray-400">{l.service_category}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={1}
                              value={l.quantity}
                              onChange={(e) => updateLine(l.key, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                              className="w-14 text-right bg-transparent border border-gray-200 rounded px-1 py-0.5"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              value={l.unit_price}
                              onChange={(e) => updateLine(l.key, { unit_price: Math.max(0, parseFloat(e.target.value) || 0) })}
                              className="w-20 text-right bg-transparent border border-gray-200 rounded px-1 py-0.5"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              value={l.line_discount}
                              onChange={(e) => updateLine(l.key, { line_discount: Math.max(0, parseFloat(e.target.value) || 0) })}
                              className="w-20 text-right bg-transparent border border-gray-200 rounded px-1 py-0.5"
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">{l.tax_rate}%</td>
                          <td className="px-3 py-2 text-right font-bold text-gray-900">₹{lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => removeLine(l.key)} className="text-gray-300 hover:text-red-500">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Bill discount + totals */}
          {lines.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Bill-level Discount (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={billDiscountPct}
                  onChange={(e) => setBillDiscountPct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 outline-none"
                />
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs space-y-1">
                <div className="flex justify-between text-gray-500"><span>Sub-total</span><span>₹{totals.gross.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                {totals.overallDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold"><span>Bill discount ({billDiscountPct}%)</span><span>-₹{totals.overallDiscount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                )}
                <div className="flex justify-between text-gray-500"><span>Taxable</span><span>₹{totals.taxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between text-gray-500"><span>GST</span><span>₹{totals.tax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between text-gray-900 font-black border-t border-gray-200 pt-1 mt-1"><span>NET</span><span>₹{totals.net.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
              </div>
            </div>
          )}

          {/* Payment block — only for Cash patients */}
          {isCash && lines.length > 0 && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Payment</label>
              {splits.map((split, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="number"
                    min={0}
                    value={split.amount}
                    onChange={(e) => {
                      const updated = [...splits];
                      updated[idx].amount = e.target.value;
                      setSplits(updated);
                    }}
                    placeholder="Amount"
                    className="w-32 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm"
                  />
                  <select
                    value={split.method}
                    onChange={(e) => {
                      const updated = [...splits];
                      updated[idx].method = e.target.value;
                      setSplits(updated);
                    }}
                    className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm"
                  >
                    {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                  <input
                    value={split.reference}
                    onChange={(e) => {
                      const updated = [...splits];
                      updated[idx].reference = e.target.value;
                      setSplits(updated);
                    }}
                    placeholder="Ref / Txn ID"
                    className="w-36 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm"
                  />
                  {splits.length > 1 && (
                    <button onClick={() => setSplits(splits.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setSplits([...splits, { amount: '', method: 'Cash', reference: '' }])}
                className="text-xs text-orange-600 hover:underline font-bold"
              >
                + Add another payment method
              </button>

              {/* PAN compliance */}
              {(panRequired || cashBlocked) && (
                <div className={`mt-2 p-3 rounded-xl border ${cashBlocked ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-start gap-2">
                    <AlertCircle className={`h-4 w-4 shrink-0 mt-0.5 ${cashBlocked ? 'text-red-600' : 'text-amber-600'}`} />
                    <div className="flex-1 space-y-2">
                      <p className="text-xs font-bold">
                        {cashBlocked
                          ? `Cash > ₹${cashThresholds.cash_limit.toLocaleString('en-IN')} not permitted. Use UPI/Card/Bank.`
                          : `Cash ≥ ₹${cashThresholds.pan_threshold.toLocaleString('en-IN')} — PAN required.`}
                      </p>
                      {!cashBlocked && (
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={panNumber}
                            onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                            placeholder="PAN Number (ABCDE1234F)"
                            maxLength={10}
                            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm uppercase"
                          />
                          <input
                            value={panName}
                            onChange={(e) => setPanName(e.target.value)}
                            placeholder="PAN Holder Name"
                            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!splitsBalanced && totals.net > 0 && (
                <p className="text-[11px] text-amber-600 font-bold">
                  Payment splits total ₹{splitTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })} — net is ₹{totals.net.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </p>
              )}
            </div>
          )}

          {/* Corporate banner */}
          {isCorporate && lines.length > 0 && (
            <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <Building2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800">
                Corporate billing. No payment collected at counter — net amount will be posted to the corporate account balance.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 font-bold">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            {onCancel ? (
              <button
                onClick={onCancel}
                className="px-4 py-2.5 text-sm font-bold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
            ) : <span />}
            <button
              onClick={handleSubmit}
              disabled={submitting || lines.length === 0 || cashGuardBlocked}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl shadow-lg shadow-orange-500/20 active:scale-[0.98]"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
              {isCorporate ? 'Generate Bill (Post to Balance)' : isCash && totals.net > 0 ? 'Generate & Collect' : 'Generate Bill'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default InlineBillBuilder;
