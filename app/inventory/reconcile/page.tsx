'use client';

import React, { useEffect, useState } from 'react';
import { Scale, Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { reconcileInventoryToGL, retryUnpostedGLMovements } from '@/app/actions/inventory-gl-actions';
import { listStores } from '@/app/actions/store-actions';
import { btnPrimary, inputCls, cardCls } from '../components/InventoryUI';

export default function InventoryReconcilePage() {
  const [stores, setStores] = useState<any[]>([]);
  const [storeId, setStoreId] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { listStores().then((r) => { if (r.success) setStores(r.data as any[]); }); }, []);

  const load = async () => {
    setLoading(true);
    const res = await reconcileInventoryToGL(storeId ? Number(storeId) : undefined);
    if (res.success) setData(res.data);
    setLoading(false);
  };

  const retry = async () => {
    setLoading(true);
    const res = await retryUnpostedGLMovements();
    setLoading(false);
    if (res.success) { alert(`Retried ${res.data?.retried} movements`); load(); }
    else alert(res.error);
  };

  return (
    <AppShell pageTitle="GL Reconciliation" pageIcon={<Scale className="h-5 w-5" />} onRefresh={load} refreshing={loading}>
      <div className={`${cardCls} p-4 mb-4 flex gap-3 items-end bg-gray-50/50`}>
        <select className={`${inputCls} max-w-xs`} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="">All stores</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={load} className={btnPrimary}>Reconcile</button>
        <button onClick={retry} className={btnPrimary}>Retry Unposted GL</button>
      </div>

      {data && (
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className={`${cardCls} p-5`}>
            <p className="text-2xl font-black text-teal-700">₹{data.ledgerValue?.toLocaleString('en-IN')}</p>
            <p className="text-xs font-bold text-gray-400 uppercase">Sub-ledger Value</p>
          </div>
          <div className={`${cardCls} p-5`}>
            <p className="text-2xl font-black text-amber-700">{data.unpostedMovements}</p>
            <p className="text-xs font-bold text-gray-400 uppercase">Unposted Movements</p>
          </div>
        </div>
      )}

      {data?.categoryBreakdown && (
        <div className={cardCls}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold text-gray-400 uppercase bg-gray-50/80">
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.categoryBreakdown).map(([cat, val]) => (
                <tr key={cat} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-bold">{cat}</td>
                  <td className="px-4 py-3">₹{Math.round(val as number).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {loading && !data && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-teal-500" /></div>}
    </AppShell>
  );
}
