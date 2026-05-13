'use client';

import React, { useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { CalendarPlus, Search, User, Phone, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';
import { checkDuplicatePatient } from '@/app/actions/register-patient';
import { bookAppointment } from '@/app/actions/reception-actions';

const DEPARTMENTS = [
  'General Medicine', 'Cardiology', 'Orthopedics', 'Pediatrics',
  'Neurology', 'ENT', 'Dermatology', 'Pulmonology', 'Gynecology', 'Ophthalmology',
];

export default function CallCenterBookPage() {
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [department, setDepartment] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(false);

  const handleLookup = async () => {
    if (!phone || phone.length < 10) {
      toast.error('Enter a valid 10-digit phone number');
      return;
    }
    setSearching(true);
    setPatients([]);
    setSelectedPatient(null);
    setNotFound(false);
    try {
      const result = await checkDuplicatePatient(phone);
      if (result.success && result.data && result.data.length > 0) {
        setPatients(result.data);
        setSelectedPatient(result.data[0]);
        setNotFound(false);
      } else {
        setNotFound(true);
      }
    } catch {
      toast.error('Patient lookup failed');
    } finally {
      setSearching(false);
    }
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    if (!department) {
      toast.error('Please select a department');
      return;
    }
    setSubmitting(true);
    try {
      const result = await bookAppointment({
        patientId: selectedPatient.patient_id,
        doctorId: '',
        doctorName: '',
        department,
        date: preferredDate || new Date().toISOString().split('T')[0],
        reasonForVisit: reason || 'Call Center Booking',
        booking_channel: 'call_center',
      });
      if (result.success) {
        setBooked(true);
        toast.success('Appointment booked successfully');
      } else {
        toast.error((result as any).error || 'Booking failed');
      }
    } catch {
      toast.error('Failed to book appointment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setPhone('');
    setPatients([]);
    setSelectedPatient(null);
    setNotFound(false);
    setDepartment('');
    setPreferredDate('');
    setReason('');
    setBooked(false);
  };

  return (
    <AppShell pageTitle="Book Appointment" pageIcon={<CalendarPlus className="h-5 w-5" />}>
      <div className="max-w-xl mx-auto space-y-6">

        {/* Phone Lookup */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Phone className="h-4 w-4 text-blue-500" />
            Patient Lookup by Phone
          </h2>
          <div className="flex gap-3">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="Enter 10-digit mobile number"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
            />
            <button
              onClick={handleLookup}
              disabled={searching}
              className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Search className="h-4 w-4" />
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Patient Not Found */}
        {notFound && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-amber-800">Patient not found</p>
              <p className="text-sm text-amber-700 mt-1">
                No patient registered with this phone number.{' '}
                <a href="/reception/register" className="underline font-medium">
                  Register new patient
                </a>
              </p>
            </div>
          </div>
        )}

        {/* Patient Selection (if multiple matches) */}
        {patients.length > 1 && !booked && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Multiple patients found — select one:</p>
            <div className="space-y-2">
              {patients.map((p) => (
                <button
                  key={p.patient_id}
                  onClick={() => setSelectedPatient(p)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                    selectedPatient?.patient_id === p.patient_id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className="font-medium text-gray-900">{p.full_name}</span>
                  <span className="text-gray-500 ml-2">· {p.patient_id}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Patient Card */}
        {selectedPatient && !booked && (
          <>
            <div className="bg-white border border-gray-200 rounded-2xl p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{selectedPatient.full_name}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  ID: {selectedPatient.patient_id} &bull; {selectedPatient.phone}
                  {selectedPatient.age ? ` • ${selectedPatient.age} yrs` : ''}
                </p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                Selected
              </span>
            </div>

            {/* Booking Form */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Appointment Details</h2>
              <form onSubmit={handleBook} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Department <span className="text-red-500">*</span></label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select department</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Preferred Date</label>
                  <input
                    type="date"
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Reason for Visit</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="Brief description of complaint..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Booking...' : 'Book Appointment'}
                </button>
              </form>
            </div>
          </>
        )}

        {/* Success State */}
        {booked && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="font-semibold text-green-800 text-lg">Appointment Booked!</p>
            <p className="text-sm text-green-700 mt-1 mb-4">
              The appointment for {selectedPatient?.full_name} has been scheduled successfully.
            </p>
            <button
              onClick={handleReset}
              className="text-sm text-green-700 underline"
            >
              Book another appointment
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
