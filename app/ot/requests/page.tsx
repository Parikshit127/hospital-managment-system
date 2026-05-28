"use client";

import React, { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ClipboardList, Loader2, Plus, Check, X, ArrowRight } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import {
  listSurgeryRequests,
  approveSurgeryRequest,
  rejectSurgeryRequest,
  createSurgeryRequest,
  listSurgeryMasters,
} from "@/app/actions/ot-actions";
import { searchPatientsForAdmission } from "@/app/actions/ipd-actions";
import { searchDoctorsForIPD } from "@/app/actions/ipd-billing-helpers";

type Req = {
  id: string;
  request_number: string;
  patient_id: string;
  surgery_name: string;
  surgery_category: string | null;
  urgency: string;
  status: string;
  diagnosis: string | null;
  clinical_notes: string | null;
  requesting_doctor_id: string;
  approved_by: string | null;
  created_at: string;
};

function SurgeryRequestsInner() {
  const searchParams = useSearchParams();
  const [requests, setRequests] = useState<Req[]>([]);
  const [filter, setFilter] = useState<string>("Requested");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(searchParams.get("create") === "1");
  const [createError, setCreateError] = useState<string>("");
  const [masters, setMasters] = useState<any[]>([]);
  const [form, setForm] = useState({
    patient_id: "",
    patient_label: "",
    requesting_doctor_id: "",
    doctor_label: "",
    surgery_master_id: "",
    surgery_name: "",
    surgery_category: "",
    urgency: "Elective" as "Elective" | "Urgent" | "Emergency",
    diagnosis: "",
    clinical_notes: "",
  });

  const load = async () => {
    setLoading(true);
    const res = await listSurgeryRequests(filter === "All" ? undefined : { status: filter });
    if (res.success) setRequests(res.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [filter]);

  useEffect(() => {
    listSurgeryMasters().then((r) => r.success && setMasters(r.data));
  }, []);

  const resetForm = () =>
    setForm({
      patient_id: "",
      patient_label: "",
      requesting_doctor_id: "",
      doctor_label: "",
      surgery_master_id: "",
      surgery_name: "",
      surgery_category: "",
      urgency: "Elective",
      diagnosis: "",
      clinical_notes: "",
    });

  const closeCreate = () => {
    setShowCreate(false);
    setCreateError("");
    resetForm();
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    if (!form.patient_id || !form.surgery_name || !form.requesting_doctor_id) {
      setCreateError("Patient, doctor and surgery name are required.");
      return;
    }
    const res = await createSurgeryRequest({
      patient_id: form.patient_id,
      requesting_doctor_id: form.requesting_doctor_id,
      surgery_master_id: form.surgery_master_id || null,
      surgery_name: form.surgery_name,
      surgery_category: form.surgery_category || null,
      urgency: form.urgency,
      diagnosis: form.diagnosis || null,
      clinical_notes: form.clinical_notes || null,
    });
    if (res.success) {
      closeCreate();
      load();
    } else {
      setCreateError(res.error || "Failed to create surgery request.");
    }
  };

  return (
    <AppShell
      pageTitle="Surgery Requests"
      pageIcon={<ClipboardList className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
      headerActions={
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" /> New Request
        </button>
      }
    >
      <div className="flex items-center gap-2 mb-4">
        {["Requested", "Approved", "Scheduled", "PAC_Cleared", "Completed", "Cancelled", "All"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              filter === s
                ? "bg-blue-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : requests.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No surgery requests.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
              <tr>
                <th className="text-left px-4 py-2">Request #</th>
                <th className="text-left px-4 py-2">Patient</th>
                <th className="text-left px-4 py-2">Surgery</th>
                <th className="text-left px-4 py-2">Urgency</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs">{r.request_number}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.patient_id}</td>
                  <td className="px-4 py-2">
                    {r.surgery_name}
                    {r.surgery_category ? (
                      <span className="text-[10px] text-gray-400 ml-2">{r.surgery_category}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        r.urgency === "Emergency"
                          ? "bg-rose-100 text-rose-700"
                          : r.urgency === "Urgent"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {r.urgency}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs font-bold">{r.status}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {r.status === "Requested" && (
                        <>
                          <button
                            onClick={async () => {
                              const name = prompt("Approver name?");
                              if (!name) return;
                              await approveSurgeryRequest(r.id, name);
                              load();
                            }}
                            className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded"
                            title="Approve"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              const reason = prompt("Rejection reason?");
                              if (!reason) return;
                              await rejectSurgeryRequest(r.id, reason);
                              load();
                            }}
                            className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded"
                            title="Reject"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      {r.status === "Approved" && (
                        <Link
                          href={`/ot/schedule?id=${r.id}`}
                          className="px-2 py-1 bg-blue-600 text-white text-[10px] font-bold rounded hover:bg-blue-700 flex items-center gap-1"
                        >
                          Schedule <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                      <Link
                        href={`/ot/notes/${r.id}`}
                        className="p-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 rounded text-[10px] font-bold"
                      >
                        Notes
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={closeCreate}
        >
          <form
            onSubmit={onCreate}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-3"
          >
            <h3 className="text-lg font-black text-gray-800">New Surgery Request</h3>

            {createError && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-xs text-rose-700">
                {createError}
              </div>
            )}

            <SearchPicker
              label="Patient *"
              placeholder="Search by name, UHID, or phone..."
              selectedLabel={form.patient_label}
              onPick={(value, display) => setForm({ ...form, patient_id: value, patient_label: display })}
              onClear={() => setForm({ ...form, patient_id: "", patient_label: "" })}
              fetcher={async (q) => {
                const r = await searchPatientsForAdmission(q);
                if (!r.success) return [];
                return (r.data as any[]).map((p) => ({
                  value: p.patient_id,
                  display: `${p.full_name}`,
                  sub: `${p.patient_id} · ${p.phone || '—'}`,
                }));
              }}
            />

            <SearchPicker
              label="Requesting Doctor *"
              placeholder="Search by doctor name or specialty..."
              selectedLabel={form.doctor_label}
              onPick={(value, display) => setForm({ ...form, requesting_doctor_id: value, doctor_label: display })}
              onClear={() => setForm({ ...form, requesting_doctor_id: "", doctor_label: "" })}
              fetcher={async (q) => {
                const r = await searchDoctorsForIPD(q, 10);
                if (!r.success) return [];
                return (r.data as any[]).map((d) => ({
                  value: d.id,
                  display: d.name,
                  sub: d.specialty || d.username || '',
                }));
              }}
            />
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Surgery (from master)
              </label>
              <select
                value={form.surgery_master_id}
                onChange={(e) => {
                  const m = masters.find((x) => x.id === e.target.value);
                  setForm({
                    ...form,
                    surgery_master_id: e.target.value,
                    surgery_name: m?.surgery_name ?? form.surgery_name,
                    surgery_category: m?.category ?? form.surgery_category,
                  });
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">— Custom —</option>
                {masters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.surgery_code} · {m.surgery_name}
                  </option>
                ))}
              </select>
            </div>
            <Field
              label="Surgery name *"
              value={form.surgery_name}
              onChange={(v) => setForm({ ...form, surgery_name: v })}
            />
            <Field
              label="Category"
              value={form.surgery_category}
              onChange={(v) => setForm({ ...form, surgery_category: v })}
            />
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Urgency
              </label>
              <select
                value={form.urgency}
                onChange={(e) => setForm({ ...form, urgency: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="Elective">Elective</option>
                <option value="Urgent">Urgent</option>
                <option value="Emergency">Emergency</option>
              </select>
            </div>
            <Field label="Diagnosis" value={form.diagnosis} onChange={(v) => setForm({ ...form, diagnosis: v })} />
            <Field
              label="Clinical notes"
              value={form.clinical_notes}
              onChange={(v) => setForm({ ...form, clinical_notes: v })}
              multiline
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeCreate}
                className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Create Request
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

function SearchPicker({
  label,
  placeholder,
  selectedLabel,
  onPick,
  onClear,
  fetcher,
}: {
  label: string;
  placeholder: string;
  selectedLabel: string;
  onPick: (value: string, display: string) => void;
  onClear: () => void;
  fetcher: (query: string) => Promise<Array<{ value: string; display: string; sub?: string }>>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ value: string; display: string; sub?: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string>("");

  // Keep latest fetcher in a ref so the search effect doesn't re-fire when
  // the parent re-renders (inline arrow fetchers get a new identity each
  // render — without this, typing during any parent state change would
  // restart the debounce and the dropdown could appear stuck on "Searching…").
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    setErr("");
    if (!open || query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetcherRef.current(query.trim());
        if (cancelled) return;
        setResults(Array.isArray(r) ? r : []);
      } catch (e: any) {
        if (cancelled) return;
        setResults([]);
        setErr(e?.message || "Search failed");
        console.error("[SearchPicker] fetcher error:", e);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open]); // Intentionally NOT [fetcher] — see ref above

  if (selectedLabel) {
    return (
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</label>
        <div className="flex items-center gap-2 px-3 py-2 border border-emerald-200 bg-emerald-50 rounded-lg">
          <span className="text-sm font-medium text-emerald-800 flex-1">{selectedLabel}</span>
          <button type="button" onClick={onClear} className="text-emerald-700 hover:text-emerald-900 text-xs font-bold">
            ✕ Change
          </button>
        </div>
      </div>
    );
  }

  const trimmedLen = query.trim().length;

  return (
    <div className="relative">
      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</label>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 250)}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none"
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          {trimmedLen < 2 ? (
            <div className="px-3 py-3 text-xs text-gray-400">
              Type at least 2 characters to search…
            </div>
          ) : searching ? (
            <div className="px-3 py-3 text-xs text-gray-500 flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching for &quot;{query.trim()}&quot;…
            </div>
          ) : err ? (
            <div className="px-3 py-3 text-xs text-rose-600">
              Search failed: {err}. Check your network / login and try again.
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-400">
              No matches for &quot;{query.trim()}&quot;.
            </div>
          ) : (
            results.map((r) => (
              <button
                key={r.value}
                type="button"
                onMouseDown={(e) => {
                  // onMouseDown fires BEFORE input's onBlur — preserves selection
                  e.preventDefault();
                  onPick(r.value, r.display);
                  setQuery("");
                  setOpen(false);
                  setResults([]);
                }}
                className="block w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50"
              >
                <div className="text-sm font-medium text-gray-800">{r.display}</div>
                {r.sub && <div className="text-[10px] text-gray-500">{r.sub}</div>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function SurgeryRequestsPage() {
  return (
    <Suspense fallback={<div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}>
      <SurgeryRequestsInner />
    </Suspense>
  );
}
