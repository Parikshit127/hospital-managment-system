'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { getPharmacyQueue, verifyPharmacyOrder, dispenseIndentManual } from '@/app/actions/pharmacy-actions';
import { useToast } from '@/app/components/ui/Toast';
import {
  CheckCircle2, ClipboardList, PackageCheck, Pill, BedDouble, User,
  AlertTriangle, X, ChevronDown, ChevronUp, FlaskConical,
} from 'lucide-react';
import { fmtIstDateTime } from '@/app/lib/ist';

interface OrderItem {
  id: number;
  medicine_id: number;
  medicine_name: string;
  quantity_requested: number;
  quantity_dispensed: number | null;
  status: string;
  unit_price: number | null;
  total_price?: number | null;
  /** Indicative rate from the medicine master / FEFO batch, for lines not yet dispensed. */
  est_price?: number | null;
  available_batches?: { batch_no: string; stock: number; expiry: string }[];
  stock?: { totalStock: number; status: 'In Stock' | 'Low Stock' | 'Out of Stock' };
}

const rupee = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Rate and amount for one indent line. `unit_price` is only stamped at dispense
 * time, so a pending line falls back to the indicative master/batch rate — the
 * pharmacy indent has to show a value while the indent is still being actioned.
 */
function lineMoney(item: OrderItem) {
  const rate = Number(item.unit_price ?? item.est_price ?? 0);
  const qty = item.quantity_dispensed || item.quantity_requested;
  const amount = item.unit_price != null && item.total_price != null ? Number(item.total_price) : rate * qty;
  return { rate, amount, estimated: item.unit_price == null };
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
  patient: { patient_id: string; full_name: string; phone?: string | null } | null;
}

const STATUS_COLORS: Record<string, string> = {
  Ordered: 'bg-amber-100 text-amber-800',
  Pending: 'bg-amber-100 text-amber-800',
  Verified: 'bg-blue-100 text-blue-800',
  Dispensing: 'bg-orange-100 text-orange-800',
  Partial: 'bg-purple-100 text-purple-800',
  Dispensed: 'bg-emerald-100 text-emerald-800',
  Completed: 'bg-emerald-100 text-emerald-800',
};

const STATUS_LABELS: Record<string, string> = {
  Partial: 'Partially Dispensed',
};

const STOCK_COLORS: Record<string, string> = {
  'In Stock': 'text-emerald-700 bg-emerald-50',
  'Low Stock': 'text-amber-700 bg-amber-50',
  'Out of Stock': 'text-rose-700 bg-rose-50',
};

const isVerifiable = (s: string) => s === 'Pending' || s === 'Ordered';
const isDispensable = (s: string) => s === 'Verified' || s === 'Dispensing' || s === 'Partial';

interface DispenseState {
  open: boolean;
  lineQtys: Record<number, number>;
  lineSkip: Record<number, boolean>;
}

function initDispenseState(order: PharmacyOrder): DispenseState {
  const lineQtys: Record<number, number> = {};
  const lineSkip: Record<number, boolean> = {};
  for (const item of order.items) {
    if (item.status === 'Dispensed') continue;
    const stock = item.stock?.totalStock ?? 0;
    lineQtys[item.id] = Math.min(stock, item.quantity_requested);
    lineSkip[item.id] = false;
  }
  return { open: true, lineQtys, lineSkip };
}

export default function IPMedicationOrdersPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);
  const [dispenseStates, setDispenseStates] = useState<Record<number, DispenseState>>({});

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

  function openDispensePanel(order: PharmacyOrder) {
    setDispenseStates(prev => ({ ...prev, [order.id]: initDispenseState(order) }));
  }

  function closeDispensePanel(orderId: number) {
    setDispenseStates(prev => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
  }

  function setLineQty(orderId: number, itemId: number, qty: number) {
    setDispenseStates(prev => ({
      ...prev,
      [orderId]: { ...prev[orderId], lineQtys: { ...prev[orderId].lineQtys, [itemId]: qty } },
    }));
  }

  function setLineSkipFn(orderId: number, itemId: number, skip: boolean) {
    setDispenseStates(prev => ({
      ...prev,
      [orderId]: { ...prev[orderId], lineSkip: { ...prev[orderId].lineSkip, [itemId]: skip } },
    }));
  }

  async function handleConfirmDispense(order: PharmacyOrder) {
    const state = dispenseStates[order.id];
    if (!state) return;

    const pendingItems = order.items.filter(i => i.status !== 'Dispensed');
    const lineData = pendingItems.map(item => ({
      order_item_id: item.id,
      qty_to_dispense: state.lineSkip[item.id] ? 0 : (state.lineQtys[item.id] ?? 0),
    }));

    setActionLoading(order.id);
    try {
      const res = await dispenseIndentManual(order.id, lineData);
      if (res.success) {
        const shortages = (res as any).shortages as { medicine_name: string; requested: number; dispensed: number }[] | undefined;
        const overrides = (res as any).overrides as number | undefined;
        const skipped = (res as any).skipped as number | undefined;
        const parts: string[] = [];
        if (shortages && shortages.length > 0)
          parts.push(`Short: ${shortages.map((s: any) => `${s.medicine_name} ${s.dispensed}/${s.requested}`).join(', ')}`);
        if (overrides && overrides > 0)
          parts.push(`${overrides} item(s) from physical stock`);
        if (skipped && skipped > 0)
          parts.push(`${skipped} skipped — will remain pending`);
        // Handed over but not chargeable — the pharmacist has to raise these
        // manually, so this must never be silent.
        const unbilled = (res as { unbilled?: string[] }).unbilled;
        if (unbilled && unbilled.length > 0) {
          toast.error(`NOT BILLED — add manually: ${unbilled.join(', ')}`, 12000);
        }
        if (parts.length > 0) toast.warning(parts.join(' · '), 8000);
        else if (!unbilled?.length) toast.success('All medicines dispensed successfully');
        closeDispensePanel(order.id);
        await loadOrders();
      } else {
        toast.error((res as any).error || 'Failed to dispense');
      }
    } finally {
      setActionLoading(null);
    }
  }

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

  type Sheet = { key: string; admissionId: string | null; patientId: string; patientName: string; ward: string; orders: PharmacyOrder[] };
  const sheetMap = new Map<string, Sheet>();
  for (const order of orders) {
    const key = order.admission_id || `patient:${order.patient_id}`;
    if (!sheetMap.has(key)) {
      sheetMap.set(key, { key, admissionId: order.admission_id, patientId: order.patient_id, patientName: order.patient?.full_name || order.patient_id, ward: order.ward || '—', orders: [] });
    }
    sheetMap.get(key)!.orders.push(order);
  }
  const sheets = Array.from(sheetMap.values());

  return (
    <AppShell
      pageTitle="Nursing Indent"
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
                {/* Patient header */}
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

                {/* Indent blocks */}
                <div className="divide-y divide-gray-200">
                  {sheet.orders.map((order) => {
                    const panelState = dispenseStates[order.id];
                    const panelOpen = !!panelState?.open;
                    const pendingItems = order.items.filter(i => i.status !== 'Dispensed');

                    let dispenseCount = 0;
                    let skipCount = 0;
                    let overrideCount = 0;
                    if (panelState) {
                      for (const item of pendingItems) {
                        if (panelState.lineSkip[item.id]) { skipCount++; continue; }
                        const qty = panelState.lineQtys[item.id] ?? 0;
                        if (qty > 0) {
                          dispenseCount++;
                          if (qty > (item.stock?.totalStock ?? 0)) overrideCount++;
                        } else {
                          skipCount++;
                        }
                      }
                    }

                    return (
                      <div key={order.id} className="px-5 py-4">
                        {/* Meta row */}
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500 font-medium">
                            <span className="font-mono font-bold text-gray-800 text-xs">
                              {order.indent_number || `IND-${order.id}`}
                            </span>
                            <span>{fmtIstDateTime(order.created_at)}</span>
                            <span>Type: Patient-Wise</span>
                            <span>Raised by: <span className="font-bold text-teal-700">{order.requested_by_name || order.doctor_id || '—'}</span></span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-800'}`}>
                              {STATUS_LABELS[order.status] || order.status}
                            </span>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
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
                            {isDispensable(order.status) && !panelOpen && (
                              <button
                                onClick={() => openDispensePanel(order)}
                                disabled={actionLoading === order.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                              >
                                <PackageCheck className="h-3.5 w-3.5" />
                                Dispense
                                <ChevronDown className="h-3 w-3" />
                              </button>
                            )}
                            {isDispensable(order.status) && panelOpen && (
                              <button
                                onClick={() => closeDispensePanel(order.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors whitespace-nowrap"
                              >
                                <ChevronUp className="h-3 w-3" />
                                Cancel
                              </button>
                            )}
                            {(order.status === 'Completed' || order.status === 'Dispensed') && (
                              <span className="text-xs text-emerald-600 font-bold">Done</span>
                            )}
                          </div>
                        </div>

                        {/* Medicine table */}
                        <div className="overflow-x-auto rounded-lg border border-gray-100">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-gray-500">
                              <tr>
                                {panelOpen && (
                                  <th className="text-center px-3 py-2 font-bold text-[10px] uppercase tracking-wider w-10">Include</th>
                                )}
                                <th className="text-left px-4 py-2 font-bold text-[10px] uppercase tracking-wider">Medicine</th>
                                <th className="text-center px-4 py-2 font-bold text-[10px] uppercase tracking-wider">Requested</th>
                                {panelOpen && (
                                  <th className="text-center px-4 py-2 font-bold text-[10px] uppercase tracking-wider">Dispense Qty</th>
                                )}
                                <th className="text-right px-4 py-2 font-bold text-[10px] uppercase tracking-wider">Rate (₹)</th>
                                <th className="text-right px-4 py-2 font-bold text-[10px] uppercase tracking-wider">Amount (₹)</th>
                                <th className="text-left px-4 py-2 font-bold text-[10px] uppercase tracking-wider">Stock</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {order.items.map((item) => {
                                const isAlreadyDone = item.status === 'Dispensed';
                                const stock = item.stock?.totalStock ?? 0;
                                const skipped = panelState?.lineSkip[item.id] ?? false;
                                const qty = panelState?.lineQtys[item.id] ?? 0;
                                const isOverride = panelOpen && !isAlreadyDone && !skipped && qty > stock;
                                const money = lineMoney(item);

                                return (
                                  <tr
                                    key={item.id}
                                    className={[
                                      isAlreadyDone ? 'opacity-50 bg-gray-50' : '',
                                      panelOpen && skipped && !isAlreadyDone ? 'opacity-40 bg-gray-50' : '',
                                      isOverride ? 'bg-amber-50' : '',
                                    ].join(' ')}
                                  >
                                    {panelOpen && (
                                      <td className="px-3 py-2 text-center">
                                        {!isAlreadyDone && (
                                          <input
                                            type="checkbox"
                                            checked={!skipped}
                                            onChange={e => setLineSkipFn(order.id, item.id, !e.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 accent-emerald-600 cursor-pointer"
                                          />
                                        )}
                                      </td>
                                    )}
                                    <td className="px-4 py-2 text-gray-800 font-medium">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {item.medicine_name}
                                        {isOverride && (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-700 border border-amber-200">
                                            <FlaskConical className="h-2.5 w-2.5" />
                                            Physical Override
                                          </span>
                                        )}
                                        {isAlreadyDone && (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-700">
                                            Dispensed
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-2 text-center text-gray-700 font-semibold">
                                      {item.quantity_requested}
                                    </td>
                                    {panelOpen && (
                                      <td className="px-4 py-2 text-center">
                                        {!isAlreadyDone ? (
                                          <input
                                            type="number"
                                            min={0}
                                            value={skipped ? '' : qty}
                                            disabled={skipped}
                                            placeholder={skipped ? 'Skipped' : '0'}
                                            onChange={e => {
                                              const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                                              setLineQty(order.id, item.id, v);
                                            }}
                                            className={[
                                              'w-16 text-center text-sm font-bold rounded-md border px-2 py-1 outline-none transition-colors',
                                              skipped
                                                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                : isOverride
                                                  ? 'border-amber-400 bg-amber-50 text-amber-800 focus:ring-2 focus:ring-amber-300'
                                                  : 'border-gray-300 focus:ring-2 focus:ring-emerald-300',
                                            ].join(' ')}
                                          />
                                        ) : (
                                          <span className="text-xs text-emerald-600 font-bold">{item.quantity_dispensed ?? '—'}</span>
                                        )}
                                      </td>
                                    )}
                                    <td className="px-4 py-2 text-right text-gray-700 tabular-nums">
                                      {money.rate > 0 ? rupee(money.rate) : <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="px-4 py-2 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">
                                      {money.amount > 0 ? (
                                        <>
                                          {rupee(money.amount)}
                                          {money.estimated && <span className="ml-1 text-[9px] font-bold uppercase text-gray-400">est</span>}
                                        </>
                                      ) : <span className="text-gray-300 font-normal">—</span>}
                                    </td>
                                    <td className="px-4 py-2">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${STOCK_COLORS[item.stock?.status || 'Out of Stock']}`}>
                                          {item.stock?.status || 'Out of Stock'}
                                        </span>
                                        {(item.stock?.totalStock ?? 0) < item.quantity_requested && (
                                          <span className="text-[10px] font-bold text-rose-600 whitespace-nowrap">
                                            {item.stock?.totalStock ?? 0}/{item.quantity_requested} · short {item.quantity_requested - (item.stock?.totalStock ?? 0)}
                                          </span>
                                        )}
                                        {panelOpen && !isAlreadyDone && stock === 0 && !skipped && (
                                          <span className="text-[10px] text-amber-700 font-medium whitespace-nowrap">
                                            ⚠ Enter qty to use physical stock
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-gray-50 border-t border-gray-200">
                              <tr>
                                <td
                                  colSpan={panelOpen ? 4 : 2}
                                  className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-wider text-gray-500"
                                >
                                  Indent Total
                                </td>
                                <td className="px-4 py-2 text-right font-black text-gray-900 tabular-nums whitespace-nowrap" colSpan={2}>
                                  ₹ {rupee(order.items.reduce((s, i) => s + lineMoney(i).amount, 0))}
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        {/* Confirm dispense bar */}
                        {panelOpen && (
                          <div className="mt-3 flex items-center justify-between gap-3 flex-wrap bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
                            <div className="text-xs text-gray-600 font-medium flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="font-bold text-gray-800">
                                Dispensing {dispenseCount} of {pendingItems.length} item{pendingItems.length !== 1 ? 's' : ''}
                              </span>
                              {skipCount > 0 && <span className="text-gray-500">· {skipCount} skipped (stays pending)</span>}
                              {overrideCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-amber-700">
                                  <AlertTriangle className="h-3 w-3" />
                                  {overrideCount} physical stock override{overrideCount !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => closeDispensePanel(order.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
                              >
                                <X className="h-3.5 w-3.5" /> Cancel
                              </button>
                              <button
                                onClick={() => handleConfirmDispense(order)}
                                disabled={actionLoading === order.id || dispenseCount === 0}
                                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <PackageCheck className="h-3.5 w-3.5" />
                                {actionLoading === order.id
                                  ? 'Dispensing…'
                                  : overrideCount > 0
                                    ? `Confirm Dispense (${overrideCount} override)`
                                    : `Confirm Dispense (${dispenseCount})`}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
