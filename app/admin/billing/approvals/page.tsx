"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronLeft,
  ClipboardCheck,
  Filter,
  Loader2,
  Play,
  ReceiptText,
  Scale,
  ShieldAlert,
  Undo2,
  User,
  X,
} from "lucide-react";
import { AdminPage } from "@/app/admin/components/AdminPage";
import {
  approveItem,
  executeApprovedItem,
  getApprovalKPIs,
  getApprovalQueue,
  rejectItem,
  type ApprovalItem,
  type ApprovalItemType,
} from "@/app/actions/approval-center-actions";
import { listWriteoffs } from "@/app/actions/writeoff-actions";

const fmtMoney = (n: number) =>
  Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString();

const TYPE_BADGE: Record<ApprovalItemType, { label: string; cls: string; icon: any }> = {
  refund: { label: "Refund", cls: "bg-rose-100 text-rose-700 border-rose-200", icon: Undo2 },
  credit_note: {
    label: "Credit Note",
    cls: "bg-purple-100 text-purple-700 border-purple-200",
    icon: ReceiptText,
  },
  writeoff: {
    label: "Write-off",
    cls: "bg-amber-100 text-amber-700 border-amber-200",
    icon: Scale,
  },
};

export default function ApprovalCenterPage() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [kpis, setKpis] = useState<any>(null);
  const [pendingPost, setPendingPost] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<ApprovalItemType | "">("");
  const [showAmountFilter, setShowAmountFilter] = useState(false);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [actionItem, setActionItem] = useState<{
    item: ApprovalItem;
    action: "approve" | "reject";
  } | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [q, k, posted] = await Promise.all([
      getApprovalQueue({
        type: typeFilter || undefined,
        min_amount: minAmount ? Number(minAmount) : undefined,
        max_amount: maxAmount ? Number(maxAmount) : undefined,
      }),
      getApprovalKPIs(),
      listWriteoffs({ status: "Approved", limit: 100 }),
    ]);
    if (q.success) setItems(q.data);
    if (k.success) setKpis(k.data);
    if (posted.success) setPendingPost(posted.data);
    setLoading(false);
  }, [typeFilter, minAmount, maxAmount]);

  useEffect(() => {
    load();
    fetch("/api/session")
      .then((r) => r.json())
      .then((s) => setSession(s))
      .catch(() => setSession(null));
  }, [load]);

  const canActOn = (item: ApprovalItem) => {
    if (!session?.role) return false;
    return item.required_roles.includes(session.role);
  };

  const submitAction = async () => {
    if (!actionItem) return;
    setSubmitting(true);
    const res =
      actionItem.action === "approve"
        ? await approveItem({
            type: actionItem.item.type,
            id: actionItem.item.id,
            comment: comment || undefined,
          })
        : await rejectItem({
            type: actionItem.item.type,
            id: actionItem.item.id,
            reason: comment,
          });
    setSubmitting(false);
    if (res.success) {
      setActionItem(null);
      setComment("");
      load();
    } else {
      alert((res as any).error || "Action failed");
    }
  };

  const doPost = async (writeoffId: string) => {
    setPostingId(writeoffId);
    const res = await executeApprovedItem({ type: "writeoff", id: writeoffId });
    setPostingId(null);
    if (res.success) {
      load();
      if ((res as any).warnings?.length) {
        alert("Posted with warnings:\n" + (res as any).warnings.join("\n"));
      }
    } else {
      alert(res.error || "Posting failed");
    }
  };

  return (
    <AdminPage
      pageTitle="Approval Center"
      pageIcon={<ShieldAlert className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
      headerActions={
        <Link
          href="/admin/billing"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Master Billing
        </Link>
      }
    >
      <div className="space-y-5">
        {/* KPIs */}
        {kpis && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <Kpi
              label="Total Pending"
              value={kpis.total_pending}
              sub={`₹${fmtMoney(kpis.total_pending_amount)}`}
              tone="amber"
            />
            <Kpi
              label="Pending Refunds"
              value={kpis.refunds.count}
              sub={`₹${fmtMoney(kpis.refunds.total)}`}
              tone="rose"
              icon={Undo2}
            />
            <Kpi
              label="Pending Credit Notes"
              value={kpis.credit_notes.count}
              sub={`₹${fmtMoney(kpis.credit_notes.total)}`}
              tone="purple"
              icon={ReceiptText}
            />
            <Kpi
              label="Pending Write-offs"
              value={kpis.writeoffs_pending.count}
              sub={`₹${fmtMoney(kpis.writeoffs_pending.total)}`}
              tone="amber"
              icon={Scale}
            />
            <Kpi
              label="Ready to Post"
              value={kpis.writeoffs_ready_to_post.count}
              sub={`₹${fmtMoney(kpis.writeoffs_ready_to_post.total)} (write-offs)`}
              tone="blue"
              icon={Play}
            />
          </div>
        )}

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Type</span>
          <div className="flex items-center gap-1">
            {(["", "refund", "credit_note", "writeoff"] as const).map((t) => (
              <button
                key={t || "all"}
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize ${
                  typeFilter === t
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t === "" ? "All" : t === "credit_note" ? "Credit Note" : t}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAmountFilter((s) => !s)}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <Filter className="h-3 w-3" /> Amount
          </button>
          {showAmountFilter && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder="Min"
                className="w-20 px-2 py-1 border border-gray-200 rounded text-xs"
              />
              <span className="text-gray-400">–</span>
              <input
                type="number"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                placeholder="Max"
                className="w-20 px-2 py-1 border border-gray-200 rounded text-xs"
              />
            </div>
          )}
        </div>

        {/* Ready-to-post (write-offs that have been approved) */}
        {(!typeFilter || typeFilter === "writeoff") && pendingPost.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Play className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-blue-900">
                Approved write-offs awaiting GL posting ({pendingPost.length})
              </h3>
            </div>
            <div className="space-y-1.5">
              {pendingPost.map((wo: any) => (
                <div
                  key={wo.id}
                  className="bg-white border border-blue-100 rounded-lg p-3 flex items-center justify-between"
                >
                  <div>
                    <span className="font-mono text-xs font-bold text-blue-900">
                      {wo.writeoff_number}
                    </span>
                    <span className="ml-3 text-xs text-gray-600">{wo.writeoff_type}</span>
                    <span className="ml-3 text-xs text-gray-500">Patient {wo.patient_id}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm">₹{fmtMoney(Number(wo.amount))}</span>
                    <button
                      onClick={() => doPost(wo.id)}
                      disabled={postingId === wo.id || session?.role !== "admin" && session?.role !== "finance"}
                      title={
                        session?.role !== "admin" && session?.role !== "finance"
                          ? "Admin / Finance only"
                          : ""
                      }
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded disabled:opacity-50 flex items-center gap-1"
                    >
                      {postingId === wo.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                      Post to GL
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Queue */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              No items pending approval.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                <tr>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Ref #</th>
                  <th className="text-left px-3 py-2">Patient</th>
                  <th className="text-left px-3 py-2">Invoice</th>
                  <th className="text-left px-3 py-2">Reason</th>
                  <th className="text-left px-3 py-2">Requested By</th>
                  <th className="text-left px-3 py-2">Requested</th>
                  <th className="text-left px-3 py-2">Required Role</th>
                  <th className="text-right px-3 py-2">Amount</th>
                  <th className="text-right px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const meta = TYPE_BADGE[item.type];
                  const Icon = meta.icon;
                  const canAct = canActOn(item);
                  return (
                    <tr key={`${item.type}-${item.id}`} className="border-t border-gray-100 hover:bg-blue-50/30">
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${meta.cls}`}
                        >
                          <Icon className="h-3 w-3" /> {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono font-bold">{item.number}</td>
                      <td className="px-3 py-2">
                        {item.patient_id ? (
                          <Link
                            href={`/billing/patient/${item.patient_id}`}
                            className="text-blue-600 hover:underline font-bold"
                          >
                            {item.patient_name ?? item.patient_id}
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-500">
                        {item.invoice_number ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-700 max-w-xs truncate" title={item.reason}>
                        {item.reason}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{item.requested_by ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                        {fmtDateTime(item.requested_at)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          {item.required_roles.join(" / ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-bold">
                        ₹{fmtMoney(item.amount)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => {
                              setActionItem({ item, action: "approve" });
                              setComment("");
                            }}
                            disabled={!canAct}
                            title={!canAct ? "Your role cannot approve this amount" : ""}
                            className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[10px] font-bold rounded disabled:opacity-40 flex items-center gap-1"
                          >
                            <Check className="h-3 w-3" /> Approve
                          </button>
                          <button
                            onClick={() => {
                              setActionItem({ item, action: "reject" });
                              setComment("");
                            }}
                            disabled={!canAct}
                            className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 text-[10px] font-bold rounded disabled:opacity-40 flex items-center gap-1"
                          >
                            <X className="h-3 w-3" /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Approval rules legend */}
        <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-3">
          <div className="font-bold uppercase tracking-wider text-[10px] text-gray-600 mb-1">
            Approval Routing
          </div>
          <ul className="space-y-0.5">
            <li>
              <strong>Refund</strong> &lt;₹2k: any approver · &lt;₹25k: finance/admin · ≥₹25k: admin only
            </li>
            <li>
              <strong>Credit Note</strong> &lt;₹25k: finance/admin · ≥₹25k: admin only
            </li>
            <li>
              <strong>Write-off</strong> &lt;₹5k: manager/finance/admin · &lt;₹50k: finance/admin · ≥₹50k: admin only
            </li>
            <li className="pt-1 text-gray-400">
              Every action is captured in the audit log and the item&apos;s approval chain.
            </li>
          </ul>
        </div>
      </div>

      {/* Action modal */}
      {actionItem && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(6px)" }}
          onClick={() => !submitting && setActionItem(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2.5 rounded-xl ${
                  actionItem.action === "approve"
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-rose-50 text-rose-600"
                }`}
              >
                {actionItem.action === "approve" ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <X className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-black text-gray-800">
                  {actionItem.action === "approve" ? "Approve" : "Reject"}{" "}
                  {TYPE_BADGE[actionItem.item.type].label}
                </h3>
                <div className="text-xs text-gray-500 mt-1">
                  {actionItem.item.number} · ₹{fmtMoney(actionItem.item.amount)}
                </div>
                <div className="text-xs text-gray-600 mt-2 max-h-20 overflow-y-auto">
                  {actionItem.item.reason}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                {actionItem.action === "approve" ? "Comment (optional)" : "Rejection reason *"}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                required={actionItem.action === "reject"}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                placeholder={
                  actionItem.action === "approve"
                    ? "e.g., approved per management policy"
                    : "Why is this being rejected?"
                }
              />
            </div>

            {actionItem.action === "approve" && actionItem.item.type === "writeoff" && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-[11px] text-blue-800">
                Approving will NOT post to GL. After approval, this write-off appears in the
                &ldquo;Ready to Post&rdquo; queue where Finance / Admin can commit the journal.
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setActionItem(null)}
                disabled={submitting}
                className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitAction}
                disabled={
                  submitting ||
                  (actionItem.action === "reject" && comment.trim().length < 3)
                }
                className={`px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-50 ${
                  actionItem.action === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {submitting
                  ? "Submitting…"
                  : actionItem.action === "approve"
                  ? "Confirm Approval"
                  : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
  icon: Icon = Bell,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone: "amber" | "rose" | "purple" | "blue";
  icon?: any;
}) {
  const map: Record<string, string> = {
    amber: "bg-amber-50 text-amber-600 border-amber-200",
    rose: "bg-rose-50 text-rose-600 border-rose-200",
    purple: "bg-purple-50 text-purple-600 border-purple-200",
    blue: "bg-blue-50 text-blue-600 border-blue-200",
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</div>
        <div className={`p-1.5 rounded-md border ${map[tone]}`}>
          <Icon className="h-3 w-3" />
        </div>
      </div>
      <div className="mt-1.5 text-2xl font-black text-gray-800">{value}</div>
      {sub && <div className="text-[10px] text-gray-400 font-medium mt-0.5">{sub}</div>}
    </div>
  );
}
