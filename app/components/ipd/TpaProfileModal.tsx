'use client';

import { useEffect, useState } from 'react';
import { X, ShieldCheck, Loader2, Building2, CalendarDays, FileText } from 'lucide-react';
import { getPatientPolicies } from '@/app/actions/insurance-actions';

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

interface Props {
    open: boolean;
    onClose: () => void;
    patientId: string;
    patientName?: string;
    patientType?: string;
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

export default function TpaProfileModal({ open, onClose, patientId, patientName, patientType }: Props) {
    const [loading, setLoading] = useState(true);
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        getPatientPolicies(patientId)
            .then(res => {
                if (cancelled) return;
                if (res.success) setPolicies((res.data as Policy[]) || []);
                else setError(res.error || 'Failed to load TPA profile');
                setLoading(false);
            })
            .catch(() => { if (!cancelled) { setError('Failed to load TPA profile'); setLoading(false); } });
        return () => { cancelled = true; };
    }, [open, patientId]);

    if (!open) return null;

    const typeLabel =
        patientType === 'tpa_insurance' ? 'TPA / Insurance'
        : patientType === 'corporate' ? 'Corporate'
        : 'Cash / Self-Pay';

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

                <div className="p-5 space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                        </div>
                    ) : error ? (
                        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">{error}</div>
                    ) : policies.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">
                            <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm font-medium">No insurance / TPA policy on file.</p>
                            <p className="text-xs mt-1">This patient is registered as <strong>{typeLabel}</strong>.</p>
                        </div>
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
                                        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${statusCls(p.status)}`}>
                                            {p.status}
                                        </span>
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

                                    {/* Claims */}
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
