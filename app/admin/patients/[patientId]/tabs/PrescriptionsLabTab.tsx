'use client';

import React, { useState } from 'react';
import {
  Pill,
  FlaskConical,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface PrescriptionsLabTabProps {
  pharmacyOrders: any[];
  labOrders: any[];
}

const fmtDate = (v?: string | Date | null) => {
  if (!v) return 'N/A';
  return new Date(v).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const pharmacyStatusColor = (status?: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s === 'dispensed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'cancelled') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
};

const labStatusColor = (status?: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'completed' || s === 'resulted') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s === 'in progress' || s === 'processing') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (s === 'cancelled') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
};

export default function PrescriptionsLabTab({
  pharmacyOrders,
  labOrders,
}: PrescriptionsLabTabProps) {
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  const toggleOrder = (id: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-8">
      {/* PHARMACY ORDERS */}
      <section>
        <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
          <Pill className="h-5 w-5 text-emerald-600" />
          Pharmacy Orders
        </h3>
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  {['Order ID', 'Date', 'Doctor', 'Status', 'Total Amount', 'Items', ''].map(
                    (h, i) => (
                      <th
                        key={i}
                        className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pharmacyOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12">
                      <Pill className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm font-medium">No pharmacy orders found</p>
                    </td>
                  </tr>
                ) : (
                  pharmacyOrders.map((order: any, oIdx: number) => {
                    const orderId = order.order_id || order.id || String(oIdx);
                    const isExpanded = expandedOrders.has(orderId);
                    const items: any[] = order.items || order.order_items || [];

                    return (
                      <React.Fragment key={orderId}>
                        <tr
                          className="hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => toggleOrder(orderId)}
                        >
                          <td className="px-4 py-3 text-gray-800 font-semibold whitespace-nowrap">
                            {order.order_id || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {fmtDate(order.created_at || order.order_date)}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {order.doctor?.full_name || order.doctor_name || 'N/A'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${pharmacyStatusColor(order.status)}`}
                            >
                              {order.status || 'Unknown'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-800 font-semibold">
                            {'\u20B9'}
                            {Number(order.total_amount || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {items.length} item{items.length !== 1 ? 's' : ''}
                          </td>
                          <td className="px-4 py-3">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            )}
                          </td>
                        </tr>
                        {isExpanded && items.length > 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-3 bg-gray-50/50">
                              <div className="border border-gray-200 rounded-xl overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-gray-200 bg-gray-50/80">
                                      {[
                                        'Medicine',
                                        'Qty Requested',
                                        'Qty Dispensed',
                                        'Unit Price',
                                        'Total Price',
                                        'Status',
                                      ].map((h) => (
                                        <th
                                          key={h}
                                          className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                                        >
                                          {h}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {items.map((item: any, iIdx: number) => (
                                      <tr key={iIdx} className="hover:bg-white">
                                        <td className="px-3 py-2 text-gray-800 font-semibold">
                                          {item.medicine_name ||
                                            item.medicine?.medicine_name ||
                                            'N/A'}
                                        </td>
                                        <td className="px-3 py-2 text-gray-600">
                                          {item.qty_requested ?? 'N/A'}
                                        </td>
                                        <td className="px-3 py-2 text-gray-600">
                                          {item.qty_dispensed ?? 'N/A'}
                                        </td>
                                        <td className="px-3 py-2 text-gray-600">
                                          {'\u20B9'}
                                          {Number(item.unit_price || 0).toLocaleString('en-IN')}
                                        </td>
                                        <td className="px-3 py-2 text-gray-800 font-semibold">
                                          {'\u20B9'}
                                          {Number(item.total_price || 0).toLocaleString('en-IN')}
                                        </td>
                                        <td className="px-3 py-2">
                                          <span
                                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${pharmacyStatusColor(item.status)}`}
                                          >
                                            {item.status || 'N/A'}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* LAB ORDERS */}
      <section>
        <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-amber-600" />
          Lab Orders
        </h3>
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  {['Barcode', 'Test Type', 'Status', 'Result', 'Critical', 'Report', 'Date'].map(
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
                {labOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12">
                      <FlaskConical className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm font-medium">No lab orders found</p>
                    </td>
                  </tr>
                ) : (
                  labOrders.map((lab: any, lIdx: number) => (
                    <tr
                      key={lab.id || lIdx}
                      className={`hover:bg-gray-50 transition-colors ${
                        lab.is_critical ? 'bg-red-50/50' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-gray-800 font-semibold whitespace-nowrap">
                        {lab.barcode || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {lab.test_type || 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${labStatusColor(lab.status)}`}
                        >
                          {lab.status || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                        {lab.result || 'Pending'}
                      </td>
                      <td className="px-4 py-3">
                        {lab.is_critical && (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {lab.report_url ? (
                          <a
                            href={lab.report_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-teal-600 hover:underline text-xs"
                          >
                            View Report
                          </a>
                        ) : (
                          <span className="text-gray-400 text-xs">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {fmtDate(lab.created_at)}
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
