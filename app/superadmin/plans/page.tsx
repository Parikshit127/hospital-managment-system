'use client';

import { useState, useEffect } from 'react';
import { getSubscriptionPlans, createSubscriptionPlan, updateSubscriptionPlan } from '@/app/actions/superadmin-actions';
import { CreditCard, Plus, Edit2, AlertCircle, CheckCircle, Loader2, Check } from 'lucide-react';

const ALL_FEATURES = [
    'OPD', 'IPD', 'Lab', 'Radiology', 'Pharmacy', 'Insurance', 'Finance', 'Inventory', 'Reports', 'HR',
];

export default function SubscriptionPlansPage() {
    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editPlan, setEditPlan] = useState<any>(null);

    async function loadPlans() {
        setLoading(true);
        const res = await getSubscriptionPlans();
        if (res.success) setPlans(res.data || []);
        setLoading(false);
    }

    useEffect(() => { loadPlans(); }, []);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Subscription Plans</h1>
                    <p className="text-sm text-gray-400 mt-1">Manage pricing tiers and feature access</p>
                </div>
                <button onClick={() => { setEditPlan(null); setShowModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition">
                    <Plus className="h-4 w-4" /> Add Plan
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                </div>
            ) : plans.length === 0 ? (
                <div className="text-center py-16 bg-white/5 border border-white/5 rounded-xl">
                    <CreditCard className="h-10 w-10 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400 font-medium">No subscription plans defined</p>
                    <p className="text-xs text-gray-500 mt-1">Create plans to manage tenant feature access and limits</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {plans.map(plan => (
                        <div key={plan.id} className={`bg-white/5 border rounded-xl p-6 relative ${plan.is_active ? 'border-white/10' : 'border-white/5 opacity-60'}`}>
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-white">{plan.plan_name}</h3>
                                    <p className="text-xs text-gray-500 font-mono uppercase">{plan.plan_code}</p>
                                </div>
                                <button onClick={() => { setEditPlan(plan); setShowModal(true); }}
                                    className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition">
                                    <Edit2 className="h-3.5 w-3.5" />
                                </button>
                            </div>

                            <div className="mb-4">
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-bold text-white">₹{plan.price_monthly.toLocaleString()}</span>
                                    <span className="text-xs text-gray-500">/mo</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">₹{plan.price_yearly.toLocaleString()}/year</p>
                            </div>

                            <div className="space-y-2 text-sm mb-4">
                                <p className="text-gray-400">
                                    <span className="font-semibold text-white">{plan.max_users || '∞'}</span> users
                                </p>
                                <p className="text-gray-400">
                                    <span className="font-semibold text-white">{plan.max_branches || '∞'}</span> branches
                                </p>
                                {plan.max_patients_per_month && (
                                    <p className="text-gray-400">
                                        <span className="font-semibold text-white">{plan.max_patients_per_month}</span> patients/mo
                                    </p>
                                )}
                            </div>

                            <div className="border-t border-white/5 pt-3">
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">Features</p>
                                <div className="flex flex-wrap gap-1">
                                    {(plan.features || []).map((f: string) => (
                                        <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-medium rounded">
                                            <Check className="h-2.5 w-2.5" /> {f}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {!plan.is_active && (
                                <div className="absolute top-3 right-3">
                                    <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-[10px] font-bold rounded uppercase">Inactive</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {showModal && (
                <PlanModal
                    plan={editPlan}
                    onClose={() => { setShowModal(false); setEditPlan(null); }}
                    onSave={() => { setShowModal(false); setEditPlan(null); loadPlans(); }}
                />
            )}
        </div>
    );
}

function PlanModal({ plan, onClose, onSave }: { plan?: any; onClose: () => void; onSave: () => void }) {
    const [form, setForm] = useState({
        plan_name: plan?.plan_name || '',
        plan_code: plan?.plan_code || '',
        max_users: plan?.max_users ?? 0,
        max_branches: plan?.max_branches ?? 0,
        max_patients_per_month: plan?.max_patients_per_month ?? '',
        features: plan?.features || [],
        price_monthly: plan?.price_monthly ?? 0,
        price_yearly: plan?.price_yearly ?? 0,
        is_active: plan?.is_active ?? true,
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const update = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

    const toggleFeature = (feat: string) => {
        const features = form.features.includes(feat)
            ? form.features.filter((f: string) => f !== feat)
            : [...form.features, feat];
        update('features', features);
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.plan_name || !form.plan_code) {
            setError('Plan name and code are required');
            return;
        }
        setSaving(true);
        setError('');

        const payload = {
            ...form,
            max_patients_per_month: form.max_patients_per_month !== '' ? Number(form.max_patients_per_month) : null,
        };

        const res = plan
            ? await updateSubscriptionPlan(plan.id, payload)
            : await createSubscriptionPlan(payload);

        if (res.success) onSave();
        else setError(res.error || 'Failed to save');
        setSaving(false);
    }

    const fieldClass = 'w-full px-3 py-2.5 bg-[#161b22] border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none';
    const labelClass = 'block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-[#0d1117] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">{plan ? 'Edit Plan' : 'Add Plan'}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">&times;</button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" /> {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Plan Name *</label>
                            <input type="text" value={form.plan_name} onChange={e => update('plan_name', e.target.value)} className={fieldClass} placeholder="Pro" />
                        </div>
                        <div>
                            <label className={labelClass}>Plan Code *</label>
                            <input type="text" value={form.plan_code} onChange={e => update('plan_code', e.target.value)} className={fieldClass} placeholder="pro" disabled={!!plan} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Price Monthly (₹)</label>
                            <input type="number" min="0" value={form.price_monthly} onChange={e => update('price_monthly', Number(e.target.value))} className={fieldClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Price Yearly (₹)</label>
                            <input type="number" min="0" value={form.price_yearly} onChange={e => update('price_yearly', Number(e.target.value))} className={fieldClass} />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className={labelClass}>Max Users (0=∞)</label>
                            <input type="number" min="0" value={form.max_users} onChange={e => update('max_users', Number(e.target.value))} className={fieldClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Max Branches (0=∞)</label>
                            <input type="number" min="0" value={form.max_branches} onChange={e => update('max_branches', Number(e.target.value))} className={fieldClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Max Patients/Mo</label>
                            <input type="number" min="0" value={form.max_patients_per_month} onChange={e => update('max_patients_per_month', e.target.value)} className={fieldClass} placeholder="Unlimited" />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Features</label>
                        <div className="flex flex-wrap gap-2">
                            {ALL_FEATURES.map(feat => (
                                <button key={feat} type="button" onClick={() => toggleFeature(feat)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                                        form.features.includes(feat)
                                            ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                                            : 'bg-white/5 text-gray-500 border border-white/5 hover:text-gray-300'
                                    }`}>
                                    {feat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {plan && (
                        <div className="flex items-center gap-2">
                            <input type="checkbox" checked={form.is_active} onChange={e => update('is_active', e.target.checked)}
                                className="rounded border-gray-600 text-violet-600 focus:ring-violet-500 bg-[#161b22]" />
                            <label className="text-sm text-gray-300">Active</label>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-400 bg-white/5 rounded-lg hover:bg-white/10 transition">Cancel</button>
                        <button type="submit" disabled={saving} className="px-6 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-500 disabled:opacity-50 transition">
                            {saving ? 'Saving...' : plan ? 'Update Plan' : 'Create Plan'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
