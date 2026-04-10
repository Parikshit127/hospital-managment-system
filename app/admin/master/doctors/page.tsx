'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Loader2, Pencil, PowerOff, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listDoctors, createDoctor, updateDoctor, deactivateDoctor,
} from '@/app/actions/doctor-master-actions';
import MasterImportButton from '@/app/components/master/MasterImportButton';

const PAGE_LIMIT = 25;
const EMPTY_FORM = {
  name: '', username: '', password: '',
  specialty: '', doctor_registration_no: '', qualifications: '',
  email: '', phone: '',
  consultation_fee: 500, follow_up_fee: 300,
  working_hours: '09:00-17:00', slot_duration: 20,
  is_active: true,
};

export default function DoctorMasterPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [mode, setMode] = useState<'idle'|'create'|'edit'>('idle');
  const [editingId, setEditingId] = useState<string|null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
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

  const openCreate = () => { setForm(EMPTY_FORM); setMode('create'); };
  const openEdit = (row: any) => {
    setEditingId(row.id);
    setForm({
      ...EMPTY_FORM, ...row, password: '',
      consultation_fee: Number(row.consultation_fee ?? 0),
      follow_up_fee: Number(row.follow_up_fee ?? 0),
    });
    setMode('edit');
  };
  const close = () => { setMode('idle'); setEditingId(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      ...form,
      consultation_fee: Number(form.consultation_fee),
      follow_up_fee: Number(form.follow_up_fee),
      slot_duration: Number(form.slot_duration),
    };
    const res = mode === 'create'
      ? await createDoctor(payload)
      : await updateDoctor(editingId!, { ...payload, ...(payload.password ? {} : { password: undefined }) });
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
    if (!confirm('Deactivate this doctor? They will no longer appear in billing dropdowns.')) return;
    const res = await deactivateDoctor(id);
    if (res.success) { toast.success('Deactivated'); load(); }
    else toast.error(res.error || 'Failed');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text" value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by name, username, specialty"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <MasterImportButton type="doctor_master" onImportComplete={load} />
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Add Doctor
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80">
              {['Name','Specialty','Registration','Consultation','Follow-up','Status','Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto"/></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">No doctors found</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold text-gray-900">{r.name}</td>
                <td className="px-4 py-3 text-gray-600">{r.specialty || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{r.doctor_registration_no || '—'}</td>
                <td className="px-4 py-3 text-gray-600">₹{Number(r.consultation_fee).toFixed(0)}</td>
                <td className="px-4 py-3 text-gray-600">₹{Number(r.follow_up_fee).toFixed(0)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold ${r.is_active?'bg-green-50 text-green-700':'bg-gray-100 text-gray-500'}`}>
                    {r.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="h-4 w-4 text-blue-600"/></button>
                  {r.is_active && (
                    <button onClick={() => deactivate(r.id)} className="p-1.5 hover:bg-gray-100 rounded-lg"><PowerOff className="h-4 w-4 text-red-600"/></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <span className="text-xs text-gray-500">Showing {(page-1)*PAGE_LIMIT+1}-{Math.min(page*PAGE_LIMIT,total)} of {total}</span>
            <div className="flex gap-2 items-center">
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1} className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronLeft className="h-4 w-4"/></button>
              <span className="text-xs font-medium">Page {page} of {totalPages}</span>
              <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages} className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronRight className="h-4 w-4"/></button>
            </div>
          </div>
        )}
      </div>

      {mode !== 'idle' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{mode==='create'?'Add Doctor':'Edit Doctor'}</h2>
            <form onSubmit={submit} className="grid grid-cols-2 gap-4">
              {[
                { k: 'name', label: 'Full Name', required: true, type: 'text' },
                { k: 'username', label: 'Username', required: true, type: 'text' },
                { k: 'password', label: mode === 'create' ? 'Password' : 'New Password (blank = keep)', required: mode === 'create', type: 'password' },
                { k: 'specialty', label: 'Specialization', required: true, type: 'text' },
                { k: 'doctor_registration_no', label: 'Registration No', type: 'text' },
                { k: 'qualifications', label: 'Qualifications', type: 'text' },
                { k: 'email', label: 'Email', type: 'email' },
                { k: 'phone', label: 'Phone', type: 'tel' },
                { k: 'consultation_fee', label: 'Consultation Fee (₹)', required: true, type: 'number' },
                { k: 'follow_up_fee', label: 'Follow-up Fee (₹)', required: true, type: 'number' },
                { k: 'working_hours', label: 'Working Hours', type: 'text' },
                { k: 'slot_duration', label: 'Slot Duration (min)', type: 'number' },
              ].map(f => (
                <div key={f.k} className={f.k === 'qualifications' ? 'col-span-2' : ''}>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    {f.label}{f.required && ' *'}
                  </label>
                  <input
                    type={f.type} required={f.required}
                    value={form[f.k] ?? ''}
                    onChange={e => setForm((p: any) => ({ ...p, [f.k]: e.target.value }))}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              ))}
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!form.is_active}
                  onChange={e => setForm((p: any) => ({ ...p, is_active: e.target.checked }))}/>
                Active
              </label>
              <div className="col-span-2 flex gap-3 mt-2">
                <button type="button" onClick={close}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
