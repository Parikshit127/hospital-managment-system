'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, Plus, Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
  listTransfers,
  createTransfer,
  dispatchTransfer,
  receiveTransfer,
} from '@/app/actions/inventory-actions';
import { listStores } from '@/app/actions/store-actions';
import { searchItems } from '@/app/actions/item-master-actions';
import { StatusBadge, btnPrimary, btnSecondary, inputCls, cardCls } from '../components/InventoryUI';

export default function InventoryTransfersPage() {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ from: '', to: '', item_id: '', qty: '' });

  const load = async () => {
    setLoading(true);
    const [tRes, sRes] = await Promise.all([listTransfers(), listStores()]);
    if (tRes.success) setTransfers(tRes.data as any[]);
    if (sRes.success) setStores(sRes.data as any[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (itemSearch.length < 2) { setItems([]); return; }
    searchItems(itemSearch, 10).then((r) => { if (r.success) setItems(r.data as any[]); });
  }, [itemSearch]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await createTransfer({
      from_store_id: Number(form.from),
      to_store_id: Number(form.to),
      lines: [{ item_id: Number(form.item_id), quantity: Number(form.qty) }],
    });
    setSaving(false);
    if (res.success) {
      const dispatch = await dispatchTransfer(res.data.id);
      if (dispatch.success) { setModalOpen(false); load(); }
      else alert(dispatch.error);
    } else alert(res.error);
  };

  return (
    <AppShell
      pageTitle="Stock Transfers"
      pageIcon={<ArrowLeftRight className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
      headerActions={
        <button onClick={() => setModalOpen(true)} className={btnPrimary}>
          <Plus className="h-4 w-4" /> New Transfer
        </button>
      }
    >
      <div className={cardCls}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold text-gray-400 uppercase bg-gray-50/80">
              <th className="px-4 py-3">Transfer #</th>
              <th className="px-4 py-3">From → To</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={t.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-mono text-xs font-bold">{t.transfer_number}</td>
                <td className="px-4 py-3">
                  {t.stores_stock_transfers_from_store_idTostores?.name}
                  <span className="text-gray-400 mx-1">→</span>
                  {t.stores_stock_transfers_to_store_idTostores?.name}
                </td>
                <td className="px-4 py-3 text-xs">
                  {t.stock_transfer_items?.map((l: any) => (
                    <div key={l.id}>{l.item_master?.name}: {l.quantity}</div>
                  ))}
                </td>
                <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                <td className="px-4 py-3">
                  {t.status === 'In Transit' && (
                    <button
                      onClick={() => receiveTransfer(t.id).then((r) => { if (r.success) load(); else alert(r.error); })}
                      className="text-xs font-bold text-emerald-600"
                    >
                      Receive
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && transfers.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-500">No transfers</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b bg-gray-50"><h3 className="font-bold">Store Transfer</h3></div>
            <div className="p-6 space-y-4">
              <select required className={inputCls} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })}>
                <option value="">From store</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select required className={inputCls} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })}>
                <option value="">To store</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input placeholder="Search item..." className={inputCls} value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
              <select required className={inputCls} value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
                <option value="">Select item</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.item_code} — {i.name}</option>)}
              </select>
              <input required type="number" placeholder="Quantity" className={inputCls} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            </div>
            <div className="p-4 border-t flex gap-3 justify-end">
              <button type="button" onClick={() => setModalOpen(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={saving} className={btnPrimary}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Dispatch
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
