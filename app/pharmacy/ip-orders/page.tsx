'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { getPharmacyQueue, verifyPharmacyOrder, dispenseMedicine } from '@/app/actions/pharmacy-actions';
import { useToast } from '@/app/components/ui/Toast';
import { CheckCircle2, ClipboardList, PackageCheck, Pill, BedDouble, User } from 'lucide-react';
import { fmtIstDateTime } from '@/app/lib/ist';

interface OrderItem {
  id: number;
  medicine_id: number;
  medicine_name: string;
  quantity_requested: number;
  quantity_dispensed: number | null;
  status: string;
  unit_price: number | null;
  available_batches?: { batch_no: string; stock: number; expiry: string }[];
  stock?: { totalStock: number; status: 'In Stock' | 'Low Stock' | 'Out of Stock' };
}

interface PharmacyOrder {
  id: number;
  indent_number: string | null;
  patient_id: string;
  doctor_id?: string;
  requested_by_name?: string | null;
  status: string;
  created_at: string;
  admission_id: string | null;
  is_ipd_linked: boolean;
  notes?: string;
  verified_by?: string | null;
  items: OrderItem[];
  ward?: string;
  // Shape sent by getPharmacyQueue: it attaches the OPD_REG row.
  patient: { patient_id: string; full_name: string; phone?: string | null } | null;
}

const STATUS_COLORS: Record<string, string> = {
  Ordered: 'bg-amber-100 text-amber-800',
  Pending: 'bg-amber-100 text-amber-800',
  Verified: 'bg-blue-100 text-blue-800',
  Dispensing: 'bg-orange-100 text-orange-800',
  Dispensed: 'bg-emerald-100 text-emerald-800',
  Completed: 'bg-emerald-100 text-emerald-800',
};

const STOCK_COLORS: Record<string, string> = {
  'In Stock': 'text-emerald-700 bg-emerald-50',
  'Low Stock': 'text-amber-700 bg-amber-50',
  'Out of Stock': 'text-rose-700 bg-rose-50',
};

const isVerifiable = (s: string) => s === 'Pending' || s === 'Ordered';
const isDispensable = (s: string) => s === 'Verified' || s === 'Dispensing';

export default function IPMedicationOrdersPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);

  async function loadOrders() {
    setLoading(true);
    const res = await getPharmacyQueue();
    if (res.success) {
      const ipd = (res.data as PharmacyOrder[]).filter((o) => o.is_ipd_linked || !!o.admission_id);
      setOrders(ipd);
    }
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadOrders(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function handleVerify(orderId: number) {
    setActionLoading(orderId);
    try {
      const res = await verifyPharmacyOrder(orderId);
      if (res.success) { toast.success('Indent verified'); await loadOrders(); }
      else toast.error('Failed to verify indent');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDispense(order: PharmacyOrder) {
    setActionLoading(order.id);
    try {
      const dispenseItems = order.items
        .filter((i) => i.status !== 'Dispensed')
        .map((item) => ({
          order_item_id: item.id,
          medicine_id: item.medicine_id,
          batch_no: item.available_batches?.[0]?.batch_no || 'DEFAULT',
          quantity: item.quantity_requested,
        }));
      if (dispenseItems.length === 0) { toast.error('No items to dispense'); return; }
      const res = await dispenseMedicine(order.id, dispenseItems);
      if (res.success) { toast.success('Medicines dispensed'); await loadOrders(); }
      else toast.error(res.error || 'Failed to dispense');
    } finally {
      setActionLoading(null);
    }
  }

  // Verify every still-pending indent for one patient in one click. Runs
  // sequentially so a mid-batch failure stops cleanly rather than firing a burst
  // of writes; each indent stays its own row/number/status underneath.
  async function handleVerifyAll(sheetKey: string, sheetOrders: PharmacyOrder[]) {
    const pending = sheetOrders.filter((o) => isVerifiable(o.status));
    if (pending.length === 0) return;
    setBulkLoading(sheetKey);
    try {
      let ok = 0;
      for (const o of pending) {
        const res = await verifyPharmacyOrder(o.id);
        if (res.success) ok++; else break;
      }
      if (ok === pending.length) toast.success(`Verified ${ok} indent${ok !== 1 ? 's' : ''}`);
      else toast.error(`Verified ${ok} of ${pending.length}; please retry the rest`);
      await loadOrders();
    } finally {
      setBulkLoading(null);
    }
  }

  // Group by PATIENT so two patients never mix. Each patient's indents stay
  // SEPARATE underneath (own indent no, time, nurse, stock, status, action) --
  // this is the "separate, grouped under patient" layout, mirroring the paper
  // "Requisition Indent" the ward fills in.
  type Sheet = { key: string; admissionId: string | null; patientId: string; patientName: string; ward: string; orders: PharmacyOrder[] };
  const sheetMap = new Map<string, Sheet>();
  for (const order of orders) {
    const key = order.admission_id || `patient:${order.patient_id}`;
    if (!sheetMap.has(key)) {
      sheetMap.set(key, {
        key,
        admissionId: order.admission_id,
        patientId: order.patient_id,
        patientName: order.patient?.full_name || order.patient_id,
        ward: order.ward || '—',
        orders: [],
      });
    }
    sheetMap.get(key)!.orders.push(order);
  }
  const sheets = Array.from(sheetMap.values());

  return (
    <AppShell
      pageTitle="IP Medication Orders"
      pageIcon={<ClipboardList className="h-5 w-5" />}
      onRefresh={loadOrders}
      refreshing={loading}
    >
      {loading ? (
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl px-6 py-16 text-center text-sm font-medium text-gray-500">
          Loading indents...
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-12 text-center">
          <Pill className="h-9 w-9 mx-auto text-gray-300 mb-3" />
          <p className="font-medium text-gray-500">No inpatient indents to action.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sheets.map((sheet) => {
            const pendingCount = sheet.orders.filter((o) => isVerifiable(o.status)).length;
            return (
              <div key={sheet.key} className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                {/* ── Patient header ── */}
                <div className="px-5 py-4 bg-slate-800 text-white flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-300 shrink-0" />
                      <h2 className="text-base font-black tracking-tight truncate">{sheet.patientName}</h2>
                    </div>
                    <p className="text-[11px] font-medium text-slate-300 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span>UHID: {sheet.patientId}</span>
                      {sheet.admissionId && <span>IP No: {sheet.admissionId}</span>}
                      <span className="inline-flex items-center gap-1"><BedDouble className="h-3 w-3" /> {sheet.ward}</span>
                      <span>{sheet.orders.length} indent{sheet.orders.length !== 1 ? 's' : ''}</span>
                    </p>
                  </div>
                  {pendingCount > 0 && (
                    <button
                      onClick={() => handleVerifyAll(sheet.key, sheet.orders)}
                      disabled={bulkLoading === sheet.key}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {bulkLoading === sheet.key ? 'Verifying…' : `Verify all (${pendingCount})`}
                    </button>
                  )}
                </div>

                {/* ── One requisition block per indent ── */}
                <div className="divide-y divide-gray-200">
                  {sheet.orders.map((order) => (
                    <div key={order.id} className="px-5 py-4">
                      {/* Requisition meta row */}
                      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500 font-medium">
                          <span className="font-mono font-bold text-gray-800 text-xs">
                            {order.indent_number || `IND-${order.id}`}
                          </span>
                          <span>{fmtIstDateTime(order.created_at)}</span>
                          <span>Type: Patient-Wise</span>
                          <span>Raised by: <span className="font-bold text-teal-700">{order.requested_by_name || order.doctor_id || '—'}</span></span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-800'}`}>
                            {order.status}
                          </span>
                        </div>
                        <div className="shrink-0">
                          {isVerifiable(order.status) && (
                            <button
                              onClick={() => handleVerify(order.id)}
                              disabled={actionLoading === order.id || bulkLoading === sheet.key}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {actionLoading === order.id ? 'Verifying…' : 'Verify'}
                            </button>
                          )}
                          {isDispensable(order.status) && (
                            <button
                              onClick={() => handleDispense(order)}
                              disabled={actionLoading === order.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                            >
                              <PackageCheck className="h-3.5 w-3.5" />
                              {actionLoading === order.id ? 'Dispensing…' : 'Dispense'}
                            </button>
                          )}
                          {(order.status === 'Completed' || order.status === 'Dispensed') && (
                            <span className="text-xs text-emerald-600 font-bold">Done</span>
                          )}
                        </div>
                      </div>

                      {/* Medicine lines for this indent */}
                      <div className="overflow-x-auto rounded-lg border border-gray-100">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-gray-500">
                            <tr>
                              <th className="text-left px-4 py-2 font-bold text-[10px] uppercase tracking-wider">Medicine</th>
                              <th className="text-center px-4 py-2 font-bold text-[10px] uppercase tracking-wider">Dose / Qty</th>
                              <th className="text-left px-4 py-2 font-bold text-[10px] uppercase tracking-wider">Stock</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {order.items.map((item) => (
                              <tr key={item.id}>
                                <td className="px-4 py-2 text-gray-800 font-medium">{item.medicine_name}</td>
                                <td className="px-4 py-2 text-center text-gray-700 font-semibold">{item.quantity_requested}</td>
                                <td className="px-4 py-2">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${STOCK_COLORS[item.stock?.status || 'Out of Stock']}`}>
                                    {item.stock?.status || 'Out of Stock'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
