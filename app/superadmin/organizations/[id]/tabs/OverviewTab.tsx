'use client';

import { useState } from 'react';
import { updateOrganizationProfile } from '@/app/actions/superadmin-actions';
import { Save, AlertCircle, CheckCircle, X } from 'lucide-react';

const HOSPITAL_TYPES = ['General', 'Multi-Specialty', 'Super-Specialty', 'Clinic', 'Nursing Home'];
const ACCREDITATION_BODIES = ['NABH', 'NABL', 'JCI', 'ISO', 'None'];
const COMMON_SPECIALTIES = [
    'General Medicine', 'General Surgery', 'Orthopedics', 'Cardiology', 'Neurology',
    'Pediatrics', 'Gynecology', 'ENT', 'Ophthalmology', 'Dermatology',
    'Radiology', 'Pathology', 'Anesthesiology', 'Psychiatry', 'Urology',
    'Oncology', 'Nephrology', 'Pulmonology', 'Gastroenterology', 'Emergency Medicine',
];

interface OverviewTabProps {
    org: any;
    onUpdate: () => void;
}

export default function OverviewTab({ org, onUpdate }: OverviewTabProps) {
    const [form, setForm] = useState({
        name: org.name || '',
        slug: org.slug || '',
        code: org.code || '',
        address: org.address || '',
        phone: org.phone || '',
        email: org.email || '',
        license_no: org.license_no || '',
        hospital_type: org.hospital_type || '',
        bed_capacity: org.bed_capacity ?? '',
        accreditation_body: org.accreditation_body || '',
        accreditation_number: org.accreditation_number || '',
        accreditation_expiry: org.accreditation_expiry ? new Date(org.accreditation_expiry).toISOString().slice(0, 10) : '',
        registration_number: org.registration_number || '',
        registration_authority: org.registration_authority || '',
        established_year: org.established_year ?? '',
        website: org.website || '',
        specialties: org.specialties || [],
        latitude: org.latitude ?? '',
        longitude: org.longitude ?? '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [newSpecialty, setNewSpecialty] = useState('');

    const update = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

    const addSpecialty = (spec: string) => {
        if (spec && !form.specialties.includes(spec)) {
            update('specialties', [...form.specialties, spec]);
        }
        setNewSpecialty('');
    };

    const removeSpecialty = (spec: string) => {
        update('specialties', form.specialties.filter((s: string) => s !== spec));
    };

    async function handleSave() {
        setSaving(true);
        setError('');
        setSuccess('');

        const payload = {
            ...form,
            bed_capacity: form.bed_capacity !== '' ? Number(form.bed_capacity) : null,
            established_year: form.established_year !== '' ? Number(form.established_year) : null,
            latitude: form.latitude !== '' ? Number(form.latitude) : null,
            longitude: form.longitude !== '' ? Number(form.longitude) : null,
            accreditation_expiry: form.accreditation_expiry || null,
        };

        const res = await updateOrganizationProfile(org.id, payload);
        if (res.success) {
            setSuccess('Profile updated successfully');
            onUpdate();
            setTimeout(() => setSuccess(''), 3000);
        } else {
            setError(res.error || 'Failed to update');
        }
        setSaving(false);
    }

    const fieldClass = 'w-full px-3 py-2.5 bg-[#161b22] border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none';
    const labelClass = 'block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

    return (
        <div className="space-y-6">
            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}
            {success && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-lg flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 shrink-0" /> {success}
                </div>
            )}

            {/* Basic Information */}
            <div className="bg-white/5 border border-white/5 rounded-xl p-6">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <label className={labelClass}>Hospital Name *</label>
                        <input type="text" value={form.name} onChange={e => update('name', e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Slug *</label>
                        <input type="text" value={form.slug} onChange={e => update('slug', e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Code *</label>
                        <input type="text" value={form.code} onChange={e => update('code', e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Email</label>
                        <input type="email" value={form.email} onChange={e => update('email', e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Phone</label>
                        <input type="text" value={form.phone} onChange={e => update('phone', e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Website</label>
                        <input type="text" value={form.website} onChange={e => update('website', e.target.value)} className={fieldClass} placeholder="https://..." />
                    </div>
                    <div className="md:col-span-2 lg:col-span-3">
                        <label className={labelClass}>Address</label>
                        <input type="text" value={form.address} onChange={e => update('address', e.target.value)} className={fieldClass} />
                    </div>
                </div>
            </div>

            {/* Hospital Profile */}
            <div className="bg-white/5 border border-white/5 rounded-xl p-6">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Hospital Profile</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <label className={labelClass}>Hospital Type</label>
                        <select value={form.hospital_type} onChange={e => update('hospital_type', e.target.value)} className={fieldClass}>
                            <option value="">Select type...</option>
                            {HOSPITAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>Bed Capacity</label>
                        <input type="number" min="0" value={form.bed_capacity} onChange={e => update('bed_capacity', e.target.value)} className={fieldClass} placeholder="e.g. 100" />
                    </div>
                    <div>
                        <label className={labelClass}>Established Year</label>
                        <input type="number" min="1800" max="2100" value={form.established_year} onChange={e => update('established_year', e.target.value)} className={fieldClass} placeholder="e.g. 2005" />
                    </div>
                </div>
            </div>

            {/* Regulatory */}
            <div className="bg-white/5 border border-white/5 rounded-xl p-6">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Regulatory & Accreditation</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <label className={labelClass}>License Number</label>
                        <input type="text" value={form.license_no} onChange={e => update('license_no', e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Registration Number</label>
                        <input type="text" value={form.registration_number} onChange={e => update('registration_number', e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Registration Authority</label>
                        <input type="text" value={form.registration_authority} onChange={e => update('registration_authority', e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Accreditation Body</label>
                        <select value={form.accreditation_body} onChange={e => update('accreditation_body', e.target.value)} className={fieldClass}>
                            <option value="">Select...</option>
                            {ACCREDITATION_BODIES.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>Accreditation Number</label>
                        <input type="text" value={form.accreditation_number} onChange={e => update('accreditation_number', e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Accreditation Expiry</label>
                        <input type="date" value={form.accreditation_expiry} onChange={e => update('accreditation_expiry', e.target.value)} className={fieldClass} />
                    </div>
                </div>
            </div>

            {/* Specialties */}
            <div className="bg-white/5 border border-white/5 rounded-xl p-6">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Specialties</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                    {form.specialties.map((s: string) => (
                        <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-500/15 text-violet-400 text-xs font-medium rounded-full">
                            {s}
                            <button type="button" onClick={() => removeSpecialty(s)} className="hover:text-red-400 transition"><X className="h-3 w-3" /></button>
                        </span>
                    ))}
                    {form.specialties.length === 0 && <p className="text-xs text-gray-500">No specialties added</p>}
                </div>
                <div className="flex gap-2">
                    <select value={newSpecialty} onChange={e => { if (e.target.value) addSpecialty(e.target.value); }} className={`${fieldClass} flex-1`}>
                        <option value="">Add specialty...</option>
                        {COMMON_SPECIALTIES.filter(s => !form.specialties.includes(s)).map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Location */}
            <div className="bg-white/5 border border-white/5 rounded-xl p-6">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Geo-Location</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>Latitude</label>
                        <input type="number" step="any" value={form.latitude} onChange={e => update('latitude', e.target.value)} className={fieldClass} placeholder="e.g. 28.6139" />
                    </div>
                    <div>
                        <label className={labelClass}>Longitude</label>
                        <input type="number" step="any" value={form.longitude} onChange={e => update('longitude', e.target.value)} className={fieldClass} placeholder="e.g. 77.2090" />
                    </div>
                </div>
            </div>

            {/* Save */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
                >
                    <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Profile'}
                </button>
            </div>
        </div>
    );
}
