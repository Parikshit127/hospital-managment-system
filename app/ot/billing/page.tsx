"use client";

import React, { useEffect, useState } from "react";
import { CircleDollarSign, Loader2, ReceiptText } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import {
  listSurgeryRequests,
  generateSurgeryBill,
  postSurgeryChargesToIPD,
} from "@/app/actions/ot-actions";

export default function OTBillingPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await listSurgeryRequests();
    if (res.success) {
      const filtered = res.data.filter((r: any) =>
        ["Completed", "InProgress"].includes(r.status),
      );
      setRequests(filtered);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleGenerate = async (id: string) => {
    const res = await generateSurgeryBill(id);
    if (res.success) load();
    else alert(res.error || "Failed");
  };

  const handlePost = async (id: string) => {
    const res = await postSurgeryChargesToIPD(id);
    if (res.success) load();
    else alert(res.error || "Failed");
  };

  return (
    <AppShell
      pageTitle="OT Billing"
      pageIcon={<CircleDollarSign className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
    >
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl py-16 text-center text-sm text-gray-400">
          No completed surgeries to bill.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
              <tr>
                <th className="text-left px-4 py-2">Request</th>
                <th className="text-left px-4 py-2">Patient</th>
                <th className="text-left px-4 py-2">Surgery</th>
                <th className="text-right px-4 py-2">Surgeon</th>
                <th className="text-right px-4 py-2">Anesthesia</th>
                <th className="text-right px-4 py-2">OT</th>
                <th className="text-right px-4 py-2">Consum.</th>
                <th className="text-right px-4 py-2">Implants</th>
                <th className="text-right px-4 py-2">Total</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r: any) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs">{r.request_number}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.patient_id}</td>
                  <td className="px-4 py-2">{r.surgery_name}</td>
                  <td className="px-4 py-2 text-right">{r.billing?.surgeon_fee ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{r.billing?.anesthesia_fee ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{r.billing?.ot_charges ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{r.billing?.consumable_total ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{r.billing?.implant_total ?? "—"}</td>
                  <td className="px-4 py-2 text-right font-bold">
                    {r.billing?.total_amount ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => handleGenerate(r.id)}
                        className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[11px] font-bold rounded hover:bg-blue-100 flex items-center gap-1"
                      >
                        <ReceiptText className="h-3 w-3" /> Gen Bill
                      </button>
                      {r.admission_id && r.billing && !r.billing.posted_to_ipd && (
                        <button
                          onClick={() => handlePost(r.id)}
                          className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded hover:bg-emerald-100"
                        >
                          Post to IPD
                        </button>
                      )}
                      {r.billing?.posted_to_ipd && (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded">
                          Posted
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
