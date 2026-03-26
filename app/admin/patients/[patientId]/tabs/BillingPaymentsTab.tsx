'use client';

import React, { useState } from 'react';
import {
  FileText,
  Wallet,
  Shield,
  ChevronDown,
  ChevronUp,
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Banknote,
} from 'lucide-react';

interface BillingPaymentsTabProps {
  invoices: any[];
  patientDeposits: any[];
  insurancePolicies: any[];
  summary: any;
}

const fmtDate = (v?: string | Date | null) => {
  if (!v) return 'N/A';
  return new Date(v).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const fmtAmount = (v?: number | string | null) => {
  const num = Number(v || 0);
  return `\u20B9${num.toLocaleString('en-IN')}`;
};

const invoiceStatusColor = (status?: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'draft') return 'bg-gray-100 text-gray-600 border-gray-200';
  if (s === 'finalized') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (s === 'paid') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
};

const depositStatusColor = (status?: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'applied') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (s === 'refunded') return 'bg-gray-100 text-gray-600 border-gray-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
};

const claimStatusColor = (status?: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s === 'rejected' || s === 'denied') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (s === 'submitted') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
};

export default function BillingPaymentsTab({
  invoices,
  patientDeposits,
  insurancePolicies,
  summary,
}: BillingPaymentsTabProps) {
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());

  const toggleInvoice = (id: string) => {
    setExpandedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const allClaims = insurancePolicies.flatMap(
    (p: any) =>
      p.claims?.map((c: any) => ({
        ...c,
        policyNumber: p.policy_number,
        providerName: p.provider?.provider_name,
      })) || []
  );

  const totalInvoiced = Number(summary?.totalInvoiceAmount || 0);
  const totalPaid = Number(summary?.totalPaidAmount || 0);
  const balanceDue = Number(summary?.totalBalanceDue || 0);
  const totalDeposits = Number(summary?.totalDeposits || 0);

  return (
    <div className="space-y-8">
      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Total Invoiced
            </span>
            <div className="p-1.5 bg-blue-50 rounded-lg">
              <FileText className="h-3.5 w-3.5 text-blue-500" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900">{fmtAmount(totalInvoiced)}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Total Paid
            </span>
            <div className="p-1.5 bg-emerald-50 rounded-lg">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900">{fmtAmount(totalPaid)}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Balance Due
            </span>
            <div className="p-1.5 bg-rose-50 rounded-lg">
              <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
            </div>
          </div>
          <p className={`text-2xl font-black ${balanceDue > 0 ? 'text-rose-600' : 'text-gray-900'}`}>
            {fmtAmount(balanceDue)}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Total Deposits
            </span>
            <div className="p-1.5 bg-violet-50 rounded-lg">
              <Banknote className="h-3.5 w-3.5 text-violet-500" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900">{fmtAmount(totalDeposits)}</p>
        </div>
      </div>

      {/* INVOICES */}
      <section>
        <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          Invoices
        </h3>
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  {['Invoice #', 'Type', 'Date', 'Net Amount', 'Paid', 'Balance', 'Status', ''].map(
                    (h, i) => (
                      <th
                        key={i}
                        className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12">
                      <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm font-medium">No invoices found</p>
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv: any, iIdx: number) => {
                    const invId = inv.invoice_number || inv.id || String(iIdx);
                    const isExpanded = expandedInvoices.has(invId);
                    const invItems: any[] = inv.items || inv.invoice_items || [];
                    const invPayments: any[] = inv.payments || [];

                    return (
                      <React.Fragment key={invId}>
                        <tr
                          className="hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => toggleInvoice(invId)}
                        >
                          <td className="px-4 py-3 text-gray-800 font-semibold whitespace-nowrap">
                            {inv.invoice_number || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {inv.invoice_type || inv.type || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {fmtDate(inv.invoice_date || inv.created_at)}
                          </td>
                          <td className="px-4 py-3 text-gray-800 font-semibold">
                            {fmtAmount(inv.net_amount)}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {fmtAmount(inv.paid_amount)}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {fmtAmount(inv.balance_due)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${invoiceStatusColor(inv.status)}`}
                            >
                              {inv.status || 'Unknown'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} className="px-4 py-3 bg-gray-50/50">
                              <div className="space-y-4">
                                {/* Invoice Items */}
                                {invItems.length > 0 && (
                                  <div>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                                      Line Items
                                    </p>
                                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="border-b border-gray-200 bg-gray-50/80">
                                            {[
                                              'Department',
                                              'Description',
                                              'Qty',
                                              'Unit Price',
                                              'Net Price',
                                            ].map((h) => (
                                              <th
                                                key={h}
                                                className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                                              >
                                                {h}
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                          {invItems.map((item: any, iiIdx: number) => (
                                            <tr key={iiIdx} className="hover:bg-white">
                                              <td className="px-3 py-2 text-gray-600">
                                                {item.department || 'N/A'}
                                              </td>
                                              <td className="px-3 py-2 text-gray-700">
                                                {item.description || item.item_name || 'N/A'}
                                              </td>
                                              <td className="px-3 py-2 text-gray-600">
                                                {item.quantity ?? item.qty ?? 'N/A'}
                                              </td>
                                              <td className="px-3 py-2 text-gray-600">
                                                {fmtAmount(item.unit_price)}
                                              </td>
                                              <td className="px-3 py-2 text-gray-800 font-semibold">
                                                {fmtAmount(item.net_price || item.total_price)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {/* Payments */}
                                {invPayments.length > 0 && (
                                  <div>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                                      Payments
                                    </p>
                                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="border-b border-gray-200 bg-gray-50/80">
                                            {[
                                              'Receipt #',
                                              'Amount',
                                              'Method',
                                              'Date',
                                              'Status',
                                            ].map((h) => (
                                              <th
                                                key={h}
                                                className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                                              >
                                                {h}
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                          {invPayments.map((pay: any, pIdx: number) => (
                                            <tr key={pIdx} className="hover:bg-white">
                                              <td className="px-3 py-2 text-gray-800 font-semibold">
                                                {pay.receipt_number || 'N/A'}
                                              </td>
                                              <td className="px-3 py-2 text-gray-700">
                                                {fmtAmount(pay.amount)}
                                              </td>
                                              <td className="px-3 py-2 text-gray-600">
                                                {pay.payment_method || pay.method || 'N/A'}
                                              </td>
                                              <td className="px-3 py-2 text-gray-600">
                                                {fmtDate(pay.payment_date || pay.created_at)}
                                              </td>
                                              <td className="px-3 py-2">
                                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                                  {pay.status || 'Completed'}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* DEPOSITS */}
      {patientDeposits.length > 0 && (
        <section>
          <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
            <Wallet className="h-5 w-5 text-violet-600" />
            Deposits
          </h3>
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    {['Deposit #', 'Date', 'Amount', 'Method', 'Status', 'Notes'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {patientDeposits.map((dep: any, dIdx: number) => (
                    <tr key={dep.id || dIdx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-800 font-semibold whitespace-nowrap">
                        {dep.deposit_number || dep.id || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {fmtDate(dep.deposit_date || dep.created_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-semibold">
                        {fmtAmount(dep.amount)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {dep.payment_method || dep.method || 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${depositStatusColor(dep.status)}`}
                        >
                          {dep.status || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                        {dep.notes || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* INSURANCE CLAIMS */}
      {allClaims.length > 0 && (
        <section>
          <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Insurance Claims
          </h3>
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    {[
                      'Claim #',
                      'Policy #',
                      'Provider',
                      'Claimed Amt',
                      'Approved Amt',
                      'Status',
                      'Submitted Date',
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {allClaims.map((claim: any, cIdx: number) => (
                    <tr key={claim.id || cIdx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-800 font-semibold whitespace-nowrap">
                        {claim.claim_number || claim.id || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {claim.policyNumber || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {claim.providerName || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-semibold">
                        {fmtAmount(claim.claimed_amount)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {fmtAmount(claim.approved_amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${claimStatusColor(claim.status)}`}
                        >
                          {claim.status || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {fmtDate(claim.submitted_date || claim.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
