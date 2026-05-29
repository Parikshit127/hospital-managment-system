'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { getPharmacyQueue, verifyPharmacyOrder, dispenseMedicine } from '@/app/actions/pharmacy-actions';
import { useToast } from '@/app/components/ui/Toast';
import { CheckCircle2, ClipboardList, PackageCheck, Pill } from 'lucide-react';

interface OrderItem {
  id: number;
  medicine_id: number;
  medicine_name: string;
  quantity_requested: number;
  quantity_dispensed: number | null;
  status: string;
  unit_price: number | null;
  available_batches?: { batch_no: string; stock: number; expiry: string }[];
}

interface PharmacyOrder {
  id: number;
  patient_id: string;
  status: string;
  created_at: string;
  admission_id: string | null;
  is_ipd_linked: boolean;
  notes?: string;
  verified_by?: string | null;
  items: OrderItem[];
  patient: { patient_name: string; ward?: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  Ordered: 'bg-amber-100 text-amber-800',
  Pending: 'bg-amber-100 text-amber-800',
  Verified: 'bg-blue-100 text-blue-800',
  Dispensing: 'bg-orange-100 text-orange-800',
  Dispensed: 'bg-emerald-100 text-emerald-800',
  Completed: 'bg-emerald-100 text-emerald-800',
};

export default function IPMedicationOrdersPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  async function loadOrders() {
    setLoading(true);
    const res = await getPharmacyQueue();
    if (res.success) {
      // Show all IPD-linked orders (is_ipd_linked or has admission_id)
      const ipd = (res.data as PharmacyOrder[]).filter(
        (o) => o.is_ipd_linked || !!o.admission_id
      );
      setOrders(ipd);
    }
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOrders();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function handleVerify(orderId: number) {
    setActionLoading(orderId);
    const res = await verifyPharmacyOrder(orderId);
    setActionLoading(null);
    if (res.success) {
      toast.success('Order verified');
      loadOrders();
    } else {
      toast.error('Failed to verify order');
    }
  }

  async function handleDispense(order: PharmacyOrder) {
    setActionLoading(order.id);
    // Build dispense items using first available batch for each item
    const dispenseItems = order.items
      .filter((i) => i.status !== 'Dispensed')
      .map((item) => {
        const batch = item.available_batches?.[0];
        return {
          order_item_id: item.id,
          medicine_id: item.medicine_id,
          batch_no: batch?.batch_no || 'DEFAULT',
          quantity: item.quantity_requested,
        };
      });

    if (dispenseItems.length === 0) {
      toast.error('No items to dispense');
      setActionLoading(null);
      return;
    }

    const res = await dispenseMedicine(order.id, dispenseItems);
    setActionLoading(null);
    if (res.success) {
      toast.success('Medicines dispensed successfully');
      loadOrders();
    } else {
      toast.error(res.error || 'Failed to dispense');
    }
  }

  // Group by ward — use admission_id prefix or patient name prefix as grouping key
  const grouped: Record<string, PharmacyOrder[]> = {};
  for (const order of orders) {
    const ward = order.admission_id ? `Ward / Admission ${order.admission_id.slice(0, 8)}` : 'General IPD';
    if (!grouped[ward]) grouped[ward] = [];
    grouped[ward].push(order);
  }

  return (
    <AppShell
      pageTitle="IP Medication Orders"
      pageIcon={<ClipboardList className="h-5 w-5" />}
      onRefresh={loadOrders}
      refreshing={loading}
    >
      {loading ? (
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl px-6 py-16 text-center text-sm font-medium text-gray-500">
          Loading orders...
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-12 text-center">
          <Pill className="h-9 w-9 mx-auto text-gray-300 mb-3" />
          <p className="font-medium text-gray-500">No inpatient medication orders found.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([ward, wardOrders]) => (
            <div key={ward} className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
              <div className="px-5 py-4 bg-gray-50/70 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-gray-900">{ward}</h2>
                  <p className="text-xs font-medium text-gray-500 mt-0.5">
                    {wardOrders.length} order{wardOrders.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700">
                  <Pill className="h-3.5 w-3.5" />
                  IPD Pharmacy
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                    <tr>
                      <th className="text-left px-6 py-4 font-bold text-xs uppercase tracking-wider">Patient</th>
                      <th className="text-left px-6 py-4 font-bold text-xs uppercase tracking-wider">Medicine</th>
                      <th className="text-center px-6 py-4 font-bold text-xs uppercase tracking-wider">Dose / Qty</th>
                      <th className="text-center px-6 py-4 font-bold text-xs uppercase tracking-wider">Status</th>
                      <th className="text-center px-6 py-4 font-bold text-xs uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {wardOrders.map((order) =>
                      order.items.map((item, idx) => (
                        <tr key={`${order.id}-${item.id}`} className="hover:bg-gray-50 transition-colors">
                          {idx === 0 && (
                            <td className="px-6 py-4 text-gray-900 font-bold align-top" rowSpan={order.items.length}>
                              <div>{order.patient?.patient_name || order.patient_id}</div>
                              <div className="text-xs font-medium text-gray-500 mt-0.5">
                                {new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                              </div>
                            </td>
                          )}
                          <td className="px-6 py-4 text-gray-700 font-medium">{item.medicine_name}</td>
                          <td className="px-6 py-4 text-center text-gray-700 font-semibold">{item.quantity_requested}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-800'}`}>
                              {order.status}
                            </span>
                          </td>
                          {idx === 0 && (
                            <td className="px-6 py-4 text-center align-top" rowSpan={order.items.length}>
                              <div className="flex flex-col gap-2 items-center">
                                {order.status === 'Pending' || order.status === 'Ordered' ? (
                                  <button
                                    onClick={() => handleVerify(order.id)}
                                    disabled={actionLoading === order.id}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    {actionLoading === order.id ? 'Verifying...' : 'Verify'}
                                  </button>
                                ) : null}
                                {order.status === 'Verified' || order.status === 'Dispensing' ? (
                                  <button
                                    onClick={() => handleDispense(order)}
                                    disabled={actionLoading === order.id}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                                  >
                                    <PackageCheck className="h-3.5 w-3.5" />
                                    {actionLoading === order.id ? 'Dispensing...' : 'Dispense'}
                                  </button>
                                ) : null}
                                {order.status === 'Completed' || order.status === 'Dispensed' ? (
                                  <span className="text-xs text-emerald-600 font-bold">Done</span>
                                ) : null}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
