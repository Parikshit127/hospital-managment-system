"use client";

import React, { useEffect, useState } from "react";
import { CircleDollarSign, Loader2, Receipt, ExternalLink } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { getERDashboard, generateERInvoice } from "@/app/actions/er-actions";
import { useToast } from "@/app/components/ui/Toast";
import Link from "next/link";

// Lightweight ER billing summary view — full invoicing flows live in /billing.
// This page summarises charges accrued during ER stay (visit fee + orders) and
// flags settlement / advance-deposit status.

const VISIT_BASE_FEE = 500; // simple default — admin should override in module_config

export default function ERBillingPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    const res = await getERDashboard();
    if (res.success) setList(res.data?.active ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleGenerateBill = async (id: string) => {
    setProcessingId(id);
    const res = await generateERInvoice(id);
    if (res.success) {
      toast.success("Invoice generated successfully!");
      load(); // refresh to show invoice link
    } else {
      toast.error(res.error || "Failed to generate invoice");
    }
    setProcessingId(null);
  };

  return (
    <AppShell
      pageTitle="ER Billing"
      pageIcon={<CircleDollarSign className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
    >
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : list.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl py-16 text-center text-sm text-gray-400">
          No active ER patients to bill.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
              <tr>
                <th className="text-left px-4 py-2">ER #</th>
                <th className="text-left px-4 py-2">Patient</th>
                <th className="text-left px-4 py-2">Triage</th>
                <th className="text-right px-4 py-2">Visit Fee</th>
                <th className="text-right px-4 py-2">Orders</th>
                <th className="text-right px-4 py-2">Subtotal</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r: any) => {
                const ordersCount = Array.isArray(r.orders) ? r.orders.length : 0;
                const subtotal = VISIT_BASE_FEE + ordersCount * 150; // matched with action logic
                return (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 font-mono text-xs">{r.er_number}</td>
                    <td className="px-4 py-2">
                      <div className="font-bold text-gray-800">{r.patient_name}</div>
                      {r.patient_id && <div className="text-[10px] text-gray-400">{r.patient_id}</div>}
                    </td>
                    <td className="px-4 py-2">
                      {r.triage_color ? (
                        <span 
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border"
                          style={{ backgroundColor: `${r.triage_color}15`, color: r.triage_color, borderColor: `${r.triage_color}30` }}
                        >
                          ESI {r.triage_level}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">₹{VISIT_BASE_FEE}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{ordersCount} × ₹150</td>
                    <td className="px-4 py-2 text-right font-black text-gray-900">₹{subtotal}</td>
                    <td className="px-4 py-2">
                      {r.invoice_id ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
                          Billed
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">
                          Open
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.invoice_id ? (
                        <Link
                          href={`/finance/invoices/${r.invoice_id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition-all"
                        >
                          <ExternalLink className="h-3 w-3" /> View Bill
                        </Link>
                      ) : (
                        <button
                          onClick={() => handleGenerateBill(r.id)}
                          disabled={processingId === r.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-all"
                        >
                          {processingId === r.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Receipt className="h-3 w-3" />
                          )}
                          Generate Bill
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-3 text-[10px] text-gray-500 bg-gray-50 border-t border-gray-100">
            Visit-fee and per-order rate are placeholders until OPD module_config tariffs are wired
            into ER. Final settlement happens through /finance/invoices on disposition.
          </div>
        </div>
      )}
    </AppShell>
  );
}
