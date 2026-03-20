'use client';

import { useState, useActionState } from 'react';
import { createOrganization } from '@/app/actions/superadmin-actions';
import { useRouter } from 'next/navigation';
import {
    Building2, User, Settings, ChevronRight, ChevronLeft, Loader2, Check, AlertCircle,
    MapPin, Shield, CreditCard, X
} from 'lucide-react';

const STEPS = [
    { id: 'hospital', label: 'Hospital Details', icon: Building2 },
    { id: 'contact', label: 'Contact & Location', icon: MapPin },
    { id: 'regulatory', label: 'Regulatory', icon: Shield },
    { id: 'admin', label: 'Admin Account', icon: User },
    { id: 'plan', label: 'Plan & Review', icon: CreditCard },
];

const HOSPITAL_TYPES = ['General', 'Multi-Specialty', 'Super-Specialty', 'Clinic', 'Nursing Home', 'Eye Hospital', 'Dental Clinic', 'Maternity Hospital'];
const COMMON_SPECIALTIES = ['Cardiology', 'Orthopedics', 'Pediatrics', 'Gynecology', 'Neurology', 'Dermatology', 'ENT', 'Ophthalmology', 'Urology', 'Oncology', 'Gastroenterology', 'Pulmonology', 'Nephrology', 'Psychiatry', 'General Surgery', 'General Medicine'];
const ACCREDITATION_BODIES = ['NABH', 'NABL', 'JCI', 'ISO 9001', 'ISO 15189'];

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
        // Step 1: Hospital Details
        name: '',
        slug: '',
        code: '',
        hospital_type: '',
        bed_capacity: '',
        specialties: '' as string,
        // Step 2: Contact & Location
        address: '',
        city: '',
        state: '',
        pincode: '',
        phone: '',
        email: '',
        website: '',
        latitude: '',
        longitude: '',
        // Step 3: Regulatory
        license_no: '',
        registration_number: '',
        registration_authority: '',
        accreditation_body: '',
        accreditation_number: '',
        accreditation_expiry: '',
        established_year: '',
        // Step 4: Admin Account
        admin_name: '',
        admin_username: '',
        admin_email: '',
        admin_password: '',
        // Step 5: Plan
        plan: 'free',
    });

    const [specialtiesList, setSpecialtiesList] = useState<string[]>([]);

    function updateField(field: string, value: string) {
        setFormValues((prev) => ({ ...prev, [field]: value }));

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

    function addSpecialty(spec: string) {
        if (!specialtiesList.includes(spec)) {
            const updated = [...specialtiesList, spec];
            setSpecialtiesList(updated);
            setFormValues(prev => ({ ...prev, specialties: updated.join(',') }));
        }
    }

    function removeSpecialty(spec: string) {
        const updated = specialtiesList.filter(s => s !== spec);
        setSpecialtiesList(updated);
        setFormValues(prev => ({ ...prev, specialties: updated.join(',') }));
    }

    const canProceed = () => {
        if (step === 0) return formValues.name && formValues.slug && formValues.code;
        if (step === 3) return formValues.admin_name && formValues.admin_username && formValues.admin_password && formValues.admin_email;
        return true;
    };

    const inputClass = 'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition text-sm';
    const labelClass = 'block text-sm font-medium text-gray-300 mb-1.5';
    const selectClass = 'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-sm';

    return (
        <div>
            {/* Step Indicator */}
            <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
                {STEPS.map((s, i) => {
                    const Icon = s.icon;
                    const isActive = i === step;
                    const isDone = i < step;
                    return (
                        <div key={s.id} className="flex items-center gap-1 shrink-0">
                            {i > 0 && <div className={`w-6 h-px ${isDone ? 'bg-violet-500' : 'bg-white/10'}`} />}
                            <button
                                type="button"
                                onClick={() => i < step && setStep(i)}
                                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium transition ${
                                    isActive
                                        ? 'bg-violet-500/15 text-violet-400 border border-violet-500/30'
                                        : isDone
                                        ? 'bg-emerald-500/10 text-emerald-400'
                                        : 'text-gray-500'
                                }`}
                            >
                                {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
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
                    {/* Step 0: Hospital Details */}
                    {step === 0 && (
                        <div className="space-y-5">
                            <div>
                                <h3 className="text-base font-semibold text-white mb-1">Hospital Details</h3>
                                <p className="text-xs text-gray-500 mb-5">Basic information about the hospital</p>
                            </div>
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
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Hospital Type</label>
                                    <select value={formValues.hospital_type} onChange={e => updateField('hospital_type', e.target.value)} className={selectClass}>
                                        <option value="">Select type...</option>
                                        {HOSPITAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Bed Capacity</label>
                                    <input
                                        type="number"
                                        value={formValues.bed_capacity}
                                        onChange={(e) => updateField('bed_capacity', e.target.value)}
                                        className={inputClass}
                                        placeholder="e.g. 100"
                                        min="0"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Specialties</label>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {specialtiesList.map(s => (
                                        <span key={s} className="inline-flex items-center gap-1 px-2 py-1 bg-violet-500/15 text-violet-400 text-xs rounded-lg">
                                            {s}
                                            <button type="button" onClick={() => removeSpecialty(s)} className="hover:text-white"><X className="h-3 w-3" /></button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {COMMON_SPECIALTIES.filter(s => !specialtiesList.includes(s)).map(s => (
                                        <button key={s} type="button" onClick={() => addSpecialty(s)}
                                            className="px-2 py-1 text-[11px] bg-white/5 text-gray-500 rounded-lg hover:text-white hover:bg-white/10 transition">
                                            + {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 1: Contact & Location */}
                    {step === 1 && (
                        <div className="space-y-5">
                            <div>
                                <h3 className="text-base font-semibold text-white mb-1">Contact & Location</h3>
                                <p className="text-xs text-gray-500 mb-5">Address and contact information</p>
                            </div>
                            <div>
                                <label className={labelClass}>Address</label>
                                <input type="text" value={formValues.address} onChange={e => updateField('address', e.target.value)} className={inputClass} placeholder="123 Health Street" />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className={labelClass}>City</label>
                                    <input type="text" value={formValues.city} onChange={e => updateField('city', e.target.value)} className={inputClass} placeholder="Mumbai" />
                                </div>
                                <div>
                                    <label className={labelClass}>State</label>
                                    <input type="text" value={formValues.state} onChange={e => updateField('state', e.target.value)} className={inputClass} placeholder="Maharashtra" />
                                </div>
                                <div>
                                    <label className={labelClass}>Pincode</label>
                                    <input type="text" value={formValues.pincode} onChange={e => updateField('pincode', e.target.value)} className={inputClass} placeholder="400001" maxLength={6} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Phone</label>
                                    <input type="text" value={formValues.phone} onChange={e => updateField('phone', e.target.value)} className={inputClass} placeholder="+91 9876543210" />
                                </div>
                                <div>
                                    <label className={labelClass}>Email</label>
                                    <input type="email" value={formValues.email} onChange={e => updateField('email', e.target.value)} className={inputClass} placeholder="admin@hospital.com" />
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Website</label>
                                <input type="text" value={formValues.website} onChange={e => updateField('website', e.target.value)} className={inputClass} placeholder="https://hospital.com" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Latitude</label>
                                    <input type="text" value={formValues.latitude} onChange={e => updateField('latitude', e.target.value)} className={inputClass} placeholder="19.0760" />
                                </div>
                                <div>
                                    <label className={labelClass}>Longitude</label>
                                    <input type="text" value={formValues.longitude} onChange={e => updateField('longitude', e.target.value)} className={inputClass} placeholder="72.8777" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Regulatory */}
                    {step === 2 && (
                        <div className="space-y-5">
                            <div>
                                <h3 className="text-base font-semibold text-white mb-1">Regulatory & Accreditation</h3>
                                <p className="text-xs text-gray-500 mb-5">License and accreditation details (optional)</p>
                            </div>
                            <div>
                                <label className={labelClass}>License Number</label>
                                <input type="text" value={formValues.license_no} onChange={e => updateField('license_no', e.target.value)} className={inputClass} placeholder="HOSP-2024-0001" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Registration Number</label>
                                    <input type="text" value={formValues.registration_number} onChange={e => updateField('registration_number', e.target.value)} className={inputClass} placeholder="REG/2024/12345" />
                                </div>
                                <div>
                                    <label className={labelClass}>Registration Authority</label>
                                    <input type="text" value={formValues.registration_authority} onChange={e => updateField('registration_authority', e.target.value)} className={inputClass} placeholder="State Medical Council" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Accreditation Body</label>
                                    <select value={formValues.accreditation_body} onChange={e => updateField('accreditation_body', e.target.value)} className={selectClass}>
                                        <option value="">Select...</option>
                                        {ACCREDITATION_BODIES.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Accreditation Number</label>
                                    <input type="text" value={formValues.accreditation_number} onChange={e => updateField('accreditation_number', e.target.value)} className={inputClass} placeholder="NABH-12345" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Accreditation Expiry</label>
                                    <input type="date" value={formValues.accreditation_expiry} onChange={e => updateField('accreditation_expiry', e.target.value)} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Established Year</label>
                                    <input type="number" value={formValues.established_year} onChange={e => updateField('established_year', e.target.value)} className={inputClass} placeholder="2010" min="1900" max={new Date().getFullYear()} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Admin Account */}
                    {step === 3 && (
                        <div className="space-y-5">
                            <div>
                                <h3 className="text-base font-semibold text-white mb-1">Admin Account</h3>
                                <p className="text-xs text-gray-500 mb-5">Create an administrator account for this hospital. They will manage staff and settings.</p>
                            </div>
                            <div>
                                <label className={labelClass}>Full Name *</label>
                                <input type="text" value={formValues.admin_name} onChange={e => updateField('admin_name', e.target.value)} className={inputClass} placeholder="Dr. Rajesh Kumar" />
                            </div>
                            <div>
                                <label className={labelClass}>Username *</label>
                                <input type="text" value={formValues.admin_username} onChange={e => updateField('admin_username', e.target.value)} className={inputClass} placeholder="rajesh.admin" />
                            </div>
                            <div>
                                <label className={labelClass}>Email *</label>
                                <input type="email" value={formValues.admin_email} onChange={e => updateField('admin_email', e.target.value)} className={inputClass} placeholder="rajesh@hospital.com" />
                            </div>
                            <div>
                                <label className={labelClass}>Password *</label>
                                <input type="password" value={formValues.admin_password} onChange={e => updateField('admin_password', e.target.value)} className={inputClass} placeholder="Minimum 6 characters" />
                            </div>
                        </div>
                    )}

                    {/* Step 4: Plan & Review */}
                    {step === 4 && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-base font-semibold text-white mb-1">Plan & Review</h3>
                                <p className="text-xs text-gray-500 mb-5">Select a subscription plan and review all details</p>
                            </div>
                            <div>
                                <label className={labelClass}>Subscription Plan</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {[
                                        { key: 'free', label: 'Free', desc: 'Basic features' },
                                        { key: 'starter', label: 'Starter', desc: 'Small clinics' },
                                        { key: 'pro', label: 'Pro', desc: 'AI + WhatsApp' },
                                        { key: 'enterprise', label: 'Enterprise', desc: 'Full platform' },
                                    ].map((plan) => (
                                        <button
                                            key={plan.key}
                                            type="button"
                                            onClick={() => updateField('plan', plan.key)}
                                            className={`p-4 rounded-xl border text-center transition ${
                                                formValues.plan === plan.key
                                                    ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                                                    : 'border-white/10 bg-white/[0.02] text-gray-400 hover:bg-white/5'
                                            }`}
                                        >
                                            <p className="text-sm font-semibold">{plan.label}</p>
                                            <p className="text-[11px] mt-1 text-gray-500">{plan.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Review summary */}
                            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 space-y-3">
                                <h3 className="text-sm font-semibold text-white mb-3">Summary</h3>
                                <Row label="Hospital" value={formValues.name} />
                                <Row label="Slug / Code" value={`${formValues.slug} / ${formValues.code}`} />
                                {formValues.hospital_type && <Row label="Type" value={formValues.hospital_type} />}
                                {formValues.bed_capacity && <Row label="Bed Capacity" value={formValues.bed_capacity} />}
                                {specialtiesList.length > 0 && <Row label="Specialties" value={specialtiesList.join(', ')} />}
                                <div className="border-t border-white/5 pt-3 mt-3" />
                                {formValues.address && <Row label="Address" value={formValues.address} />}
                                {formValues.city && <Row label="City / State" value={`${formValues.city}${formValues.state ? ', ' + formValues.state : ''}${formValues.pincode ? ' - ' + formValues.pincode : ''}`} />}
                                {formValues.phone && <Row label="Phone" value={formValues.phone} />}
                                {formValues.email && <Row label="Email" value={formValues.email} />}
                                {formValues.website && <Row label="Website" value={formValues.website} />}
                                {(formValues.license_no || formValues.registration_number || formValues.accreditation_body) && (
                                    <>
                                        <div className="border-t border-white/5 pt-3 mt-3" />
                                        {formValues.license_no && <Row label="License No." value={formValues.license_no} />}
                                        {formValues.registration_number && <Row label="Registration" value={`${formValues.registration_number}${formValues.registration_authority ? ' (' + formValues.registration_authority + ')' : ''}`} />}
                                        {formValues.accreditation_body && <Row label="Accreditation" value={`${formValues.accreditation_body}${formValues.accreditation_number ? ' — ' + formValues.accreditation_number : ''}`} />}
                                        {formValues.established_year && <Row label="Established" value={formValues.established_year} />}
                                    </>
                                )}
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
            <span className="text-white font-medium text-right max-w-[60%]">{value}</span>
        </div>
    );
}
