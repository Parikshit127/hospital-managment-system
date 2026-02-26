'use client';

import { useState, useActionState } from 'react';
import { createOrganization } from '@/app/actions/superadmin-actions';
import { useRouter } from 'next/navigation';
import {
    Building2, User, Settings, ChevronRight, ChevronLeft, Loader2, Check, AlertCircle
} from 'lucide-react';

const STEPS = [
    { id: 'hospital', label: 'Hospital Info', icon: Building2 },
    { id: 'admin', label: 'Admin Account', icon: User },
    { id: 'config', label: 'Plan & Review', icon: Settings },
];

export default function OnboardingWizard() {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [state, formAction, pending] = useActionState(async (prevState: any, formData: FormData) => {
        const result = await createOrganization(prevState, formData);
        if (result.success) {
            router.push('/superadmin/organizations');
        }
        return result;
    }, null);

    const [formValues, setFormValues] = useState({
        name: '',
        slug: '',
        code: '',
        address: '',
        phone: '',
        email: '',
        license_no: '',
        admin_name: '',
        admin_username: '',
        admin_email: '',
        admin_password: '',
        plan: 'free',
    });

    function updateField(field: string, value: string) {
        setFormValues((prev) => ({ ...prev, [field]: value }));

        // Auto-generate slug from name
        if (field === 'name') {
            const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const code = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || '';
            setFormValues((prev) => ({
                ...prev,
                [field]: value,
                slug: prev.slug === '' || prev.slug === autoSlug(prev.name) ? slug : prev.slug,
                code: prev.code === '' || prev.code === autoCode(prev.name) ? code : prev.code,
            }));
        }
    }

    function autoSlug(name: string) {
        return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    function autoCode(name: string) {
        return name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    }

    const canProceed = () => {
        if (step === 0) return formValues.name && formValues.slug && formValues.code;
        if (step === 1) return formValues.admin_name && formValues.admin_username && formValues.admin_password;
        return true;
    };

    const inputClass = 'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition text-sm';
    const labelClass = 'block text-sm font-medium text-gray-300 mb-1.5';

    return (
        <div>
            {/* Step Indicator */}
            <div className="flex items-center gap-2 mb-8">
                {STEPS.map((s, i) => {
                    const Icon = s.icon;
                    const isActive = i === step;
                    const isDone = i < step;
                    return (
                        <div key={s.id} className="flex items-center gap-2">
                            {i > 0 && <div className={`w-8 h-px ${isDone ? 'bg-violet-500' : 'bg-white/10'}`} />}
                            <button
                                type="button"
                                onClick={() => i < step && setStep(i)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition ${
                                    isActive
                                        ? 'bg-violet-500/15 text-violet-400 border border-violet-500/30'
                                        : isDone
                                        ? 'bg-emerald-500/10 text-emerald-400'
                                        : 'text-gray-500'
                                }`}
                            >
                                {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                                <span className="hidden sm:block">{s.label}</span>
                            </button>
                        </div>
                    );
                })}
            </div>

            {state?.error && (
                <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-400">{state.error}</p>
                </div>
            )}

            <form action={formAction}>
                {/* Hidden fields so FormData always has all values */}
                {Object.entries(formValues).map(([key, val]) => (
                    <input key={key} type="hidden" name={key} value={val} />
                ))}

                <div className="bg-white/5 border border-white/5 rounded-2xl p-6 sm:p-8">
                    {/* Step 0: Hospital Info */}
                    {step === 0 && (
                        <div className="space-y-5">
                            <div>
                                <label className={labelClass}>Hospital Name *</label>
                                <input
                                    type="text"
                                    value={formValues.name}
                                    onChange={(e) => updateField('name', e.target.value)}
                                    className={inputClass}
                                    placeholder="e.g. Avani Multi-Specialty Hospital"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>URL Slug *</label>
                                    <input
                                        type="text"
                                        value={formValues.slug}
                                        onChange={(e) => updateField('slug', e.target.value)}
                                        className={inputClass}
                                        placeholder="avani-hospital"
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Code *</label>
                                    <input
                                        type="text"
                                        value={formValues.code}
                                        onChange={(e) => updateField('code', e.target.value)}
                                        className={inputClass}
                                        placeholder="AVNI"
                                        maxLength={6}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Address</label>
                                <input
                                    type="text"
                                    value={formValues.address}
                                    onChange={(e) => updateField('address', e.target.value)}
                                    className={inputClass}
                                    placeholder="123 Health Street, Medical City"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Phone</label>
                                    <input
                                        type="text"
                                        value={formValues.phone}
                                        onChange={(e) => updateField('phone', e.target.value)}
                                        className={inputClass}
                                        placeholder="+91 9876543210"
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Email</label>
                                    <input
                                        type="email"
                                        value={formValues.email}
                                        onChange={(e) => updateField('email', e.target.value)}
                                        className={inputClass}
                                        placeholder="admin@hospital.com"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>License Number</label>
                                <input
                                    type="text"
                                    value={formValues.license_no}
                                    onChange={(e) => updateField('license_no', e.target.value)}
                                    className={inputClass}
                                    placeholder="HOSP-2024-0001"
                                />
                            </div>
                        </div>
                    )}

                    {/* Step 1: Admin Account */}
                    {step === 1 && (
                        <div className="space-y-5">
                            <p className="text-sm text-gray-400 mb-2">
                                Create an administrator account for this hospital. They will manage staff and settings.
                            </p>
                            <div>
                                <label className={labelClass}>Full Name *</label>
                                <input
                                    type="text"
                                    value={formValues.admin_name}
                                    onChange={(e) => updateField('admin_name', e.target.value)}
                                    className={inputClass}
                                    placeholder="Dr. Rajesh Kumar"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Username *</label>
                                <input
                                    type="text"
                                    value={formValues.admin_username}
                                    onChange={(e) => updateField('admin_username', e.target.value)}
                                    className={inputClass}
                                    placeholder="rajesh.admin"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Email</label>
                                <input
                                    type="email"
                                    value={formValues.admin_email}
                                    onChange={(e) => updateField('admin_email', e.target.value)}
                                    className={inputClass}
                                    placeholder="rajesh@hospital.com"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Password *</label>
                                <input
                                    type="password"
                                    value={formValues.admin_password}
                                    onChange={(e) => updateField('admin_password', e.target.value)}
                                    className={inputClass}
                                    placeholder="Minimum 6 characters"
                                />
                            </div>
                        </div>
                    )}

                    {/* Step 2: Plan & Review */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <div>
                                <label className={labelClass}>Subscription Plan</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {['free', 'pro', 'enterprise'].map((plan) => (
                                        <button
                                            key={plan}
                                            type="button"
                                            onClick={() => updateField('plan', plan)}
                                            className={`p-4 rounded-xl border text-center transition ${
                                                formValues.plan === plan
                                                    ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                                                    : 'border-white/10 bg-white/[0.02] text-gray-400 hover:bg-white/5'
                                            }`}
                                        >
                                            <p className="text-sm font-semibold capitalize">{plan}</p>
                                            <p className="text-[11px] mt-1 text-gray-500">
                                                {plan === 'free' && 'Basic features'}
                                                {plan === 'pro' && 'AI + WhatsApp'}
                                                {plan === 'enterprise' && 'Full platform'}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Review summary */}
                            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 space-y-3">
                                <h3 className="text-sm font-semibold text-white mb-3">Summary</h3>
                                <Row label="Hospital" value={formValues.name} />
                                <Row label="Slug / Code" value={`${formValues.slug} / ${formValues.code}`} />
                                {formValues.address && <Row label="Address" value={formValues.address} />}
                                {formValues.phone && <Row label="Phone" value={formValues.phone} />}
                                {formValues.email && <Row label="Email" value={formValues.email} />}
                                <div className="border-t border-white/5 pt-3 mt-3" />
                                <Row label="Admin" value={`${formValues.admin_name} (${formValues.admin_username})`} />
                                {formValues.admin_email && <Row label="Admin Email" value={formValues.admin_email} />}
                                <Row label="Plan" value={formValues.plan.toUpperCase()} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between mt-6">
                    <button
                        type="button"
                        onClick={() => setStep(Math.max(0, step - 1))}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition ${
                            step === 0 ? 'invisible' : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <ChevronLeft className="h-4 w-4" /> Back
                    </button>

                    {step < STEPS.length - 1 ? (
                        <button
                            type="button"
                            onClick={() => setStep(step + 1)}
                            disabled={!canProceed()}
                            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Next <ChevronRight className="h-4 w-4" />
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={pending}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-sm font-semibold rounded-xl transition disabled:opacity-50"
                        >
                            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            {pending ? 'Creating…' : 'Create Hospital'}
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between text-sm">
            <span className="text-gray-500">{label}</span>
            <span className="text-white font-medium">{value}</span>
        </div>
    );
}
