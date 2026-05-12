"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { getERPatient, transferERtoIP } from "@/app/actions/er-actions";
import { admitPatientIPD, getWardsWithBeds } from "@/app/actions/ipd-actions";

export default function ERTransferPage() {
  const params = useParams<{ erId: string }>();
  const router = useRouter();
  const id = params?.erId as string;
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);
  const [wards, setWards] = useState<any[]>([]);
  const [form, setForm] = useState({
    bed_id: "",
    diagnosis: "",
    doctor_name: "",
    admission_type: "Emergency",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getERPatient(id), getWardsWithBeds()]).then(([p, w]: any[]) => {
      if (p.success) {
        setPatient(p.data);
        setForm((f) => ({ ...f, diagnosis: p.data.chief_complaint }));
      }
      if (Array.isArray(w)) setWards(w as any[]);
      else if (w && Array.isArray((w as any).data)) setWards((w as any).data);
      setLoading(false);
    });
  }, [id]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bed_id) {
      alert("Pick a bed");
      return;
    }
    if (!patient.patient_id) {
      alert("Unknown ER patient — must first be linked to a registered patient before IP admission.");
      return;
    }
    // find ward_id from selected bed
    let selectedWardId: number | null = null;
    for (const w of wards) {
      const b = (w.beds || []).find((x: any) => x.bed_id === form.bed_id);
      if (b) {
        selectedWardId = w.ward_id ?? w.id ?? null;
        break;
      }
    }
    if (!selectedWardId) {
      alert("Could not determine ward for selected bed");
      return;
    }
    setSaving(true);
    const admitRes: any = await admitPatientIPD({
      patient_id: patient.patient_id,
      bed_id: form.bed_id,
      ward_id: selectedWardId,
      diagnosis: form.diagnosis,
      doctor_name: form.doctor_name,
      admission_type: form.admission_type,
    });
    if (!admitRes?.success) {
      setSaving(false);
      alert(admitRes?.error || "Admission failed");
      return;
    }
    const admissionId = admitRes.data?.admission_id || admitRes.admission_id;
    const tres = await transferERtoIP({
      er_registration_id: id,
      admission_id: admissionId,
    });
    setSaving(false);
    if (tres.success) {
      router.push(`/ipd/admission/${admissionId}`);
    } else {
      alert(tres.error || "Transfer failed");
    }
  };

  // Flatten available beds
  const allBeds: any[] = [];
  for (const w of wards) {
    for (const b of w.beds || []) {
      if (b.status === "Available") allBeds.push({ ...b, ward_name: w.ward_name });
    }
  }

  return (
    <AppShell pageTitle="Transfer ER → IP" pageIcon={<ArrowRightLeft className="h-5 w-5" />}>
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !patient ? (
        <div className="py-20 text-center text-sm text-gray-400">ER patient not found.</div>
      ) : (
        <form onSubmit={onSubmit} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 max-w-2xl">
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              {patient.er_number}
            </div>
            <div className="text-lg font-black text-gray-800">{patient.patient_name}</div>
            <div className="text-xs text-gray-500">{patient.chief_complaint}</div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Available Bed *
            </label>
            <select
              required
              value={form.bed_id}
              onChange={(e) => setForm({ ...form, bed_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">Select…</option>
              {allBeds.map((b) => (
                <option key={b.bed_id} value={b.bed_id}>
                  {b.ward_name} · {b.bed_id} ({b.bed_type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Working diagnosis
            </label>
            <input
              value={form.diagnosis}
              onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Admitting doctor
            </label>
            <input
              value={form.doctor_name}
              onChange={(e) => setForm({ ...form, doctor_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          <div className="flex justify-end gap-2">
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
              className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
              {saving ? "Transferring…" : "Admit to IPD"}
            </button>
          </div>
        </form>
      )}
    </AppShell>
  );
}
