'use client';

import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Plus, Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
  listCountSessions,
  createCountSession,
  getCountSession,
  submitCountLines,
  approveCountSession,
} from '@/app/actions/inventory-actions';
import { listStores } from '@/app/actions/store-actions';
import { StatusBadge, btnPrimary, btnSecondary, inputCls, cardCls } from '../components/InventoryUI';

export default function InventoryCountsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [storeId, setStoreId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [sRes, storeRes] = await Promise.all([listCountSessions(), listStores()]);
    if (sRes.success) setSessions(sRes.data as any[]);
    if (storeRes.success) setStores(storeRes.data as any[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startCount = async () => {
    if (!storeId) return alert('Select a store');
    setSaving(true);
    const res = await createCountSession(Number(storeId));
    setSaving(false);
    if (res.success) {
      const detail = await getCountSession(res.data.id);
      if (detail.success) {
        setActiveSession(detail.data);
        const init: Record<number, string> = {};
        detail.data.stock_count_lines?.forEach((l: any) => { init[l.id] = String(l.book_qty); });
        setCounts(init);
      }
      load();
    } else alert(res.error);
  };

  const openSession = async (id: number) => {
    const res = await getCountSession(id);
    if (res.success) {
      setActiveSession(res.data);
      const init: Record<number, string> = {};
      res.data.stock_count_lines?.forEach((l: any) => {
        init[l.id] = String(l.counted_qty || l.book_qty);
      });
      setCounts(init);
    }
  };

  const submitCounts = async () => {
    if (!activeSession) return;
    setSaving(true);
    const lines = Object.entries(counts).map(([line_id, counted_qty]) => ({
      line_id: Number(line_id),
      counted_qty: Number(counted_qty),
    }));
    const res = await submitCountLines(activeSession.id, lines);
    setSaving(false);
    if (res.success) { setActiveSession(null); load(); }
    else alert(res.error);
  };

  const approve = async () => {
    if (!activeSession) return;
    setSaving(true);
    const res = await approveCountSession(activeSession.id);
    setSaving(false);
    if (res.success) { setActiveSession(null); load(); }
    else alert(res.error);
  };

  return (
    <AppShell
      pageTitle="Physical & Cycle Count"
      pageIcon={<ClipboardCheck className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
    >
      {!activeSession ? (
        <>
          <div className={`${cardCls} p-4 mb-6 flex flex-wrap gap-3 items-end bg-gray-50/50`}>
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Start count for store</label>
              <select className={`${inputCls} min-w-[240px]`} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                <option value="">Select store</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <button onClick={startCount} disabled={saving} className={btnPrimary}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              New Count Session
            </button>
          </div>

          <div className={cardCls}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold text-gray-400 uppercase bg-gray-50/80">
                  <th className="px-4 py-3">Session #</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Lines</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-mono text-xs font-bold">{s.session_number}</td>
                    <td className="px-4 py-3">{s.stores?.name}</td>
                    <td className="px-4 py-3">{s._count?.stock_count_lines}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3">
                      {['Frozen', 'Review'].includes(s.status) && (
                        <button onClick={() => openSession(s.id)} className="text-xs font-bold text-teal-600">Open</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className={cardCls}>
          <div className="p-4 border-b flex justify-between items-center bg-gray-50/50">
            <div>
              <h3 className="font-bold">{activeSession.session_number}</h3>
              <p className="text-xs text-gray-500">{activeSession.stores?.name} · <StatusBadge status={activeSession.status} /></p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setActiveSession(null)} className={btnSecondary}>Back</button>
              {activeSession.status === 'Frozen' && (
                <button onClick={submitCounts} disabled={saving} className={btnPrimary}>Submit Counts</button>
              )}
              {activeSession.status === 'Review' && (
                <button onClick={approve} disabled={saving} className={btnPrimary}>Approve & Post</button>
              )}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold text-gray-400 uppercase">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3">Book Qty</th>
                <th className="px-4 py-3">Counted Qty</th>
              </tr>
            </thead>
            <tbody>
              {activeSession.stock_count_lines?.map((line: any) => (
                <tr key={line.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-bold">{line.item_master?.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{line.item_batches?.batch_no || '—'}</td>
                  <td className="px-4 py-3">{line.book_qty}</td>
                  <td className="px-4 py-3">
                    {['Frozen', 'Review'].includes(activeSession.status) ? (
                      <input
                        type="number"
                        className={`${inputCls} max-w-[100px]`}
                        value={counts[line.id] ?? ''}
                        onChange={(e) => setCounts({ ...counts, [line.id]: e.target.value })}
                        disabled={activeSession.status === 'Review'}
                      />
                    ) : (
                      line.counted_qty
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
