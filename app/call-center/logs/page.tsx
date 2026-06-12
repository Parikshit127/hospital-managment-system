'use client';

import React, { useState, useEffect } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import { AppShell } from '@/app/components/layout/AppShell';
import { FileText, Phone } from 'lucide-react';

interface CallLogEntry {
  id: string;
  patient_phone: string;
  patient_name: string | null;
  call_type: string;
  outcome: string;
  agent_id: string;
  created_at: string;
  duration_seconds: number | null;
  notes: string | null;
}

const CALL_TYPES = ['All', 'Inbound', 'Outbound', 'Follow-up'];
const OUTCOMES = ['All', 'Booked', 'Cancelled', 'Rescheduled', 'Enquiry', 'NoAnswer', 'Busy'];

export default function CallLogsPage() {
  const [logs, setLogs] = useState<CallLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [callTypeFilter, setCallTypeFilter] = useState('All');
  const [outcomeFilter, setOutcomeFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    // Fetch real data here when backend is wired up
    setLoading(false);
  }, []);

  const filtered = logs.filter((l) => {
    if (callTypeFilter !== 'All' && l.call_type !== callTypeFilter) return false;
    if (outcomeFilter !== 'All' && l.outcome !== outcomeFilter) return false;
    if (dateFrom && new Date(l.created_at) < new Date(dateFrom)) return false;
    if (dateTo && new Date(l.created_at) > new Date(dateTo + 'T23:59:59')) return false;
    return true;
  });

  const outcomeColor: Record<string, string> = {
    Booked: 'bg-green-50 text-green-700 border border-green-200',
    Cancelled: 'bg-red-50 text-red-700 border border-red-200',
    Rescheduled: 'bg-blue-50 text-blue-700 border border-blue-200',
    Enquiry: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    NoAnswer: 'bg-gray-50 text-gray-600 border border-gray-200',
    Busy: 'bg-orange-50 text-orange-700 border border-orange-200',
  };

  return (
    <AppShell pageTitle="Call Logs" pageIcon={<FileText className="h-5 w-5" />}>
      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Call Type</label>
            <select
              value={callTypeFilter}
              onChange={(e) => setCallTypeFilter(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CALL_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Outcome</label>
            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">From Date</label>
            <DateField
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To Date</label>
            <DateField
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Phone className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No call logs found</p>
            <p className="text-gray-400 text-sm mt-1">Call logs will appear here after agents log calls</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Date / Time</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Agent</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Phone</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Patient Name</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Call Type</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Outcome</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Duration</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">
                      {new Date(log.created_at).toLocaleDateString('en-GB')}{' '}
                      {new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{log.agent_id}</td>
                    <td className="px-4 py-3 font-mono text-gray-800">{log.patient_phone}</td>
                    <td className="px-4 py-3 text-gray-700">{log.patient_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {log.call_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${outcomeColor[log.outcome] || 'bg-gray-50 text-gray-600'}`}>
                        {log.outcome}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {log.duration_seconds ? `${log.duration_seconds}s` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                      {log.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
