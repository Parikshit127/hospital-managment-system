'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { CalendarClock, Plus, X } from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';
import { getAdmissionBookings, createAdmissionBooking } from '@/app/actions/ipd-enhancement-actions';

const STATUS_COLORS: Record<string, string> = {
  Booked: 'bg-blue-50 text-blue-700',
  Confirmed: 'bg-orange-50 text-orange-700',
  Admitted: 'bg-emerald-50 text-emerald-700',
  Cancelled: 'bg-red-50 text-red-700',
};

const BED_CATEGORIES = ['General', 'Semi-Private', 'Private', 'Deluxe', 'VIP'];

export default function PreAdmissionsPage() {
  const toast = useToast();
  const [bookings, setBookings] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    patientId: '', expectedDate: '', bedCategory: 'General',
    department: '', doctorName: '', estimatedCost: '', notes: '',
  });

  const loadData = async () => {
    setRefreshing(true);
    try {
      const res = await getAdmissionBookings();
      if (res.success) setBookings(res.data as any[]);
    } catch (err) {
      console.error('Failed to load bookings:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const totalBooked = bookings.length;
  const getDateStr = (d: any) => d ? new Date(d).toISOString().slice(0, 10) : '';
  const expectedToday = bookings.filter(b => getDateStr(b.expected_date) === today).length;
  const expectedThisWeek = bookings.filter(b => {
    const dStr = getDateStr(b.expected_date);
    return dStr && dStr >= today && dStr <= weekEnd;
  }).length;
  const admitted = bookings.filter(b => b.status === 'Admitted').length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await createAdmissionBooking({
      patientId: form.patientId,
      expectedDate: form.expectedDate,
      bedCategory: form.bedCategory,
      department: form.department,
      doctorName: form.doctorName || undefined,
      estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : undefined,
      notes: form.notes || undefined,
    });
    if (res.success) {
      toast.success('Booking created successfully');
      setModalOpen(false);
      setForm({ patientId: '', expectedDate: '', bedCategory: 'General', department: '', doctorName: '', estimatedCost: '', notes: '' });
      loadData();
    } else {
      toast.error((res as any).error || 'Failed to create booking');
    }
    setSaving(false);
  };

  return (
    <AppShell
      pageTitle="Pre-Admission Bookings"
      pageIcon={<CalendarClock className="h-5 w-5" />}
      onRefresh={loadData}
      refreshing={refreshing}
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Booked', value: totalBooked, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Expected Today', value: expectedToday, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Expected This Week', value: expectedThisWeek, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Admitted', value: admitted, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 border border-gray-100`}>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{s.label}</p>
            <p className={`text-3xl font-black mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table Card */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <h2 className="font-bold text-gray-900 text-sm">All Bookings</h2>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 bg-orange-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> New Booking
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                {['Booking #', 'Patient ID', 'Expected Date', 'Bed Category', 'Department', 'Doctor', 'Est. Cost', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 font-bold text-xs uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bookings.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-gray-400 text-sm">No bookings found</td></tr>
              )}
              {bookings.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-xs font-bold text-gray-700">{b.booking_number}</td>
                  <td className="px-5 py-3 text-gray-700">{b.patient_id}</td>
                  <td className="px-5 py-3 text-gray-600">{b.expected_date ? new Date(b.expected_date).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-5 py-3">
                    <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-bold">{b.bed_category}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{b.department}</td>
                  <td className="px-5 py-3 text-gray-600">{b.doctor_name || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{b.estimated_cost ? `₹${Number(b.estimated_cost).toLocaleString('en-IN')}` : '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${STATUS_COLORS[b.status] || 'bg-gray-100 text-gray-600'}`}>{b.status || 'Booked'}</span>
                  </td>
                  <td className="px-5 py-3">
                    <a
                      href={`/api/ipd/facesheet/${b.patient_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-orange-600 hover:underline text-xs font-bold"
                    >
                      Facesheet
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Booking Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-orange-600" /> New Pre-Admission Booking
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Patient ID *</label>
                  <input required value={form.patientId} onChange={e => setForm(f => ({ ...f, patientId: e.target.value }))}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none" placeholder="PT-XXXXXX" />
                </div>
                <div>
                  <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Expected Date *</label>
                  <input required type="date" value={form.expectedDate} onChange={e => setForm(f => ({ ...f, expectedDate: e.target.value }))}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Bed Category *</label>
                  <select required value={form.bedCategory} onChange={e => setForm(f => ({ ...f, bedCategory: e.target.value }))}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none bg-white">
                    {BED_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Department *</label>
                  <input required value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none" placeholder="e.g. Cardiology" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Doctor Name</label>
                  <input value={form.doctorName} onChange={e => setForm(f => ({ ...f, doctorName: e.target.value }))}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none" placeholder="Dr. Name" />
                </div>
                <div>
                  <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Estimated Cost (₹)</label>
                  <input type="number" min="0" value={form.estimatedCost} onChange={e => setForm(f => ({ ...f, estimatedCost: e.target.value }))}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none min-h-[72px]" placeholder="Additional notes..." />
              </div>
              <button disabled={saving} type="submit"
                className="w-full bg-orange-600 hover:bg-teal-700 disabled:opacity-60 text-white font-bold p-3 rounded-xl shadow-md transition-all">
                {saving ? 'Creating...' : 'Create Booking'}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
