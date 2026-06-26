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
import { listStores, ensureIndentStoreDefaults } from '@/app/actions/store-actions';
import { listItems } from '@/app/actions/item-master-actions';
import { StatusBadge, btnPrimary, btnSecondary, inputCls, cardCls } from '../components/InventoryUI';

const emptyForm = () => ({
  from_store_id: '',
  to_store_id: '',
  priority: 'NORMAL',
  item_id: '',
  qty: '',
});

export default function InventoryIndentsPage() {
  const [indents, setIndents] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [activeItems, setActiveItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [form, setForm] = useState(emptyForm());

  const load = async () => {
    setLoading(true);
    await ensureIndentStoreDefaults();
    const [indRes, storeRes] = await Promise.all([listIndents(), listStores()]);
    if (indRes.success) setIndents(indRes.data as any[]);
    if (storeRes.success) setStores(storeRes.data as any[]);
    setLoading(false);
  };

  const centralStores = stores.filter((s) => s.store_type === 'CENTRAL');
  const requestingStores = stores.filter((s) => s.store_type !== 'CENTRAL');
  const supplyStores = centralStores.length > 0
    ? centralStores
    : stores.filter((s) => ['CENTRAL', 'PHARMACY', 'MAIN'].includes(s.store_type) || s.name?.toLowerCase().includes('central'));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!modalOpen) return;
    listItems({ status: 'Active', limit: 200 }).then((res) => {
      if (res.success) setActiveItems(res.data as any[]);
    });
    setItemSearch('');
    const supply = supplyStores[0];
    setForm({
      ...emptyForm(),
      to_store_id: supply ? String(supply.id) : '',
    });
  }, [modalOpen, stores]);

  const filteredItems = activeItems.filter((item) => {
    if (!itemSearch.trim()) return true;
    const q = itemSearch.trim().toLowerCase();
    return (
      item.name?.toLowerCase().includes(q) ||
      item.item_code?.toLowerCase().includes(q)
    );
  });

  const selectedItem = activeItems.find((i) => String(i.id) === form.item_id);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing: string[] = [];
    if (!form.from_store_id) missing.push('Requesting store (ward/sub-store)');
    if (!form.to_store_id) missing.push('Supply from store');
    if (!form.item_id) missing.push('Item (select from dropdown after search)');
    if (!form.qty || Number(form.qty) < 1) missing.push('Quantity');
    if (form.from_store_id && form.to_store_id && form.from_store_id === form.to_store_id) {
      return alert('Requesting store and supply store must be different');
    }
    if (missing.length) {
      return alert(`Please complete:\n• ${missing.join('\n• ')}`);
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
      setForm(emptyForm());
      setItemSearch('');
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
                <label className="text-xs font-bold text-gray-500">Requesting store (ward / sub-store) *</label>
                <select required className={inputCls} value={form.from_store_id} onChange={(e) => setForm({ ...form, from_store_id: e.target.value })}>
                  <option value="">Select requesting store</option>
                  {requestingStores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">Central Store (supply from) *</label>
                <select required className={inputCls} value={form.to_store_id} onChange={(e) => setForm({ ...form, to_store_id: e.target.value })}>
                  <option value="">Select central store</option>
                  {supplyStores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">Priority</label>
                <select className={inputCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="NORMAL">Normal</option>
                  <option value="URGENT">Urgent</option>
                  <option value="EMERGENCY">Emergency</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">Item *</label>
                <input
                  placeholder="Search by item name or code..."
                  className={inputCls}
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                />
                <select
                  required
                  className={`${inputCls} mt-2`}
                  value={form.item_id}
                  onChange={(e) => setForm({ ...form, item_id: e.target.value })}
                >
                  <option value="">Select item from list</option>
                  {filteredItems.map((i) => (
                    <option key={i.id} value={i.id}>{i.item_code} — {i.name}</option>
                  ))}
                </select>
                {itemSearch && filteredItems.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">No active items match &quot;{itemSearch}&quot;. Try another search or approve items in Item Master.</p>
                )}
                {selectedItem && (
                  <p className="text-[11px] text-teal-700 font-bold mt-1">Selected: {selectedItem.item_code} — {selectedItem.name}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">Quantity *</label>
                <input required type="number" min="1" placeholder="Quantity" className={inputCls} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
              </div>
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
