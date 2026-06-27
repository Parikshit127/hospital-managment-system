'use client';

import React, { useEffect, useState } from 'react';
import { Warehouse, Plus, Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { listStores, createStore, ensureDefaultStores } from '@/app/actions/store-actions';
import { StatusBadge, btnPrimary, btnSecondary, inputCls, cardCls } from '../components/InventoryUI';
import { STORE_TYPES } from '@/app/lib/inventory-roles';

export default function InventoryStoresPage() {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ store_code: '', name: '', store_type: 'CENTRAL', cost_center: '' });

  const load = async () => {
    setLoading(true);
    await ensureDefaultStores();
    const res = await listStores({ active_only: false });
    if (res.success) setStores(res.data as any[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await createStore(form);
    setSaving(false);
    if (res.success) {
      setModalOpen(false);
      setForm({ store_code: '', name: '', store_type: 'CENTRAL', cost_center: '' });
      load();
    } else alert(res.error);
  };

  const typeColors: Record<string, string> = {
    CENTRAL: 'bg-teal-50 text-teal-700',
    PHARMACY: 'bg-blue-50 text-blue-700',
    WARD: 'bg-violet-50 text-violet-700',
    OT: 'bg-red-50 text-red-700',
    LAB: 'bg-amber-50 text-amber-700',
  };

  return (
    <AppShell
      pageTitle="Stores & Locations"
      pageIcon={<Warehouse className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
      headerActions={
        <button onClick={() => setModalOpen(true)} className={btnPrimary}>
          <Plus className="h-4 w-4" /> Add Store
        </button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stores.map((store) => (
          <div key={store.id} className={`${cardCls} p-5 hover:border-teal-300 transition-all`}>
            <div className="flex items-start justify-between mb-3">
              <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${typeColors[store.store_type] || 'bg-gray-100 text-gray-600'}`}>
                {store.store_type}
              </span>
              {store.is_active ? (
                <StatusBadge status="Active" />
              ) : (
                <StatusBadge status="Discontinued" />
              )}
            </div>
            <h3 className="font-black text-gray-900 text-lg">{store.name}</h3>
            <p className="text-xs font-mono text-teal-600 mt-1">{store.store_code}</p>
            <div className="mt-4 space-y-1 text-xs text-gray-500">
              {store.stores && <p>Replenish from: <span className="font-bold text-gray-700">{store.stores.name}</span></p>}
              {store.cost_center && <p>Cost center: {store.cost_center}</p>}
              {store.users && <p>In-charge: {store.users.name || store.users.username}</p>}
              <p>{store._count?.store_stocks ?? 0} stock records</p>
            </div>
          </div>
        ))}
        {!loading && stores.length === 0 && (
          <div className="col-span-full py-16 text-center text-gray-500">No stores configured.</div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b bg-gray-50"><h3 className="font-bold">New Store</h3></div>
            <div className="p-6 space-y-4">
              <input required placeholder="Store code *" className={inputCls} value={form.store_code} onChange={(e) => setForm({ ...form, store_code: e.target.value })} />
              <input required placeholder="Store name *" className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <select className={inputCls} value={form.store_type} onChange={(e) => setForm({ ...form, store_type: e.target.value })}>
                {STORE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input placeholder="Cost center" className={inputCls} value={form.cost_center} onChange={(e) => setForm({ ...form, cost_center: e.target.value })} />
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
