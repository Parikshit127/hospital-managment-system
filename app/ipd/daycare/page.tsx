'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Clock, Plus, X, Play, CheckCircle, Loader2, Receipt } from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';
import { getAdmissionBookings, createAdmissionBooking, updateAdmissionBookingStatus, createDaycareInvoice } from '@/app/actions/ipd-enhancement-actions';

const STATUS_COLORS: Record<string, string> = {
  Booked: 'bg-blue-50 text-blue-700',
  'In Progress': 'bg-amber-50 text-amber-700',
  Completed: 'bg-emerald-50 text-emerald-700',
  Cancelled: 'bg-red-50 text-red-700',
};

type FilterTab = 'Today' | 'In Progress' | 'Upcoming' | 'Completed';

export default function DaycarePage() {
  const toast = useToast();
  const [bookings, setBookings] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('Today');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Billing modal state
  const [billModal, setBillModal] = useState<any | null>(null);
  const [billForm, setBillForm] = useState({ unitPrice: '', discount: '', paymentMethod: 'Cash' });
  const [billing, setBilling] = useState(false);

  const handleBill = async () => {
    if (!billModal) return;
    const price = parseFloat(billForm.unitPrice);
    if (!price || price <= 0) { toast.error('Enter a valid procedure cost'); return; }
    setBilling(true);
    const notes: string = billModal.notes || '';
    const patientMatch = notes.match(/Patient:\s*([^|]+)/);
    const patientName = patientMatch ? patientMatch[1].trim() : billModal.patient_id;
    const res = await createDaycareInvoice({
      bookingId: billModal.id,
      patientId: billModal.patient_id,
      patientName,
      procedureName: billModal.department || 'Daycare Procedure',
      unitPrice: price,
      discount: parseFloat(billForm.discount) || 0,
      paymentMethod: billForm.paymentMethod,
    });
    setBilling(false);
    if (res.success) {
      toast.success(`Invoice ${res.data?.invoiceNumber} created & marked Paid`);
      setBillModal(null);
      setBillForm({ unitPrice: '', discount: '', paymentMethod: 'Cash' });
      loadData();
    } else {
      toast.error((res as any).error || 'Billing failed');
    }
  };

  const handleStatusChange = async (id: string, status: 'In Progress' | 'Completed' | 'Cancelled') => {
    setUpdatingId(id);
    const res = await updateAdmissionBookingStatus(id, status);
    if (res.success) {
      toast.success(status === 'In Progress' ? 'Procedure started' : status === 'Completed' ? 'Procedure completed' : 'Booking cancelled');
      if (status === 'In Progress') setActiveTab('In Progress');
      if (status === 'Completed') setActiveTab('Completed');
      loadData();
    } else {
      toast.error((res as any).error || 'Failed to update status');
    }
    setUpdatingId(null);
  };

  const [form, setForm] = useState({
    patient_name: '',
    patient_id: '',
    procedure_name: '',
    doctor_name: '',
    scheduled_date: '',
    duration_hours: '4',
    notes: '',
  });

  const loadData = async () => {
    setRefreshing(true);
    const res = await getAdmissionBookings();
    if (res.success) {
      const daycare = (res.data as any[]).filter((b: any) => b.admission_type === 'DAYCARE');
      setBookings(daycare);
    }
    setRefreshing(false);
  };

  useEffect(() => { loadData(); }, []);

  const today = new Date().toISOString().slice(0, 10);

  const toDateStr = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : '');

  const todayProcedures = bookings.filter(b => toDateStr(b.expected_date) === today);
  const pending = bookings.filter(b => b.status === 'Booked' || !b.status);
  const inProgress = bookings.filter(b => b.status === 'In Progress');
  const completed = bookings.filter(b => b.status === 'Completed');

  const filteredBookings = (() => {
    if (activeTab === 'Today') return bookings.filter(b => toDateStr(b.expected_date) === today && b.status !== 'Completed');
    if (activeTab === 'In Progress') return bookings.filter(b => b.status === 'In Progress');
    if (activeTab === 'Upcoming') return bookings.filter(b => toDateStr(b.expected_date) > today && b.status !== 'Completed');
    return completed;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await createAdmissionBooking({
      patientId: form.patient_id || form.patient_name,
      expectedDate: form.scheduled_date,
      bedCategory: 'Daycare',
      department: form.procedure_name,
      doctorName: form.doctor_name || undefined,
      admissionType: 'DAYCARE',
      notes: form.notes
        ? `[DAYCARE] Duration: ${form.duration_hours}h | Patient: ${form.patient_name} | ${form.notes}`
        : `[DAYCARE] Duration: ${form.duration_hours}h | Patient: ${form.patient_name}`,
    });
    if (res.success) {
      toast.success('Daycare booking created successfully');
      setModalOpen(false);
      setForm({ patient_name: '', patient_id: '', procedure_name: '', doctor_name: '', scheduled_date: '', duration_hours: '4', notes: '' });
      loadData();
    } else {
      toast.error((res as any).error || 'Failed to create booking');
    }
    setSaving(false);
  };

  return (
    <AppShell
      pageTitle="Daycare Procedures"
      pageIcon={<Clock className="h-5 w-5" />}
      onRefresh={loadData}
      refreshing={refreshing}
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Today's Procedures", value: todayProcedures.length, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Pending', value: pending.length, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'In Progress', value: inProgress.length, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Completed', value: completed.length, color: 'text-emerald-600', bg: 'bg-emerald-50' },
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
          {/* Filter Tabs */}
          <div className="flex gap-1">
            {([
              { key: 'Today', label: 'Today' },
              { key: 'In Progress', label: 'In Progress', count: inProgress.length },
              { key: 'Upcoming', label: 'Upcoming' },
              { key: 'Completed', label: 'Completed' },
            ] as { key: FilterTab; label: string; count?: number }[]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.key
                    ? 'bg-orange-600 text-white'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 bg-orange-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> New Daycare Booking
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                {['Patient Name', 'Procedure', 'Doctor', 'Scheduled Date', 'Duration', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 font-bold text-xs uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredBookings.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400 text-sm">No procedures found</td></tr>
              )}
              {filteredBookings.map(b => {
                const notes: string = b.notes || '';
                const durationMatch = notes.match(/Duration:\s*([\d.]+)h/);
                const duration = durationMatch ? `${durationMatch[1]}h` : '—';
                const patientMatch = notes.match(/Patient:\s*([^|]+)/);
                const patientDisplay = patientMatch ? patientMatch[1].trim() : b.patient_id;

                return (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800">{patientDisplay}</td>
                    <td className="px-5 py-3 text-gray-700">{b.department || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{b.doctor_name || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">
                      {b.expected_date ? new Date(b.expected_date).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{duration}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${STATUS_COLORS[b.status] || 'bg-gray-100 text-gray-600'}`}>
                        {b.status || 'Booked'}
                      </span>
                    </td>
                    <td className="px-5 py-3 flex items-center gap-2">
                      {b.status !== 'In Progress' && b.status !== 'Completed' && (
                        <button
                          title="Start Procedure"
                          disabled={updatingId === b.id}
                          onClick={() => handleStatusChange(b.id, 'In Progress')}
                          className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-800 text-xs font-bold disabled:opacity-50"
                        >
                          {updatingId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Start
                        </button>
                      )}
                      {b.status === 'In Progress' && (
                        <button
                          title="Complete Procedure"
                          disabled={updatingId === b.id}
                          onClick={() => handleStatusChange(b.id, 'Completed')}
                          className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-800 text-xs font-bold disabled:opacity-50"
                        >
                          {updatingId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />} Complete
                        </button>
                      )}
                      {b.status === 'Completed' && (
                        <button
                          onClick={() => {
                            const notes: string = b.notes || '';
                            const costMatch = notes.match(/Cost:\s*([\d.]+)/);
                            setBillForm({
                              unitPrice: costMatch ? costMatch[1] : b.estimated_cost ? String(b.estimated_cost) : '',
                              discount: '',
                              paymentMethod: 'Cash',
                            });
                            setBillModal(b);
                          }}
                          className="inline-flex items-center gap-1 text-orange-600 hover:text-teal-800 text-xs font-bold"
                        >
                          <Receipt className="h-3.5 w-3.5" /> Bill
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Daycare Booking Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-600" /> New Daycare Booking
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Patient Name *</label>
                  <input
                    required
                    type="text"
                    inputMode="text"
                    autoComplete="name"
                    maxLength={100}
                    value={form.patient_name}
                    onChange={e => {
                      const val = e.target.value.replace(/[^a-zA-Z\s.\-'()]/g, '');
                      setForm(f => ({ ...f, patient_name: val }));
                    }}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Patient ID / UHID</label>
                  <input
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={50}
                    value={form.patient_id}
                    onChange={e => setForm(f => ({ ...f, patient_id: e.target.value.trim() }))}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none"
                    placeholder="PT-XXXXXX"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Procedure Name *</label>
                <input
                  required
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  maxLength={150}
                  value={form.procedure_name}
                  onChange={e => {
                    // Letters, digits, spaces, common punctuation — no special chars
                    const val = e.target.value.replace(/[^a-zA-Z0-9\s.,\-()\/]/g, '');
                    setForm(f => ({ ...f, procedure_name: val }));
                  }}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none"
                  placeholder="e.g. Cataract Surgery, Colonoscopy"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Doctor Name</label>
                  <input
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    maxLength={100}
                    value={form.doctor_name}
                    onChange={e => {
                      const val = e.target.value.replace(/[^a-zA-Z\s.\-']/g, '');
                      setForm(f => ({ ...f, doctor_name: val }));
                    }}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none"
                    placeholder="Dr. Name"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Scheduled Date *</label>
                  <input
                    required
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={form.scheduled_date}
                    onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Duration (hours)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={24}
                  step={1}
                  value={form.duration_hours}
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    const num = Math.min(24, Math.max(1, Number(val) || 1));
                    setForm(f => ({ ...f, duration_hours: val === '' ? '' : String(num) }));
                  }}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Notes</label>
                <textarea
                  maxLength={500}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none min-h-[72px]"
                  placeholder="Additional notes..."
                />
              </div>
              <button
                disabled={saving}
                type="submit"
                className="w-full bg-orange-600 hover:bg-teal-700 disabled:opacity-60 text-white font-bold p-3 rounded-xl shadow-md transition-all"
              >
                {saving ? 'Creating...' : 'Create Daycare Booking'}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Billing Modal */}
      {billModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Receipt className="h-5 w-5 text-orange-600" /> Daycare Billing
              </h3>
              <button type="button" onClick={() => setBillModal(null)} className="text-gray-400 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Summary */}
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-1 text-sm">
                <p className="font-black text-gray-800">{(() => { const m = (billModal.notes||'').match(/Patient:\s*([^|]+)/); return m ? m[1].trim() : billModal.patient_id; })()}</p>
                <p className="text-gray-500">Procedure: <span className="font-bold text-gray-700">{billModal.department}</span></p>
                <p className="text-gray-500">Date: <span className="font-bold text-gray-700">{new Date(billModal.expected_date).toLocaleDateString('en-IN')}</span></p>
                {billModal.doctor_name && <p className="text-gray-500">Doctor: <span className="font-bold text-gray-700">{billModal.doctor_name}</span></p>}
              </div>

              {/* Procedure Cost */}
              <div>
                <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Procedure Cost (₹) *</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={billForm.unitPrice}
                  onChange={e => setBillForm(f => ({ ...f, unitPrice: e.target.value.replace(/[^0-9.]/g, '') }))}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none"
                  placeholder="e.g. 2500"
                />
              </div>

              {/* Discount */}
              <div>
                <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Discount (₹)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={billForm.discount}
                  onChange={e => setBillForm(f => ({ ...f, discount: e.target.value.replace(/[^0-9.]/g, '') }))}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none"
                  placeholder="0"
                />
              </div>

              {/* Net payable preview */}
              {billForm.unitPrice && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 flex justify-between items-center">
                  <span className="text-xs font-bold text-gray-500 uppercase">Net Payable</span>
                  <span className="text-lg font-black text-orange-700">
                    ₹{Math.max(0, (parseFloat(billForm.unitPrice) || 0) - (parseFloat(billForm.discount) || 0)).toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              {/* Payment Method */}
              <div>
                <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Payment Method</label>
                <div className="grid grid-cols-4 gap-2">
                  {['Cash', 'Card', 'UPI', 'Online'].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setBillForm(f => ({ ...f, paymentMethod: m }))}
                      className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                        billForm.paymentMethod === m
                          ? 'bg-orange-600 border-teal-600 text-white'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-teal-400'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setBillModal(null)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={billing || !billForm.unitPrice}
                  onClick={handleBill}
                  className="flex-1 py-2.5 bg-orange-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                >
                  {billing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                  {billing ? 'Creating Invoice…' : 'Generate Invoice & Collect'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </AppShell>
  );
}
