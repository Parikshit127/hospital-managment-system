"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Eye,
  FileText,
  History,
  Loader2,
  Mail,
  Phone,
  ReceiptText,
  RotateCcw,
  Scale,
  Shield,
  ShieldAlert,
  TimerReset,
  Undo2,
  User,
  Wallet,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import {
  getPatientAuditLog,
  getPatientFinancialProfile,
  getPatientLedger,
  getPatientTimeline,
} from "@/app/actions/master-billing-actions";
import { recordPayment } from "@/app/actions/finance-actions";

// ── helpers ───────────────────────────────────────────────────────────────

const fmtMoney = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmtDateTime = (iso: string | Date | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
};
const fmtDate = (iso: string | Date | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
};

type Tab =
  | "invoices"
  | "payments"
  | "deposits"
  | "insurance"
  | "refunds"
  | "credit_notes"
  | "writeoffs"
  | "ledger"
  | "timeline"
  | "audit";

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: "invoices", label: "Invoices", icon: FileText },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "deposits", label: "Deposits", icon: Wallet },
  { key: "insurance", label: "Insurance / TPA", icon: Shield },
  { key: "refunds", label: "Refunds", icon: Undo2 },
  { key: "credit_notes", label: "Credit Notes", icon: ReceiptText },
  { key: "writeoffs", label: "Write-offs", icon: Scale },
  { key: "ledger", label: "Ledger", icon: ClipboardList },
  { key: "timeline", label: "Timeline", icon: History },
  { key: "audit", label: "Audit Log", icon: ShieldAlert },
];

export default function PatientFinancialProfilePage() {
  const params = useParams<{ patientId: string }>();
  const patientId = params?.patientId as string;

  const [profile, setProfile] = useState<any>(null);
  const [ledger, setLedger] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("invoices");
  const [expandedInvoice, setExpandedInvoice] = useState<number | null>(null);
  const [payingInvoice, setPayingInvoice] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, l, t, a] = await Promise.all([
      getPatientFinancialProfile(patientId),
      getPatientLedger(patientId),
      getPatientTimeline(patientId),
      getPatientAuditLog(patientId),
    ]);
    if (p.success) setProfile(p.data);
    if (l.success) setLedger(l.data);
    if (t.success) setTimeline(t.data);
    if (a.success) setAudit(a.data);
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppShell
      pageTitle="Patient Financial Profile"
      pageIcon={<CircleDollarSign className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
      headerActions={
        <Link
          href="/billing"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Master Billing
        </Link>
      }
    >
      {loading && !profile ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !profile ? (
        <div className="py-20 text-center text-sm text-gray-400">
          Patient not found, or no financial records available.
        </div>
      ) : (
        <div className="space-y-5">
          {/* SECTION A — Patient Summary */}
          <PatientSummary profile={profile} />

          {/* SECTION B — Financial Summary Cards */}
          <FinancialCards totals={profile.totals} />

          {/* Tabs row */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="border-b border-gray-100 flex items-center overflow-x-auto">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
                      active
                        ? "border-blue-600 text-blue-700"
                        : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="p-5">
              {tab === "invoices" && (
                <InvoicesTab
                  invoices={profile.invoices}
                  expandedInvoice={expandedInvoice}
                  setExpandedInvoice={setExpandedInvoice}
                  onCollectPayment={(inv: any) => setPayingInvoice(inv)}
                />
              )}
              {tab === "payments" && <PaymentsTab invoices={profile.invoices} />}
              {tab === "deposits" && <DepositsTab deposits={profile.deposits} />}
              {tab === "insurance" && <InsuranceTab claims={profile.claims} preauths={profile.preauths} policies={profile.patient.insurance_policies} />}
              {tab === "refunds" && <RefundsTab refunds={profile.refunds} />}
              {tab === "credit_notes" && <CreditNotesTab invoices={profile.invoices} />}
              {tab === "writeoffs" && (
                <WriteoffsTab
                  patientId={patientId}
                  writeoffs={profile.writeoffs ?? []}
                  invoices={profile.invoices}
                  onChanged={load}
                />
              )}
              {tab === "ledger" && <LedgerTab ledger={ledger} />}
              {tab === "timeline" && <TimelineTab timeline={timeline} />}
              {tab === "audit" && <AuditTab audit={audit} />}
            </div>
          </div>
        </div>
      )}

      {/* Collect Payment Modal */}
      {payingInvoice && (
        <CollectPaymentModal
          invoice={payingInvoice}
          onClose={() => setPayingInvoice(null)}
          onSuccess={() => {
            setPayingInvoice(null);
            load();
          }}
        />
      )}
    </AppShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION A — Patient Summary
// ──────────────────────────────────────────────────────────────────────────

function PatientSummary({ profile }: { profile: any }) {
  const p = profile.patient;
  const totals = profile.totals;
  const policy = p.insurance_policies?.[0];
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="p-3 rounded-xl bg-blue-50">
          <User className="h-7 w-7 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-black text-gray-800">{p.full_name}</h2>
            <span className="font-mono text-xs px-2 py-0.5 bg-gray-100 rounded">{p.patient_id}</span>
            {p.patient_type === "corporate" && p.corporate && (
              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {p.corporate.company_name}
              </span>
            )}
            {p.patient_type === "tpa_insurance" && policy && (
              <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <Shield className="h-3 w-3" /> {policy.provider?.provider_name}
              </span>
            )}
            {p.blood_group && (
              <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-bold">
                {p.blood_group}
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-gray-500 flex flex-wrap gap-3">
            <span>{p.age ?? "—"} {p.gender ? `· ${p.gender}` : ""}</span>
            {p.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {p.phone}
              </span>
            )}
            {p.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {p.email}
              </span>
            )}
            {p.department && <span>· {p.department}</span>}
          </div>
          {p.allergies && (
            <div className="mt-2 text-xs text-amber-700 font-bold flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Allergies: {p.allergies}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Outstanding
          </div>
          <div
            className={`text-3xl font-black ${
              totals.total_outstanding > 0 ? "text-rose-600" : "text-emerald-600"
            }`}
          >
            ₹{fmtMoney(totals.total_outstanding)}
          </div>
          {p.corporate?.credit_limit && (
            <div className="text-[10px] text-gray-400">
              Credit limit ₹{fmtMoney(Number(p.corporate.credit_limit))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION B — Financial Summary Cards
// ──────────────────────────────────────────────────────────────────────────

function FinancialCards({ totals }: { totals: any }) {
  const cards = [
    { label: "Total Billed", value: totals.total_billed, tone: "blue" },
    { label: "Total Paid", value: totals.total_paid, tone: "emerald" },
    { label: "Outstanding", value: totals.total_outstanding, tone: "rose" },
    { label: "Deposits Held", value: totals.deposits_held, tone: "amber" },
    { label: "Insurance Approved", value: totals.insurance_approved, tone: "purple" },
    { label: "Insurance Settled", value: totals.insurance_settled, tone: "purple" },
    { label: "Refunds Issued", value: totals.refunds_issued, tone: "rose" },
    { label: "Credit Notes", value: totals.credit_notes_total, tone: "gray" },
    { label: "Write-offs Posted", value: totals.writeoffs_posted ?? 0, tone: "rose" },
    { label: "GST Total", value: totals.total_tax, tone: "gray" },
    { label: "Discount Given", value: totals.total_discount, tone: "gray" },
  ];
  const tones: Record<string, string> = {
    blue: "border-l-blue-500",
    emerald: "border-l-emerald-500",
    rose: "border-l-rose-500",
    amber: "border-l-amber-500",
    purple: "border-l-purple-500",
    gray: "border-l-gray-300",
  };
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`bg-white border border-gray-200 border-l-4 ${tones[c.tone]} rounded-xl px-4 py-3`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {c.label}
          </div>
          <div className="mt-1 text-xl font-black text-gray-800">₹{fmtMoney(c.value)}</div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION C + D — Invoices + Line Items
// ──────────────────────────────────────────────────────────────────────────

function InvoicesTab({
  invoices,
  expandedInvoice,
  setExpandedInvoice,
  onCollectPayment,
}: {
  invoices: any[];
  expandedInvoice: number | null;
  setExpandedInvoice: (id: number | null) => void;
  onCollectPayment: (inv: any) => void;
}) {
  if (!invoices.length) {
    return <div className="text-xs text-gray-400">No invoices yet.</div>;
  }
  return (
    <div className="space-y-2">
      {invoices.map((inv: any) => {
        const expanded = expandedInvoice === inv.id;
        return (
          <div key={inv.id} className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedInvoice(expanded ? null : inv.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-xs font-bold text-gray-700">
                  {inv.invoice_number}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    inv.status === "Paid"
                      ? "bg-emerald-100 text-emerald-700"
                      : inv.status === "Cancelled"
                      ? "bg-gray-100 text-gray-500"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {inv.status}
                </span>
                <span className="text-[10px] text-gray-400">
                  {inv.invoice_type} · {fmtDate(inv.created_at)}
                </span>
                {Number(inv.tpa_settled_amount) > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-bold">
                    TPA ₹{fmtMoney(Number(inv.tpa_settled_amount))}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="text-right">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider">Net</div>
                  <div className="font-bold">₹{fmtMoney(Number(inv.net_amount))}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider">Paid</div>
                  <div className="font-bold text-emerald-600">₹{fmtMoney(Number(inv.paid_amount))}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider">Balance</div>
                  <div
                    className={`font-bold ${Number(inv.balance_due) > 0 ? "text-rose-600" : "text-gray-400"}`}
                  >
                    ₹{fmtMoney(Number(inv.balance_due))}
                  </div>
                </div>
                <ChevronRight
                  className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
                />
              </div>
            </button>

            {expanded && (
              <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/40 space-y-3">
                {/* Cancelled invoice warning banner */}
                {inv.status === "Cancelled" && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <XCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                      <div className="text-xs text-rose-700 space-y-0.5">
                        <p className="font-bold text-rose-800">This invoice has been cancelled.</p>
                        {inv.cancellation_reason && (
                          <p><span className="font-semibold">Reason:</span> {inv.cancellation_reason}</p>
                        )}
                        {inv.cancelled_by && (
                          <p><span className="font-semibold">Cancelled by:</span> {inv.cancelled_by}</p>
                        )}
                        {inv.cancelled_at && (
                          <p><span className="font-semibold">Cancelled on:</span> {fmtDateTime(inv.cancelled_at)}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Line items (Section D) */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Line Items ({inv.items.length})
                  </div>
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                      <tr>
                        <th className="text-left py-1">Service</th>
                        <th className="text-left py-1">Dept</th>
                        <th className="text-right py-1">Qty</th>
                        <th className="text-right py-1">Unit</th>
                        <th className="text-right py-1">Discount</th>
                        <th className="text-right py-1">Tax</th>
                        <th className="text-right py-1">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv.items.map((it: any) => (
                        <tr key={it.id} className="border-t border-gray-100">
                          <td className="py-1">{it.description}</td>
                          <td className="py-1 text-gray-500">{it.department}</td>
                          <td className="py-1 text-right">{it.quantity}</td>
                          <td className="py-1 text-right">{fmtMoney(Number(it.unit_price))}</td>
                          <td className="py-1 text-right">{fmtMoney(Number(it.discount))}</td>
                          <td className="py-1 text-right">{fmtMoney(Number(it.tax_amount))}</td>
                          <td className="py-1 text-right font-bold">
                            {fmtMoney(Number(it.net_price))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Payment list for this invoice */}
                {inv.payments?.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                      Payments ({inv.payments.length})
                    </div>
                    <table className="w-full text-xs">
                      <thead className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                        <tr>
                          <th className="text-left py-1">Receipt</th>
                          <th className="text-left py-1">Method</th>
                          <th className="text-left py-1">Reference</th>
                          <th className="text-left py-1">Date</th>
                          <th className="text-right py-1">Amount</th>
                          <th className="text-right py-1">Status</th>
                          <th className="text-right py-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {inv.payments.map((p: any) => (
                          <tr key={p.id} className="border-t border-gray-100">
                            <td className="py-1 font-mono">{p.receipt_number}</td>
                            <td className="py-1">{p.payment_method}</td>
                            <td className="py-1 text-gray-500">{p.reference ?? "—"}</td>
                            <td className="py-1 text-gray-500">{fmtDateTime(p.created_at)}</td>
                            <td className="py-1 text-right font-bold">
                              ₹{fmtMoney(Number(p.amount))}
                            </td>
                            <td className="py-1 text-right">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  p.status === "Completed"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : p.status === "Reversed"
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {p.status}
                              </span>
                            </td>
                            <td className="py-1 text-right">
                              <button
                                onClick={() => window.open(`/api/payment/${p.id}/receipt`, '_blank')}
                                className="text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                Receipt
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <ActionLink href={`/finance/invoices/${inv.id}`}>View Detail</ActionLink>
                  {inv.status === "Draft" && (
                    <ActionLink href="/billing">Finalize</ActionLink>
                  )}
                  {Number(inv.balance_due) > 0 && inv.status !== "Cancelled" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCollectPayment(inv);
                      }}
                      className="px-2.5 py-1 bg-white border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 text-xs font-bold text-gray-700 rounded"
                    >
                      Collect Payment
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`/api/invoice/${inv.id}/summary-bill`, '_blank');
                    }}
                    className="px-2.5 py-1 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-xs font-bold text-gray-700 rounded"
                  >
                    Print Bill
                  </button>
                  {inv.admission_id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`/api/discharge/${inv.admission_id}/bill`, '_blank');
                      }}
                      className="px-2.5 py-1 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-xs font-bold text-gray-700 rounded"
                    >
                      Detailed Bill
                    </button>
                  )}
                  <ActionLink href="/finance/credit-notes">Credit Note</ActionLink>
                  <ActionLink href="/finance/refunds">Refund</ActionLink>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-2.5 py-1 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-xs font-bold text-gray-700 rounded"
    >
      {children}
    </Link>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Collect Payment Modal
// ──────────────────────────────────────────────────────────────────────────

function CollectPaymentModal({
  invoice,
  onClose,
  onSuccess,
}: {
  invoice: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const balanceDue = Number(invoice.balance_due);
  const [amount, setAmount] = useState(balanceDue.toString());
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const numAmount = Number(amount) || 0;
  const isValid = numAmount > 0 && numAmount <= balanceDue;

  const handleRazorpay = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoice.id }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Order creation failed (${res.status}): ${text}`);
      }
      const data = await res.json();
      const orderId = data?.data?.order_id || data?.orderId;
      const keyId = data?.data?.key_id || data?.keyId;
      const orderAmount = data?.data?.amount;
      const hospitalName = data?.data?.hospital_name || data?.hospital_name || "Hospital";

      if (!orderId || !keyId || !orderAmount) {
        throw new Error(data.error || "Failed to create payment order. Check Razorpay configuration.");
      }

      if (!window.Razorpay) {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.async = true;
        document.body.appendChild(script);
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = () => reject(new Error("Failed to load Razorpay checkout script"));
        });
      }

      const options = {
        key: keyId,
        amount: orderAmount,
        currency: "INR",
        name: hospitalName,
        description: `Invoice Payment (${invoice.invoice_number})`,
        order_id: orderId,
        method: {
          card: true,
          netbanking: true,
          wallet: true,
          upi: true,
          emi: true,
          paylater: true,
        },
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch("/api/razorpay/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                invoice_id: invoice.id,
              }),
            });
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              setSuccess(true);
              setTimeout(onSuccess, 1200);
            } else {
              setError(verifyData.error || "Payment verification failed.");
            }
          } catch (err: any) {
            setError(err.message || "Payment verification error.");
          }
        },
        modal: {
          ondismiss: () => setSaving(false),
        },
        theme: { color: "#10b981" },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (response: any) => {
        const desc = response?.error?.description || "Payment could not be completed.";
        setError(desc);
        setSaving(false);
      });
      rzp.open();
    } catch (err: any) {
      setError(err.message || "Failed to initiate online payment.");
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!isValid) return;

    if (method === "Online") {
      return handleRazorpay();
    }

    setError(null);
    setSaving(true);
    try {
      const res = await recordPayment({
        invoice_id: invoice.id,
        amount: numAmount,
        payment_method: method,
        payment_type: "Settlement",
        notes: [notes, reference ? `Ref: ${reference}` : ""].filter(Boolean).join(" | ") || undefined,
      });
      if (res.success) {
        setSuccess(true);
        setTimeout(onSuccess, 1200);
      } else {
        setError(res.error || "Payment failed. Please try again.");
      }
    } catch (err: any) {
      setError(err.message || "Unexpected error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Collect Payment</h3>
            <p className="text-[11px] text-gray-500 font-mono mt-0.5">{invoice.invoice_number}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500">
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          <div className="px-5 py-10 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-lg font-bold text-gray-800">Payment Recorded!</p>
            <p className="text-xs text-gray-500 mt-1">₹{fmtMoney(numAmount)} via {method}</p>
          </div>
        ) : (
          <div className="px-5 py-5 space-y-4">
            {/* Invoice Summary */}
            <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Net Amount</div>
                <div className="text-sm font-bold text-gray-700">₹{fmtMoney(Number(invoice.net_amount))}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Paid</div>
                <div className="text-sm font-bold text-emerald-600">₹{fmtMoney(Number(invoice.paid_amount))}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Balance</div>
                <div className="text-sm font-bold text-rose-600">₹{fmtMoney(balanceDue)}</div>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Amount *</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">₹</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={1}
                  max={balanceDue}
                  step="0.01"
                  className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono font-bold focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
                  autoFocus
                />
              </div>
              {numAmount > balanceDue && (
                <p className="text-[11px] text-rose-500 mt-1">Amount cannot exceed balance of ₹{fmtMoney(balanceDue)}</p>
              )}
              <button
                onClick={() => setAmount(balanceDue.toString())}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-bold mt-1"
              >
                Pay Full Balance (₹{fmtMoney(balanceDue)})
              </button>
            </div>

            {/* Payment Method */}
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Payment Method</label>
              <div className="grid grid-cols-5 gap-1.5 mt-1.5">
                {["Cash", "Card", "UPI", "Bank", "Online"].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                      method === m
                        ? "bg-emerald-50 border-emerald-400 text-emerald-700 shadow-sm"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {method === "Online" && (
                <p className="text-[11px] text-blue-600 mt-1.5 font-medium">
                  Razorpay checkout will open for card, UPI, netbanking, wallets, and more.
                </p>
              )}
            </div>

            {/* Reference (for Card/UPI/Bank — not for Cash or Online) */}
            {method !== "Cash" && method !== "Online" && (
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Reference / Transaction ID</label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Enter transaction reference"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 outline-none"
                />
              </div>
            )}

            {/* Notes (not for Online — Razorpay handles it) */}
            {method !== "Online" && (
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Notes (optional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional remark"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 outline-none"
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-lg">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                disabled={saving}
                className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !isValid}
                className="flex-[2] flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                {saving ? "Processing…" : method === "Online" ? `Pay ₹${fmtMoney(numAmount)} Online` : `Record ₹${fmtMoney(numAmount)}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION E — Payments Tab
// ──────────────────────────────────────────────────────────────────────────

function PaymentsTab({ invoices }: { invoices: any[] }) {
  const payments = invoices
    .flatMap((inv: any) =>
      inv.payments.map((p: any) => ({ ...p, invoice_number: inv.invoice_number })),
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (!payments.length) return <div className="text-xs text-gray-400">No payments recorded.</div>;

  return (
    <table className="w-full text-xs">
      <thead className="text-[10px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
        <tr>
          <th className="text-left py-2">Receipt #</th>
          <th className="text-left py-2">Invoice</th>
          <th className="text-left py-2">Method</th>
          <th className="text-left py-2">Reference</th>
          <th className="text-left py-2">Date</th>
          <th className="text-right py-2">Amount</th>
          <th className="text-right py-2">Status</th>
          <th className="text-right py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p: any) => (
          <tr key={p.id} className="border-b border-gray-50">
            <td className="py-2 font-mono">{p.receipt_number}</td>
            <td className="py-2 font-mono text-gray-500">{p.invoice_number}</td>
            <td className="py-2">{p.payment_method}</td>
            <td className="py-2 text-gray-500">{p.reference ?? "—"}</td>
            <td className="py-2 text-gray-500">{fmtDateTime(p.created_at)}</td>
            <td className="py-2 text-right font-bold">₹{fmtMoney(Number(p.amount))}</td>
            <td className="py-2 text-right">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  p.status === "Completed"
                    ? "bg-emerald-100 text-emerald-700"
                    : p.status === "Reversed"
                    ? "bg-rose-100 text-rose-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {p.status}
              </span>
            </td>
            <td className="py-2 text-right flex items-center justify-end gap-2">
              <button
                onClick={() => window.open(`/api/payment/${p.id}/receipt`, '_blank')}
                className="text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
              >
                Receipt
              </button>
              <ActionLink href={`/finance/payments`}>Reverse</ActionLink>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION F — Deposits Tab
// ──────────────────────────────────────────────────────────────────────────

function DepositsTab({ deposits }: { deposits: any[] }) {
  if (!deposits.length)
    return (
      <div className="space-y-3">
        <div className="text-xs text-gray-400">No deposits collected.</div>
        <ActionLink href="/finance/deposits">Collect Deposit</ActionLink>
      </div>
    );

  return (
    <div className="space-y-3">
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
          <tr>
            <th className="text-left py-2">Deposit #</th>
            <th className="text-left py-2">Method</th>
            <th className="text-left py-2">Status</th>
            <th className="text-left py-2">Date</th>
            <th className="text-right py-2">Amount</th>
            <th className="text-right py-2">Applied</th>
            <th className="text-right py-2">Refunded</th>
            <th className="text-right py-2">Balance</th>
          </tr>
        </thead>
        <tbody>
          {deposits.map((d: any) => {
            const balance = Number(d.amount) - Number(d.applied_amount) - Number(d.refunded_amount);
            return (
              <tr key={d.id} className="border-b border-gray-50">
                <td className="py-2 font-mono">{d.deposit_number}</td>
                <td className="py-2">{d.payment_method}</td>
                <td className="py-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      d.status === "Active"
                        ? "bg-emerald-100 text-emerald-700"
                        : d.status === "Applied"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {d.status}
                  </span>
                </td>
                <td className="py-2 text-gray-500">{fmtDate(d.created_at)}</td>
                <td className="py-2 text-right font-bold">₹{fmtMoney(Number(d.amount))}</td>
                <td className="py-2 text-right">₹{fmtMoney(Number(d.applied_amount))}</td>
                <td className="py-2 text-right">₹{fmtMoney(Number(d.refunded_amount))}</td>
                <td
                  className={`py-2 text-right font-bold ${balance > 0 ? "text-emerald-600" : "text-gray-400"}`}
                >
                  ₹{fmtMoney(balance)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex gap-1.5">
        <ActionLink href="/finance/deposits">Collect Deposit</ActionLink>
        <ActionLink href="/finance/deposits">Apply Deposit</ActionLink>
        <ActionLink href="/finance/deposits">Refund Deposit</ActionLink>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION G — Insurance / TPA Tab
// ──────────────────────────────────────────────────────────────────────────

function InsuranceTab({
  claims,
  preauths,
  policies,
}: {
  claims: any[];
  preauths: any[];
  policies: any[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
          Active Policies
        </h4>
        {!policies?.length ? (
          <div className="text-xs text-gray-400">No active insurance policies.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {policies.map((pol: any) => (
              <div key={pol.id} className="border border-gray-200 rounded-xl p-3">
                <div className="font-bold text-sm">{pol.provider?.provider_name ?? "—"}</div>
                <div className="text-[11px] text-gray-500">
                  Policy {pol.policy_number} · {pol.policy_type ?? "—"}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <Field label="Sum Insured" value={`₹${fmtMoney(Number(pol.sum_insured))}`} />
                  <Field label="Balance" value={`₹${fmtMoney(Number(pol.balance_amount))}`} />
                  <Field label="Valid Until" value={fmtDate(pol.valid_until)} />
                  <Field label="Status" value={pol.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
          Pre-Authorisations ({preauths.length})
        </h4>
        {!preauths.length ? (
          <div className="text-xs text-gray-400">No pre-auths raised.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
              <tr>
                <th className="text-left py-2">Pre-Auth #</th>
                <th className="text-left py-2">Provider</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Requested</th>
                <th className="text-right py-2">Requested</th>
                <th className="text-right py-2">Approved</th>
              </tr>
            </thead>
            <tbody>
              {preauths.map((pa: any) => (
                <tr key={pa.id} className="border-b border-gray-50">
                  <td className="py-2 font-mono">{pa.pre_auth_number ?? "—"}</td>
                  <td className="py-2">{pa.provider?.provider_name ?? "—"}</td>
                  <td className="py-2 font-bold">{pa.status}</td>
                  <td className="py-2 text-gray-500">{fmtDate(pa.requested_at)}</td>
                  <td className="py-2 text-right">₹{fmtMoney(Number(pa.requested_amount))}</td>
                  <td className="py-2 text-right font-bold text-emerald-600">
                    ₹{fmtMoney(Number(pa.approved_amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
          Claims ({claims.length})
        </h4>
        {!claims.length ? (
          <div className="text-xs text-gray-400">No claims raised.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
              <tr>
                <th className="text-left py-2">Claim #</th>
                <th className="text-left py-2">Provider</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Submitted</th>
                <th className="text-right py-2">Claim</th>
                <th className="text-right py-2">Approved</th>
                <th className="text-right py-2">Settled</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c: any) => (
                <tr key={c.id} className="border-b border-gray-50">
                  <td className="py-2 font-mono">{c.claim_number ?? `C-${c.id.slice(0, 8)}`}</td>
                  <td className="py-2">{c.provider?.provider_name ?? "—"}</td>
                  <td className="py-2 font-bold">{c.status}</td>
                  <td className="py-2 text-gray-500">{fmtDate(c.created_at)}</td>
                  <td className="py-2 text-right">₹{fmtMoney(Number(c.claim_amount))}</td>
                  <td className="py-2 text-right">₹{fmtMoney(Number(c.approved_amount))}</td>
                  <td className="py-2 text-right font-bold text-emerald-600">
                    ₹{fmtMoney(Number(c.settled_amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex gap-1.5">
        <ActionLink href="/insurance">Create Pre-Auth</ActionLink>
        <ActionLink href="/insurance">Raise Claim</ActionLink>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-sm font-bold text-gray-800">{value ?? "—"}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION H — Refunds Tab
// ──────────────────────────────────────────────────────────────────────────

function RefundsTab({ refunds }: { refunds: any[] }) {
  if (!refunds.length)
    return (
      <div className="space-y-3">
        <div className="text-xs text-gray-400">No refunds for this patient.</div>
        <ActionLink href="/finance/refunds">Request Refund</ActionLink>
      </div>
    );
  return (
    <div className="space-y-3">
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
          <tr>
            <th className="text-left py-2">Refund #</th>
            <th className="text-left py-2">Invoice</th>
            <th className="text-left py-2">Reason</th>
            <th className="text-left py-2">Status</th>
            <th className="text-left py-2">Processed By</th>
            <th className="text-left py-2">Date</th>
            <th className="text-right py-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {refunds.map((r: any) => (
            <tr key={r.id} className="border-b border-gray-50">
              <td className="py-2 font-mono">R-{r.id}</td>
              <td className="py-2 font-mono text-gray-500">{r.invoice_id}</td>
              <td className="py-2">{r.reason}</td>
              <td className="py-2">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    r.status === "Processed"
                      ? "bg-emerald-100 text-emerald-700"
                      : r.status === "Pending"
                      ? "bg-amber-100 text-amber-700"
                      : r.status === "Rejected"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {r.status}
                </span>
              </td>
              <td className="py-2 text-gray-500">{r.processed_by ?? "—"}</td>
              <td className="py-2 text-gray-500">{fmtDate(r.created_at)}</td>
              <td className="py-2 text-right font-bold">₹{fmtMoney(Number(r.amount))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ActionLink href="/finance/refunds">Request New Refund</ActionLink>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION I — Credit Notes
// ──────────────────────────────────────────────────────────────────────────

function CreditNotesTab({ invoices }: { invoices: any[] }) {
  const notes = invoices
    .flatMap((inv: any) =>
      inv.credit_notes.map((cn: any) => ({ ...cn, invoice_number: inv.invoice_number })),
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (!notes.length)
    return (
      <div className="space-y-3">
        <div className="text-xs text-gray-400">No credit notes issued.</div>
        <ActionLink href="/finance/credit-notes">Create Credit Note</ActionLink>
      </div>
    );
  return (
    <div className="space-y-3">
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
          <tr>
            <th className="text-left py-2">Credit Note #</th>
            <th className="text-left py-2">Invoice</th>
            <th className="text-left py-2">Reason</th>
            <th className="text-left py-2">Status</th>
            <th className="text-left py-2">Approved By</th>
            <th className="text-left py-2">Date</th>
            <th className="text-right py-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {notes.map((cn: any) => (
            <tr key={cn.id} className="border-b border-gray-50">
              <td className="py-2 font-mono">{cn.credit_note_number}</td>
              <td className="py-2 font-mono text-gray-500">{cn.invoice_number}</td>
              <td className="py-2">{cn.reason}</td>
              <td className="py-2">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    cn.status === "Approved" || cn.status === "Applied"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {cn.status}
                </span>
              </td>
              <td className="py-2 text-gray-500">{cn.approved_by ?? "—"}</td>
              <td className="py-2 text-gray-500">{fmtDate(cn.created_at)}</td>
              <td className="py-2 text-right font-bold">₹{fmtMoney(Number(cn.total_amount))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ActionLink href="/finance/credit-notes">Create Credit Note</ActionLink>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION J — Write-offs (Master Billing Phase 2)
// ──────────────────────────────────────────────────────────────────────────

function WriteoffsTab({
  patientId,
  writeoffs,
  invoices,
  onChanged,
}: {
  patientId: string;
  writeoffs: any[];
  invoices: any[];
  onChanged: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    invoice_id: "",
    writeoff_type: "bad_debt",
    amount: "",
    reason: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(form.amount);
    if (!amountNum || amountNum <= 0 || form.reason.trim().length < 5) {
      alert("Positive amount and reason ≥ 5 chars are required");
      return;
    }
    setSaving(true);
    const { requestWriteoff } = await import("@/app/actions/writeoff-actions");
    const res = await requestWriteoff({
      patient_id: patientId,
      invoice_id: form.invoice_id ? Number(form.invoice_id) : null,
      writeoff_type: form.writeoff_type as any,
      amount: amountNum,
      reason: form.reason,
      notes: form.notes || null,
    });
    setSaving(false);
    if (res.success) {
      setShowCreate(false);
      setForm({ invoice_id: "", writeoff_type: "bad_debt", amount: "", reason: "", notes: "" });
      onChanged();
    } else {
      alert((res as any).error);
    }
  };

  const posted = writeoffs.filter((w) => w.status === "Posted");
  const pending = writeoffs.filter((w) => ["Requested", "Approved"].includes(w.status));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 text-xs">
          <div>
            <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px]">
              Posted ({posted.length})
            </span>
            <span className="ml-2 font-bold text-rose-600">
              ₹{fmtMoney(posted.reduce((s, w) => s + Number(w.amount), 0))}
            </span>
          </div>
          <div>
            <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px]">
              Pending ({pending.length})
            </span>
            <span className="ml-2 font-bold text-amber-600">
              ₹{fmtMoney(pending.reduce((s, w) => s + Number(w.amount), 0))}
            </span>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Link
            href="/billing/approvals"
            className="px-2.5 py-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded"
          >
            Approval Center
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded flex items-center gap-1"
          >
            <Scale className="h-3 w-3" /> Request Write-off
          </button>
        </div>
      </div>

      {writeoffs.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
          <div className="font-bold mb-1">No write-offs for this patient.</div>
          A write-off explicitly forgives an outstanding receivable (charity, bad debt, employee
          waiver, etc.). It requires approval per amount-tier rules and is posted to a dedicated
          GL expense account.
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              <tr>
                <th className="text-left px-3 py-2">Number</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-left px-3 py-2">Invoice</th>
                <th className="text-left px-3 py-2">Reason</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Approved By</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-right px-3 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {writeoffs.map((wo: any) => (
                <tr key={wo.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono font-bold">{wo.writeoff_number}</td>
                  <td className="px-3 py-2 capitalize">{wo.writeoff_type.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 font-mono text-gray-500">
                    {wo.invoice?.invoice_number ?? "—"}
                  </td>
                  <td className="px-3 py-2 max-w-xs truncate" title={wo.reason}>
                    {wo.reason}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        wo.status === "Posted"
                          ? "bg-emerald-100 text-emerald-700"
                          : wo.status === "Approved"
                          ? "bg-blue-100 text-blue-700"
                          : wo.status === "Rejected"
                          ? "bg-rose-100 text-rose-700"
                          : wo.status === "Reversed"
                          ? "bg-gray-100 text-gray-600"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {wo.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{wo.approved_by ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {fmtDate(wo.created_at)}
                  </td>
                  <td className="px-3 py-2 text-right font-bold">
                    ₹{fmtMoney(Number(wo.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(15,23,42,0.45)", backdropFilter: "blur(6px)" }}
          onClick={() => !saving && setShowCreate(false)}
        >
          <form
            onSubmit={onSubmit}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4"
          >
            <h3 className="text-lg font-black text-gray-800">Request Write-off</h3>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Apply to invoice (optional)
              </label>
              <select
                value={form.invoice_id}
                onChange={(e) => setForm({ ...form, invoice_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">— Patient-level (no specific invoice) —</option>
                {invoices
                  .filter((i: any) => Number(i.balance_due) > 0)
                  .map((i: any) => (
                    <option key={i.id} value={i.id}>
                      {i.invoice_number} · ₹{Number(i.balance_due).toLocaleString("en-IN")}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Type *
              </label>
              <select
                value={form.writeoff_type}
                onChange={(e) => setForm({ ...form, writeoff_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="charity">Charity</option>
                <option value="bad_debt">Bad Debt</option>
                <option value="management_waiver">Management Waiver</option>
                <option value="settlement_adjustment">Settlement Adjustment</option>
                <option value="employee_waiver">Employee Waiver</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Amount *
              </label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Reason * (min 5 chars)
              </label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Internal notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
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
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION K — Patient Financial Ledger (THE most important section)
// ──────────────────────────────────────────────────────────────────────────

function LedgerTab({ ledger }: { ledger: any }) {
  if (!ledger) return <div className="text-xs text-gray-400">No ledger entries.</div>;
  const items = ledger.ledger ?? [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Total Debit" value={`₹${fmtMoney(ledger.total_debit)}`} />
        <Field label="Total Credit" value={`₹${fmtMoney(ledger.total_credit)}`} />
        <Field
          label="Closing Balance"
          value={
            <span className={ledger.closing_balance > 0 ? "text-rose-600" : "text-emerald-600"}>
              ₹{fmtMoney(ledger.closing_balance)}
            </span>
          }
        />
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-gray-400">No ledger entries.</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100 sticky top-0 bg-white">
            <tr>
              <th className="text-left py-2">Date</th>
              <th className="text-left py-2">Event</th>
              <th className="text-left py-2">Description</th>
              <th className="text-left py-2">Reference</th>
              <th className="text-left py-2">Source</th>
              <th className="text-right py-2">Debit</th>
              <th className="text-right py-2">Credit</th>
              <th className="text-right py-2">Running Balance</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e: any, idx: number) => (
              <tr key={idx} className="border-b border-gray-50">
                <td className="py-2 text-gray-500">{fmtDateTime(e.date)}</td>
                <td className="py-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${eventTone(e.event)}`}
                  >
                    {e.event}
                  </span>
                </td>
                <td className="py-2">{e.description}</td>
                <td className="py-2 font-mono text-gray-500">{e.reference}</td>
                <td className="py-2 text-gray-500">{e.source}</td>
                <td className="py-2 text-right">{e.debit > 0 ? `₹${fmtMoney(e.debit)}` : "—"}</td>
                <td className="py-2 text-right">{e.credit > 0 ? `₹${fmtMoney(e.credit)}` : "—"}</td>
                <td
                  className={`py-2 text-right font-bold ${
                    e.running_balance > 0 ? "text-rose-600" : "text-gray-600"
                  }`}
                >
                  ₹{fmtMoney(e.running_balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function eventTone(event: string): string {
  if (event === "Invoice") return "bg-blue-100 text-blue-700";
  if (event === "Payment") return "bg-emerald-100 text-emerald-700";
  if (event.startsWith("Deposit")) return "bg-amber-100 text-amber-700";
  if (event === "Refund") return "bg-rose-100 text-rose-700";
  if (event === "Credit Note") return "bg-purple-100 text-purple-700";
  if (event === "Insurance Settlement") return "bg-cyan-100 text-cyan-700";
  return "bg-gray-100 text-gray-700";
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION L — Timeline
// ──────────────────────────────────────────────────────────────────────────

function TimelineTab({ timeline }: { timeline: any[] }) {
  if (!timeline.length) return <div className="text-xs text-gray-400">No events.</div>;
  return (
    <div className="space-y-2 relative">
      <div className="absolute left-3 top-1 bottom-1 w-px bg-gray-200" />
      {timeline.map((e, idx) => (
        <div key={idx} className="flex items-start gap-3 pl-1">
          <div
            className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-white z-10 ${
              e.kind === "payment"
                ? "bg-emerald-500"
                : e.kind === "invoice_created"
                ? "bg-blue-500"
                : e.kind === "invoice_finalized"
                ? "bg-indigo-500"
                : e.kind === "admission"
                ? "bg-purple-500"
                : e.kind === "discharge"
                ? "bg-gray-500"
                : e.kind === "refund"
                ? "bg-rose-500"
                : "bg-amber-500"
            }`}
          >
            {e.kind === "payment" && <CreditCard className="h-3 w-3" />}
            {e.kind === "invoice_created" && <FileText className="h-3 w-3" />}
            {e.kind === "invoice_finalized" && <CheckCircle2 className="h-3 w-3" />}
            {e.kind === "admission" && <Activity className="h-3 w-3" />}
            {e.kind === "discharge" && <XCircle className="h-3 w-3" />}
            {e.kind === "refund" && <Undo2 className="h-3 w-3" />}
            {e.kind === "preauth" && <Shield className="h-3 w-3" />}
          </div>
          <div className="flex-1">
            <div className="text-sm text-gray-700 font-bold">{e.label}</div>
            <div className="text-[11px] text-gray-400 font-medium">
              {fmtDateTime(e.ts)}
              {e.meta ? ` · ${e.meta}` : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION M — Audit Log
// ──────────────────────────────────────────────────────────────────────────

function AuditTab({ audit }: { audit: any[] }) {
  if (!audit.length) return <div className="text-xs text-gray-400">No audit events.</div>;
  return (
    <table className="w-full text-xs">
      <thead className="text-[10px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
        <tr>
          <th className="text-left py-2">Timestamp</th>
          <th className="text-left py-2">User</th>
          <th className="text-left py-2">Role</th>
          <th className="text-left py-2">Action</th>
          <th className="text-left py-2">Module</th>
          <th className="text-left py-2">Entity</th>
          <th className="text-left py-2">Details</th>
          <th className="text-left py-2">IP</th>
        </tr>
      </thead>
      <tbody>
        {audit.map((a: any) => (
          <tr key={a.id} className="border-b border-gray-50">
            <td className="py-2 text-gray-500 whitespace-nowrap">{fmtDateTime(a.created_at)}</td>
            <td className="py-2 font-bold">{a.username ?? "—"}</td>
            <td className="py-2 text-gray-500">{a.role ?? "—"}</td>
            <td className="py-2">{a.action}</td>
            <td className="py-2 text-gray-500">{a.module}</td>
            <td className="py-2 text-gray-500">
              {a.entity_type ? `${a.entity_type} · ${a.entity_id ?? "—"}` : a.entity_id ?? "—"}
            </td>
            <td className="py-2 text-gray-700 max-w-md truncate" title={a.details ?? ""}>
              {a.details ?? "—"}
            </td>
            <td className="py-2 font-mono text-gray-400 text-[10px]">{a.ip_address ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
