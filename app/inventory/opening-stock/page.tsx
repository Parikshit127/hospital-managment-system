'use client';

import React, { useEffect, useState } from 'react';
import { PackageOpen, Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { listStores } from '@/app/actions/store-actions';
import { searchItems } from '@/app/actions/item-master-actions';
import { recordOpeningStockWithGL } from '@/app/actions/inventory-operations-actions';
import { btnPrimary, inputCls, cardCls } from '../components/InventoryUI';

export default function OpeningStockPage() {
  const [stores, setStores] = useState<any[]>([]);
  const [storeId, setStoreId] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [lines, setLines] = useState<Array<{ item_id: number; name: string; qty: string; cost: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { listStores().then((r) => { if (r.success) setStores(r.data as any[]); }); }, []);
  useEffect(() => {
    if (search.length < 2) { setItems([]); return; }
    searchItems(search, 10).then((r) => { if (r.success) setItems(r.data as any[]); });
  }, [search]);

  const addLine = (item: any) => {
    if (lines.some((l) => l.item_id === item.id)) return;
    setLines([...lines, { item_id: item.id, name: item.name, qty: '', cost: String(item.std_purchase_price || 0) }]);
    setSearch('');
  };

  const submit = async () => {
    if (!storeId || !lines.length) return alert('Select store and add lines');
    setLoading(true);
    const res = await recordOpeningStockWithGL({
      store_id: Number(storeId),
      lines: lines.map((l) => ({
        item_id: l.item_id,
        quantity: Number(l.qty),
        unit_cost: Number(l.cost),
      })),
    });
    setLoading(false);
    if (res.success) {
      alert(`Opening stock posted. Value: ₹${res.data?.totalValue}`);
      setLines([]);
    } else alert(res.error);
  };

  return (
    <AppShell pageTitle="Opening Stock Entry" pageIcon={<PackageOpen className="h-5 w-5" />}>
      <div className={`${cardCls} p-6 max-w-2xl space-y-4`}>
        <p className="text-sm text-gray-500">Finance sign-off required — posts Dr Inventory, Cr Opening Equity.</p>
        <select className={inputCls} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="">Select store</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input placeholder="Search item to add..." className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} />
        {items.length > 0 && (
          <div className="border rounded-xl p-2 space-y-1">
            {items.map((i) => (
              <button key={i.id} onClick={() => addLine(i)} className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 rounded-lg">
                {i.item_code} — {i.name}
              </button>
            ))}
          </div>
        )}
        {lines.map((l, idx) => (
          <div key={l.item_id} className="grid grid-cols-4 gap-2 items-center">
            <span className="text-sm font-bold truncate">{l.name}</span>
            <input type="number" placeholder="Qty" className={inputCls} value={l.qty} onChange={(e) => {
              const n = [...lines]; n[idx].qty = e.target.value; setLines(n);
            }} />
            <input type="number" step="0.01" placeholder="Unit cost" className={inputCls} value={l.cost} onChange={(e) => {
              const n = [...lines]; n[idx].cost = e.target.value; setLines(n);
            }} />
            <button onClick={() => setLines(lines.filter((x) => x.item_id !== l.item_id))} className="text-xs text-red-600 font-bold">Remove</button>
          </div>
        ))}
        <button onClick={submit} disabled={loading} className={btnPrimary}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Post Opening Stock + GL
        </button>
      </div>
    </AppShell>
  );
}
