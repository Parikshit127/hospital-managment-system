'use client';

import React, { useEffect, useState } from 'react';
import { ClipboardList, Plus, Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
  listIndents,
  createIndent,
  updateIndentStatus,
  issueIndent,
  confirmIndentReceipt,
} from '@/app/actions/indent-actions';
import { listStores } from '@/app/actions/store-actions';
import { searchItems } from '@/app/actions/item-master-actions';
import { StatusBadge, btnPrimary, btnSecondary, inputCls, cardCls } from '../components/InventoryUI';

export default function InventoryIndentsPage() {
  const [indents, setIndents] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState<any[]>([]);
  const [form, setForm] = useState({
    from_store_id: '',
    to_store_id: '',
    priority: 'NORMAL',
    item_id: '',
    qty: '',
  });

  const load = async () => {
    setLoading(true);
    const [indRes, storeRes] = await Promise.all([listIndents(), listStores()]);
    if (indRes.success) setIndents(indRes.data as any[]);
    if (storeRes.success) setStores(storeRes.data as any[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (itemSearch.length < 2) { setItemResults([]); return; }
    searchItems(itemSearch, 10).then((res) => {
      if (res.success) setItemResults(res.data as any[]);
    });
  }, [itemSearch]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.from_store_id || !form.to_store_id || !form.item_id || !form.qty) {
      return alert('Fill all required fields');
    }
    setSaving(true);
    const res = await createIndent({
      from_store_id: Number(form.from_store_id),
      to_store_id: Number(form.to_store_id),
      priority: form.priority,
      lines: [{ item_id: Number(form.item_id), qty_requested: Number(form.qty) }],
    });
    setSaving(false);
    if (res.success) {
      setModalOpen(false);
      load();
    } else alert(res.error);
  };

  const handleAction = async (id: number, action: string) => {
    let res;
    if (action === 'submit') res = await updateIndentStatus(id, 'Submitted');
    else if (action === 'approve') res = await updateIndentStatus(id, 'Approved');
    else if (action === 'issue') res = await issueIndent(id);
    else if (action === 'receive') res = await confirmIndentReceipt(id);
    else return;
    if (res?.success) load();
    else alert(res?.error);
  };

  return (
    <AppShell
      pageTitle="Indents & Issues"
      pageIcon={<ClipboardList className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
      headerActions={
        <button onClick={() => setModalOpen(true)} className={btnPrimary}>
          <Plus className="h-4 w-4" /> Raise Indent
        </button>
      }
    >
      <div className={cardCls}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold text-gray-400 uppercase bg-gray-50/80">
                <th className="px-4 py-3">Indent #</th>
                <th className="px-4 py-3">From → To</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {indents.map((ind) => (
                <tr key={ind.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-teal-700">{ind.indent_number}</td>
                  <td className="px-4 py-3">
                    <span className="text-gray-700">{ind.stores_indents_from_store_idTostores?.name}</span>
                    <span className="text-gray-400 mx-1">→</span>
                    <span className="font-bold">{ind.stores_indents_to_store_idTostores?.name}</span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={ind.priority} /></td>
                  <td className="px-4 py-3">
                    {ind.indent_items?.map((l: any) => (
                      <div key={l.id} className="text-xs">
                        {l.item_master?.name}: {l.qty_requested} (issued {l.qty_issued})
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={ind.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {ind.status === 'Draft' && (
                        <button onClick={() => handleAction(ind.id, 'submit')} className="text-xs font-bold text-blue-600">Submit</button>
                      )}
                      {ind.status === 'Submitted' && (
                        <button onClick={() => handleAction(ind.id, 'approve')} className="text-xs font-bold text-emerald-600">Approve</button>
                      )}
                      {['Approved', 'Partially Issued'].includes(ind.status) && (
                        <button onClick={() => handleAction(ind.id, 'issue')} className="text-xs font-bold text-teal-600">Issue</button>
                      )}
                      {ind.status === 'Issued' && (
                        <button onClick={() => handleAction(ind.id, 'receive')} className="text-xs font-bold text-violet-600">Confirm Receipt</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && indents.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">No indents yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b bg-gray-50"><h3 className="font-bold">Raise Indent</h3></div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500">Requesting store (from)</label>
                <select required className={inputCls} value={form.from_store_id} onChange={(e) => setForm({ ...form, from_store_id: e.target.value })}>
                  <option value="">Select ward/sub-store</option>
                  {stores.filter((s) => s.store_type !== 'CENTRAL').map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">Issuing store (to)</label>
                <select required className={inputCls} value={form.to_store_id} onChange={(e) => setForm({ ...form, to_store_id: e.target.value })}>
                  <option value="">Select source store</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.store_type})</option>)}
                </select>
              </div>
              <select className={inputCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="NORMAL">Normal</option>
                <option value="URGENT">Urgent</option>
                <option value="EMERGENCY">Emergency</option>
              </select>
              <input placeholder="Search item..." className={inputCls} value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
              {itemResults.length > 0 && (
                <select required className={inputCls} value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
                  <option value="">Select item</option>
                  {itemResults.map((i) => <option key={i.id} value={i.id}>{i.item_code} — {i.name}</option>)}
                </select>
              )}
              <input required type="number" min="1" placeholder="Quantity" className={inputCls} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            </div>
            <div className="p-4 border-t flex gap-3 justify-end">
              <button type="button" onClick={() => setModalOpen(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={saving} className={btnPrimary}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
