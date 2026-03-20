'use client';

import { useState, useEffect } from 'react';
import { getOrganizationBilling, updateOrganizationPlan } from '@/app/actions/superadmin-actions';
import { CreditCard, Users, MapPin, Activity, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface BillingTabProps {
    orgId: string;
    currentPlan: string;
    onPlanChange: () => void;
}

export default function BillingTab({ orgId, currentPlan, onPlanChange }: BillingTabProps) {
    const [billing, setBilling] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [changingPlan, setChangingPlan] = useState(false);
    const [message, setMessage] = useState('');

    async function loadBilling() {
        setLoading(true);
        const res = await getOrganizationBilling(orgId);
        if (res.success) setBilling(res.data);
        setLoading(false);
    }

    useEffect(() => { loadBilling(); }, [orgId]);

    async function handleChangePlan(newPlan: string) {
        if (newPlan === billing?.currentPlan) return;
        if (!confirm(`Change plan to "${newPlan}"?`)) return;
        setChangingPlan(true);
        setMessage('');
        const res = await updateOrganizationPlan(orgId, newPlan);
        if (res.success) {
            setMessage('Plan updated successfully');
            onPlanChange();
            loadBilling();
            setTimeout(() => setMessage(''), 3000);
        } else {
            setMessage(res.error || 'Failed to change plan');
        }
        setChangingPlan(false);
    }

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            </div>
        );
    }

    if (!billing) {
        return <div className="text-center py-16 text-gray-500">Failed to load billing data</div>;
    }

    const plan = billing.planDetails;
    const usage = billing.usage;

    const usageBar = (current: number, max: number, label: string) => {
        const unlimited = max === 0;
        const pct = unlimited ? 0 : Math.min(100, (current / max) * 100);
        const isOver = !unlimited && current > max;

        return (
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{label}</span>
                    <span className={`font-semibold ${isOver ? 'text-red-400' : 'text-white'}`}>
                        {current} / {unlimited ? '∞' : max}
                    </span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-violet-500'}`}
                        style={{ width: unlimited ? '0%' : `${pct}%` }}
                    />
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {message && (
                <div className={`p-3 text-sm rounded-lg flex items-center gap-2 ${
                    message.includes('success') ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}>
                    {message.includes('success') ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    {message}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Current Plan */}
                <div className="bg-white/5 border border-white/5 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-violet-500/15 rounded-lg">
                            <CreditCard className="h-5 w-5 text-violet-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Current Plan</h3>
                            <p className="text-2xl font-bold text-violet-400 uppercase">{billing.currentPlan}</p>
                        </div>
                    </div>

                    {plan ? (
                        <div className="space-y-3 text-sm">
                            <p className="text-gray-400">
                                <span className="font-semibold text-white">₹{plan.price_monthly.toLocaleString()}</span> /month
                                <span className="text-gray-600 ml-2">· ₹{plan.price_yearly.toLocaleString()}/year</span>
                            </p>
                            <div className="flex flex-wrap gap-1 mt-2">
                                {(plan.features || []).map((f: string) => (
                                    <span key={f} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-medium rounded">
                                        {f}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-gray-500">No plan details configured. Create subscription plans in the Plans page.</p>
                    )}

                    {/* Change Plan */}
                    <div className="mt-6 pt-4 border-t border-white/5">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Change Plan</p>
                        <div className="flex gap-2">
                            {['free', 'starter', 'pro', 'enterprise'].map(p => (
                                <button key={p} onClick={() => handleChangePlan(p)} disabled={changingPlan || p === billing.currentPlan}
                                    className={`px-3 py-1.5 text-xs font-semibold uppercase rounded-lg transition ${
                                        p === billing.currentPlan
                                            ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                                            : 'bg-white/5 text-gray-500 border border-white/5 hover:text-white hover:bg-white/10'
                                    } disabled:opacity-50`}>
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Usage vs Limits */}
                <div className="bg-white/5 border border-white/5 rounded-xl p-6">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Usage vs Limits</h3>

                    <div className="space-y-4">
                        {usageBar(usage.users, plan?.max_users || 0, 'Staff Users')}
                        {usageBar(usage.branches, plan?.max_branches || 0, 'Branches')}
                        {usageBar(usage.monthlyPatients, plan?.max_patients_per_month || 0, 'Patients (30 days)')}
                    </div>

                    {!plan && (
                        <p className="text-xs text-gray-500 mt-4">Set up subscription plans to enable limit tracking</p>
                    )}
                </div>
            </div>
        </div>
    );
}
