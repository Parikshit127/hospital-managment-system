"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  Filter,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Scale,
  Search,
  X,
} from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import {
  approveWriteoff,
  getWriteoffStats,
  listWriteoffs,
  postWriteoff,
  rejectWriteoff,
  requestWriteoff,
  reverseWriteoff,
  type WriteoffStatus,
  type WriteoffType,
} from "@/app/actions/writeoff-actions";

const fmtMoney = (n: number) =>
  Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmtDateTime = (iso: string) => (iso ? new Date(iso).toLocaleString() : "—");

const TYPE_OPTIONS: { value: WriteoffType; label: string }[] = [
  { value: "charity", label: "Charity" },
  { value: "bad_debt", label: "Bad Debt" },
  { value: "management_waiver", label: "Management Waiver" },
  { value: "settlement_adjustment", label: "Settlement Adjustment" },
  { value: "employee_waiver", label: "Employee Waiver" },
];

const STATUS_OPTIONS: WriteoffStatus[] = [
  "Requested",
  "Approved",
  "Rejected",
  "Posted",
  "Reversed",
];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    Requested: "bg-amber-100 text-amber-700",
    Approved: "bg-blue-100 text-blue-700",
    Posted: "bg-emerald-100 text-emerald-700",
    Rejected: "bg-rose-100 text-rose-700",
    Reversed: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${map[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {status}
    </span>
  );
}

export default function WriteoffsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<WriteoffStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<WriteoffType | "">("");
  const [showCreate, setShowCreate] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [items, s] = await Promise.all([
      listWriteoffs({
        status: statusFilter || undefined,
        writeoff_type: typeFilter || undefined,
        limit: 200,
      }),
      getWriteoffStats(90),
    ]);
    if (items.success) setItems(items.data);
    if (s.success) setStats(s.data);
    setLoading(false);
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    load();
    fetch("/api/session")
      .then((r) => r.json())
      .then(setSession)
      .catch(() => setSession(null));
  }, [load]);

  const onApprove = async (id: string) => {
    const comment = prompt("Optional approval comment:") ?? undefined;
    setBusyId(id);
    const res = await approveWriteoff(id, comment ?? undefined);
    setBusyId(null);
    if (res.success) load();
    else alert(res.error);
  };
  const onReject = async (id: string) => {
    const reason = prompt("Rejection reason (required):");
    if (!reason || reason.trim().length < 3) return;
    setBusyId(id);
    const res = await rejectWriteoff(id, reason);
    setBusyId(null);
    if (res.success) load();
    else alert(res.error);
  };
  const onPost = async (id: string) => {
    if (!confirm("Post this write-off to GL? This creates a journal entry and reduces the invoice balance.")) return;
    setBusyId(id);
    const res = await postWriteoff(id);
    setBusyId(null);
    if (res.success) {
      load();
      if ((res as any).warnings?.length) {
        alert("Posted with warnings:\n" + (res as any).warnings.join("\n"));
      }
    } else alert(res.error);
  };
  const onReverse = async (id: string) => {
    const reason = prompt("Reversal reason (required):");
    if (!reason || reason.trim().length < 3) return;
    setBusyId(id);
    const res = await reverseWriteoff(id, reason);
    setBusyId(null);
    if (res.success) load();
    else alert(res.error);
  };

  return (
    <AppShell
      pageTitle="Write-offs"
      pageIcon={<Scale className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
      headerActions={
        <div className="flex items-center gap-1.5">
          <Link
            href="/billing/approvals"
            className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg"
          >
            Approval Center
          </Link>
          <Link
            href="/billing"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Master Billing
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg"
          >
            <Plus className="h-3.5 w-3.5" /> New Write-off
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Pending (Requested)" value={stats.pending_count} sub={`₹${fmtMoney(stats.pending_total)}`} tone="amber" />
            <Stat label="Posted (90d)" value={stats.posted_count} sub={`₹${fmtMoney(stats.posted_total)}`} tone="emerald" />
            <Stat
              label="Top Type"
              value={
                stats.by_type[0]?.writeoff_type
                  ? `${stats.by_type[0].writeoff_type}`
                  : "—"
              }
              sub={stats.by_type[0] ? `₹${fmtMoney(stats.by_type[0].total)}` : "—"}
              tone="blue"
            />
            <Stat
              label="Total Statuses"
              value={stats.by_status.length}
              sub={stats.by_status.map((s: any) => `${s.status}:${s.count}`).join(" · ")}
              tone="gray"
            />
          </div>
        )}

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-2 py-1 border border-gray-200 rounded text-xs"
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-3">Type</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="px-2 py-1 border border-gray-200 rounded text-xs"
          >
            <option value="">All</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* List */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              No write-offs match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                  <tr>
                    <th className="text-left px-3 py-2">Number</th>
                    <th className="text-left px-3 py-2">Patient</th>
                    <th className="text-left px-3 py-2">Invoice</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-left px-3 py-2">Reason</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Requested By</th>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-right px-3 py-2">Amount</th>
                    <th className="text-right px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((wo: any) => {
                    const busy = busyId === wo.id;
                    return (
                      <tr key={wo.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-mono font-bold">{wo.writeoff_number}</td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/billing/patient/${wo.patient_id}`}
                            className="text-blue-600 hover:underline font-mono text-[11px]"
                          >
                            {wo.patient_id}
                          </Link>
                        </td>
                        <td className="px-3 py-2 font-mono text-gray-500">
                          {wo.invoice?.invoice_number ?? "—"}
                        </td>
                        <td className="px-3 py-2 capitalize">
                          {wo.writeoff_type.replace(/_/g, " ")}
                        </td>
                        <td className="px-3 py-2 text-gray-700 max-w-xs truncate" title={wo.reason}>
                          {wo.reason}
                        </td>
                        <td className="px-3 py-2">{statusBadge(wo.status)}</td>
                        <td className="px-3 py-2 text-gray-600">{wo.requested_by ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                          {fmtDateTime(wo.created_at)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold">
                          ₹{fmtMoney(Number(wo.amount))}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            {wo.status === "Requested" && (
                              <>
                                <button
                                  onClick={() => onApprove(wo.id)}
                                  disabled={busy}
                                  className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[10px] font-bold rounded disabled:opacity-50 flex items-center gap-1"
                                >
                                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                  Approve
                                </button>
                                <button
                                  onClick={() => onReject(wo.id)}
                                  disabled={busy}
                                  className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 text-[10px] font-bold rounded disabled:opacity-50 flex items-center gap-1"
                                >
                                  <X className="h-3 w-3" /> Reject
                                </button>
                              </>
                            )}
                            {wo.status === "Approved" && (
                              <button
                                onClick={() => onPost(wo.id)}
                                disabled={busy}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded disabled:opacity-50 flex items-center gap-1"
                              >
                                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                Post to GL
                              </button>
                            )}
                            {wo.status === "Posted" && session?.role === "admin" && (
                              <button
                                onClick={() => onReverse(wo.id)}
                                disabled={busy}
                                className="px-2 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 text-[10px] font-bold rounded disabled:opacity-50 flex items-center gap-1"
                              >
                                <RotateCcw className="h-3 w-3" /> Reverse
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showCreate && <NewWriteoffModal onClose={() => setShowCreate(false)} onSaved={load} />}
    </AppShell>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone: "amber" | "emerald" | "blue" | "gray";
}) {
  const tones: Record<string, string> = {
    amber: "border-l-amber-500",
    emerald: "border-l-emerald-500",
    blue: "border-l-blue-500",
    gray: "border-l-gray-300",
  };
  return (
    <div className={`bg-white border border-gray-200 border-l-4 ${tones[tone]} rounded-xl px-4 py-3`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-black text-gray-800">{value}</div>
      {sub && <div className="text-[10px] text-gray-400 font-medium mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function NewWriteoffModal({
  onClose,
  onSaved,
  defaultPatientId,
  defaultInvoiceId,
}: {
  onClose: () => void;
  onSaved: () => void;
  defaultPatientId?: string;
  defaultInvoiceId?: number;
}) {
  const [form, setForm] = useState({
    patient_id: defaultPatientId ?? "",
    invoice_id: defaultInvoiceId ? String(defaultInvoiceId) : "",
    writeoff_type: "bad_debt" as WriteoffType,
    amount: "",
    reason: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(form.amount);
    if (!form.patient_id || !amountNum || amountNum <= 0 || form.reason.trim().length < 5) {
      alert("Patient ID, positive amount, and a reason ≥ 5 chars are required");
      return;
    }
    setSaving(true);
    const res = await requestWriteoff({
      patient_id: form.patient_id.trim(),
      invoice_id: form.invoice_id ? Number(form.invoice_id) : null,
      writeoff_type: form.writeoff_type,
      amount: amountNum,
      reason: form.reason,
      notes: form.notes || null,
    });
    setSaving(false);
    if (res.success) {
      onSaved();
      onClose();
    } else {
      alert((res as any).error || "Failed");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4"
      >
        <h3 className="text-lg font-black text-gray-800">New Write-off Request</h3>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Patient UHID *"
            value={form.patient_id}
            onChange={(v) => setForm({ ...form, patient_id: v })}
            disabled={!!defaultPatientId}
          />
          <Field
            label="Invoice ID (optional)"
            value={form.invoice_id}
            onChange={(v) => {
              // digits only
              const cleaned = v.replace(/\D/g, '');
              setForm({ ...form, invoice_id: cleaned });
            }}
            placeholder="numeric ID"
            disabled={!!defaultInvoiceId}
            inputMode="numeric"
            type="number"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
            Write-off Type *
          </label>
          <select
            value={form.writeoff_type}
            onChange={(e) => setForm({ ...form, writeoff_type: e.target.value as WriteoffType })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <Field
          label="Amount *"
          value={form.amount}
          onChange={(v) => setForm({ ...form, amount: v })}
          type="number"
        />
        <Field
          label="Reason *"
          value={form.reason}
          onChange={(v) => setForm({ ...form, reason: v })}
          multiline
        />
        <Field
          label="Internal notes"
          value={form.notes}
          onChange={(v) => setForm({ ...form, notes: v })}
          multiline
        />

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-800">
          A write-off request is created in <strong>Requested</strong> state. It must be approved
          (per amount-tier rules) and then explicitly posted to the GL before it affects financials.
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
          >
            {saving ? "Submitting…" : "Submit Request"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  type,
  placeholder,
  disabled,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
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
          placeholder={placeholder}
          disabled={disabled}
        />
      ) : (
        <input
          type={type ?? "text"}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          placeholder={placeholder}
          disabled={disabled}
        />
      )}
    </div>
  );
}
