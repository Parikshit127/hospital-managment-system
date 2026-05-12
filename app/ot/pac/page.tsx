"use client";

import React, { useEffect, useState } from "react";
import { HeartPulse, Loader2, Save } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { listSurgeryRequests, savePACClearance } from "@/app/actions/ot-actions";

export default function PACPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    anesthetist_name: "",
    asa_grade: "ASA I",
    anesthesia_type: "General",
    fitness_status: "Pending" as "Pending" | "Fit" | "Unfit" | "ConditionallyFit",
    conditions: "",
    notes: "",
    mallampati: "I",
    thyromental: "Normal",
    neck_mobility: "Full",
    labs_required: "",
    ecg_required: false,
    cxr_required: false,
  });

  const loadRequests = async () => {
    setLoading(true);
    const res = await listSurgeryRequests();
    if (res.success) {
      // Show requests pending or needing PAC
      const filtered = res.data.filter((r: any) =>
        ["Approved", "Scheduled", "PAC_Pending"].includes(r.status),
      );
      setRequests(filtered);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    if (selectedId) {
      const r = requests.find((x) => x.id === selectedId);
      if (r?.pac) {
        setForm({
          anesthetist_name: r.pac.anesthetist_name ?? "",
          asa_grade: r.pac.asa_grade ?? "ASA I",
          anesthesia_type: r.pac.anesthesia_type ?? "General",
          fitness_status: r.pac.fitness_status ?? "Pending",
          conditions: r.pac.conditions ?? "",
          notes: r.pac.notes ?? "",
          mallampati: (r.pac.airway_assessment as any)?.mallampati ?? "I",
          thyromental: (r.pac.airway_assessment as any)?.thyromental ?? "Normal",
          neck_mobility: (r.pac.airway_assessment as any)?.neck_mobility ?? "Full",
          labs_required: (r.pac.pre_op_investigations as any)?.labs ?? "",
          ecg_required: (r.pac.pre_op_investigations as any)?.ecg ?? false,
          cxr_required: (r.pac.pre_op_investigations as any)?.cxr ?? false,
        });
      }
    }
  }, [selectedId, requests]);

  const onSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    const res = await savePACClearance({
      surgery_request_id: selectedId,
      anesthetist_name: form.anesthetist_name,
      asa_grade: form.asa_grade,
      anesthesia_type: form.anesthesia_type,
      fitness_status: form.fitness_status,
      conditions: form.conditions || null,
      notes: form.notes || null,
      airway_assessment: {
        mallampati: form.mallampati,
        thyromental: form.thyromental,
        neck_mobility: form.neck_mobility,
      },
      pre_op_investigations: {
        labs: form.labs_required,
        ecg: form.ecg_required,
        cxr: form.cxr_required,
      },
    });
    setSaving(false);
    if (res.success) {
      alert("PAC clearance saved");
      loadRequests();
    } else {
      alert(res.error || "Save failed");
    }
  };

  return (
    <AppShell pageTitle="PAC Clearance" pageIcon={<HeartPulse className="h-5 w-5" />}>
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-4 max-h-[70vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Pending PAC</h3>
            {requests.length === 0 ? (
              <div className="text-xs text-gray-400">No surgeries awaiting PAC.</div>
            ) : (
              <div className="space-y-1">
                {requests.map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`block w-full text-left px-3 py-2 rounded text-xs ${
                      selectedId === r.id
                        ? "bg-blue-50 border border-blue-200"
                        : "hover:bg-gray-50 border border-transparent"
                    }`}
                  >
                    <div className="font-bold text-gray-700">{r.surgery_name}</div>
                    <div className="text-gray-400 font-mono">
                      {r.request_number} · {r.patient_id}
                    </div>
                    <div className="mt-1 text-[10px] font-bold text-gray-500">
                      {r.pac ? `PAC: ${r.pac.fitness_status}` : "PAC: not started"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
            {!selectedId ? (
              <div className="text-center py-20 text-sm text-gray-400">
                Select a surgery from the list to begin PAC.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field
                    label="Anesthetist Name"
                    value={form.anesthetist_name}
                    onChange={(v) => setForm({ ...form, anesthetist_name: v })}
                  />
                  <Select
                    label="ASA Grade"
                    value={form.asa_grade}
                    onChange={(v) => setForm({ ...form, asa_grade: v })}
                    options={["ASA I", "ASA II", "ASA III", "ASA IV", "ASA V", "ASA VI"]}
                  />
                  <Select
                    label="Anesthesia Type"
                    value={form.anesthesia_type}
                    onChange={(v) => setForm({ ...form, anesthesia_type: v })}
                    options={["General", "Spinal", "Epidural", "Local", "Regional"]}
                  />
                  <Select
                    label="Fitness"
                    value={form.fitness_status}
                    onChange={(v) => setForm({ ...form, fitness_status: v as any })}
                    options={["Pending", "Fit", "Unfit", "ConditionallyFit"]}
                  />
                </div>

                <div>
                  <h4 className="text-xs font-bold text-gray-600 mb-2">Airway Assessment</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <Select
                      label="Mallampati"
                      value={form.mallampati}
                      onChange={(v) => setForm({ ...form, mallampati: v })}
                      options={["I", "II", "III", "IV"]}
                    />
                    <Select
                      label="Thyromental"
                      value={form.thyromental}
                      onChange={(v) => setForm({ ...form, thyromental: v })}
                      options={["Normal", "Reduced"]}
                    />
                    <Select
                      label="Neck Mobility"
                      value={form.neck_mobility}
                      onChange={(v) => setForm({ ...form, neck_mobility: v })}
                      options={["Full", "Restricted"]}
                    />
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-gray-600 mb-2">Pre-Op Investigations</h4>
                  <Field
                    label="Labs required"
                    value={form.labs_required}
                    onChange={(v) => setForm({ ...form, labs_required: v })}
                  />
                  <div className="flex gap-4 mt-2">
                    <Check
                      label="ECG required"
                      checked={form.ecg_required}
                      onChange={(v) => setForm({ ...form, ecg_required: v })}
                    />
                    <Check
                      label="Chest X-ray required"
                      checked={form.cxr_required}
                      onChange={(v) => setForm({ ...form, cxr_required: v })}
                    />
                  </div>
                </div>

                <Field
                  label="Conditions (if conditionally fit)"
                  value={form.conditions}
                  onChange={(v) => setForm({ ...form, conditions: v })}
                />
                <Field
                  label="Notes"
                  value={form.notes}
                  onChange={(v) => setForm({ ...form, notes: v })}
                  multiline
                />

                <div className="flex justify-end">
                  <button
                    onClick={onSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save PAC"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-gray-300"
      />
      {label}
    </label>
  );
}
