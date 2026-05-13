'use client';

import React, { useState, useEffect } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Phone, PhoneCall, Calendar, Clock, PhoneMissed, Plus } from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';

interface CallLogEntry {
  id: string;
  patient_phone: string;
  patient_name: string | null;
  call_type: string;
  outcome: string;
  agent_id: string;
  created_at: string;
  duration_seconds: number | null;
}

interface Stats {
  todayCalls: number;
  booked: number;
  pendingCallbacks: number;
  avgDuration: number;
}

export default function CallCenterDashboard() {
  const toast = useToast();
  const [logs, setLogs] = useState<CallLogEntry[]>([]);
  const [stats, setStats] = useState<Stats>({
    todayCalls: 0,
    booked: 0,
    pendingCallbacks: 0,
    avgDuration: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch real data here when backend is wired up
    setLoading(false);
  }, []);

  const outcomeColor: Record<string, string> = {
    Booked: 'bg-green-50 text-green-700 border border-green-200',
    Cancelled: 'bg-red-50 text-red-700 border border-red-200',
    Rescheduled: 'bg-blue-50 text-blue-700 border border-blue-200',
    Enquiry: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    NoAnswer: 'bg-gray-50 text-gray-600 border border-gray-200',
    Busy: 'bg-orange-50 text-orange-700 border border-orange-200',
  };

  return (
    <AppShell pageTitle="Call Center" pageIcon={<Phone className="h-5 w-5" />}>
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <PhoneCall className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Today&apos;s Calls</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.todayCalls}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-xl bg-green-50 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">Appointments Booked</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.booked}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <PhoneMissed className="h-5 w-5 text-amber-600" />
            </div>
            <span className="text-sm text-gray-500">Pending Callbacks</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.pendingCallbacks}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-xl bg-purple-50 flex items-center justify-center">
              <Clock className="h-5 w-5 text-purple-600" />
            </div>
            <span className="text-sm text-gray-500">Avg Duration</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {stats.avgDuration > 0 ? `${stats.avgDuration}s` : '—'}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Recent Calls</h2>
        <a
          href="/call-center/book"
          className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Call
        </a>
      </div>

      {/* Recent Calls Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <Phone className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No calls logged today</p>
            <p className="text-gray-400 text-sm mt-1">Call logs will appear here as agents handle calls</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Phone</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Patient Name</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Outcome</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Agent</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Time</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
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
                    <td className="px-4 py-3 text-gray-600">{log.agent_id}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {log.duration_seconds ? `${log.duration_seconds}s` : '—'}
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
