'use client';

import React, { useEffect, useState } from 'react';
import { ShoppingCart, Plus, Loader2, Truck } from 'lucide-react';
import { DateField } from '@/app/components/ui/DateField';
import { AppShell } from '@/app/components/layout/AppShell';
import {
  listPurchaseRequisitions,
  createPurchaseRequisition,
  updatePRStatus,
  listGRNs,
  receiveGrn,
} from '@/app/actions/inventory-actions';
import { listStores } from '@/app/actions/store-actions';
import { searchItems } from '@/app/actions/item-master-actions';
import { listVendors } from '@/app/actions/indent-actions';
import { StatusBadge, btnPrimary, btnSecondary, inputCls, cardCls } from '../components/InventoryUI';

export default function InventoryProcurementPage() {
  const [tab, setTab] = useState<'pr' | 'grn'>('pr');
  const [prs, setPrs] = useState<any[]>([]);
  const [grns, setGrns] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [prModal, setPrModal] = useState(false);
  const [grnModal, setGrnModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [prForm, setPrForm] = useState({ store_id: '', item_id: '', qty: '' });
  const [grnForm, setGrnForm] = useState({
    store_id: '',
    vendor_id: '',
    item_id: '',
    qty: '',
    unit_price: '',
    batch_no: '',
    expiry: '',
  });

  const load = async () => {
    setLoading(true);
    const [prRes, grnRes, storeRes, vendorRes] = await Promise.all([
      listPurchaseRequisitions(),
      listGRNs(),
      listStores(),
      listVendors(),
    ]);
    if (prRes.success) setPrs(prRes.data as any[]);
    if (grnRes.success) setGrns(grnRes.data as any[]);
    if (storeRes.success) setStores(storeRes.data as any[]);
    if (vendorRes.success) setVendors(vendorRes.data as any[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (itemSearch.length < 2) { setItems([]); return; }
    searchItems(itemSearch, 15).then((r) => { if (r.success) setItems(r.data as any[]); });
  }, [itemSearch]);

  const handleCreatePR = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await createPurchaseRequisition({
      requesting_store_id: Number(prForm.store_id),
      lines: [{ item_id: Number(prForm.item_id), quantity: Number(prForm.qty) }],
    });
    setSaving(false);
    if (res.success) { setPrModal(false); load(); }
    else alert(res.error);
  };

  const handleReceiveGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await receiveGrn({
      store_id: Number(grnForm.store_id),
      vendor_id: grnForm.vendor_id ? Number(grnForm.vendor_id) : undefined,
      lines: [{
        item_id: Number(grnForm.item_id),
        quantity_accepted: Number(grnForm.qty),
        unit_price: Number(grnForm.unit_price),
        batch_no: grnForm.batch_no || undefined,
        expiry_date: grnForm.expiry || undefined,
      }],
    });
    setSaving(false);
    if (res.success) { setGrnModal(false); load(); }
    else alert(res.error);
  };

  return (
    <AppShell
      pageTitle="Procurement"
      pageIcon={<ShoppingCart className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
      headerActions={
        tab === 'pr' ? (
          <button onClick={() => setPrModal(true)} className={btnPrimary}><Plus className="h-4 w-4" /> New PR</button>
        ) : (
          <button onClick={() => setGrnModal(true)} className={btnPrimary}><Truck className="h-4 w-4" /> Receive GRN</button>
        )
      }
    >
      <div className="flex gap-3 mb-4">
        <button onClick={() => setTab('pr')} className={`px-4 py-2 rounded-xl text-sm font-bold border ${tab === 'pr' ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-white border-gray-200'}`}>
          Purchase Requisitions
        </button>
        <button onClick={() => setTab('grn')} className={`px-4 py-2 rounded-xl text-sm font-bold border ${tab === 'grn' ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-white border-gray-200'}`}>
          Goods Receipt (GRN)
        </button>
      </div>

      {tab === 'pr' ? (
        <div className={cardCls}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold text-gray-400 uppercase bg-gray-50/80">
                <th className="px-4 py-3">PR #</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Lines</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {prs.map((pr) => (
                <tr key={pr.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-teal-700">{pr.pr_number}</td>
                  <td className="px-4 py-3">{pr.stores?.name}</td>
                  <td className="px-4 py-3 text-xs">
                    {pr.purchase_requisition_items?.map((l: any) => (
                      <div key={l.id}>{l.item_master?.name}: {l.quantity}</div>
                    ))}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={pr.status} /></td>
                  <td className="px-4 py-3">
                    {pr.status === 'Draft' && (
                      <button onClick={() => updatePRStatus(pr.id, 'Submitted').then(load)} className="text-xs font-bold text-blue-600">Submit</button>
                    )}
                    {pr.status === 'Submitted' && (
                      <button onClick={() => updatePRStatus(pr.id, 'Approved').then(load)} className="text-xs font-bold text-emerald-600 ml-2">Approve</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={cardCls}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold text-gray-400 uppercase bg-gray-50/80">
                <th className="px-4 py-3">GRN #</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {grns.map((g) => (
                <tr key={g.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-mono text-xs font-bold">{g.grn_number}</td>
                  <td className="px-4 py-3">{g.stores?.name}</td>
                  <td className="px-4 py-3">{g.vendor?.vendor_name || '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    {g.goods_receipt_note_items?.map((l: any) => (
                      <div key={l.id}>{l.item_master?.name}: {l.quantity_accepted}</div>
                    ))}
                  </td>
                  <td className="px-4 py-3 font-bold">₹{Math.round(g.total_amount).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {prModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreatePR} className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b bg-gray-50"><h3 className="font-bold">Purchase Requisition</h3></div>
            <div className="p-6 space-y-4">
              <select required className={inputCls} value={prForm.store_id} onChange={(e) => setPrForm({ ...prForm, store_id: e.target.value })}>
                <option value="">Requesting store</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input placeholder="Search item..." className={inputCls} value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
              <select required className={inputCls} value={prForm.item_id} onChange={(e) => setPrForm({ ...prForm, item_id: e.target.value })}>
                <option value="">Select item</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.item_code} — {i.name}</option>)}
              </select>
              <input required type="number" placeholder="Quantity" className={inputCls} value={prForm.qty} onChange={(e) => setPrForm({ ...prForm, qty: e.target.value })} />
            </div>
            <div className="p-4 border-t flex gap-3 justify-end">
              <button type="button" onClick={() => setPrModal(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create PR</button>
            </div>
          </form>
        </div>
      )}

      {grnModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleReceiveGrn} className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b bg-gray-50"><h3 className="font-bold">Receive GRN</h3></div>
            <div className="p-6 space-y-4">
              <select required className={inputCls} value={grnForm.store_id} onChange={(e) => setGrnForm({ ...grnForm, store_id: e.target.value })}>
                <option value="">Receiving store</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select className={inputCls} value={grnForm.vendor_id} onChange={(e) => setGrnForm({ ...grnForm, vendor_id: e.target.value })}>
                <option value="">Vendor (optional)</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
              </select>
              <input placeholder="Search item..." className={inputCls} value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
              <select required className={inputCls} value={grnForm.item_id} onChange={(e) => setGrnForm({ ...grnForm, item_id: e.target.value })}>
                <option value="">Select item</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.item_code} — {i.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input required type="number" placeholder="Qty accepted" className={inputCls} value={grnForm.qty} onChange={(e) => setGrnForm({ ...grnForm, qty: e.target.value })} />
                <input required type="number" step="0.01" placeholder="Unit price" className={inputCls} value={grnForm.unit_price} onChange={(e) => setGrnForm({ ...grnForm, unit_price: e.target.value })} />
              </div>
              <input placeholder="Batch no (if batch tracked)" className={inputCls} value={grnForm.batch_no} onChange={(e) => setGrnForm({ ...grnForm, batch_no: e.target.value })} />
              <DateField className={inputCls} value={grnForm.expiry} onChange={(e) => setGrnForm({ ...grnForm, expiry: e.target.value })} />
            </div>
            <div className="p-4 border-t flex gap-3 justify-end">
              <button type="button" onClick={() => setGrnModal(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Post GRN</button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
