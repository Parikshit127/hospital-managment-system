'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, ShieldCheck, Loader2, Building2, CalendarDays, FileText, Banknote, Receipt, Plus, Pencil, Save } from 'lucide-react';
import {
    getPatientPolicies,
    getPatientTpaInvoices,
    getInsuranceProviders,
    addPatientPolicy,
    updatePatientPolicy,
} from '@/app/actions/insurance-actions';
import { RecordTpaPaymentModal } from '@/app/components/billing/RecordTpaPaymentModal';

type Provider = { id: number; provider_name: string; provider_code?: string | null };

const POLICY_TYPES = ['Individual', 'Family Floater', 'Group / Corporate', 'Government Scheme', 'Senior Citizen', 'Other'];

type Claim = {
    id: number;
    claim_number: string;
    status: string;
    claimed_amount: number | null;
    approved_amount: number | null;
    settled_amount: number | null;
    rejected_amount: number | null;
    submitted_at: string | null;
    settled_at: string | null;
};

type Policy = {
    id: number;
    policy_number: string;
    plan_name: string | null;
    policy_holder: string | null;
    member_id: string | null;
    policy_type: string | null;
    status: string;
    coverage_limit: number | null;
    remaining_limit: number | null;
    valid_from: string | null;
    valid_until: string | null;
    copay_percent: number | null;
    copay_fixed: number | null;
    provider: { provider_name: string; provider_code: string } | null;
    claims: Claim[];
};

// A patient's TPA bill — the system tracks the claim lifecycle on the invoice.
type TpaInvoice = {
    id: number;
    version: number;
    invoice_number: string;
    billing_patient_type: string;
    tpa_provider_id: number | null;
    tpa_provider_name: string | null;
    tpa_claim_status: string;
    tpa_claim_number: string | null;
    tpa_approved_amount: number | null;
    tpa_settled_amount: number | null;
    net_amount: number | null;
    created_at: string | null;
};

// Exact invoice shape RecordTpaPaymentModal expects.
type TpaInvoiceTarget = {
    id: number;
    version: number;
    invoice_number: string;
    patient_name?: string | null;
    tpa_provider_name?: string | null;
    tpa_approved_amount: number;
    tpa_settled_amount: number;
};

interface PanelProps {
    patientId: string;
    patientName?: string;
    patientType?: string;
}

interface ModalProps extends PanelProps {
    open: boolean;
    onClose: () => void;
}

const inr = (n: number | null | undefined) =>
    n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN');

const fdate = (s: string | null | undefined) =>
    s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function statusCls(status: string): string {
    const s = (status || '').toLowerCase();
    if (s.includes('settl') || s.includes('approv') || s === 'active') return 'bg-emerald-100 text-emerald-700';
    if (s.includes('reject') || s.includes('denied') || s === 'expired') return 'bg-rose-100 text-rose-700';
    if (s.includes('submit') || s.includes('pending') || s.includes('review')) return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-600';
}

// Human-readable labels + colours for the invoice-level TPA claim status.
const TPA_STATUS_LABEL: Record<string, string> = {
    not_submitted: 'Not Submitted',
    submitted: 'Submitted',
    under_review: 'Under Review',
    approved: 'Approved · Awaiting Payment',
    partially_settled: 'Partially Settled',
    settled: 'Settled',
    rejected: 'Rejected',
};

function tpaStatusLabel(s: string): string {
    return TPA_STATUS_LABEL[s] ?? s;
}

function tpaStatusCls(s: string): string {
    if (s === 'settled') return 'bg-emerald-100 text-emerald-700';
    if (s === 'approved' || s === 'partially_settled') return 'bg-amber-100 text-amber-700';
    if (s === 'rejected') return 'bg-rose-100 text-rose-700';
    if (s === 'submitted' || s === 'under_review') return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-600';
}

// Mirrors the Master Billing gate: payment can only be recorded when the
// invoice's TPA claim is approved (awaiting payment) or partially settled.
function canRecordTpaPayment(status: string | undefined): boolean {
    return status === 'approved' || status === 'partially_settled';
}

/**
 * Inline TPA / Insurance profile panel — shows the patient's policies, coverage
 * and recent claims, plus an actionable "TPA Claims & Payments" section listing
 * their TPA bills. Approved / partially-settled bills expose a [Mark TPA Received]
 * button that opens the same RecordTpaPaymentModal used by Master Billing.
 */
export function TpaProfilePanel({ patientId, patientName, patientType }: PanelProps) {
    const [loading, setLoading] = useState(true);
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [tpaInvoices, setTpaInvoices] = useState<TpaInvoice[]>([]);
    const [error, setError] = useState<string | null>(null);
    // Tracks the specific bill whose payment is being recorded.
    const [tpaTarget, setTpaTarget] = useState<TpaInvoiceTarget | null>(null);
    // Provider dropdown options + policy add/edit form state.
    const [providers, setProviders] = useState<Provider[]>([]);
    // null = form closed; 'new' = adding; a Policy = editing that policy.
    const [editing, setEditing] = useState<'new' | Policy | null>(null);

    useEffect(() => {
        getInsuranceProviders().then(r => { if (r.success) setProviders((r.data as Provider[]) || []); });
    }, []);

    // Single fetch routine, reused on mount/patient-change and after recording a payment.
    const load = useCallback(async (signal?: { cancelled: boolean }) => {
        setLoading(true);
        setError(null);
        try {
            const [polRes, invRes] = await Promise.all([
                getPatientPolicies(patientId),
                getPatientTpaInvoices(patientId),
            ]);
            if (signal?.cancelled) return;
            if (polRes.success) setPolicies((polRes.data as Policy[]) || []);
            else setError(polRes.error || 'Failed to load TPA profile');
            if (invRes.success) setTpaInvoices((invRes.data as TpaInvoice[]) || []);
        } catch {
            if (!signal?.cancelled) setError('Failed to load TPA profile');
        } finally {
            if (!signal?.cancelled) setLoading(false);
        }
    }, [patientId]);

    useEffect(() => {
        const signal = { cancelled: false };
        void load(signal);
        return () => { signal.cancelled = true; };
    }, [load]);

    const typeLabel =
        patientType === 'tpa_insurance' ? 'TPA / Insurance'
        : patientType === 'corporate' ? 'Corporate'
        : 'Cash / Self-Pay';

    return (
        <div className="space-y-4">
            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                </div>
            ) : error ? (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">{error}</div>
            ) : (
                <>
                    {/* ── Header + Add Policy ── */}
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                            <ShieldCheck className="h-4 w-4 text-purple-500" /> Insurance / TPA Policies
                        </h3>
                        {editing === null && (
                            <button
                                onClick={() => setEditing('new')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg"
                            >
                                <Plus className="h-3.5 w-3.5" /> Add Policy
                            </button>
                        )}
                    </div>

                    {/* ── Add / Edit Policy form ── */}
                    {editing !== null && (
                        <PolicyFormCard
                            patientId={patientId}
                            providers={providers}
                            policy={editing === 'new' ? null : editing}
                            onCancel={() => setEditing(null)}
                            onSaved={() => { setEditing(null); void load(); }}
                        />
                    )}

                    {/* ── TPA Claims & Payments (driven by invoices) ── */}
                    {tpaInvoices.length > 0 && (
                        <div className="border border-amber-200 rounded-xl overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-3 bg-amber-50/70 border-b border-amber-100">
                                <Receipt className="h-4 w-4 text-amber-600 shrink-0" />
                                <span className="font-bold text-gray-900 text-sm">TPA Claims &amp; Payments</span>
                                <span className="ml-auto text-[11px] text-gray-500">{tpaInvoices.length} bill{tpaInvoices.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-gray-400 text-left bg-gray-50/60">
                                            <th className="py-2 px-4 font-medium">Invoice</th>
                                            <th className="py-2 pr-3 font-medium">Status</th>
                                            <th className="py-2 pr-3 font-medium text-right">Approved</th>
                                            <th className="py-2 pr-3 font-medium text-right">Received</th>
                                            <th className="py-2 pr-3 font-medium text-right">Outstanding</th>
                                            <th className="py-2 pr-4 font-medium text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tpaInvoices.map(inv => {
                                            const approved = Number(inv.tpa_approved_amount || 0);
                                            const settled = Number(inv.tpa_settled_amount || 0);
                                            const outstanding = Math.max(0, approved - settled);
                                            // A bill is actionable only while money is still outstanding.
                                            // Some bills keep status 'approved' even after being fully
                                            // received (status flag not flipped), so gate on the amount
                                            // too — and surface those as Settled, not "Awaiting Payment".
                                            const fullyReceived = canRecordTpaPayment(inv.tpa_claim_status) && outstanding <= 0.01;
                                            const showPay = canRecordTpaPayment(inv.tpa_claim_status) && outstanding > 0.01;
                                            const displayStatus = fullyReceived ? 'settled' : inv.tpa_claim_status;
                                            return (
                                                <tr key={inv.id} className="border-t border-gray-100">
                                                    <td className="py-2 px-4">
                                                        <span className="font-mono text-gray-700">{inv.invoice_number || 'Draft (unsaved)'}</span>
                                                        {inv.tpa_provider_name && (
                                                            <span className="block text-[10px] text-gray-400">{inv.tpa_provider_name}</span>
                                                        )}
                                                    </td>
                                                    <td className="py-2 pr-3">
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tpaStatusCls(displayStatus)}`}>
                                                            {tpaStatusLabel(displayStatus)}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 pr-3 text-right text-gray-700">{inr(approved)}</td>
                                                    <td className="py-2 pr-3 text-right text-gray-700">{inr(settled)}</td>
                                                    <td className="py-2 pr-3 text-right font-semibold text-gray-900">{inr(outstanding)}</td>
                                                    <td className="py-2 pr-4 text-right">
                                                        {showPay ? (
                                                            <button
                                                                onClick={() => {
                                                                    // Capture THIS bill's invoice exactly (mirrors Master Billing).
                                                                    setTpaTarget({
                                                                        id: Number(inv.id),
                                                                        version: Number(inv.version || 0),
                                                                        invoice_number: inv.invoice_number,
                                                                        patient_name: patientName ?? null,
                                                                        tpa_provider_name: inv.tpa_provider_name,
                                                                        tpa_approved_amount: approved,
                                                                        tpa_settled_amount: settled,
                                                                    });
                                                                }}
                                                                className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-md hover:bg-amber-100 transition-colors"
                                                                title="Record TPA payment received"
                                                            >
                                                                <Banknote className="h-3 w-3" /> Mark TPA Received
                                                            </button>
                                                        ) : (
                                                            <span className="text-gray-300">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ── Policies ── */}
                    {policies.length === 0 ? (
                        tpaInvoices.length === 0 && (
                            <div className="text-center py-10 text-gray-500">
                                <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
                                <p className="text-sm font-medium">No insurance / TPA policy on file.</p>
                                <p className="text-xs mt-1">This patient is registered as <strong>{typeLabel}</strong>.</p>
                            </div>
                        )
                    ) : (
                        policies.map(p => {
                            const limit = Number(p.coverage_limit ?? 0);
                            const remaining = Number(p.remaining_limit ?? 0);
                            const used = Math.max(0, limit - remaining);
                            const usedPct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                            return (
                                <div key={p.id} className="border border-gray-200 rounded-xl overflow-hidden">
                                    {/* Policy header */}
                                    <div className="flex items-center gap-2 px-4 py-3 bg-purple-50/60 border-b border-gray-100">
                                        <Building2 className="h-4 w-4 text-purple-500 shrink-0" />
                                        <span className="font-bold text-gray-900 text-sm">{p.provider?.provider_name || 'Insurer'}</span>
                                        {p.provider?.provider_code && (
                                            <span className="text-[11px] text-gray-400">[{p.provider.provider_code}]</span>
                                        )}
                                        <div className="ml-auto flex items-center gap-2">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${statusCls(p.status)}`}>
                                                {p.status}
                                            </span>
                                            {editing === null && (
                                                <button
                                                    onClick={() => setEditing(p)}
                                                    className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 hover:border-purple-400 hover:bg-purple-50 text-[10px] font-bold text-gray-700 rounded-md"
                                                >
                                                    <Pencil className="h-3 w-3" /> Edit
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Policy details grid */}
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 px-4 py-3 text-sm">
                                        <Detail label="Policy No." value={p.policy_number} />
                                        <Detail label="Plan" value={p.plan_name || '—'} />
                                        <Detail label="Member ID" value={p.member_id || '—'} />
                                        <Detail label="Policy Holder" value={p.policy_holder || '—'} />
                                        <Detail label="Type" value={p.policy_type || '—'} />
                                        <Detail label="Co-pay" value={p.copay_percent != null ? `${p.copay_percent}%` : p.copay_fixed != null ? inr(p.copay_fixed) : '—'} />
                                        <Detail label="Coverage Limit" value={inr(p.coverage_limit)} />
                                        <Detail label="Remaining" value={inr(p.remaining_limit)} />
                                        <Detail
                                            label="Validity"
                                            value={<span className="flex items-center gap-1"><CalendarDays className="h-3 w-3 text-gray-400" />{fdate(p.valid_from)} – {fdate(p.valid_until)}</span>}
                                        />
                                    </div>

                                    {/* Coverage usage bar */}
                                    {limit > 0 && (
                                        <div className="px-4 pb-3">
                                            <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                                                <span>Used {inr(used)}</span>
                                                <span>{usedPct}% of {inr(limit)}</span>
                                            </div>
                                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div className={`h-full ${usedPct >= 90 ? 'bg-rose-500' : usedPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${usedPct}%` }} />
                                            </div>
                                        </div>
                                    )}

                                    {/* Claims (insurance_claims records — informational) */}
                                    <div className="px-4 pb-4">
                                        <p className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                                            <FileText className="h-3.5 w-3.5" /> Recent Claims
                                        </p>
                                        {(!p.claims || p.claims.length === 0) ? (
                                            <p className="text-xs text-gray-400 italic">No claims for this policy.</p>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="text-gray-400 text-left">
                                                            <th className="py-1 pr-3 font-medium">Claim No.</th>
                                                            <th className="py-1 pr-3 font-medium">Status</th>
                                                            <th className="py-1 pr-3 font-medium text-right">Claimed</th>
                                                            <th className="py-1 pr-3 font-medium text-right">Approved</th>
                                                            <th className="py-1 pr-3 font-medium text-right">Settled</th>
                                                            <th className="py-1 font-medium">Submitted</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {p.claims.map(c => (
                                                            <tr key={c.id} className="border-t border-gray-100">
                                                                <td className="py-1.5 pr-3 font-mono text-gray-700">{c.claim_number}</td>
                                                                <td className="py-1.5 pr-3">
                                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusCls(c.status)}`}>{c.status}</span>
                                                                </td>
                                                                <td className="py-1.5 pr-3 text-right text-gray-700">{inr(c.claimed_amount)}</td>
                                                                <td className="py-1.5 pr-3 text-right text-gray-700">{inr(c.approved_amount)}</td>
                                                                <td className="py-1.5 pr-3 text-right text-gray-700">{inr(c.settled_amount)}</td>
                                                                <td className="py-1.5 text-gray-500">{fdate(c.submitted_at)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </>
            )}

            {/* Record TPA Payment modal — populated with the selected bill's invoice */}
            {tpaTarget && (
                <RecordTpaPaymentModal
                    open
                    invoice={tpaTarget}
                    onClose={() => setTpaTarget(null)}
                    onRecorded={() => { setTpaTarget(null); void load(); }}
                />
            )}
        </div>
    );
}

/**
 * Backwards-compatible overlay wrapper around TpaProfilePanel.
 * Retained so any existing modal-style call sites keep working.
 */
export default function TpaProfileModal({ open, onClose, patientId, patientName, patientType }: ModalProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 bg-white flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
                    <div className="p-2 rounded-xl bg-purple-50">
                        <ShieldCheck className="h-5 w-5 text-purple-600" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-base font-black text-gray-900 truncate">TPA / Insurance Profile</h3>
                        {patientName && <p className="text-xs text-gray-500 truncate">{patientName}</p>}
                    </div>
                    <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-5">
                    <TpaProfilePanel patientId={patientId} patientName={patientName} patientType={patientType} />
                </div>
            </div>
        </div>
    );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
            <p className="text-gray-800 font-medium truncate">{value}</p>
        </div>
    );
}

const dateInputValue = (s: string | null | undefined) => (s ? new Date(s).toISOString().slice(0, 10) : '');
const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

/**
 * Add / edit a patient's insurance / TPA policy. Renders inline inside the TPA
 * Profile panel. `policy === null` → add mode; otherwise edit that policy.
 */
function PolicyFormCard({
    patientId,
    providers,
    policy,
    onCancel,
    onSaved,
}: {
    patientId: string;
    providers: Provider[];
    policy: Policy | null;
    onCancel: () => void;
    onSaved: () => void;
}) {
    const isEdit = policy !== null;
    // Resolved from the provider name in the effect below (Policy carries the
    // provider object, not its numeric id).
    const [providerId, setProviderId] = useState<string>('');
    const [policyNumber, setPolicyNumber] = useState(policy?.policy_number ?? '');
    const [memberId, setMemberId] = useState(policy?.member_id ?? '');
    const [policyHolder, setPolicyHolder] = useState(policy?.policy_holder ?? '');
    const [planName, setPlanName] = useState(policy?.plan_name ?? '');
    const [policyType, setPolicyType] = useState(policy?.policy_type ?? '');
    const [coverageLimit, setCoverageLimit] = useState(policy?.coverage_limit != null ? String(policy.coverage_limit) : '');
    const [copayPercent, setCopayPercent] = useState(policy?.copay_percent != null ? String(policy.copay_percent) : '');
    const [copayFixed, setCopayFixed] = useState(policy?.copay_fixed != null ? String(policy.copay_fixed) : '');
    const [validFrom, setValidFrom] = useState(dateInputValue(policy?.valid_from));
    const [validUntil, setValidUntil] = useState(dateInputValue(policy?.valid_until));
    const [status, setStatus] = useState(policy?.status ?? 'Active');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    // When editing, resolve the provider id by matching the provider name (the
    // Policy shape carries the provider object, not its numeric id).
    useEffect(() => {
        if (policy?.provider?.provider_name) {
            const match = providers.find(p => p.provider_name === policy.provider?.provider_name);
            if (match) setProviderId(String(match.id));
        }
    }, [policy, providers]);

    async function handleSave() {
        if (!providerId) { setFormError('Select an insurance / TPA provider.'); return; }
        setSaving(true);
        setFormError(null);
        const common = {
            provider_id: Number(providerId),
            policy_number: policyNumber.trim() || undefined,
            policy_holder: policyHolder.trim() || undefined,
            plan_name: planName.trim() || undefined,
            member_id: memberId.trim() || undefined,
            policy_type: policyType || undefined,
            coverage_limit: numOrNull(coverageLimit),
            copay_percent: numOrNull(copayPercent),
            copay_fixed: numOrNull(copayFixed),
            valid_from: validFrom || undefined,
            valid_until: validUntil || undefined,
        };
        const res = isEdit
            ? await updatePatientPolicy(policy!.id, { ...common, status })
            : await addPatientPolicy({ patient_id: patientId, ...common });
        setSaving(false);
        if (res.success) onSaved();
        else setFormError(res.error || 'Failed to save policy.');
    }

    return (
        <div className="border border-purple-200 bg-purple-50/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-purple-600" />
                <h4 className="text-sm font-black text-gray-900">{isEdit ? 'Edit Policy' : 'Add Insurance / TPA Policy'}</h4>
            </div>

            {formError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2">{formError}</div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Provider *">
                    <select value={providerId} onChange={e => setProviderId(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400">
                        <option value="">Select provider…</option>
                        {providers.map(p => (
                            <option key={p.id} value={p.id}>{p.provider_name}{p.provider_code ? ` (${p.provider_code})` : ''}</option>
                        ))}
                    </select>
                </Field>
                <Field label="Policy Number">
                    <input value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400" placeholder="e.g. POL-12345" />
                </Field>
                <Field label="Member ID">
                    <input value={memberId} onChange={e => setMemberId(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400" placeholder="e.g. MEM-001" />
                </Field>
                <Field label="Policy Holder">
                    <input value={policyHolder} onChange={e => setPolicyHolder(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400" placeholder="Name on policy" />
                </Field>
                <Field label="Plan Name">
                    <input value={planName} onChange={e => setPlanName(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400" placeholder="e.g. Gold Health Plan" />
                </Field>
                <Field label="Policy Type">
                    <select value={policyType} onChange={e => setPolicyType(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400">
                        <option value="">Select type…</option>
                        {POLICY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </Field>
                <Field label="Coverage Limit (₹)">
                    <input type="number" min="0" value={coverageLimit} onChange={e => setCoverageLimit(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400" placeholder="e.g. 500000" />
                </Field>
                <Field label="Co-pay %">
                    <input type="number" min="0" max="100" value={copayPercent} onChange={e => setCopayPercent(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400" placeholder="e.g. 10" />
                </Field>
                <Field label="Co-pay Fixed (₹)">
                    <input type="number" min="0" value={copayFixed} onChange={e => setCopayFixed(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400" placeholder="e.g. 2000" />
                </Field>
                <Field label="Valid From">
                    <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400" />
                </Field>
                <Field label="Valid Until">
                    <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400" />
                </Field>
                {isEdit && (
                    <Field label="Status">
                        <select value={status} onChange={e => setStatus(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400">
                            {['Active', 'Inactive', 'Expired'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </Field>
                )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={onCancel} disabled={saving} className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700 rounded-lg disabled:opacity-50">
                    Cancel
                </button>
                <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg disabled:opacity-50">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {saving ? 'Saving…' : isEdit ? 'Update Policy' : 'Save Policy'}
                </button>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">{label}</span>
            {children}
        </label>
    );
}
