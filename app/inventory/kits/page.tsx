'use client';

import React, { useEffect, useState } from 'react';
import { Boxes, Plus } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { listItems } from '@/app/actions/item-master-actions';
import { createItemKit, issueKit } from '@/app/actions/inventory-operations-actions';
import { listStores } from '@/app/actions/store-actions';
import { btnPrimary, inputCls, cardCls } from '../components/InventoryUI';

export default function InventoryKitsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [kitItemId, setKitItemId] = useState('');
  const [components, setComponents] = useState<Array<{ item_id: string; qty: string }>>([{ item_id: '', qty: '1' }]);
  const [issueForm, setIssueForm] = useState({ store_id: '', kit_id: '', qty: '1', admission_id: '' });

  useEffect(() => {
    listItems({ limit: 200 }).then((r) => { if (r.success) setItems(r.data as any[]); });
    listStores().then((r) => { if (r.success) setStores(r.data as any[]); });
  }, []);

  const saveKit = async () => {
    const res = await createItemKit(Number(kitItemId), components.filter((c) => c.item_id).map((c) => ({
      item_id: Number(c.item_id),
      quantity: Number(c.qty) || 1,
    })));
    if (res.success) alert('Kit saved');
    else alert(res.error);
  };

  const issue = async () => {
    const res = await issueKit({
      store_id: Number(issueForm.store_id),
      kit_item_id: Number(issueForm.kit_id),
      quantity: Number(issueForm.qty),
      admission_id: issueForm.admission_id || undefined,
    });
    if (res.success) alert('Kit issued — components consumed');
    else alert((res as any).error || 'Failed');
  };

  return (
    <AppShell pageTitle="Kits / BOM" pageIcon={<Boxes className="h-5 w-5" />}>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className={`${cardCls} p-6 space-y-4`}>
          <h3 className="font-bold">Define Kit</h3>
          <select className={inputCls} value={kitItemId} onChange={(e) => setKitItemId(e.target.value)}>
            <option value="">Kit item (parent)</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.item_code} — {i.name}</option>)}
          </select>
          {components.map((c, idx) => (
            <div key={idx} className="grid grid-cols-2 gap-2">
              <select className={inputCls} value={c.item_id} onChange={(e) => {
                const n = [...components]; n[idx].item_id = e.target.value; setComponents(n);
              }}>
                <option value="">Component</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              <input type="number" className={inputCls} value={c.qty} onChange={(e) => {
                const n = [...components]; n[idx].qty = e.target.value; setComponents(n);
              }} />
            </div>
          ))}
          <button onClick={() => setComponents([...components, { item_id: '', qty: '1' }])} className="text-xs font-bold text-teal-600">+ Component</button>
          <button onClick={saveKit} className={btnPrimary}><Plus className="h-4 w-4" /> Save Kit</button>
        </div>

        <div className={`${cardCls} p-6 space-y-4`}>
          <h3 className="font-bold">Issue Kit</h3>
          <select className={inputCls} value={issueForm.store_id} onChange={(e) => setIssueForm({ ...issueForm, store_id: e.target.value })}>
            <option value="">From store</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className={inputCls} value={issueForm.kit_id} onChange={(e) => setIssueForm({ ...issueForm, kit_id: e.target.value })}>
            <option value="">Kit item</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input type="number" className={inputCls} placeholder="Kit quantity" value={issueForm.qty} onChange={(e) => setIssueForm({ ...issueForm, qty: e.target.value })} />
          <input className={inputCls} placeholder="Admission ID (optional)" value={issueForm.admission_id} onChange={(e) => setIssueForm({ ...issueForm, admission_id: e.target.value })} />
          <button onClick={issue} className={btnPrimary}>Issue Kit (explode BOM)</button>
        </div>
      </div>
    </AppShell>
  );
}
