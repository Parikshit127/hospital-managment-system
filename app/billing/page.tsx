"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DateField } from '@/app/components/ui/DateField';
import Link from "next/link";
import {
  BanknoteArrowDown,
  BarChart3,
  Bell,
  CalendarClock,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  DollarSign,
  Download,
  FileText,
  Filter,
  Layers,
  Loader2,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Undo2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { AdminPage } from "@/app/admin/components/AdminPage";
import {
  getMasterBillingGrid,
  getMasterBillingKPIs,
  globalFinanceSearch,
  type GlobalFinanceSearchHit,
  type MasterBillingFilter,
} from "@/app/actions/master-billing-actions";
import { getMyRole } from "@/app/actions/finance-actions";
import { CancelInvoiceModal } from "@/app/components/finance/CancelInvoiceModal";
import { EditInvoiceModal } from "@/app/components/finance/EditInvoiceModal";
import { RefundModal } from "@/app/components/finance/RefundModal";
import { RecordTpaPaymentModal } from "@/app/components/billing/RecordTpaPaymentModal";
import { Pencil } from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────

function fmtMoney(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// ── status badges ─────────────────────────────────────────────────────────

function InvoiceBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Draft: "bg-gray-100 text-gray-700 border-gray-200",
    Finalized: "bg-blue-100 text-blue-700 border-blue-200",
    Partial: "bg-amber-100 text-amber-700 border-amber-200",
    Paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Overdue: "bg-rose-100 text-rose-700 border-rose-200",
    Cancelled: "bg-rose-100 text-rose-700 border-rose-200 line-through",
    Voided: "bg-gray-100 text-gray-500 border-gray-200",
    Refunded: "bg-purple-100 text-purple-700 border-purple-200",
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${map[status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}
    >
      {status}
    </span>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Paid: "bg-emerald-100 text-emerald-700",
    Partial: "bg-amber-100 text-amber-700",
    Overdue: "bg-rose-100 text-rose-700",
    Draft: "bg-gray-100 text-gray-600",
    Cancelled: "bg-gray-100 text-gray-400",
    Voided: "bg-gray-100 text-gray-400",
    Refunded: "bg-purple-100 text-purple-700",
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${map[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {status}
    </span>
  );
}

// Cash / Corporate / TPA payer, resolved to what the patient (or their payer)
// is actually called — the raw `patient_type` alone doesn't tell you which
// TPA or corporate account is on the hook.
function payerLabel(r: any): { label: string; cls: string } {
  if (r.patient_type === "tpa_insurance") {
    return { label: r.tpa_provider_name || "TPA", cls: "bg-purple-50 text-purple-700" };
  }
  if (r.patient_type === "corporate") {
    return { label: r.corporate_name || "Corporate", cls: "bg-blue-50 text-blue-700" };
  }
  return { label: "Cash", cls: "bg-gray-100 text-gray-700" };
}

// ── main page ─────────────────────────────────────────────────────────────

// Cancel is offered for any non-terminal invoice. Invoices that already have
// payments are still surfaced — the modal shows the "use Refund / Credit Note"
// validation (and the server-side guard in cancelInvoice blocks them), so the
// reviewer can attempt a cancel and see the validation. Already cancelled /
// voided / refunded invoices have nothing left to cancel.
const TERMINAL_STATUSES = ["Cancelled", "Voided", "Refunded"];
function canCancelInvoice(r: any): boolean {
  return !TERMINAL_STATUSES.includes(r?.invoice_status);
}

// ── date quick-filter presets ───────────────────────────────────────────────
// Local-time YYYY-MM-DD (matches the date inputs + server created_at range).
function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const DATE_PRESETS = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "This Month", "Last Month"];
function presetRange(key: string): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case "Today":
      break;
    case "Yesterday":
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case "Last 7 Days":
      start.setDate(start.getDate() - 6);
      break;
    case "Last 30 Days":
      start.setDate(start.getDate() - 29);
      break;
    case "This Month":
      start.setDate(1);
      break;
    case "Last Month":
      start.setMonth(start.getMonth() - 1, 1); // 1st of previous month
      end.setDate(0); // last day of previous month
      break;
  }
  return { from: toYMD(start), to: toYMD(end) };
}

const STATUS_FILTERS = ["", "Draft", "Final", "Cancelled"];
const PAYMENT_FILTERS = ["", "Paid", "Partial", "Overdue", "Draft", "Refunded"];
const PATIENT_TYPES = ["", "cash", "corporate", "tpa_insurance"];
const PATIENT_TYPE_LABELS: Record<string, string> = { cash: "Cash", corporate: "Corporate", tpa_insurance: "TPA" };
const INVOICE_TYPES = ["", "OPD", "IPD", "LAB", "PHARMACY"];

export function MasterBillingContent({ shell = "app" }: { shell?: "app" | "admin" }) {
  const isAdminShell = shell === "admin";
  const billingRoot = isAdminShell ? "/admin/billing" : "/billing";
  const [grid, setGrid] = useState<any[]>([]);
  const [meta, setMeta] = useState<{
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } | null>(null);
  const [kpis, setKpis] = useState<any>(null);
  const [filter, setFilter] = useState<MasterBillingFilter>({ page: 1, limit: 25 });
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [tpaPaymentTarget, setTpaPaymentTarget] = useState<any | null>(null);
  // Viewer role — only admin/finance may edit a bill once a payment has been collected.
  const [myRole, setMyRole] = useState<string | null>(null);
  const canEditPaid = ['admin', 'finance', 'superadmin'].includes(myRole || '');

  useEffect(() => {
    getMyRole().then((r) => setMyRole(r.role));
  }, []);

  const loadGrid = useCallback(async () => {
    setLoading(true);
    const res = await getMasterBillingGrid(filter);
    if (res.success) {
      setGrid(res.data || []);
      setMeta(res.meta);
    } else {
      setGrid([]);
      setMeta(null);
    }
    setLoading(false);
  }, [filter]);

  const loadKpis = useCallback(async () => {
    const res = await getMasterBillingKPIs();
    if (res.success) setKpis(res.data);
  }, []);

  useEffect(() => {
    loadKpis();
  }, [loadKpis]);

  useEffect(() => {
    const t = setTimeout(loadGrid, 200);
    return () => clearTimeout(t);
  }, [loadGrid]);

  const updateFilter = (patch: Partial<MasterBillingFilter>) => {
    setFilter((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  };

  const clearFilters = () => setFilter({ page: 1, limit: 25 });
  const hasActiveFilters = Boolean(
    filter.search || filter.invoice_status || filter.payment_status ||
    filter.patient_type || filter.invoice_type || filter.date_from || filter.date_to
  );

  // Export the FULL filtered result set (all pages, respecting every active
  // filter — date range, status, search, etc.) to Excel.
  async function handleExport() {
    setExporting(true);
    try {
      const res = await getMasterBillingGrid({ ...filter, export_all: true });
      const rows: any[] = res.success && res.data ? res.data : [];
      if (rows.length === 0) {
        alert("No invoices match the current filters.");
        return;
      }
      const xlsxMod: any = await import("xlsx");
      const XLSX = xlsxMod.default ?? xlsxMod;
      const mapped = rows.map((r) => ({
        "Invoice #": r.invoice_number,
        Patient: r.patient_name,
        UHID: r.patient_id,
        Doctor: r.doctor_name,
        "Patient Type": r.patient_type,
        Type: r.admission_type,
        "Invoice Status": r.invoice_status,
        "Payment Status": r.payment_status,
        Total: Number(r.total_amount || 0),
        Paid: Number(r.paid_amount || 0),
        Outstanding: Number(r.outstanding_amount || 0),
        "Deposit Balance": Number(r.deposit_balance || 0),
        "Aging (days)": r.aging_days,
        "Invoice Date": r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "",
        "Last Payment": r.last_payment_date ? new Date(r.last_payment_date).toLocaleDateString("en-IN") : "",
      }));
      const ws = XLSX.utils.json_to_sheet(mapped);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Master Billing");
      const span = `${filter.date_from || "all"}_${filter.date_to || "all"}`;
      XLSX.writeFile(wb, `master-billing-${span}.xlsx`);
    } catch (e) {
      console.error("Export failed:", e);
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  const Shell = isAdminShell ? AdminPage : AppShell;

  return (
    <Shell
      pageTitle="Master Billing"
      pageIcon={<CircleDollarSign className="h-5 w-5" />}
      onRefresh={() => {
        loadGrid();
        loadKpis();
      }}
      refreshing={loading}
      headerActions={
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold rounded-lg"
            title="Global finance search"
          >
            <Search className="h-3.5 w-3.5" /> Search
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold rounded-lg"
              title="Clear all column filters"
            >
              <Filter className="h-3.5 w-3.5" /> Clear Filters
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold rounded-lg disabled:opacity-50"
            title="Export current filtered results to Excel"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Export
          </button>
        </div>
      }
    >
      {/* Quick Action Toolbar (blueprint § 6) */}
      <QuickActions billingRoot={billingRoot} adminMode={isAdminShell} onProcessRefund={() => setRefundOpen(true)} />

      {/* KPI Cards (12) */}
      <KpiGrid kpis={kpis} />

      {/* Master Grid — column filters live in the header row itself */}
      <div className="mt-5 bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : grid.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            No invoices match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 font-bold sticky top-0 z-10">
                <tr>
                  <ThFilter
                    label="Type"
                    value={filter.invoice_type ?? ""}
                    options={INVOICE_TYPES}
                    onChange={(v) => updateFilter({ invoice_type: v || undefined })}
                  />
                  <ThDateFilter filter={filter} setFilter={updateFilter} />
                  <ThSearchFilter value={filter.search ?? ""} onChange={(v) => updateFilter({ search: v })} />
                  <Th>Doctor</Th>
                  <ThFilter
                    label="Payer"
                    value={filter.patient_type ?? ""}
                    options={PATIENT_TYPES}
                    labels={PATIENT_TYPE_LABELS}
                    onChange={(v) => updateFilter({ patient_type: v || undefined })}
                  />
                  <Th align="right">Bill Amount</Th>
                  <Th align="right">Payment Received</Th>
                  <Th align="right">Outstanding</Th>
                  <Th>Invoice #</Th>
                  <ThFilter
                    label="Inv. Status"
                    value={filter.invoice_status ?? ""}
                    options={STATUS_FILTERS}
                    onChange={(v) => updateFilter({ invoice_status: v || undefined })}
                  />
                  <ThFilter
                    label="Pay Status"
                    value={filter.payment_status ?? ""}
                    options={PAYMENT_FILTERS}
                    onChange={(v) => updateFilter({ payment_status: v || undefined })}
                  />
                  <Th align="right">Deposit</Th>
                  <Th align="right" sticky>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {grid.map((r) => {
                  const payer = payerLabel(r);
                  return (
                    <tr key={r.invoice_id} className="group border-t border-gray-100 hover:bg-blue-50/30">
                      <Td>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            r.admission_type === "IPD"
                              ? "bg-violet-50 text-violet-700"
                              : r.admission_type === "OPD"
                              ? "bg-teal-50 text-teal-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {r.admission_type}
                        </span>
                      </Td>
                      <Td>
                        <span className="whitespace-nowrap text-gray-700">
                          {r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "—"}
                        </span>
                      </Td>
                      <Td>
                        <Link
                          href={`${billingRoot}/patient/${r.patient_id}`}
                          className="font-bold text-gray-800 hover:underline"
                        >
                          {r.patient_name}
                        </Link>
                        {r.patient_phone && (
                          <div className="text-[10px] text-gray-400">{r.patient_phone}</div>
                        )}
                        {r.package_name && (
                          <div className="text-[10px] text-indigo-700 font-semibold mt-0.5">
                            📦 {r.package_name} · ₹{Number(r.package_amount).toLocaleString('en-IN')}
                          </div>
                        )}
                      </Td>
                      <Td>{r.doctor_name ?? "-"}</Td>
                      <Td>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${payer.cls}`}>
                          {payer.label}
                        </span>
                      </Td>
                      <Td align="right">{fmtMoney(r.total_amount)}</Td>
                      <Td align="right">{fmtMoney(r.paid_amount)}</Td>
                      <Td align="right">
                        <span className={r.outstanding_amount > 0 ? "font-bold text-rose-600" : ""}>
                          {fmtMoney(r.outstanding_amount)}
                        </span>
                      </Td>
                      <Td><span className="font-mono">{r.invoice_number || 'Draft (unsaved)'}</span></Td>
                      <Td><InvoiceBadge status={r.invoice_status} /></Td>
                      <Td><PaymentBadge status={r.payment_status} /></Td>
                      <Td align="right">
                        <span className={r.deposit_balance > 0 ? "font-bold text-emerald-600" : "text-gray-400"}>
                          {fmtMoney(r.deposit_balance)}
                        </span>
                      </Td>
                      <Td align="right" sticky>
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`${billingRoot}/patient/${r.patient_id}`}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded"
                          >
                            Open
                          </Link>
                          {(r.invoice_status === "Draft" || (r.invoice_status === "Final" && canEditPaid)) && (
                            <button
                              onClick={() => setEditingInvoiceId(Number(r.invoice_id))}
                              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-bold rounded transition-colors flex items-center gap-0.5"
                              title={r.invoice_status === "Final" ? 'Edit finalized bill (Admin/Finance)' : 'Edit draft invoice'}
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                          )}
                          {(r.tpa_claim_status === 'approved' || r.tpa_claim_status === 'partially_settled') && (
                            <button
                              onClick={() => setTpaPaymentTarget(r)}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold rounded transition-colors flex items-center gap-0.5"
                              title="Record actual money received from TPA"
                            >
                              <Shield className="h-3 w-3" /> Mark TPA Received
                            </button>
                          )}
                          {canCancelInvoice(r) && canEditPaid && (
                            <button
                              onClick={() => setCancelTarget(r)}
                              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold rounded transition-colors"
                              title="Cancel this invoice (Admin/Finance only)"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {meta && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-xs text-gray-500 bg-gray-50">
            <div>
              {meta.total} invoices · page {meta.page} of {meta.totalPages}
            </div>
            <div className="flex items-center gap-1">
              <button
                disabled={meta.page <= 1}
                onClick={() => updateFilter({ page: meta.page - 1 })}
                className="px-2 py-1 rounded bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-100 font-bold"
              >
                Prev
              </button>
              <button
                disabled={meta.page >= meta.totalPages}
                onClick={() => updateFilter({ page: meta.page + 1 })}
                className="px-2 py-1 rounded bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-100 font-bold"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Global Finance Search modal */}
      {searchOpen && <FinanceSearchModal billingRoot={billingRoot} onClose={() => setSearchOpen(false)} />}

      {/* Edit Invoice modal */}
      {editingInvoiceId !== null && (
        <EditInvoiceModal
          invoiceId={editingInvoiceId}
          isOpen
          onClose={() => setEditingInvoiceId(null)}
          onSaved={() => {
            setEditingInvoiceId(null);
            loadGrid();
            loadKpis();
          }}
        />
      )}

      {/* Cancel Invoice confirmation modal */}
      {cancelTarget && (
        <CancelInvoiceModal
          invoiceId={cancelTarget.invoice_id}
          invoiceNumber={cancelTarget.invoice_number}
          patientName={cancelTarget.patient_name}
          amount={Number(cancelTarget.total_amount ?? 0)}
          paidAmount={Number(cancelTarget.paid_amount ?? 0)}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => {
            loadGrid();
            loadKpis();
          }}
        />
      )}

      {/* Refund modal */}
      <RefundModal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        onRefunded={() => {
          loadGrid();
          loadKpis();
        }}
      />

      {/* Record TPA Payment Received modal */}
      {tpaPaymentTarget && (
        <RecordTpaPaymentModal
          open
          onClose={() => setTpaPaymentTarget(null)}
          onRecorded={() => {
            setTpaPaymentTarget(null);
            loadGrid();
            loadKpis();
          }}
          invoice={{
            id: Number(tpaPaymentTarget.invoice_id),
            version: Number(tpaPaymentTarget.version ?? 0),
            invoice_number: tpaPaymentTarget.invoice_number,
            patient_name: tpaPaymentTarget.patient_name,
            tpa_provider_name: tpaPaymentTarget.corporate_name ?? null,
            tpa_approved_amount: Number(tpaPaymentTarget.tpa_approved_amount ?? 0),
            tpa_settled_amount: Number(tpaPaymentTarget.tpa_settled_amount ?? 0),
          }}
        />
      )}
    </Shell>
  );
}

export default function MasterBillingPage() {
  return <MasterBillingContent />;
}

// ── sub-components ────────────────────────────────────────────────────────

function Th({
  children,
  align = "left",
  sticky = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  sticky?: boolean;
}) {
  return (
    <th
      className={`px-2.5 py-2 align-top ${align === "right" ? "text-right" : "text-left"} whitespace-nowrap ${
        sticky ? "sticky right-0 z-20 bg-gray-50 shadow-[-4px_0_6px_-6px_rgba(0,0,0,0.25)]" : ""
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  sticky = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  sticky?: boolean;
}) {
  return (
    <td
      className={`px-2.5 py-2 ${align === "right" ? "text-right" : "text-left"} whitespace-nowrap ${
        sticky ? "sticky right-0 z-[5] bg-white group-hover:bg-blue-50/30 shadow-[-4px_0_6px_-6px_rgba(0,0,0,0.25)]" : ""
      }`}
    >
      {children}
    </td>
  );
}

// Dropdown filter embedded directly in a column header — the "column-header
// filters" pattern replacing the old separate filter pill row.
function ThFilter({
  label,
  value,
  options,
  labels,
  onChange,
  align = "left",
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (v: string) => void;
  align?: "left" | "right";
}) {
  const active = Boolean(value);
  return (
    <th className={`px-2.5 py-2 align-top ${align === "right" ? "text-right" : "text-left"}`}>
      <div className={`flex flex-col gap-1 ${align === "right" ? "items-end" : "items-start"}`}>
        <span className="whitespace-nowrap">{label}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`normal-case text-[10px] font-semibold rounded px-1 py-0.5 border max-w-[110px] ${
            active ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-500"
          }`}
        >
          {options.map((o) => (
            <option key={o || "_all"} value={o}>
              {labels?.[o] ?? (o || "All")}
            </option>
          ))}
        </select>
      </div>
    </th>
  );
}

// Patient-column header search — matches name / phone / invoice # / doctor
// (the server already searches all of those for one `search` term).
function ThSearchFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <th className="px-2.5 py-2 align-top text-left">
      <div className="flex flex-col gap-1 items-start">
        <span className="whitespace-nowrap">Patient</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search name / phone…"
          className={`normal-case text-[10px] font-semibold rounded px-1.5 py-0.5 border w-28 ${
            value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-500"
          }`}
        />
      </div>
    </th>
  );
}

// Bill-Date header — compact button + popover so the date presets/custom
// range don't have to live in a separate filter row above the table.
function ThDateFilter({
  filter,
  setFilter,
}: {
  filter: MasterBillingFilter;
  setFilter: (p: Partial<MasterBillingFilter>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Popover renders via a portal (below) so it can't be clipped by the grid
  // wrapper's `overflow-hidden` (needed there for the rounded card corners).
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleDismiss = () => setOpen(false);
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", handleDismiss, true);
    window.addEventListener("resize", handleDismiss);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", handleDismiss, true);
      window.removeEventListener("resize", handleDismiss);
    };
  }, [open]);

  const active = Boolean(filter.date_from || filter.date_to);
  const activeLabel =
    DATE_PRESETS.find((key) => {
      const r = presetRange(key);
      return filter.date_from === r.from && filter.date_to === r.to;
    }) ?? (active ? "Custom" : "All");

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen((o) => !o);
  };

  return (
    <th className="px-2.5 py-2 align-top text-left">
      <div className="flex flex-col gap-1 items-start">
        <span className="whitespace-nowrap">Bill Date</span>
        <button
          ref={btnRef}
          type="button"
          onClick={toggle}
          className={`normal-case text-[10px] font-semibold rounded px-1.5 py-0.5 border flex items-center gap-1 ${
            active ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-500"
          }`}
        >
          <CalendarClock className="h-2.5 w-2.5" /> {activeLabel}
        </button>
      </div>
      {open && coords && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: coords.top, left: coords.left }}
          className="z-[100] w-60 bg-white border border-gray-200 rounded-lg shadow-lg p-3 normal-case font-normal text-gray-700"
        >
          <div className="flex flex-wrap gap-1 mb-2">
            {DATE_PRESETS.map((key) => {
              const r = presetRange(key);
              const activeP = filter.date_from === r.from && filter.date_to === r.to;
              return (
                <button
                  key={key}
                  onClick={() => {
                    setFilter({ date_from: r.from, date_to: r.to });
                    setOpen(false);
                  }}
                  className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors ${
                    activeP
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {key}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 mb-2">
            <DateField
              value={filter.date_from ?? ""}
              max={filter.date_to || undefined}
              onChange={(e) => setFilter({ date_from: e.target.value || undefined })}
              className="px-2 py-1 border border-gray-200 rounded text-xs w-full"
            />
            <span className="text-[10px] text-gray-400">to</span>
            <DateField
              value={filter.date_to ?? ""}
              min={filter.date_from || undefined}
              onChange={(e) => setFilter({ date_to: e.target.value || undefined })}
              className="px-2 py-1 border border-gray-200 rounded text-xs w-full"
            />
          </div>
          {active && (
            <button
              onClick={() => {
                setFilter({ date_from: undefined, date_to: undefined });
                setOpen(false);
              }}
              className="text-[10px] font-bold text-gray-400 hover:text-gray-600 underline"
            >
              Clear date filter
            </button>
          )}
        </div>,
        document.body
      )}
    </th>
  );
}

function QuickActions({
  billingRoot,
  adminMode,
  onProcessRefund,
}: {
  billingRoot: string;
  adminMode?: boolean;
  onProcessRefund?: () => void;
}) {
  // Per blueprint § 6 Quick Action Toolbar.
  // Each button links to the existing flow — the Master Billing page is the orchestrator,
  // not the form host. Forms live in the existing modules (preserves backward compat).
  const actions: Array<{
    label: string;
    icon: any;
    href?: string;
    onClick?: () => void;
  }> = [
    { label: "New Bill", icon: Plus, href: `${billingRoot}/new` },
    { label: "Fee Receipt", icon: ReceiptText, href: `${billingRoot}/fee-receipt` },
    { label: "Collect Payment", icon: CreditCard, href: billingRoot },
    { label: "Add Deposit", icon: Wallet, href: adminMode ? "/admin/finance/deposits" : "/finance/deposits" },
    { label: "Process Refund", icon: Undo2, onClick: onProcessRefund },
    { label: "Credit Note", icon: ReceiptText, href: adminMode ? "/admin/finance/credit-notes" : "/finance/credit-notes" },
    { label: "Discharge Settle", icon: BanknoteArrowDown, href: adminMode ? "/admin/ipd/discharge-settlement" : "/ipd/discharge-settlement" },
    { label: "Insurance Claims", icon: Shield, href: adminMode ? "/admin/finance/tpa-insurance" : "/insurance" },
    { label: "Export", icon: Download, href: adminMode ? "/admin/finance/reports" : "/finance/reports" },
    { label: "Reconcile", icon: ClipboardCheck, href: adminMode ? "/admin/finance/bank-recon" : "/finance/bank-recon" },
    { label: "Write-off", icon: ShieldAlert, href: `${billingRoot}/writeoffs` },
    { label: "Approvals", icon: ShieldAlert, href: `${billingRoot}/approvals` },
  ];
  const baseClass =
    "flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700 text-xs font-bold rounded-lg transition-all";
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-5">
      {actions.map((a) =>
        a.onClick ? (
          <button key={a.label} type="button" onClick={a.onClick} className={baseClass}>
            <a.icon className="h-3.5 w-3.5" />
            {a.label}
          </button>
        ) : (
          <Link key={a.label} href={a.href!} className={baseClass}>
            <a.icon className="h-3.5 w-3.5" />
            {a.label}
          </Link>
        )
      )}
    </div>
  );
}

function KpiGrid({ kpis }: { kpis: any }) {
  if (!kpis) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-5">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-3 h-20 animate-pulse" />
        ))}
      </div>
    );
  }
  const cards = [
    {
      label: "Today's Revenue",
      value: `₹${fmtMoney(kpis.todays_revenue)}`,
      icon: TrendingUp,
      tone: "emerald",
      sub: `${fmtMoney(kpis.todays_collected)} collected`,
    },
    {
      label: "Outstanding AR",
      value: `₹${fmtMoney(kpis.outstanding_receivables)}`,
      icon: ClipboardList,
      tone: "rose",
      sub: `${kpis.outstanding_count} invoices`,
    },
    {
      label: "Pending Claims",
      value: kpis.pending_claims,
      icon: Shield,
      tone: "amber",
      sub: `${kpis.claims_under_review} under review`,
    },
    {
      label: "Deposit Liability",
      value: `₹${fmtMoney(kpis.deposit_liability)}`,
      icon: Wallet,
      tone: "blue",
    },
    {
      label: "Refunds (30d)",
      value: `₹${fmtMoney(kpis.refund_volume_30d)}`,
      icon: Undo2,
      tone: "purple",
      sub: `${kpis.refund_count_30d} processed`,
    },
    {
      label: "Leakage Alerts",
      value: kpis.leakage_alerts,
      icon: TrendingDown,
      tone: "rose",
      sub: "stale drafts > 7d",
    },
    {
      label: "Pending Discharges",
      value: kpis.pending_discharges,
      icon: BanknoteArrowDown,
      tone: "amber",
    },
    {
      label: "Collection Efficiency",
      value: `${kpis.collection_efficiency_pct}%`,
      icon: TrendingUp,
      tone: "emerald",
      sub: `₹${fmtMoney(kpis.collected_30d)} / ₹${fmtMoney(kpis.billed_30d)}`,
    },
    {
      label: "Overdue Accounts",
      value: kpis.overdue_accounts,
      icon: CalendarClock,
      tone: "rose",
      sub: `₹${fmtMoney(kpis.overdue_amount)}`,
    },
    {
      label: "Pending Approvals",
      value: kpis.pending_approvals,
      icon: Bell,
      tone: "amber",
      sub: "refunds queue",
    },
    {
      label: "Top Dept Revenue",
      value: kpis.department_revenue?.[0]
        ? `₹${fmtMoney(kpis.department_revenue[0].revenue)}`
        : "—",
      icon: Stethoscope,
      tone: "blue",
      sub: kpis.department_revenue?.[0]?.department,
    },
    {
      label: "Billed (30d)",
      value: `₹${fmtMoney(kpis.billed_30d)}`,
      icon: BarChart3,
      tone: "blue",
    },
  ];

  const tones: Record<string, string> = {
    emerald: "text-emerald-600 bg-emerald-50",
    rose: "text-rose-600 bg-rose-50",
    amber: "text-amber-600 bg-amber-50",
    blue: "text-blue-600 bg-blue-50",
    purple: "text-purple-600 bg-purple-50",
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-5">
      {cards.map((c) => (
        <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {c.label}
            </div>
            <div className={`p-1.5 rounded-md ${tones[c.tone] ?? tones.blue}`}>
              <c.icon className="h-3 w-3" />
            </div>
          </div>
          <div className="mt-1.5 text-xl font-black text-gray-800">{c.value}</div>
          {c.sub && <div className="text-[10px] text-gray-400 font-medium mt-0.5">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function FinanceSearchModal({ billingRoot, onClose }: { billingRoot: string; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GlobalFinanceSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const res = await globalFinanceSearch(query);
      if (res.success) setHits(res.data);
      setLoading(false);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const grouped = useMemo(() => {
    const byType: Record<string, GlobalFinanceSearchHit[]> = {};
    for (const h of hits) {
      (byType[h.type] ||= []).push(h);
    }
    return byType;
  }, [hits]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[10vh]"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search invoices, doctors, receipts, claims, deposits, refunds, patient phone..."
            className="flex-1 outline-none text-sm font-medium text-gray-800 placeholder:text-gray-400 bg-transparent"
          />
          {loading && <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />}
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-md">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {!loading && query.length < 2 && (
            <div className="px-4 py-6 text-center text-xs text-gray-400 font-medium">
              Type at least 2 characters - search across patients, doctors, invoices, receipts, claims, deposits, refunds.
            </div>
          )}
          {!loading && query.length >= 2 && hits.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-gray-400 font-medium">
              No financial records matched.
            </div>
          )}
          {Object.entries(grouped).map(([type, group]) => (
            <div key={type} className="border-t border-gray-100">
              <div className="px-4 py-2 bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500 sticky top-0">
                {type} ({group.length})
              </div>
              {group.map((h) => (
                <Link
                  key={`${h.type}-${h.id}`}
                  href={h.patient_id ? `${billingRoot}/patient/${h.patient_id}` : billingRoot}
                  onClick={onClose}
                  className="block px-4 py-2.5 border-b border-gray-50 hover:bg-blue-50/50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-gray-800">{h.primary}</div>
                      <div className="text-[11px] text-gray-500 font-medium">{h.secondary}</div>
                    </div>
                    <div className="text-right">
                      {h.amount !== undefined && (
                        <div className="text-sm font-bold text-gray-700">₹{fmtMoney(h.amount)}</div>
                      )}
                      {h.date && (
                        <div className="text-[10px] text-gray-400 font-medium">
                          {new Date(h.date).toLocaleDateString('en-GB')}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
