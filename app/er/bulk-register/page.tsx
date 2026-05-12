"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Plus, Trash2, AlertTriangle } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { bulkRegisterER } from "@/app/actions/er-actions";

type Row = {
  patient_name: string;
  age_estimate: string;
  gender: string;
  is_unknown: boolean;
  chief_complaint: string;
  triage_level: string;
};

const empty: Row = {
  patient_name: "",
  age_estimate: "",
  gender: "Unknown",
  is_unknown: true,
  chief_complaint: "",
  triage_level: "",
};

export default function BulkRegisterPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([{ ...empty }, { ...empty }, { ...empty }]);
  const [saving, setSaving] = useState(false);

  const update = (i: number, field: keyof Row, value: any) => {
    const next = [...rows];
    (next[i] as any)[field] = value;
    if (field === "patient_name" && value) next[i].is_unknown = false;
    setRows(next);
  };

  const onSubmit = async () => {
    const valid = rows.filter((r) => r.chief_complaint);
    if (valid.length === 0) {
      alert("At least one row with a chief complaint is required");
      return;
    }
    if (!confirm(`Mass casualty intake: register ${valid.length} patients?`)) return;
    setSaving(true);
    const res = await bulkRegisterER(
      valid.map((r) => ({
        patient_name: r.is_unknown
          ? `Unknown ${r.gender} ${r.age_estimate ? `~${r.age_estimate}` : ""}`.trim()
          : r.patient_name,
        is_unknown: r.is_unknown,
        age_estimate: r.age_estimate || null,
        gender: r.gender || null,
        chief_complaint: r.chief_complaint,
        triage_level: r.triage_level || null,
        brought_by: "Mass Casualty",
      })),
    );
    setSaving(false);
    if (res.success) {
      router.push("/er/dashboard");
    } else {
      alert((res as any).error || "Failed");
    }
  };

  return (
    <AppShell pageTitle="Mass Casualty Intake" pageIcon={<Users className="h-5 w-5" />}>
      <div className="bg-rose-50 border-2 border-rose-200 rounded-xl p-4 mb-4 flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-rose-500" />
        <div className="text-sm text-rose-700">
          Use this form for mass casualty events only. Each row creates a new ER registration.
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 font-bold">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Unknown</th>
              <th className="px-2 py-2 text-left">Name (if known)</th>
              <th className="px-2 py-2 text-left">Age</th>
              <th className="px-2 py-2 text-left">Gender</th>
              <th className="px-2 py-2 text-left">Chief Complaint *</th>
              <th className="px-2 py-2 text-left">Triage</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-2 py-1.5 font-bold text-gray-500">{i + 1}</td>
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={r.is_unknown}
                    onChange={(e) => update(i, "is_unknown", e.target.checked)}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={r.patient_name}
                    onChange={(e) => update(i, "patient_name", e.target.value)}
                    disabled={r.is_unknown}
                    className="w-full px-2 py-1 border border-gray-200 rounded text-xs disabled:bg-gray-50 disabled:text-gray-400"
                    placeholder={r.is_unknown ? "(auto)" : "Name"}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={r.age_estimate}
                    onChange={(e) => update(i, "age_estimate", e.target.value)}
                    className="w-16 px-2 py-1 border border-gray-200 rounded text-xs"
                    placeholder="~30y"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <select
                    value={r.gender}
                    onChange={(e) => update(i, "gender", e.target.value)}
                    className="px-1.5 py-1 border border-gray-200 rounded text-xs"
                  >
                    {["Male", "Female", "Unknown"].map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={r.chief_complaint}
                    onChange={(e) => update(i, "chief_complaint", e.target.value)}
                    className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <select
                    value={r.triage_level}
                    onChange={(e) => update(i, "triage_level", e.target.value)}
                    className="px-1.5 py-1 border border-gray-200 rounded text-xs"
                  >
                    <option value="">—</option>
                    {["1", "2", "3", "4", "5"].map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                    className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-3 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={() => setRows([...rows, { ...empty }])}
            className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
          >
            <Plus className="h-3 w-3" /> Add row
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={saving}
              className="px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
            >
              {saving ? "Registering…" : "Bulk Register"}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
