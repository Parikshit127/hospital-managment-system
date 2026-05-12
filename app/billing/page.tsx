"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  getMasterBillingGrid,
  getMasterBillingKPIs,
  globalFinanceSearch,
  type GlobalFinanceSearchHit,
  type MasterBillingFilter,
} from "@/app/actions/master-billing-actions";

// ── helpers ───────────────────────────────────────────────────────────────

function fmtMoney(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString();
}

// ── status badges ─────────────────────────────────────────────────────────

function InvoiceBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Draft: "bg-gray-100 text-gray-700 border-gray-200",
    Finalized: "bg-blue-100 text-blue-700 border-blue-200",
    Partial: "bg-amber-100 text-amber-700 border-amber-200",
    Paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Overdue: "bg-rose-100 text-rose-700 border-rose-200",
    Cancelled: "bg-gray-100 text-gray-500 border-gray-200 line-through",
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

function ClaimBadge({ status }: { status: string }) {
  if (!status || status === "not_submitted") return <span className="text-[10px] text-gray-400">—</span>;
  const map: Record<string, string> = {
    submitted: "bg-blue-100 text-blue-700",
    under_review: "bg-amber-100 text-amber-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-rose-100 text-rose-700",
    partially_approved: "bg-orange-100 text-orange-700",
    partially_settled: "bg-orange-100 text-orange-700",
    settled: "bg-emerald-100 text-emerald-700",
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${map[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function RiskDot({ level, reasons }: { level: "low" | "medium" | "high"; reasons: string[] }) {
  const color =
    level === "high" ? "bg-rose-500" : level === "medium" ? "bg-amber-400" : "bg-emerald-400";
  return (
    <span title={reasons.join(" · ") || "Low risk"} className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{level}</span>
    </span>
  );
}

// ── main page ─────────────────────────────────────────────────────────────

const STATUS_FILTERS = ["", "Draft", "Finalized", "Partial", "Paid", "Overdue", "Cancelled"];
const PAYMENT_FILTERS = ["", "Paid", "Partial", "Overdue", "Draft", "Refunded"];
const PATIENT_TYPES = ["", "cash", "corporate", "tpa_insurance"];
const INVOICE_TYPES = ["", "OPD", "IPD", "LAB", "PHARMACY"];
const RISK_LEVELS = ["", "low", "medium", "high"];

export default function MasterBillingPage() {
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
  const [showFilters, setShowFilters] = useState(false);

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

  return (
    <AppShell
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
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg ${
              showFilters
                ? "bg-blue-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Filter className="h-3.5 w-3.5" /> Filters
          </button>
        </div>
      }
    >
      {/* Quick Action Toolbar (blueprint § 6) */}
      <QuickActions />

      {/* KPI Cards (12) */}
      <KpiGrid kpis={kpis} />

      {/* Filter pill row */}
      {showFilters && <FilterRow filter={filter} setFilter={updateFilter} clear={clearFilters} />}

      {/* Master Grid */}
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
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 font-bold sticky top-0">
                <tr>
                  <Th>Patient</Th>
                  <Th>UHID</Th>
                  <Th>Type</Th>
                  <Th>Adm. Type</Th>
                  <Th>Invoice #</Th>
                  <Th>Category</Th>
                  <Th>Payer</Th>
                  <Th>Inv. Status</Th>
                  <Th>Pay Status</Th>
                  <Th>Claim</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Paid</Th>
                  <Th align="right">Outstanding</Th>
                  <Th align="right">Deposit</Th>
                  <Th align="right">Aging</Th>
                  <Th>Last Pay</Th>
                  <Th>Risk</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {grid.map((r) => (
                  <tr key={r.invoice_id} className="border-t border-gray-100 hover:bg-blue-50/30">
                    <Td>
                      <Link
                        href={`/billing/patient/${r.patient_id}`}
                        className="font-bold text-gray-800 hover:underline"
                      >
                        {r.patient_name}
                      </Link>
                      {r.patient_phone && (
                        <div className="text-[10px] text-gray-400">{r.patient_phone}</div>
                      )}
                    </Td>
                    <Td><span className="font-mono">{r.patient_id}</span></Td>
                    <Td>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          r.patient_type === "corporate"
                            ? "bg-blue-50 text-blue-700"
                            : r.patient_type === "tpa_insurance"
                            ? "bg-purple-50 text-purple-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {r.patient_type}
                      </span>
                    </Td>
                    <Td>{r.admission_type}</Td>
                    <Td><span className="font-mono">{r.invoice_number}</span></Td>
                    <Td>{r.billing_category ?? "—"}</Td>
                    <Td>{r.corporate_name ?? "—"}</Td>
                    <Td><InvoiceBadge status={r.invoice_status} /></Td>
                    <Td><PaymentBadge status={r.payment_status} /></Td>
                    <Td><ClaimBadge status={r.claim_status} /></Td>
                    <Td align="right">{fmtMoney(r.total_amount)}</Td>
                    <Td align="right">{fmtMoney(r.paid_amount)}</Td>
                    <Td align="right">
                      <span className={r.outstanding_amount > 0 ? "font-bold text-rose-600" : ""}>
                        {fmtMoney(r.outstanding_amount)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className={r.deposit_balance > 0 ? "font-bold text-emerald-600" : "text-gray-400"}>
                        {fmtMoney(r.deposit_balance)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span
                        className={
                          r.aging_days > 30
                            ? "text-rose-600 font-bold"
                            : r.aging_days > 15
                            ? "text-amber-600 font-bold"
                            : "text-gray-500"
                        }
                      >
                        {r.aging_days}d
                      </span>
                    </Td>
                    <Td>{fmtDateTime(r.last_payment_date)}</Td>
                    <Td><RiskDot level={r.risk_level} reasons={r.risk_reasons} /></Td>
                    <Td align="right">
                      <Link
                        href={`/billing/patient/${r.patient_id}`}
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded"
                      >
                        Open
                      </Link>
                    </Td>
                  </tr>
                ))}
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
      {searchOpen && <FinanceSearchModal onClose={() => setSearchOpen(false)} />}
    </AppShell>
  );
}

// ── sub-components ────────────────────────────────────────────────────────

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`px-2.5 py-2 ${align === "right" ? "text-right" : "text-left"} whitespace-nowrap`}
    >
      {children}
    </th>
  );
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <td
      className={`px-2.5 py-2 ${align === "right" ? "text-right" : "text-left"} whitespace-nowrap`}
    >
      {children}
    </td>
  );
}

function QuickActions() {
  // Per blueprint § 6 Quick Action Toolbar.
  // Each button links to the existing flow — the Master Billing page is the orchestrator,
  // not the form host. Forms live in the existing modules (preserves backward compat).
  const actions = [
    { label: "New Bill", icon: Plus, href: "/reception/billing/new" },
    { label: "Collect Payment", icon: CreditCard, href: "/reception/billing" },
    { label: "Add Deposit", icon: Wallet, href: "/finance/deposits" },
    { label: "Process Refund", icon: Undo2, href: "/finance/refunds" },
    { label: "Credit Note", icon: ReceiptText, href: "/finance/credit-notes" },
    { label: "Discharge Settle", icon: BanknoteArrowDown, href: "/ipd/discharge-settlement" },
    { label: "Insurance Claims", icon: Shield, href: "/insurance" },
    { label: "Export", icon: Download, href: "/finance/reports" },
    { label: "Reconcile", icon: ClipboardCheck, href: "/finance/bank-recon" },
    { label: "Write-off", icon: ShieldAlert, href: "/billing/writeoffs" },
    { label: "Approvals", icon: ShieldAlert, href: "/billing/approvals" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-5">
      {actions.map((a) => (
        <Link
          key={a.label}
          href={a.href}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700 text-xs font-bold rounded-lg transition-all"
        >
          <a.icon className="h-3.5 w-3.5" />
          {a.label}
        </Link>
      ))}
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

function FilterRow({
  filter,
  setFilter,
  clear,
}: {
  filter: MasterBillingFilter;
  setFilter: (p: Partial<MasterBillingFilter>) => void;
  clear: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3 flex flex-wrap items-center gap-2">
      <FilterSelect
        label="Invoice"
        value={filter.invoice_status ?? ""}
        options={STATUS_FILTERS}
        onChange={(v) => setFilter({ invoice_status: v || undefined })}
      />
      <FilterSelect
        label="Payment"
        value={filter.payment_status ?? ""}
        options={PAYMENT_FILTERS}
        onChange={(v) => setFilter({ payment_status: v || undefined })}
      />
      <FilterSelect
        label="Patient type"
        value={filter.patient_type ?? ""}
        options={PATIENT_TYPES}
        onChange={(v) => setFilter({ patient_type: v || undefined })}
      />
      <FilterSelect
        label="Invoice type"
        value={filter.invoice_type ?? ""}
        options={INVOICE_TYPES}
        onChange={(v) => setFilter({ invoice_type: v || undefined })}
      />
      <FilterSelect
        label="Risk"
        value={filter.risk_level ?? ""}
        options={RISK_LEVELS}
        onChange={(v) => setFilter({ risk_level: (v || undefined) as any })}
      />
      <input
        type="text"
        placeholder="Search by name / phone / invoice…"
        value={filter.search ?? ""}
        onChange={(e) => setFilter({ search: e.target.value })}
        className="ml-auto px-3 py-1.5 border border-gray-200 rounded-lg text-xs w-64"
      />
      <button
        onClick={clear}
        className="px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-1"
      >
        <X className="h-3 w-3" /> Reset
      </button>
    </div>
  );
}

function FilterSelect({
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
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 border border-gray-200 rounded text-xs"
      >
        {options.map((o) => (
          <option key={o || "_all"} value={o}>
            {o || "All"}
          </option>
        ))}
      </select>
    </div>
  );
}

function FinanceSearchModal({ onClose }: { onClose: () => void }) {
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
            placeholder="Search invoices, receipts, claims, deposits, refunds, patient phone…"
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
              Type at least 2 characters · search across patients, invoices, receipts, claims, deposits, refunds.
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
                  href={h.patient_id ? `/billing/patient/${h.patient_id}` : "/billing"}
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
                          {new Date(h.date).toLocaleDateString()}
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
