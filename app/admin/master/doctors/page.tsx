'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Loader2, Pencil, PowerOff, ChevronLeft, ChevronRight, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listDoctors, createDoctor, updateDoctor, deactivateDoctor,
} from '@/app/actions/doctor-master-actions';
import MasterImportButton from '@/app/components/master/MasterImportButton';

const onlyDigits = (v: string) => v.replace(/\D/g, '');
const normalizeName = (v: string) => v.replace(/[^a-zA-Z\s.'-]/g, '');

const PAGE_LIMIT = 25;

const SPECIALTIES = [
  'General Medicine', 'Cardiology', 'Orthopedics', 'Pediatrics', 'Neurology',
  'ENT', 'Dermatology', 'Pulmonology', 'OB/GYN', 'Ophthalmology', 'Urology',
  'Gastroenterology', 'Oncology', 'Radiology', 'Pathology', 'Anesthesiology',
  'Emergency', 'Dental', 'Psychiatry', 'Physiotherapy', 'General Surgery', 'Nephrology',
];

const WORKING_DAYS_OPTIONS = [
  'Mon-Sat', 'Mon-Fri', 'Mon,Wed,Fri', 'Tue,Thu,Sat', 'Mon-Sun', 'Custom',
];

const EMPTY_FORM = {
  // Mandatory
  name: '', username: '', password: '', specialty: '',
  consultation_fee: 500, follow_up_fee: 300,
  working_hours: '09:00-17:00', slot_duration: 20,
  is_active: true,
  // Preferred
  doctor_registration_no: '', qualifications: '', phone: '',
  gender: '' as '' | 'Male' | 'Female' | 'Other',
  working_days: 'Mon-Sat',
  max_patients_per_day: 30,
  max_overbooking_per_slot: 0,
  // Optional
  email: '',
};

// Section header inside modal
function SectionLabel({ label, badge }: { label: string; badge: 'mandatory' | 'preferred' | 'optional' }) {
  const colors = {
    mandatory: 'bg-red-50 text-red-600 border border-red-200',
    preferred: 'bg-amber-50 text-amber-600 border border-amber-200',
    optional: 'bg-gray-100 text-gray-500 border border-gray-200',
  };
  return (
    <div className="col-span-2 flex items-center gap-2 pt-2 pb-1 border-b border-gray-100">
      <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{label}</span>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors[badge]}`}>
        {badge}
      </span>
    </div>
  );
}

// Field label with badge
function FieldLabel({ label, badge }: { label: string; badge?: 'mandatory' | 'preferred' | 'optional' }) {
  const dot = { mandatory: 'bg-red-400', preferred: 'bg-amber-400', optional: 'bg-gray-300' };
  return (
    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 mb-1.5">
      {badge && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot[badge]}`} />}
      {label}
      {badge === 'mandatory' && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

const inputCls = 'w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-teal-400 transition';
const selectCls = 'w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-teal-400 transition';

export default function DoctorMasterPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listDoctors({ search, page, limit: PAGE_LIMIT });
    if (res.success) {
      setRows(res.data.doctors);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } else {
      toast.error(res.error || 'Failed to load');
    }
    setLoading(false);
  }, [search, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const openCreate = () => { setForm(EMPTY_FORM); setMode('create'); };
  const openEdit = (row: any) => {
    setEditingId(row.id);
    setForm({
      ...EMPTY_FORM,
      ...row,
      password: '',
      consultation_fee: Number(row.consultation_fee ?? 500),
      follow_up_fee: Number(row.follow_up_fee ?? 300),
      slot_duration: Number(row.slot_duration ?? 20),
      max_patients_per_day: row.max_patients_per_day ?? 30,
      max_overbooking_per_slot: row.max_overbooking_per_slot ?? 0,
      gender: row.gender ?? '',
      working_days: row.working_days ?? 'Mon-Sat',
    });
    setMode('edit');
  };
  const close = () => { setMode('idle'); setEditingId(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const payload: any = {
      ...form,
      consultation_fee: Number(form.consultation_fee) || 0,
      follow_up_fee: Number(form.follow_up_fee) || 0,
      slot_duration: Number(form.slot_duration) || 20,
      max_patients_per_day: form.max_patients_per_day ? Number(form.max_patients_per_day) : undefined,
      max_overbooking_per_slot: Number(form.max_overbooking_per_slot) || 0,
      gender: form.gender || undefined,
      working_days: form.working_days || undefined,
      email: form.email || undefined,
      doctor_registration_no: form.doctor_registration_no || undefined,
      qualifications: form.qualifications || undefined,
      phone: form.phone || undefined,
    };
    if (mode === 'edit' && !payload.password) delete payload.password;

    const res = mode === 'create'
      ? await createDoctor(payload)
      : await updateDoctor(editingId!, payload);

    if (res.success) {
      toast.success(mode === 'create' ? 'Doctor created' : 'Doctor updated');
      close();
      load();
    } else {
      toast.error(res.error || 'Failed');
    }
    setSubmitting(false);
  };

  const deactivate = async (id: string) => {
    if (!confirm('Deactivate this doctor? They will no longer appear in scheduling dropdowns.')) return;
    const res = await deactivateDoctor(id);
    if (res.success) { toast.success('Deactivated'); load(); }
    else toast.error(res.error || 'Failed');
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text" value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by name, username, specialty…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <MasterImportButton type="doctor_master" onImportComplete={load} />
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl transition">
            <Plus className="h-4 w-4" /> Add Doctor
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                {['Name', 'Specialty', 'Gender', 'Registration', 'Working Days', 'Consultation', 'Follow-up', 'Max/Day', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={10} className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-500 mx-auto" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-gray-400 text-sm">No doctors found</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{r.name}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{r.specialty || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.gender || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">{r.doctor_registration_no || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.working_days || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 text-xs font-medium">₹{Number(r.consultation_fee).toFixed(0)}</td>
                  <td className="px-4 py-3 text-gray-700 text-xs font-medium">₹{Number(r.follow_up_fee).toFixed(0)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.max_patients_per_day ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold ${r.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-gray-100 rounded-lg transition" title="Edit">
                        <Pencil className="h-4 w-4 text-orange-600" />
                      </button>
                      {r.is_active && (
                        <button onClick={() => deactivate(r.id)} className="p-1.5 hover:bg-gray-100 rounded-lg transition" title="Deactivate">
                          <PowerOff className="h-4 w-4 text-red-500" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <span className="text-xs text-gray-500">Showing {(page - 1) * PAGE_LIMIT + 1}–{Math.min(page * PAGE_LIMIT, total)} of {total}</span>
            <div className="flex gap-2 items-center">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-xs font-medium text-gray-600">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {mode !== 'idle' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">{mode === 'create' ? 'Add Doctor' : 'Edit Doctor'}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" /> Mandatory</span>
                  <span className="inline-flex items-center gap-1 ml-3"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> Preferred</span>
                  <span className="inline-flex items-center gap-1 ml-3"><span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" /> Optional</span>
                </p>
              </div>
              <button onClick={close} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable form body */}
            <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">

                {/* ── MANDATORY ── */}
                <SectionLabel label="Basic Information" badge="mandatory" />

                <div>
                  <FieldLabel label="Full Name" badge="mandatory" />
                  <input required type="text" value={form.name}
                    onChange={e => set('name', normalizeName(e.target.value))}
                    maxLength={100} placeholder="Dr. Rajesh Kumar Sharma"
                    className={inputCls} />
                </div>

                <div>
                  <FieldLabel label="Username" badge="mandatory" />
                  <input required type="text" value={form.username}
                    onChange={e => set('username', e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                    maxLength={30} placeholder="dr.rajesh"
                    className={inputCls} />
                </div>

                <div>
                  <FieldLabel label={mode === 'create' ? 'Password' : 'New Password (blank = keep)'} badge="mandatory" />
                  <input type="password" value={form.password}
                    onChange={e => set('password', e.target.value)}
                    required={mode === 'create'} minLength={8} placeholder="Min 8 characters"
                    className={inputCls} />
                </div>

                <div>
                  <FieldLabel label="Specialty / Department" badge="mandatory" />
                  <select required value={form.specialty} onChange={e => set('specialty', e.target.value)} className={selectCls}>
                    <option value="">Select specialty</option>
                    {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <FieldLabel label="Consultation Fee (₹)" badge="mandatory" />
                  <input required type="number" min={0} value={form.consultation_fee}
                    onChange={e => set('consultation_fee', e.target.value)}
                    className={inputCls} />
                </div>

                <div>
                  <FieldLabel label="Follow-up Fee (₹)" badge="mandatory" />
                  <input required type="number" min={0} value={form.follow_up_fee}
                    onChange={e => set('follow_up_fee', e.target.value)}
                    className={inputCls} />
                </div>

                <div>
                  <FieldLabel label="Working Hours" badge="mandatory" />
                  <input required type="text" value={form.working_hours}
                    onChange={e => set('working_hours', e.target.value)}
                    placeholder="09:00-13:00,16:00-19:00"
                    className={inputCls} />
                </div>

                <div>
                  <FieldLabel label="Slot Duration (min)" badge="mandatory" />
                  <input required type="number" min={5} max={180} value={form.slot_duration}
                    onChange={e => set('slot_duration', e.target.value)}
                    className={inputCls} />
                </div>

                {/* ── PREFERRED ── */}
                <SectionLabel label="Professional Details" badge="preferred" />

                <div>
                  <FieldLabel label="Medical Registration No." badge="preferred" />
                  <input type="text" value={form.doctor_registration_no}
                    onChange={e => set('doctor_registration_no', e.target.value)}
                    maxLength={30} placeholder="MCI-12345 / DMC-67890"
                    className={inputCls} />
                </div>

                <div>
                  <FieldLabel label="Gender" badge="preferred" />
                  <select value={form.gender} onChange={e => set('gender', e.target.value)} className={selectCls}>
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <FieldLabel label="Qualifications" badge="preferred" />
                  <input type="text" value={form.qualifications}
                    onChange={e => set('qualifications', e.target.value)}
                    placeholder="MBBS, MD (Cardiology), DM"
                    className={inputCls} />
                </div>

                <div>
                  <FieldLabel label="Phone" badge="preferred" />
                  <input type="tel" value={form.phone}
                    onChange={e => set('phone', onlyDigits(e.target.value).slice(0, 10))}
                    inputMode="numeric" maxLength={10} placeholder="9876543210"
                    pattern="[0-9]{10}" title="10-digit mobile number"
                    className={inputCls} />
                </div>

                <div>
                  <FieldLabel label="Working Days" badge="preferred" />
                  <select value={form.working_days} onChange={e => set('working_days', e.target.value)} className={selectCls}>
                    {WORKING_DAYS_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                <div>
                  <FieldLabel label="Max Patients Per Day" badge="preferred" />
                  <input type="number" min={1} max={500} value={form.max_patients_per_day}
                    onChange={e => set('max_patients_per_day', e.target.value)}
                    placeholder="30"
                    className={inputCls} />
                </div>

                <div>
                  <FieldLabel label="Allow Overbooking (extra slots)" badge="preferred" />
                  <input type="number" min={0} max={20} value={form.max_overbooking_per_slot}
                    onChange={e => set('max_overbooking_per_slot', e.target.value)}
                    placeholder="0 = no overbooking"
                    className={inputCls} />
                </div>

                {/* ── OPTIONAL ── */}
                <SectionLabel label="Contact & Access" badge="optional" />

                <div>
                  <FieldLabel label="Email" badge="optional" />
                  <input type="email" value={form.email}
                    onChange={e => set('email', e.target.value.trim())}
                    placeholder="dr.rajesh@hospital.com"
                    className={inputCls} />
                </div>

                <div className="flex items-center gap-3 col-span-2 mt-1 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <input type="checkbox" id="is_active" checked={!!form.is_active}
                    onChange={e => set('is_active', e.target.checked)}
                    className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500" />
                  <label htmlFor="is_active" className="text-sm font-semibold text-gray-700">
                    Active — doctor appears in scheduling & billing
                  </label>
                </div>

              </div>

              {/* Footer buttons */}
              <div className="flex gap-3 mt-5 pt-4 border-t border-gray-100">
                <button type="button" onClick={close}
                  className="flex-1 py-2.5 px-4 border border-gray-300 rounded-xl text-gray-700 text-sm font-semibold hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 py-2.5 px-4 bg-orange-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition flex items-center justify-center gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? 'Saving…' : mode === 'create' ? 'Create Doctor' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
