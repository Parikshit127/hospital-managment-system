'use client';

import React from 'react';

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-700 border-gray-200',
  Submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Rejected: 'bg-red-50 text-red-700 border-red-200',
  'Partially Issued': 'bg-amber-50 text-amber-700 border-amber-200',
  Issued: 'bg-teal-50 text-teal-700 border-teal-200',
  Closed: 'bg-slate-100 text-slate-600 border-slate-200',
  Cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
  'In Transit': 'bg-violet-50 text-violet-700 border-violet-200',
  Received: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Frozen: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  Review: 'bg-amber-50 text-amber-700 border-amber-200',
  Posted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Discontinued: 'bg-red-50 text-red-600 border-red-200',
  URGENT: 'bg-red-50 text-red-700 border-red-200',
  EMERGENCY: 'bg-red-100 text-red-800 border-red-300',
  NORMAL: 'bg-gray-50 text-gray-600 border-gray-200',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] || 'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${cls}`}>
      {status}
    </span>
  );
}

export function InventoryPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <h2 className="text-lg font-black text-gray-800">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function InventoryKpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color = 'text-teal-600',
  bg = 'bg-teal-50',
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: string;
  bg?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-teal-300 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
      <p className="text-2xl font-black text-gray-900 tracking-tight">{value}</p>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export const btnPrimary =
  'flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold py-2 px-4 rounded-xl shadow-sm transition-all text-sm disabled:opacity-50';

export const btnSecondary =
  'flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold py-2 px-4 rounded-xl transition-all text-sm';

export const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20';

export const cardCls = 'bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden';
