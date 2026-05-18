'use client';

import React, { useEffect, useState } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { LayoutGrid, Plus, Edit2, X, Loader2, UserCircle2 } from 'lucide-react';
import {
  getDepartments, createDepartment, updateDepartment,
  getDoctorsForDropdown,
} from '@/app/actions/admin-actions';

const inputCls = 'w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors text-sm';
const selectCls = 'w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors text-sm';

function FieldLabel({ label, badge }: { label: string; badge: 'mandatory' | 'optional' }) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badge === 'mandatory' ? 'bg-red-400' : 'bg-gray-300'}`} />
      {label}
      {badge === 'mandatory' && <span className="text-red-500 ml-0.5 normal-case font-normal">*</span>}
    </label>
  );
}

const EMPTY_FORM = {
  name: '',
  head_doctor_id: '',
  base_consultation_fee: 500,
  description: '',
  is_active: true,
};

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const loadData = async () => {
    setLoading(true);
    const [deptRes, docRes] = await Promise.all([
      getDepartments(),
      getDoctorsForDropdown(),
    ]);
    if (deptRes.success) setDepartments(deptRes.data);
    if (docRes.success) setDoctors(docRes.data);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (dept: any) => {
    setEditId(dept.id);
    setForm({
      name: dept.name,
      head_doctor_id: dept.head_doctor_id ?? '',
      base_consultation_fee: Number(dept.base_consultation_fee) || 500,
      description: dept.description ?? '',
      is_active: dept.is_active,
    });
    setError('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      name: form.name.trim(),
      head_doctor_id: form.head_doctor_id || undefined,
      base_consultation_fee: Number(form.base_consultation_fee),
      description: form.description || undefined,
      is_active: form.is_active,
    };

    const res = editId
      ? await updateDepartment(editId as any, payload)
      : await createDepartment(payload);

    setSaving(false);
    if (res?.success) {
      setModalOpen(false);
      loadData();
    } else {
      setError((res as any)?.error || 'Operation failed. Please try again.');
    }
  };

  const toggleStatus = async (id: string, current: boolean) => {
    await updateDepartment(id as any, { is_active: !current });
    loadData();
  };

  return (
    <AdminPage
      pageTitle="Clinical Departments"
      pageIcon={<LayoutGrid className="h-5 w-5" />}
      onRefresh={loadData}
      refreshing={loading}
    >
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-xl font-black text-gray-900">Manage Departments</h2>
          <p className="text-sm font-medium text-gray-500">
            Add or update hospital clinical and non-clinical departments.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors text-sm"
        >
          <Plus className="h-4 w-4" /> New Department
        </button>
      </div>

      {/* Department cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {departments.map((d: any) => (
          <div
            key={d.id}
            className={`bg-white rounded-2xl border ${d.is_active ? 'border-gray-200 shadow-sm' : 'border-dashed border-gray-300 opacity-70'} p-5 relative overflow-hidden hover:border-indigo-300 transition-colors`}
          >
            <div className={`absolute top-0 left-0 w-full h-1 ${d.is_active ? 'bg-indigo-500' : 'bg-gray-300'}`} />

            <div className="flex justify-between items-start mt-2 mb-3">
              <h3 className="text-base font-black text-gray-900 leading-tight">{d.name}</h3>
              <button
                onClick={() => openEdit(d)}
                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors shrink-0"
              >
                <Edit2 className="h-4 w-4" />
              </button>
            </div>

            {/* Head of Department */}
            <div className="flex items-center gap-1.5 mb-3">
              <UserCircle2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <span className="text-xs text-gray-500 font-medium">
                {d.head_doctor_name ?? <span className="italic text-gray-300">No HOD assigned</span>}
              </span>
            </div>

            {d.description && (
              <p className="text-xs text-gray-400 mb-3 line-clamp-2">{d.description}</p>
            )}

            <div className="flex justify-between items-center pt-3 border-t border-gray-100">
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5">Base Fee</p>
                <p className="font-bold text-gray-900 text-sm">₹{Number(d.base_consultation_fee).toLocaleString('en-IN')}</p>
              </div>
              <button
                onClick={() => toggleStatus(d.id, d.is_active)}
                className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider transition-colors ${
                  d.is_active
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                }`}
              >
                {d.is_active ? 'Active' : 'Disabled'}
              </button>
            </div>
          </div>
        ))}

        {departments.length === 0 && !loading && (
          <div className="col-span-full border-2 border-dashed border-gray-200 rounded-3xl p-16 text-center bg-gray-50/50">
            <LayoutGrid className="h-14 w-14 mx-auto mb-4 text-gray-300" />
            <h2 className="text-lg font-black text-gray-900 mb-2">No Departments Yet</h2>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">
              Create departments to categorize doctors and set base consultation fees for OPD.
            </p>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-black text-gray-900">{editId ? 'Edit Department' : 'Create Department'}</h3>
                <p className="text-[10px] text-gray-400 mt-0.5 flex gap-3">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />Mandatory</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />Optional</span>
                </p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                  {error}
                </div>
              )}

              {/* Department Name — Mandatory */}
              <div>
                <FieldLabel label="Department Name" badge="mandatory" />
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Cardiology"
                  maxLength={100}
                  className={inputCls}
                />
              </div>

              {/* Base Consultation Fee — Mandatory */}
              <div>
                <FieldLabel label="Base Consultation Fee (₹)" badge="mandatory" />
                <input
                  required
                  type="number"
                  min={0}
                  value={form.base_consultation_fee}
                  onChange={e => set('base_consultation_fee', e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* Head of Department — Optional (from doc: listed but no mandatory marker) */}
              <div>
                <FieldLabel label="Head of Department (Doctor)" badge="optional" />
                <select
                  value={form.head_doctor_id}
                  onChange={e => set('head_doctor_id', e.target.value)}
                  className={selectCls}
                >
                  <option value="">— Not assigned —</option>
                  {doctors.map((doc: any) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name}{doc.specialty ? ` (${doc.specialty})` : ''}
                    </option>
                  ))}
                </select>
                {doctors.length === 0 && (
                  <p className="text-[10px] text-amber-600 mt-1">No active doctors found. Add doctors first.</p>
                )}
              </div>

              {/* Description — Optional */}
              <div>
                <FieldLabel label="Description / Notes" badge="optional" />
                <textarea
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  rows={3}
                  placeholder="Optional notes about this department…"
                  className={inputCls}
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                <input
                  type="checkbox"
                  id="deptActive"
                  checked={form.is_active}
                  onChange={e => set('is_active', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                />
                <label htmlFor="deptActive" className="text-sm font-bold text-indigo-900">
                  Active — department appears in OPD & billing
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 text-sm font-semibold hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Department'}
              </button>
            </div>
          </form>
        </div>
      )}
    </AdminPage>
  );
}
