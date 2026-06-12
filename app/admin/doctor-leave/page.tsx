'use client';

import React, { useState, useEffect } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { CalendarOff, Plus, Trash2, X, Loader2 } from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';
import { getDoctorLeaves, createDoctorLeave, deleteDoctorLeave } from '@/app/actions/doctor-leave-actions';
import { getUsersList } from '@/app/actions/admin-actions';

const LEAVE_TYPES = ['Leave', 'Conference', 'Training', 'Personal'];

export default function DoctorLeavePage() {
  const toast = useToast();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    doctorId: '',
    doctorName: '',
    leaveType: 'Leave',
    fromDate: '',
    toDate: '',
    reason: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [leavesRes, doctorsRes] = await Promise.all([
        getDoctorLeaves(),
        getUsersList({ role: 'doctor', page: 1, limit: 200, search: '' }),
      ]);
      if (leavesRes.success) setLeaves(leavesRes.data);
      if ((doctorsRes as any).success) setDoctors((doctorsRes as any).data?.users || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDoctorChange = (userId: string) => {
    const doc = doctors.find((d) => d.id === userId);
    setForm((f) => ({ ...f, doctorId: userId, doctorName: doc?.name || '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.doctorId || !form.fromDate || !form.toDate) {
      toast.error('Please fill all required fields');
      return;
    }
    if (new Date(form.toDate) < new Date(form.fromDate)) {
      toast.error('To date must be after from date');
      return;
    }
    setSubmitting(true);
    try {
      const result = await createDoctorLeave(form);
      if (result.success) {
        toast.success('Doctor leave added successfully');
        setShowModal(false);
        setForm({ doctorId: '', doctorName: '', leaveType: 'Leave', fromDate: '', toDate: '', reason: '' });
        fetchData();
      } else {
        toast.error('Failed to add leave');
      }
    } catch {
      toast.error('An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this leave entry?')) return;
    setDeletingId(id);
    try {
      const result = await deleteDoctorLeave(id);
      if (result.success) {
        toast.success('Leave deleted');
        setLeaves((prev) => prev.filter((l) => l.id !== id));
      } else {
        toast.error('Failed to delete');
      }
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (d: string | Date) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const leaveTypeColor: Record<string, string> = {
    Leave: 'bg-red-50 text-red-700 border border-red-200',
    Conference: 'bg-blue-50 text-blue-700 border border-blue-200',
    Training: 'bg-purple-50 text-purple-700 border border-purple-200',
    Personal: 'bg-amber-50 text-amber-700 border border-amber-200',
  };

  return (
    <AdminPage
      pageTitle="Doctor Leave Management"
      pageIcon={<CalendarOff className="h-5 w-5" />}
      headerActions={
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Leave
        </button>
      }
    >
      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading...
          </div>
        ) : leaves.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarOff className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No doctor leaves recorded</p>
            <p className="text-gray-400 text-sm mt-1">Click &ldquo;Add Leave&rdquo; to record a doctor&apos;s leave</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Doctor Name</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Leave Type</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">From</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">To</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Reason</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((leave) => (
                  <tr key={leave.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{leave.doctor_name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${leaveTypeColor[leave.leave_type] || 'bg-gray-50 text-gray-600 border border-gray-200'}`}>
                        {leave.leave_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(leave.from_date)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(leave.to_date)}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{leave.reason || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(leave.id)}
                        disabled={deletingId === leave.id}
                        className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {deletingId === leave.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Leave Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Add Doctor Leave</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Doctor <span className="text-red-500">*</span></label>
                <select
                  value={form.doctorId}
                  onChange={(e) => handleDoctorChange(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select doctor</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Leave Type</label>
                <select
                  value={form.leaveType}
                  onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {LEAVE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">From Date <span className="text-red-500">*</span></label>
                  <DateField
                    value={form.fromDate}
                    onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))}
                    required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">To Date <span className="text-red-500">*</span></label>
                  <DateField
                    value={form.toDate}
                    onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))}
                    required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Reason</label>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  rows={2}
                  placeholder="Optional reason for leave..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-blue-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? 'Saving...' : 'Save Leave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
