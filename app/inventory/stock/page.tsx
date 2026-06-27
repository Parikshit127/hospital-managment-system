'use client';

import React, { useEffect, useState } from 'react';
import { Package, Search, BookOpen } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { getStockOnHand, getMovementLedger } from '@/app/actions/inventory-actions';
import { listStores } from '@/app/actions/store-actions';
import { inputCls, cardCls } from '../components/InventoryUI';
import { useDebouncedValue } from '@/app/lib/hooks/useDebouncedValue';

export default function InventoryStockPage() {
  const [tab, setTab] = useState<'stock' | 'ledger'>('stock');
  const [stores, setStores] = useState<any[]>([]);
  const [storeId, setStoreId] = useState('');
  const [stock, setStock] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);

  const load = async () => {
    setLoading(true);
    const storesRes = await listStores();
    if (storesRes.success) setStores(storesRes.data as any[]);

    if (tab === 'stock') {
      const res = await getStockOnHand({
        store_id: storeId ? Number(storeId) : undefined,
        query: debouncedSearch,
        low_stock_only: lowOnly,
      });
      if (res.success) setStock(res.data as any[]);
    } else {
      const res = await getMovementLedger({
        store_id: storeId ? Number(storeId) : undefined,
        limit: 100,
      });
      if (res.success) setLedger(res.data as any[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab, storeId, debouncedSearch, lowOnly]);

  return (
    <AppShell
      pageTitle="Stock & Ledger"
      pageIcon={<Package className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
    >
      <div className="flex flex-wrap gap-3 mb-4">
        <button onClick={() => setTab('stock')} className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${tab === 'stock' ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-white border-gray-200 text-gray-600'}`}>
          Stock on Hand
        </button>
        <button onClick={() => setTab('ledger')} className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors flex items-center gap-2 ${tab === 'ledger' ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-white border-gray-200 text-gray-600'}`}>
          <BookOpen className="h-4 w-4" /> Movement Ledger
        </button>
      </div>

      <div className={`${cardCls} mb-4 p-4 flex flex-wrap gap-3 bg-gray-50/50`}>
        <select className={`${inputCls} max-w-xs`} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="">All stores</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {tab === 'stock' && (
          <>
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} pl-9`} />
            </div>
            <button onClick={() => setLowOnly(!lowOnly)} className={`px-4 py-2 rounded-xl text-sm font-bold border ${lowOnly ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-200'}`}>
              {lowOnly ? 'Low stock only' : 'All stock'}
            </button>
          </>
        )}
      </div>

      {tab === 'stock' ? (
        <div className={cardCls}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold text-gray-400 uppercase bg-gray-50/80">
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Batch</th>
                  <th className="px-4 py-3">On Hand</th>
                  <th className="px-4 py-3">Available</th>
                  <th className="px-4 py-3">Avg Cost</th>
                  <th className="px-4 py-3">Value</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-4 py-2.5 text-gray-600">{row.stores?.name}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-bold">{row.item_master?.name}</span>
                      <span className="text-[10px] text-gray-400 block">{row.item_master?.item_code}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{row.item_batches?.batch_no || '—'}</td>
                    <td className="px-4 py-2.5 font-black text-gray-800">{row.quantity_on_hand}</td>
                    <td className="px-4 py-2.5 text-emerald-600 font-bold">{row.available}</td>
                    <td className="px-4 py-2.5">₹{row.avg_unit_cost?.toFixed(2)}</td>
                    <td className="px-4 py-2.5 font-bold">₹{Math.round(row.value).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {!loading && stock.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500">No stock records</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className={cardCls}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold text-gray-400 uppercase bg-gray-50/80">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">In</th>
                  <th className="px-4 py-3">Out</th>
                  <th className="px-4 py-3">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((m) => (
                  <tr key={m.id} className="border-t border-gray-100">
                    <td className="px-4 py-2.5 text-xs text-gray-500">{new Date(m.created_at).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-teal-700">{m.movement_type}</td>
                    <td className="px-4 py-2.5 font-bold">{m.item_master?.name}</td>
                    <td className="px-4 py-2.5">{m.stores?.name}</td>
                    <td className="px-4 py-2.5 text-emerald-600 font-bold">{m.quantity_in || '—'}</td>
                    <td className="px-4 py-2.5 text-red-600 font-bold">{m.quantity_out || '—'}</td>
                    <td className="px-4 py-2.5 font-black">{m.balance_after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
