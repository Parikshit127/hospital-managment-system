'use client';

import React from 'react';
import {
  CalendarDays,
  ClipboardList,
  HeartPulse,
  UserCheck,
} from 'lucide-react';

interface OPDHistoryTabProps {
  appointments: any[];
  clinicalEHRs: any[];
  vitalSigns: any[];
  followUps: any[];
}

const fmtDate = (v?: string | Date | null) => {
  if (!v) return 'N/A';
  return new Date(v).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const appointmentStatusColor = (status?: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'cancelled') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (s === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s === 'in progress') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (s === 'checked in') return 'bg-violet-50 text-violet-700 border-violet-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
};

const followUpStatusColor = (status?: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'missed') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (s === 'cancelled') return 'bg-gray-100 text-gray-600 border-gray-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
};

const clinicalNoteColor = (type?: string) => {
  const t = (type || '').toLowerCase();
  if (t === 'diagnosis' || t === 'clinical') return 'border-teal-400';
  if (t === 'follow_up' || t === 'follow-up') return 'border-indigo-400';
  if (t === 'prescription') return 'border-emerald-400';
  if (t === 'lab') return 'border-amber-400';
  return 'border-violet-400';
};

export default function OPDHistoryTab({
  appointments,
  clinicalEHRs,
  vitalSigns,
  followUps,
}: OPDHistoryTabProps) {
  return (
    <div className="space-y-8">
      {/* APPOINTMENTS */}
      <section>
        <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-blue-600" />
          Appointments
        </h3>
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  {['Date', 'Appointment ID', 'Doctor', 'Department', 'Reason', 'Status'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {appointments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12">
                      <CalendarDays className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm font-medium">No appointments found</p>
                    </td>
                  </tr>
                ) : (
                  appointments.map((appt: any, idx: number) => (
                    <tr key={appt.appointment_id || idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {fmtDate(appt.appointment_date)}
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-semibold whitespace-nowrap">
                        {appt.appointment_id || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {appt.doctor?.full_name || appt.doctor_name || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {appt.department || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                        {appt.reason || 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${appointmentStatusColor(appt.status)}`}
                        >
                          {appt.status || 'Unknown'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CLINICAL NOTES */}
      <section>
        <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-teal-600" />
          Clinical Notes
        </h3>
        {clinicalEHRs.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
            <ClipboardList className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400 text-sm font-medium">No clinical notes found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {clinicalEHRs.map((note: any, idx: number) => (
              <div
                key={note.id || idx}
                className={`bg-white border border-gray-200 rounded-2xl p-4 border-l-4 ${clinicalNoteColor(note.note_type || note.type)}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500 font-semibold">
                    {fmtDate(note.created_at || note.date)}
                  </p>
                  <p className="text-xs text-gray-500 font-semibold">
                    {note.doctor_name || note.doctor?.full_name || 'N/A'}
                  </p>
                </div>
                <p className="text-sm font-bold text-gray-800 mb-1">
                  {note.diagnosis || 'No diagnosis'}
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {note.doctor_notes
                    ? String(note.doctor_notes).length > 200
                      ? String(note.doctor_notes).slice(0, 200) + '...'
                      : note.doctor_notes
                    : 'No notes recorded'}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* VITALS HISTORY */}
      <section>
        <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-rose-600" />
          Vitals
        </h3>
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  {['Date', 'BP', 'Heart Rate', 'Temp', 'SpO2', 'Resp Rate', 'Weight', 'Height'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vitalSigns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12">
                      <HeartPulse className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm font-medium">No vitals recorded</p>
                    </td>
                  </tr>
                ) : (
                  vitalSigns.map((v: any, idx: number) => (
                    <tr key={v.id || idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {fmtDate(v.created_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-semibold">
                        {v.blood_pressure || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {v.heart_rate != null ? `${v.heart_rate} bpm` : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {v.temperature != null ? `${Number(v.temperature)}${'\u00B0'}C` : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {v.spo2 != null ? `${Number(v.spo2)}%` : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {v.respiratory_rate != null ? `${v.respiratory_rate}/min` : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {v.weight != null ? `${Number(v.weight)} kg` : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {v.height != null ? `${Number(v.height)} cm` : 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FOLLOW-UPS */}
      <section>
        <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-indigo-600" />
          Follow-Ups
        </h3>
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  {['Scheduled Date', 'Doctor', 'Status', 'Notes'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {followUps.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12">
                      <UserCheck className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm font-medium">No follow-ups found</p>
                    </td>
                  </tr>
                ) : (
                  followUps.map((fu: any, idx: number) => (
                    <tr key={fu.id || idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {fmtDate(fu.scheduled_date || fu.follow_up_date)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {fu.doctor?.full_name || fu.doctor_name || 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${followUpStatusColor(fu.status)}`}
                        >
                          {fu.status || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[300px] truncate">
                        {fu.notes || 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
