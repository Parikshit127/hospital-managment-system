"use client";

import React, { useEffect, useState } from "react";
import { CircleDollarSign, Loader2, Pencil, ReceiptText, X } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import {
  listSurgeryRequests,
  generateSurgeryBill,
  postSurgeryChargesToIPD,
  updateSurgeryBillFees,
} from "@/app/actions/ot-actions";

const fmt = (val: any) =>
  val === null || val === undefined ? "—" : `₹${Number(val).toLocaleString("en-IN")}`;

type FeeForm = {
  surgeon_fee: string;
  anesthesia_fee: string;
  ot_charges: string;
};

export default function OTBillingPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feeForm, setFeeForm] = useState<FeeForm>({ surgeon_fee: "0", anesthesia_fee: "0", ot_charges: "0" });
  const [saving, setSaving] = useState(false);

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

  const openEdit = (r: any) => {
    setFeeForm({
      surgeon_fee: String(r.billing?.surgeon_fee ?? 0),
      anesthesia_fee: String(r.billing?.anesthesia_fee ?? 0),
      ot_charges: String(r.billing?.ot_charges ?? 0),
    });
    setEditingId(r.id);
  };

  const handleSaveFees = async () => {
    if (!editingId) return;
    setSaving(true);
    const res = await updateSurgeryBillFees(editingId, {
      surgeon_fee: Number(feeForm.surgeon_fee) || 0,
      anesthesia_fee: Number(feeForm.anesthesia_fee) || 0,
      ot_charges: Number(feeForm.ot_charges) || 0,
    });
    setSaving(false);
    if (res.success) {
      setEditingId(null);
      load();
    } else {
      alert(res.error || "Failed to save fees");
    }
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
                  <td className="px-4 py-2 text-right">{fmt(r.billing?.surgeon_fee)}</td>
                  <td className="px-4 py-2 text-right">{fmt(r.billing?.anesthesia_fee)}</td>
                  <td className="px-4 py-2 text-right">{fmt(r.billing?.ot_charges)}</td>
                  <td className="px-4 py-2 text-right">{fmt(r.billing?.consumable_total)}</td>
                  <td className="px-4 py-2 text-right">{fmt(r.billing?.implant_total)}</td>
                  <td className="px-4 py-2 text-right font-bold">
                    {fmt(r.billing?.total_amount)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      {/* Edit fees manually if no surgery master linked */}
                      <button
                        onClick={() => openEdit(r)}
                        className="px-2.5 py-1 bg-gray-50 text-gray-600 text-[11px] font-bold rounded hover:bg-gray-100 flex items-center gap-1"
                        title="Edit fees"
                      >
                        <Pencil className="h-3 w-3" /> Edit Fees
                      </button>
                      <button
                        onClick={() => handleGenerate(r.id)}
                        className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[11px] font-bold rounded hover:bg-blue-100 flex items-center gap-1"
                      >
                        <ReceiptText className="h-3 w-3" />
                        {r.billing ? "Re-generate" : "Gen Bill"}
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

      {/* Edit Fees Modal */}
      {editingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-800">Edit Surgery Fees</h2>
              <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              {(["surgeon_fee", "anesthesia_fee", "ot_charges"] as const).map((field) => (
                <div key={field}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 capitalize">
                    {field.replace("_", " ").replace("fee", "Fee").replace("charges", "Charges")} (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={feeForm[field]}
                    onChange={(e) => setFeeForm({ ...feeForm, [field]: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
              <div className="pt-1 text-xs text-gray-400">
                Total: ₹{(
                  (Number(feeForm.surgeon_fee) || 0) +
                  (Number(feeForm.anesthesia_fee) || 0) +
                  (Number(feeForm.ot_charges) || 0)
                ).toLocaleString("en-IN")}
                {" "}(+ consumables & implants)
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setEditingId(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFees}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                Save Fees
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
