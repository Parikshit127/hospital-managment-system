"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, AlertTriangle } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { registerERPatient, registerUnknownPatient } from "@/app/actions/er-actions";

export default function ERRegisterPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"known" | "unknown">("known");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    patient_id: "",
    patient_name: "",
    age_estimate: "",
    gender: "Male" as "Male" | "Female" | "Unknown",
    brought_by: "Self",
    arrival_mode: "Walking",
    chief_complaint: "",
    is_mlc: false,
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res =
      mode === "known"
        ? await registerERPatient({
            patient_id: form.patient_id || null,
            patient_name: form.patient_name,
            gender: form.gender,
            brought_by: form.brought_by,
            arrival_mode: form.arrival_mode,
            chief_complaint: form.chief_complaint,
            is_mlc: form.is_mlc,
          })
        : await registerUnknownPatient({
            age_estimate: form.age_estimate || null,
            gender: form.gender,
            brought_by: form.brought_by,
            arrival_mode: form.arrival_mode,
            chief_complaint: form.chief_complaint,
            is_mlc: form.is_mlc,
          });
    setSaving(false);
    if (res.success) {
      const id = (res.data as any).id;
      if (form.is_mlc) {
        router.push(`/er/mlc/${id}`);
      } else {
        router.push(`/er/triage/${id}`);
      }
    } else {
      alert((res as any).error || "Failed");
    }
  };

  return (
    <AppShell pageTitle="ER Registration" pageIcon={<UserPlus className="h-5 w-5" />}>
      <form
        onSubmit={onSubmit}
        className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5 max-w-2xl"
      >
        <div className="flex items-center gap-2">
          {(["known", "unknown"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${
                mode === m
                  ? "bg-rose-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {m} patient
            </button>
          ))}
        </div>

        {mode === "known" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Patient ID (if registered)"
              value={form.patient_id}
              onChange={(v) => setForm({ ...form, patient_id: v })}
            />
            <Field
              required
              label="Patient name"
              value={form.patient_name}
              onChange={(v) => setForm({ ...form, patient_name: v })}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Age estimate"
              value={form.age_estimate}
              onChange={(v) => setForm({ ...form, age_estimate: v })}
              placeholder="e.g. ~30y"
            />
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Select
            label="Gender"
            value={form.gender}
            options={["Male", "Female", "Unknown"]}
            onChange={(v) => setForm({ ...form, gender: v as any })}
          />
          <Select
            label="Brought by"
            value={form.brought_by}
            options={["Self", "Family", "Ambulance", "Police", "Bystander"]}
            onChange={(v) => setForm({ ...form, brought_by: v })}
          />
          <Select
            label="Arrival mode"
            value={form.arrival_mode}
            options={["Walking", "Wheelchair", "Stretcher", "Ambulance"]}
            onChange={(v) => setForm({ ...form, arrival_mode: v })}
          />
        </div>

        <Field
          required
          label="Chief complaint *"
          value={form.chief_complaint}
          onChange={(v) => setForm({ ...form, chief_complaint: v })}
          multiline
        />

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.is_mlc}
            onChange={(e) => setForm({ ...form, is_mlc: e.target.checked })}
            className="rounded border-gray-300"
          />
          <AlertTriangle className="h-4 w-4 text-rose-500" />
          Medico-Legal Case (MLC)
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
          >
            {saving ? "Registering…" : "Register & " + (form.is_mlc ? "MLC" : "Triage")}
          </button>
        </div>
      </form>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
        {label}
      </label>
      {multiline ? (
        <textarea
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
      ) : (
        <input
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
      )}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
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
