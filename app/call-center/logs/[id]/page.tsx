'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/app/components/layout/AppShell';
import { Phone, ArrowLeft, Bot, User, Calendar, ShieldCheck } from 'lucide-react';
import { getCallLogDetail } from '@/app/actions/call-center-actions';

interface TranscriptTurn {
  role?: string;
  text?: string;
  ts?: string | number;
}

const outcomeColor: Record<string, string> = {
  Booked: 'bg-green-50 text-green-700 border border-green-200',
  Registered: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  Cancelled: 'bg-red-50 text-red-700 border border-red-200',
  Rescheduled: 'bg-blue-50 text-blue-700 border border-blue-200',
  Enquiry: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  Callback: 'bg-purple-50 text-purple-700 border border-purple-200',
  Transferred: 'bg-cyan-50 text-cyan-700 border border-cyan-200',
  NoAnswer: 'bg-gray-50 text-gray-600 border border-gray-200',
  Busy: 'bg-orange-50 text-orange-700 border border-orange-200',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm text-gray-900">{value ?? '—'}</p>
    </div>
  );
}

export default function CallLogDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [log, setLog] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await getCallLogDetail(id);
      if (cancelled) return;
      if (res.success && res.data) setLog(res.data);
      else setNotFound(true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const turns: TranscriptTurn[] = Array.isArray(log?.transcript?.turns) ? log.transcript.turns : [];

  return (
    <AppShell pageTitle="Call Detail" pageIcon={<Phone className="h-5 w-5" />}>
      <button
        onClick={() => router.push('/call-center/logs')}
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Call Logs
      </button>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading...</div>
      ) : notFound || !log ? (
        <div className="p-12 text-center bg-white border border-gray-200 rounded-2xl">
          <Phone className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Call not found</p>
        </div>
      ) : (
        <div className="space-y-6 max-w-4xl">
          {/* Header */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
              {log.channel === 'voice_ai' ? (
                <Bot className="h-6 w-6 text-indigo-600" />
              ) : (
                <Phone className="h-6 w-6 text-blue-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 font-mono">{log.patient_phone}</p>
              <p className="text-sm text-gray-500 mt-0.5">
                {log.patient_name || 'Unknown caller'}
                {log.channel === 'voice_ai' ? ' • AI Voice Assistant' : ` • ${log.agent_id}`}
              </p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full ${outcomeColor[log.outcome] || 'bg-gray-50 text-gray-600'}`}>
              {log.outcome}
            </span>
          </div>

          {/* Metadata grid */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Call Details</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Call Type" value={log.call_type} />
              <Field label="Channel" value={log.channel} />
              <Field label="Direction" value={log.direction} />
              <Field label="Provider" value={log.provider} />
              <Field label="Status" value={log.status} />
              <Field label="Language" value={log.language} />
              <Field
                label="Duration"
                value={log.duration_seconds != null ? `${log.duration_seconds}s` : '—'}
              />
              <Field
                label="Started"
                value={log.started_at ? new Date(log.started_at).toLocaleString('en-GB') : '—'}
              />
              <Field
                label="Ended"
                value={log.ended_at ? new Date(log.ended_at).toLocaleString('en-GB') : '—'}
              />
            </div>
          </div>

          {/* Verification + linked records */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-gray-500" /> Verification
              </h2>
              <Field label="Status" value={log.verification_status} />
              {log.patient ? (
                <div className="mt-3 flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                  <User className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{log.patient.full_name}</p>
                    <p className="text-xs text-gray-500">
                      {log.patient.patient_id}
                      {log.patient.age ? ` • ${log.patient.age} yrs` : ''}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400 mt-3">No patient linked</p>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" /> Appointment
              </h2>
              {log.appointment ? (
                <div className="space-y-2">
                  <Field label="Appointment ID" value={log.appointment.appointment_id} />
                  <Field label="Doctor" value={log.appointment.doctor_name} />
                  <Field label="Department" value={log.appointment.department} />
                  <Field
                    label="Date"
                    value={
                      log.appointment.appointment_date
                        ? new Date(log.appointment.appointment_date).toLocaleString('en-GB')
                        : '—'
                    }
                  />
                  <Field label="Status" value={log.appointment.status} />
                </div>
              ) : (
                <p className="text-xs text-gray-400">No appointment linked</p>
              )}
            </div>
          </div>

          {/* Transcript */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">Transcript</h2>
            {log.transcript?.summary && (
              <p className="text-sm text-gray-600 mb-4 italic">{log.transcript.summary}</p>
            )}
            {turns.length === 0 ? (
              <p className="text-xs text-gray-400">No transcript recorded for this call.</p>
            ) : (
              <div className="space-y-3">
                {turns.map((t, i) => {
                  const isAssistant = t.role === 'assistant';
                  return (
                    <div key={i} className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                          isAssistant
                            ? 'bg-indigo-50 text-indigo-900 rounded-tl-sm'
                            : 'bg-gray-100 text-gray-800 rounded-tr-sm'
                        }`}
                      >
                        <span className="block text-[10px] uppercase tracking-wide opacity-60 mb-0.5">
                          {isAssistant ? 'Assistant' : 'Caller'}
                        </span>
                        {t.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {log.notes && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-2">Notes</h2>
              <p className="text-sm text-gray-700">{log.notes}</p>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
