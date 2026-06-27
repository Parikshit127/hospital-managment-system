'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { listCssdInstruments, registerCssdInstrument } from '@/app/actions/inventory-operations-actions';
import { listStores } from '@/app/actions/store-actions';
import { btnPrimary, inputCls, cardCls } from '../components/InventoryUI';

export default function InventoryCssdPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [form, setForm] = useState({ instrument_code: '', name: '', store_id: '' });

  const load = async () => {
    const [r, s] = await Promise.all([listCssdInstruments(), listStores({ store_type: 'CSSD' })]);
    if (r.success) setRows(r.data as any[]);
    if (s.success) setStores(s.data as any[]);
  };

  useEffect(() => { load(); }, []);

  const register = async () => {
    const res = await registerCssdInstrument({
      instrument_code: form.instrument_code,
      name: form.name,
      store_id: form.store_id ? Number(form.store_id) : undefined,
    });
    if (res.success) { setForm({ instrument_code: '', name: '', store_id: '' }); load(); }
    else alert(res.error);
  };

  return (
    <AppShell pageTitle="CSSD Instruments" pageIcon={<ShieldCheck className="h-5 w-5" />} onRefresh={load}>
      <div className={`${cardCls} p-6 max-w-lg space-y-4 mb-6`}>
        <h3 className="font-bold">Register Instrument</h3>
        <input className={inputCls} placeholder="Instrument code" value={form.instrument_code} onChange={(e) => setForm({ ...form, instrument_code: e.target.value })} />
        <input className={inputCls} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className={inputCls} value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })}>
          <option value="">CSSD store (optional)</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={register} className={btnPrimary}>Register</button>
      </div>

      <div className={cardCls}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold text-gray-400 uppercase bg-gray-50/80">
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Sterilized</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-mono text-xs">{r.instrument_code}</td>
                <td className="px-4 py-3 font-bold">{r.name}</td>
                <td className="px-4 py-3">{r.status}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{r.last_sterilized_at ? new Date(r.last_sterilized_at).toLocaleDateString('en-IN') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
