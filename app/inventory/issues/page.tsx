'use client';

import React, { useEffect, useState } from 'react';
import { Syringe, Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { listStores } from '@/app/actions/store-actions';
import { searchItems } from '@/app/actions/item-master-actions';
import {
  recordConsumption,
  directIssue,
  emergencyIssue,
  writeOffBatch,
  quarantineBatch,
} from '@/app/actions/inventory-operations-actions';
import { btnPrimary, btnSecondary, inputCls, cardCls } from '../components/InventoryUI';

export default function InventoryIssuesPage() {
  const [tab, setTab] = useState<'consumption' | 'direct' | 'emergency' | 'writeoff'>('consumption');
  const [stores, setStores] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    store_id: '',
    item_id: '',
    qty: '1',
    admission_id: '',
    cost_center: '',
    batch_id: '',
    reason: 'EXPIRY_WRITEOFF',
    to_store_id: '',
  });

  useEffect(() => {
    listStores().then((r) => { if (r.success) setStores(r.data as any[]); });
  }, []);

  useEffect(() => {
    if (search.length < 2) { setItems([]); return; }
    searchItems(search, 15).then((r) => { if (r.success) setItems(r.data as any[]); });
  }, [search]);

  const submit = async () => {
    setLoading(true);
    let res;
    const base = {
      store_id: Number(form.store_id),
      item_id: Number(form.item_id),
      quantity: Number(form.qty),
    };
    if (tab === 'consumption') {
      res = await recordConsumption({
        ...base,
        admission_id: form.admission_id || undefined,
        cost_center: form.cost_center || undefined,
        chargeable: !!form.admission_id,
      });
    } else if (tab === 'direct') {
      res = await directIssue({
        from_store_id: base.store_id,
        to_store_id: form.to_store_id ? Number(form.to_store_id) : undefined,
        item_id: base.item_id,
        quantity: base.quantity,
        cost_center: form.cost_center || undefined,
      });
    } else if (tab === 'emergency') {
      res = await emergencyIssue({
        from_store_id: base.store_id,
        item_id: base.item_id,
        quantity: base.quantity,
        admission_id: form.admission_id || undefined,
        cost_center: form.cost_center || undefined,
      });
    } else {
      res = await writeOffBatch({
        store_id: base.store_id,
        batch_id: Number(form.batch_id),
        quantity: base.quantity,
        reason_code: form.reason as 'EXPIRY_WRITEOFF' | 'DAMAGE_WRITEOFF',
      });
    }
    setLoading(false);
    if (res?.success) alert('Recorded successfully');
    else alert(res?.error || 'Failed');
  };

  const tabs = [
    { key: 'consumption', label: 'Consumption' },
    { key: 'direct', label: 'Direct Issue' },
    { key: 'emergency', label: 'Emergency' },
    { key: 'writeoff', label: 'Write-off' },
  ] as const;

  return (
    <AppShell pageTitle="Issues & Consumption" pageIcon={<Syringe className="h-5 w-5" />}>
      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold border ${tab === t.key ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-white border-gray-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={`${cardCls} p-6 max-w-lg space-y-4`}>
        <select required className={inputCls} value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })}>
          <option value="">Select store</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {tab !== 'writeoff' && (
          <>
            <input placeholder="Search item..." className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} />
            <select required className={inputCls} value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
              <option value="">Select item</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.item_code} — {i.name}</option>)}
            </select>
          </>
        )}

        {tab === 'writeoff' && (
          <input placeholder="Batch ID" className={inputCls} value={form.batch_id} onChange={(e) => setForm({ ...form, batch_id: e.target.value })} />
        )}

        <input type="number" min="1" placeholder="Quantity" className={inputCls} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />

        {(tab === 'consumption' || tab === 'emergency') && (
          <input placeholder="Admission ID (for patient charge)" className={inputCls} value={form.admission_id} onChange={(e) => setForm({ ...form, admission_id: e.target.value })} />
        )}

        {tab === 'direct' && (
          <select className={inputCls} value={form.to_store_id} onChange={(e) => setForm({ ...form, to_store_id: e.target.value })}>
            <option value="">To store (optional)</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}

        {tab === 'writeoff' && (
          <select className={inputCls} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
            <option value="EXPIRY_WRITEOFF">Expiry write-off</option>
            <option value="DAMAGE_WRITEOFF">Damage write-off</option>
          </select>
        )}

        <input placeholder="Cost center" className={inputCls} value={form.cost_center} onChange={(e) => setForm({ ...form, cost_center: e.target.value })} />

        <button onClick={submit} disabled={loading} className={btnPrimary}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Submit
        </button>
      </div>
    </AppShell>
  );
}
