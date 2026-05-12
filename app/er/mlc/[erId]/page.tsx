"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Save, Shield } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { createMLCRecord, getERPatient, markPoliceInformed } from "@/app/actions/er-actions";

export default function MLCRegistrationPage() {
  const params = useParams<{ erId: string }>();
  const router = useRouter();
  const id = params?.erId as string;
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    case_type: "RTA",
    police_station: "",
    fir_number: "",
    io_name: "",
    io_contact: "",
    brought_by_name: "",
    brought_by_relation: "",
    brought_by_id_proof: "",
    injury_description: "",
    injury_time: "",
    alcohol_involved: false,
  });

  const load = async () => {
    const r = await getERPatient(id);
    if (r.success) {
      setPatient(r.data);
      if (r.data.mlc_record) {
        const m = r.data.mlc_record;
        setForm({
          case_type: m.case_type ?? "RTA",
          police_station: m.police_station ?? "",
          fir_number: m.fir_number ?? "",
          io_name: m.io_name ?? "",
          io_contact: m.io_contact ?? "",
          brought_by_name: m.brought_by_name ?? "",
          brought_by_relation: m.brought_by_relation ?? "",
          brought_by_id_proof: m.brought_by_id_proof ?? "",
          injury_description: m.injury_description ?? "",
          injury_time: m.injury_time ? new Date(m.injury_time).toISOString().slice(0, 16) : "",
          alcohol_involved: !!m.alcohol_involved,
        });
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await createMLCRecord({
      er_registration_id: id,
      case_type: form.case_type,
      police_station: form.police_station || null,
      fir_number: form.fir_number || null,
      io_name: form.io_name || null,
      io_contact: form.io_contact || null,
      brought_by_name: form.brought_by_name || null,
      brought_by_relation: form.brought_by_relation || null,
      brought_by_id_proof: form.brought_by_id_proof || null,
      injury_description: form.injury_description || null,
      injury_time: form.injury_time || null,
      alcohol_involved: form.alcohol_involved,
    });
    setSaving(false);
    if (res.success) {
      alert("MLC saved");
      load();
    } else {
      alert(res.error || "Failed");
    }
  };

  const onInformPolice = async () => {
    if (!patient?.mlc_record?.id) return;
    const res = await markPoliceInformed(patient.mlc_record.id);
    if (res.success) load();
    else alert(res.error || "Failed");
  };

  return (
    <AppShell pageTitle="Medico-Legal Case" pageIcon={<AlertTriangle className="h-5 w-5" />}>
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !patient ? (
        <div className="py-20 text-center text-sm text-gray-400">ER patient not found.</div>
      ) : (
        <div className="space-y-5 max-w-3xl">
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              {patient.er_number}
            </div>
            <div className="text-lg font-black text-gray-800">{patient.patient_name}</div>
            <div className="text-xs text-gray-500">{patient.chief_complaint}</div>
            {patient.mlc_record && (
              <div className="mt-3 flex items-center gap-3">
                <div className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-1 rounded">
                  MLC #{patient.mlc_record.mlc_number}
                </div>
                {patient.mlc_record.police_informed ? (
                  <div className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                    <Shield className="h-3 w-3" /> Police informed
                  </div>
                ) : (
                  <button
                    onClick={onInformPolice}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    Mark police informed →
                  </button>
                )}
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
            <Select
              label="Case type"
              value={form.case_type}
              options={[
                "RTA",
                "Assault",
                "Poisoning",
                "Burns",
                "Suicide Attempt",
                "Snake Bite",
                "Dog Bite",
                "Industrial",
                "Other",
              ]}
              onChange={(v) => setForm({ ...form, case_type: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Police station" value={form.police_station} onChange={(v) => setForm({ ...form, police_station: v })} />
              <Field label="FIR number" value={form.fir_number} onChange={(v) => setForm({ ...form, fir_number: v })} />
              <Field label="Investigating Officer (name)" value={form.io_name} onChange={(v) => setForm({ ...form, io_name: v })} />
              <Field label="IO contact" value={form.io_contact} onChange={(v) => setForm({ ...form, io_contact: v })} />
            </div>

            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mt-3">Brought-by</h4>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Name" value={form.brought_by_name} onChange={(v) => setForm({ ...form, brought_by_name: v })} />
              <Field label="Relation" value={form.brought_by_relation} onChange={(v) => setForm({ ...form, brought_by_relation: v })} />
              <Field label="ID proof" value={form.brought_by_id_proof} onChange={(v) => setForm({ ...form, brought_by_id_proof: v })} />
            </div>

            <Field
              label="Injury description"
              value={form.injury_description}
              onChange={(v) => setForm({ ...form, injury_description: v })}
              multiline
            />
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Injury time
              </label>
              <input
                type="datetime-local"
                value={form.injury_time}
                onChange={(e) => setForm({ ...form, injury_time: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.alcohol_involved}
                onChange={(e) => setForm({ ...form, alcohol_involved: e.target.checked })}
                className="rounded border-gray-300"
              />
              Alcohol / substance involved
            </label>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => router.push(`/er/triage/${id}`)}
                className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Skip → Triage
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save MLC"}
              </button>
            </div>
          </form>
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
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
