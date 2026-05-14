'use client';

import { useEffect, useState } from 'react';
import { getPharmacyQueue, verifyPharmacyOrder, dispenseMedicine } from '@/app/actions/pharmacy-actions';
import { useToast } from '@/app/components/ui/Toast';

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
  Ordered: 'bg-yellow-500/20 text-yellow-400',
  Pending: 'bg-yellow-500/20 text-yellow-400',
  Verified: 'bg-blue-500/20 text-blue-400',
  Dispensing: 'bg-orange-500/20 text-orange-400',
  Dispensed: 'bg-emerald-500/20 text-emerald-400',
  Completed: 'bg-emerald-500/20 text-emerald-400',
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
    loadOrders();
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">IP Medication Orders</h1>
          <p className="text-sm text-gray-400 mt-0.5">Inpatient medication orders — verify and dispense</p>
        </div>
        <button
          onClick={loadOrders}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-500">No inpatient medication orders found</p>
        </div>
      ) : (
        Object.entries(grouped).map(([ward, wardOrders]) => (
          <div key={ward} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-800/60 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-teal-400">{ward}</h2>
              <p className="text-xs text-gray-500">{wardOrders.length} order{wardOrders.length !== 1 ? 's' : ''}</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Patient</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Medicine</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">Dose / Qty</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">Status</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {wardOrders.map((order) =>
                  order.items.map((item, idx) => (
                    <tr key={`${order.id}-${item.id}`} className="border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors">
                      {idx === 0 && (
                        <td
                          className="px-4 py-3 text-white font-medium align-top"
                          rowSpan={order.items.length}
                        >
                          <div>{order.patient?.patient_name || order.patient_id}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-200">{item.medicine_name}</td>
                      <td className="px-4 py-3 text-center text-gray-300">{item.quantity_requested}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[order.status] || 'bg-gray-700 text-gray-400'}`}>
                          {order.status}
                        </span>
                      </td>
                      {idx === 0 && (
                        <td
                          className="px-4 py-3 text-center align-top"
                          rowSpan={order.items.length}
                        >
                          <div className="flex flex-col gap-1.5 items-center">
                            {order.status === 'Pending' || order.status === 'Ordered' ? (
                              <button
                                onClick={() => handleVerify(order.id)}
                                disabled={actionLoading === order.id}
                                className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 whitespace-nowrap"
                              >
                                {actionLoading === order.id ? '...' : 'Verify'}
                              </button>
                            ) : null}
                            {order.status === 'Verified' || order.status === 'Dispensing' ? (
                              <button
                                onClick={() => handleDispense(order)}
                                disabled={actionLoading === order.id}
                                className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 whitespace-nowrap"
                              >
                                {actionLoading === order.id ? '...' : 'Dispense'}
                              </button>
                            ) : null}
                            {order.status === 'Completed' || order.status === 'Dispensed' ? (
                              <span className="text-xs text-emerald-400 font-medium">Done</span>
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
        ))
      )}
    </div>
  );
}
