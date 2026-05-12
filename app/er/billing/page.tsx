"use client";

import React, { useEffect, useState } from "react";
import { CircleDollarSign, Loader2 } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { getERDashboard } from "@/app/actions/er-actions";

// Lightweight ER billing summary view — full invoicing flows live in /billing.
// This page summarises charges accrued during ER stay (visit fee + orders) and
// flags settlement / advance-deposit status.

const VISIT_BASE_FEE = 500; // simple default — admin should override in module_config

export default function ERBillingPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await getERDashboard();
    if (res.success) setList(res.data?.active ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

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
              </tr>
            </thead>
            <tbody>
              {list.map((r: any) => {
                const ordersCount = Array.isArray(r.er_orders) ? r.er_orders.length : 0;
                const subtotal = VISIT_BASE_FEE + ordersCount * 200;
                return (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-mono text-xs">{r.er_number}</td>
                    <td className="px-4 py-2">{r.patient_name}</td>
                    <td className="px-4 py-2">
                      {r.triage_color ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700">
                          ESI {r.triage_level}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">{VISIT_BASE_FEE}</td>
                    <td className="px-4 py-2 text-right">{ordersCount} × 200</td>
                    <td className="px-4 py-2 text-right font-bold">{subtotal}</td>
                    <td className="px-4 py-2 text-xs font-bold text-amber-700">Open</td>
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
