"use client";

import React from "react";
import { useEffect, useState } from "react";
import { BookOpen, Building2, ChevronDown, ChevronRight, Loader2, TrendingDown } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { getVendors, getExpenses } from "@/app/actions/expense-actions";

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

const STATUS_BADGE: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-700",
  Approved: "bg-blue-100 text-blue-700",
  Paid: "bg-emerald-100 text-emerald-700",
  Rejected: "bg-red-100 text-red-700",
};

export default function VendorLedgerPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedVendor, setSelectedVendor] = useState<number | "all">("all");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [vRes, eRes] = await Promise.all([
      getVendors(false), // all vendors including inactive
      getExpenses({ limit: 500 }),
    ]);
    if (vRes.success) setVendors(vRes.data);
    if (eRes.success) setExpenses(eRes.data);
    setLoading(false);
  }

  // Group expenses by vendor
  const expensesByVendor = expenses.reduce((acc: Record<string, any[]>, e: any) => {
    const key = e.vendor_id ? String(e.vendor_id) : "__none__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  const vendorRows = vendors.map((v: any) => {
    const exps = expensesByVendor[String(v.id)] ?? [];
    const totalBilled = exps.reduce((s: number, e: any) => s + Number(e.total_amount ?? 0), 0);
    const totalPaid = exps
      .filter((e: any) => e.status === "Paid")
      .reduce((s: number, e: any) => s + Number(e.total_amount ?? 0), 0);
    const outstanding = totalBilled - totalPaid;
    return { ...v, exps, totalBilled, totalPaid, outstanding };
  });

  const filteredRows =
    selectedVendor === "all"
      ? vendorRows
      : vendorRows.filter((v) => v.id === selectedVendor);

  const grandTotal = filteredRows.reduce(
    (acc, v) => ({
      billed: acc.billed + v.totalBilled,
      paid: acc.paid + v.totalPaid,
      outstanding: acc.outstanding + v.outstanding,
    }),
    { billed: 0, paid: 0, outstanding: 0 },
  );

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <AppShell
      pageTitle="Vendor Ledger"
      pageIcon={<BookOpen className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
    >
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Total Billed
              </div>
              <div className="text-2xl font-black text-gray-800">{fmt(grandTotal.billed)}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Total Paid
              </div>
              <div className="text-2xl font-black text-emerald-700">{fmt(grandTotal.paid)}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Outstanding
              </div>
              <div className="text-2xl font-black text-amber-700">{fmt(grandTotal.outstanding)}</div>
            </div>
          </div>

          {/* Vendor filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Vendor:</span>
            <select
              value={selectedVendor}
              onChange={(e) =>
                setSelectedVendor(e.target.value === "all" ? "all" : Number(e.target.value))
              }
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Vendors</option>
              {vendors.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.vendor_name} ({v.vendor_code})
                </option>
              ))}
            </select>
          </div>

          {/* Ledger table */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                <tr>
                  <th className="text-left px-4 py-2 w-6"></th>
                  <th className="text-left px-4 py-2">Vendor</th>
                  <th className="text-left px-4 py-2">Code</th>
                  <th className="text-right px-4 py-2">Expenses</th>
                  <th className="text-right px-4 py-2">Total Billed</th>
                  <th className="text-right px-4 py-2">Paid</th>
                  <th className="text-right px-4 py-2">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                      No vendor data found.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((v) => (
                    <React.Fragment key={v.id}>
                      {/* Vendor summary row */}
                      <tr
                        className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleExpand(v.id)}
                      >
                        <td className="px-4 py-3 text-gray-400">
                          {v.exps.length > 0 ? (
                            expanded.has(v.id) ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-emerald-50 rounded-lg flex items-center justify-center">
                              <Building2 className="h-3.5 w-3.5 text-emerald-600" />
                            </div>
                            <div>
                              <div className="font-semibold text-gray-800">{v.vendor_name}</div>
                              {v.contact_person && (
                                <div className="text-[11px] text-gray-400">{v.contact_person}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{v.vendor_code}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{v.exps.length}</td>
                        <td className="px-4 py-3 text-right font-semibold">{fmt(v.totalBilled)}</td>
                        <td className="px-4 py-3 text-right text-emerald-700 font-semibold">
                          {fmt(v.totalPaid)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold">
                          <span
                            className={
                              v.outstanding > 0 ? "text-amber-700" : "text-gray-400"
                            }
                          >
                            {fmt(v.outstanding)}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded expense rows */}
                      {expanded.has(v.id) &&
                        v.exps.map((e: any) => (
                          <tr
                            key={e.id}
                            className="border-t border-gray-50 bg-gray-50/60 text-xs"
                          >
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 pl-10 text-gray-600" colSpan={2}>
                              <div className="font-mono text-[10px] text-gray-400">
                                {e.expense_number}
                              </div>
                              <div className="text-gray-700">{e.description}</div>
                              <div className="text-[10px] text-gray-400">
                                {e.category?.name} ·{" "}
                                {e.payment_date
                                  ? new Date(e.payment_date).toLocaleDateString("en-IN")
                                  : new Date(e.created_at).toLocaleDateString("en-IN")}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${STATUS_BADGE[e.status] ?? "bg-gray-100 text-gray-600"}`}
                              >
                                {e.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-gray-700">
                              {fmt(Number(e.total_amount))}
                            </td>
                            <td className="px-4 py-2 text-right text-emerald-700">
                              {e.status === "Paid" ? fmt(Number(e.total_amount)) : "—"}
                            </td>
                            <td className="px-4 py-2 text-right text-amber-700">
                              {e.status !== "Paid" && e.status !== "Rejected"
                                ? fmt(Number(e.total_amount))
                                : "—"}
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  ))
                )}
              </tbody>
              {filteredRows.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wider">
                      Grand Total
                    </td>
                    <td className="px-4 py-2 text-right font-black text-gray-800">
                      {fmt(grandTotal.billed)}
                    </td>
                    <td className="px-4 py-2 text-right font-black text-emerald-700">
                      {fmt(grandTotal.paid)}
                    </td>
                    <td className="px-4 py-2 text-right font-black text-amber-700">
                      {fmt(grandTotal.outstanding)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
