'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShoppingCart, Plus, Loader2, Truck, FileText } from 'lucide-react';
import { DateField } from '@/app/components/ui/DateField';
import { AppShell } from '@/app/components/layout/AppShell';
import {
  listPurchaseRequisitions,
  createPurchaseRequisition,
  updatePRStatus,
  listGRNs,
  receiveGrn,
} from '@/app/actions/inventory-actions';
import {
  listItemPOs,
  submitItemPO,
  approveItemPO,
  convertPRtoPO,
  createItemPurchaseOrder,
  createItemPurchaseInvoice,
  matchItemPurchaseInvoice,
  postItemPurchaseInvoice,
  listItemPurchaseInvoices,
} from '@/app/actions/inventory-procurement-actions';
import { listStores } from '@/app/actions/store-actions';
import { searchItems } from '@/app/actions/item-master-actions';
import { listVendors } from '@/app/actions/indent-actions';
import { StatusBadge, btnPrimary, btnSecondary, inputCls, cardCls } from '../components/InventoryUI';
import { useInventorySession } from '../components/useInventorySession';

type Tab = 'pr' | 'po' | 'grn' | 'invoices';

export default function ProcurementClient() {
  const searchParams = useSearchParams();
  const { can, role } = useInventorySession();
  const tabParam = searchParams.get('tab') as Tab | null;
  const defaultTab: Tab = can('enter_invoice') ? 'invoices' : can('receive_grn') ? 'grn' : 'po';
  const [tab, setTab] = useState<Tab>(tabParam && ['pr', 'po', 'grn', 'invoices'].includes(tabParam) ? tabParam : defaultTab);
  const [prs, setPrs] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [grns, setGrns] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [prModal, setPrModal] = useState(false);
  const [poModal, setPoModal] = useState(false);
  const [grnModal, setGrnModal] = useState(false);
  const [invModal, setInvModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [prForm, setPrForm] = useState({ store_id: '', item_id: '', qty: '' });
  const [poForm, setPoForm] = useState({ vendor_id: '', store_id: '', item_id: '', qty: '', unit_price: '' });
  const [grnForm, setGrnForm] = useState({
    po_id: '',
    store_id: '',
    vendor_id: '',
    item_id: '',
    qty: '',
    unit_price: '',
    batch_no: '',
    expiry: '',
  });
  const [invForm, setInvForm] = useState({
    po_id: '',
    vendor_id: '',
    invoice_date: new Date().toISOString().slice(0, 10),
    qty: '',
    unit_price: '',
  });

  useEffect(() => {
    if (tabParam && ['pr', 'po', 'grn', 'invoices'].includes(tabParam)) setTab(tabParam);
  }, [tabParam]);

  const load = async () => {
    setLoading(true);
    const [prRes, poRes, grnRes, invRes, storeRes, vendorRes] = await Promise.all([
      listPurchaseRequisitions(),
      listItemPOs(),
      listGRNs(),
      listItemPurchaseInvoices(),
      listStores(),
      listVendors(),
    ]);
    if (prRes.success) setPrs(prRes.data as any[]);
    if (poRes.success) setPos(poRes.data as any[]);
    else console.error('Failed to load POs:', poRes.error);
    if (grnRes.success) setGrns(grnRes.data as any[]);
    if (invRes.success) setInvoices(invRes.data as any[]);
    if (storeRes.success) setStores(storeRes.data as any[]);
    if (vendorRes.success) setVendors(vendorRes.data as any[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (itemSearch.length < 2) { setItems([]); return; }
    searchItems(itemSearch, 15).then((r) => { if (r.success) setItems(r.data as any[]); });
  }, [itemSearch]);

  const PO_FOR_GRN = ['Approved', 'Partially Received'];
  const PO_FOR_INVOICE = ['Approved', 'Partially Received', 'Received'];

  const grnEligiblePos = pos.filter((p) => PO_FOR_GRN.includes(p.status));
  const invoiceEligiblePos = pos.filter((p) => PO_FOR_INVOICE.includes(p.status));

  const onPoSelectForGrn = (poId: string) => {
    const po = pos.find((p) => String(p.id) === poId);
    if (!po) {
      setGrnForm((f) => ({ ...f, po_id: poId }));
      return;
    }
    const firstLine = po.items?.[0];
    setGrnForm({
      po_id: poId,
      store_id: String(po.storeId || ''),
      vendor_id: String(po.vendor_id || ''),
      item_id: firstLine ? String(firstLine.itemMasterId) : '',
      qty: firstLine ? String(firstLine.quantity_ordered) : '',
      unit_price: firstLine ? String(firstLine.unit_price) : '',
      batch_no: '',
      expiry: '',
    });
  };

  const onPoSelectForInvoice = (poId: string) => {
    const po = pos.find((p) => String(p.id) === poId);
    const firstLine = po?.items?.[0];
    const grnQty = firstLine?.quantity_received;
    const defaultQty = grnQty != null && grnQty > 0 ? grnQty : firstLine?.quantity_ordered;
    setInvForm((f) => ({
      ...f,
      po_id: poId,
      vendor_id: po ? String(po.vendor_id || '') : f.vendor_id,
      qty: defaultQty != null ? String(defaultQty) : f.qty,
      unit_price: firstLine ? String(firstLine.unit_price) : f.unit_price,
    }));
  };

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

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await createItemPurchaseOrder({
      vendor_id: Number(poForm.vendor_id),
      store_id: Number(poForm.store_id),
      lines: [{
        item_id: Number(poForm.item_id),
        quantity: Number(poForm.qty),
        unit_price: Number(poForm.unit_price),
      }],
    });
    setSaving(false);
    if (res.success) { setPoModal(false); setTab('po'); load(); }
    else alert(res.error);
  };

  const handleReceiveGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await receiveGrn({
      store_id: Number(grnForm.store_id),
      vendor_id: grnForm.vendor_id ? Number(grnForm.vendor_id) : undefined,
      po_id: grnForm.po_id ? Number(grnForm.po_id) : undefined,
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

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const po = pos.find((p) => String(p.id) === invForm.po_id);
    const poItem = po?.items?.[0];
    if (!poItem) return alert('Select a valid PO with line items');
    if (!invForm.vendor_id) return alert('Selected PO has no vendor');
    const qty = Number(invForm.qty);
    const unitPrice = Number(invForm.unit_price);
    if (!qty || qty <= 0) return alert('Enter a valid quantity');
    if (unitPrice < 0 || Number.isNaN(unitPrice)) return alert('Enter a valid unit price');

    setSaving(true);
    const createRes = await createItemPurchaseInvoice({
      vendor_id: Number(invForm.vendor_id),
      po_id: Number(invForm.po_id),
      invoice_date: invForm.invoice_date,
      lines: [{
        item_id: poItem.itemMasterId,
        po_item_id: poItem.id,
        quantity: qty,
        unit_price: unitPrice,
        gst_rate: poItem.gst_rate || 0,
        hsn_code: poItem.hsn_code || undefined,
      }],
    });
    if (!createRes.success) {
      setSaving(false);
      return alert(createRes.error || 'Failed to create invoice');
    }

    const matchRes = await matchItemPurchaseInvoice(createRes.data.id);
    if (!matchRes.success) {
      setSaving(false);
      return alert(matchRes.error || 'Matching failed');
    }

    if (matchRes.data.allOk) {
      const postRes = await postItemPurchaseInvoice(createRes.data.id);
      setSaving(false);
      if (!postRes.success) {
        alert(`Invoice ${createRes.data.invoice_number} saved and matched, but posting failed: ${postRes.error}`);
      } else {
        alert(`Invoice ${createRes.data.invoice_number} saved, matched, and posted.`);
      }
    } else {
      setSaving(false);
      alert(`Invoice ${createRes.data.invoice_number} saved with status: ${matchRes.data.status}. Finance approval may be required before posting.`);
    }
    setInvModal(false);
    setTab('invoices');
    load();
  };

  const headerAction = () => {
    if (tab === 'pr' && can('create_po')) return <button onClick={() => setPrModal(true)} className={btnPrimary}><Plus className="h-4 w-4" /> New PR</button>;
    if (tab === 'po' && can('create_po')) return <button onClick={() => setPoModal(true)} className={btnPrimary}><Plus className="h-4 w-4" /> Create PO</button>;
    if (tab === 'grn' && can('receive_grn')) return <button onClick={() => setGrnModal(true)} className={btnPrimary}><Truck className="h-4 w-4" /> Receive GRN</button>;
    if (tab === 'invoices' && can('enter_invoice')) return <button onClick={() => setInvModal(true)} className={btnPrimary}><FileText className="h-4 w-4" /> Create Invoice</button>;
    return null;
  };

  const visibleTabs = ([
    ['pr', 'Purchase Requisitions', can('create_po')],
    ['po', 'Purchase Orders', can('create_po')],
    ['grn', 'Goods Receipt (GRN)', can('receive_grn')],
    ['invoices', 'Supplier Invoices', can('enter_invoice')],
  ] as const).filter(([, , ok]) => ok);

  return (
    <AppShell pageTitle="Procurement" pageIcon={<ShoppingCart className="h-5 w-5" />} onRefresh={load} refreshing={loading} headerActions={headerAction()}>
      <div className="flex flex-wrap gap-3 mb-4">
        {visibleTabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 rounded-xl text-sm font-bold border ${tab === key ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-white border-gray-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'po' && (
        <div className={cardCls}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold text-gray-400 uppercase bg-gray-50/80">
                <th className="px-4 py-3">PO #</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((po) => (
                <tr key={po.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-mono text-xs font-bold">{po.po_number}</td>
                  <td className="px-4 py-3">{po.vendor?.vendor_name}</td>
                  <td className="px-4 py-3">{po.stores?.name}</td>
                  <td className="px-4 py-3 font-bold">₹{Math.round(po.total_amount).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3"><StatusBadge status={po.status} /></td>
                  <td className="px-4 py-3">
                    {po.status === 'Draft' && can('create_po') && <button onClick={() => submitItemPO(po.id).then(load)} className="text-xs font-bold text-blue-600">Submit</button>}
                    {['Submitted', 'Draft'].includes(po.status) && can('approve_po') && (
                      <button onClick={() => approveItemPO(po.id).then(load)} className="text-xs font-bold text-emerald-600 ml-2">Approve</button>
                    )}
                    {['Submitted', 'Draft'].includes(po.status) && !can('approve_po') && role === 'procurement_officer' && (
                      <span className="text-[10px] text-gray-400 font-bold">Needs store mgr approval</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'pr' && (
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
                  <td className="px-4 py-3 text-xs">{pr.purchase_requisition_items?.map((l: any) => <div key={l.id}>{l.item_master?.name}: {l.quantity}</div>)}</td>
                  <td className="px-4 py-3"><StatusBadge status={pr.status} /></td>
                  <td className="px-4 py-3">
                    {pr.status === 'Draft' && <button onClick={() => updatePRStatus(pr.id, 'Submitted').then(load)} className="text-xs font-bold text-blue-600">Submit</button>}
                    {pr.status === 'Submitted' && (
                      <>
                        <button onClick={() => updatePRStatus(pr.id, 'Approved').then(load)} className="text-xs font-bold text-emerald-600">Approve</button>
                        <button onClick={() => { const v = vendors[0]?.id; if (!v) return alert('Add a vendor first'); convertPRtoPO(pr.id, v).then(load); }} className="text-xs font-bold text-violet-600 ml-2">Convert to PO</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'grn' && (
        <div className={cardCls}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold text-gray-400 uppercase bg-gray-50/80">
                <th className="px-4 py-3">GRN #</th>
                <th className="px-4 py-3">PO</th>
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
                  <td className="px-4 py-3 text-xs">{g.po_id ? `#${g.po_id}` : '—'}</td>
                  <td className="px-4 py-3">{g.stores?.name}</td>
                  <td className="px-4 py-3">{g.vendor?.vendor_name || '—'}</td>
                  <td className="px-4 py-3 text-xs">{g.goods_receipt_note_items?.map((l: any) => <div key={l.id}>{l.item_master?.name}: {l.quantity_accepted}</div>)}</td>
                  <td className="px-4 py-3 font-bold">₹{Math.round(g.total_amount).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'invoices' && (
        <div className={cardCls}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold text-gray-400 uppercase bg-gray-50/80">
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">PO</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-mono text-xs font-bold">{inv.invoice_number}</td>
                  <td className="px-4 py-3">{inv.po?.po_number || '—'}</td>
                  <td className="px-4 py-3">{inv.vendor?.vendor_name}</td>
                  <td className="px-4 py-3 font-bold">₹{Math.round(inv.total_amount).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
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

      {poModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreatePO} className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b bg-gray-50"><h3 className="font-bold">Create Purchase Order</h3></div>
            <div className="p-6 space-y-4">
              <select required className={inputCls} value={poForm.vendor_id} onChange={(e) => setPoForm({ ...poForm, vendor_id: e.target.value })}>
                <option value="">Vendor</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
              </select>
              <select required className={inputCls} value={poForm.store_id} onChange={(e) => setPoForm({ ...poForm, store_id: e.target.value })}>
                <option value="">Receiving store</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input placeholder="Search item..." className={inputCls} value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
              <select required className={inputCls} value={poForm.item_id} onChange={(e) => setPoForm({ ...poForm, item_id: e.target.value })}>
                <option value="">Select item (Active only)</option>
                {items.filter((i) => i.status === 'Active').map((i) => <option key={i.id} value={i.id}>{i.item_code} — {i.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input required type="number" placeholder="Qty" className={inputCls} value={poForm.qty} onChange={(e) => setPoForm({ ...poForm, qty: e.target.value })} />
                <input required type="number" step="0.01" placeholder="Unit price" className={inputCls} value={poForm.unit_price} onChange={(e) => setPoForm({ ...poForm, unit_price: e.target.value })} />
              </div>
            </div>
            <div className="p-4 border-t flex gap-3 justify-end">
              <button type="button" onClick={() => setPoModal(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create PO</button>
            </div>
          </form>
        </div>
      )}

      {grnModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleReceiveGrn} className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b bg-gray-50"><h3 className="font-bold">Receive GRN against PO</h3></div>
            <div className="p-6 space-y-4">
              <select className={inputCls} value={grnForm.po_id} onChange={(e) => onPoSelectForGrn(e.target.value)}>
                <option value="">Link to PO (recommended)</option>
                {grnEligiblePos.map((po) => <option key={po.id} value={po.id}>{po.po_number} — {po.vendor?.vendor_name}</option>)}
              </select>
              <select required className={inputCls} value={grnForm.store_id} onChange={(e) => setGrnForm({ ...grnForm, store_id: e.target.value })}>
                <option value="">Receiving store</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select className={inputCls} value={grnForm.vendor_id} onChange={(e) => setGrnForm({ ...grnForm, vendor_id: e.target.value })}>
                <option value="">Vendor</option>
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
              <input placeholder="Batch no" className={inputCls} value={grnForm.batch_no} onChange={(e) => setGrnForm({ ...grnForm, batch_no: e.target.value })} />
              <DateField className={inputCls} value={grnForm.expiry} onChange={(e) => setGrnForm({ ...grnForm, expiry: e.target.value })} />
            </div>
            <div className="p-4 border-t flex gap-3 justify-end">
              <button type="button" onClick={() => setGrnModal(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Post GRN</button>
            </div>
          </form>
        </div>
      )}

      {invModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateInvoice} className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b bg-gray-50"><h3 className="font-bold">Supplier Invoice (3-Way Match)</h3></div>
            <div className="p-6 space-y-4">
              <select required className={inputCls} value={invForm.po_id} onChange={(e) => onPoSelectForInvoice(e.target.value)}>
                <option value="">Select PO</option>
                {invoiceEligiblePos.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.po_number}{po.status !== 'Approved' ? ` (${po.status})` : ''}
                  </option>
                ))}
              </select>
              {invoiceEligiblePos.length === 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  No eligible POs found. Create a PO, approve it, and receive goods (GRN) first.
                </p>
              )}
              <DateField required className={inputCls} value={invForm.invoice_date} onChange={(e) => setInvForm({ ...invForm, invoice_date: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input required type="number" placeholder="Qty" className={inputCls} value={invForm.qty} onChange={(e) => setInvForm({ ...invForm, qty: e.target.value })} />
                <input required type="number" step="0.01" placeholder="Unit price" className={inputCls} value={invForm.unit_price} onChange={(e) => setInvForm({ ...invForm, unit_price: e.target.value })} />
              </div>
              <p className="text-xs text-gray-500">On save, system runs 3-way match and auto-posts if PO/GRN/invoice quantities and prices align.</p>
            </div>
            <div className="p-4 border-t flex gap-3 justify-end">
              <button type="button" onClick={() => setInvModal(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save & Match</button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
