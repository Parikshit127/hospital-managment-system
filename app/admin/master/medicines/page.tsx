'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Loader2, Pencil, PowerOff, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listMedicines, createMedicine, updateMedicine, deactivateMedicine,
  listBatches, addBatch, updateBatch,
} from '@/app/actions/medicine-master-actions';
import MasterImportButton from '@/app/components/master/MasterImportButton';

const PAGE_LIMIT = 25;
const EMPTY_MED = {
  brand_name: '', generic_name: '', category: '', manufacturer: '',
  form: '', strength: '', mrp: 0, purchase_price: 0, selling_price: 0,
  gst_percent: 0, min_threshold: 10, hsn_sac_code: '', is_active: true,
};
const EMPTY_BATCH = {
  batch_no: '', current_stock: 0, manufacture_date: '', expiry_date: '',
  cost_price: 0, rack_location: '', supplier_name: '',
};

function formatDate(d: any): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().split('T')[0];
}

function toISODateTime(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00.000Z').toISOString();
}

export default function MedicineMasterPage() {
  // medicines list state
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // medicine modal state
  const [medMode, setMedMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [medForm, setMedForm] = useState<any>(EMPTY_MED);
  const [submitting, setSubmitting] = useState(false);

  // batch modal state
  const [batchMed, setBatchMed] = useState<any | null>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchMode, setBatchMode] = useState<'idle' | 'add' | 'edit'>('idle');
  const [batchEditingId, setBatchEditingId] = useState<number | null>(null);
  const [batchForm, setBatchForm] = useState<any>(EMPTY_BATCH);
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listMedicines({ search, page, limit: PAGE_LIMIT });
    if (res.success) {
      setRows(res.data.medicines);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } else {
      toast.error((res as any).error || 'Failed to load');
    }
    setLoading(false);
  }, [search, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const openCreate = () => { setMedForm(EMPTY_MED); setMedMode('create'); };
  const openEdit = (row: any) => {
    setEditingId(row.id);
    setMedForm({
      ...EMPTY_MED, ...row,
      mrp: Number(row.mrp ?? 0),
      purchase_price: Number(row.purchase_price ?? 0),
      selling_price: Number(row.selling_price ?? 0),
      gst_percent: Number(row.gst_percent ?? 0),
      min_threshold: Number(row.min_threshold ?? 10),
    });
    setMedMode('edit');
  };
  const closeMed = () => { setMedMode('idle'); setEditingId(null); };

  const submitMed = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      ...medForm,
      mrp: Number(medForm.mrp),
      purchase_price: Number(medForm.purchase_price),
      selling_price: Number(medForm.selling_price),
      gst_percent: Number(medForm.gst_percent),
      min_threshold: Number(medForm.min_threshold),
    };
    const res = medMode === 'create'
      ? await createMedicine(payload)
      : await updateMedicine(editingId!, payload);
    if (res.success) {
      toast.success(medMode === 'create' ? 'Medicine created' : 'Medicine updated');
      closeMed();
      load();
    } else {
      toast.error((res as any).error || 'Failed');
    }
    setSubmitting(false);
  };

  const deactivate = async (id: number) => {
    if (!confirm('Deactivate this medicine? It will no longer appear in billing dropdowns.')) return;
    const res = await deactivateMedicine(id);
    if (res.success) { toast.success('Deactivated'); load(); }
    else toast.error((res as any).error || 'Failed');
  };

  const openBatches = async (row: any) => {
    setBatchMed(row);
    setBatchMode('idle');
    setBatchForm(EMPTY_BATCH);
    setBatchLoading(true);
    const res = await listBatches(row.id);
    if (res.success) setBatches((res.data as any[]) ?? []);
    else toast.error((res as any).error || 'Failed to load batches');
    setBatchLoading(false);
  };
  const closeBatches = () => { setBatchMed(null); setBatches([]); setBatchMode('idle'); };

  const openAddBatch = () => {
    setBatchEditingId(null);
    setBatchForm(EMPTY_BATCH);
    setBatchMode('add');
  };
  const openEditBatch = (b: any) => {
    setBatchEditingId(b.id);
    setBatchForm({
      batch_no: b.batch_no ?? '',
      current_stock: Number(b.current_stock ?? 0),
      manufacture_date: formatDate(b.manufacture_date),
      expiry_date: formatDate(b.expiry_date),
      cost_price: Number(b.cost_price ?? 0),
      rack_location: b.rack_location ?? '',
      supplier_name: b.supplier_name ?? '',
    });
    setBatchMode('edit');
  };
  const closeBatchForm = () => { setBatchMode('idle'); setBatchEditingId(null); };

  const submitBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchMed) return;
    setBatchSubmitting(true);
    const payload = {
      medicine_id: batchMed.id,
      batch_no: batchForm.batch_no,
      current_stock: Number(batchForm.current_stock),
      manufacture_date: batchForm.manufacture_date ? toISODateTime(batchForm.manufacture_date) : '',
      expiry_date: toISODateTime(batchForm.expiry_date),
      cost_price: Number(batchForm.cost_price),
      rack_location: batchForm.rack_location,
      supplier_name: batchForm.supplier_name,
    };
    const res = batchMode === 'add'
      ? await addBatch(payload)
      : await updateBatch(batchEditingId!, payload);
    if (res.success) {
      toast.success(batchMode === 'add' ? 'Batch added' : 'Batch updated');
      closeBatchForm();
      const reloaded = await listBatches(batchMed.id);
      if (reloaded.success) setBatches((reloaded.data as any[]) ?? []);
      load();
    } else {
      toast.error((res as any).error || 'Failed');
    }
    setBatchSubmitting(false);
  };

  const today = new Date();
  const thirtyDaysOut = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text" value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by brand, generic, category"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <MasterImportButton type="medicine_master" onImportComplete={load} />
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Add Medicine
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80">
              {['Brand Name', 'Generic', 'Form / Strength', 'MRP (₹)', 'Selling (₹)', 'GST %', 'Stock', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={9} className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-gray-400">No medicines found</td></tr>
            ) : rows.map(r => {
              const hasExpiringSoon = r.batches?.some((b: any) => {
                const exp = new Date(b.expiry_date);
                return exp > today && exp <= thirtyDaysOut;
              });
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">{r.brand_name}</td>
                  <td className="px-4 py-3 text-gray-600">{r.generic_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {[r.form, r.strength].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">₹{Number(r.mrp).toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-600">₹{Number(r.selling_price).toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-600">{Number(r.gst_percent).toFixed(0)}%</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span>{r.total_stock}</span>
                      {r.total_stock < r.min_threshold && (
                        <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full w-fit">Low Stock</span>
                      )}
                      {hasExpiringSoon && (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full w-fit">Expiring Soon</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold ${r.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Edit">
                      <Pencil className="h-4 w-4 text-blue-600" />
                    </button>
                    <button onClick={() => openBatches(r)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Batches">
                      <Layers className="h-4 w-4 text-indigo-600" />
                    </button>
                    {r.is_active && (
                      <button onClick={() => deactivate(r.id)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Deactivate">
                        <PowerOff className="h-4 w-4 text-red-600" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <span className="text-xs text-gray-500">
              Showing {(page - 1) * PAGE_LIMIT + 1}–{Math.min(page * PAGE_LIMIT, total)} of {total}
            </span>
            <div className="flex gap-2 items-center">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-medium">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Medicine Create/Edit Modal */}
      {medMode !== 'idle' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{medMode === 'create' ? 'Add Medicine' : 'Edit Medicine'}</h2>
            <form onSubmit={submitMed} className="grid grid-cols-2 gap-4">
              {[
                { k: 'brand_name', label: 'Brand Name', required: true, type: 'text' },
                { k: 'generic_name', label: 'Generic Name', type: 'text' },
                { k: 'category', label: 'Category', type: 'text' },
                { k: 'manufacturer', label: 'Manufacturer', type: 'text' },
                { k: 'form', label: 'Form (tablet, syrup, injection…)', type: 'text' },
                { k: 'strength', label: 'Strength', type: 'text' },
                { k: 'mrp', label: 'MRP (₹)', required: true, type: 'number' },
                { k: 'purchase_price', label: 'Purchase Price (₹)', required: true, type: 'number' },
                { k: 'selling_price', label: 'Selling Price (₹)', required: true, type: 'number' },
                { k: 'gst_percent', label: 'GST %', type: 'number' },
                { k: 'min_threshold', label: 'Min Stock Threshold', type: 'number' },
                { k: 'hsn_sac_code', label: 'HSN / SAC Code', type: 'text' },
              ].map(f => (
                <div key={f.k}>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    {f.label}{f.required && ' *'}
                  </label>
                  <input
                    type={f.type} required={f.required}
                    value={medForm[f.k] ?? ''}
                    onChange={e => setMedForm((p: any) => ({ ...p, [f.k]: e.target.value }))}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              ))}
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!medForm.is_active}
                  onChange={e => setMedForm((p: any) => ({ ...p, is_active: e.target.checked }))} />
                Active
              </label>
              <div className="col-span-2 flex gap-3 mt-2">
                <button type="button" onClick={closeMed}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Modal */}
      {batchMed && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-4xl shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Batches for {batchMed.brand_name}</h2>
              <button onClick={closeBatches}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 font-semibold hover:bg-gray-50">
                Close
              </button>
            </div>

            {batchLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : (
              <>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/80">
                        {['Batch No', 'Stock', 'Manufacture Date', 'Expiry Date', 'Cost Price', 'Rack', 'Supplier', ''].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {batches.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-8 text-gray-400">No batches yet</td></tr>
                      ) : batches.map(b => (
                        <tr key={b.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 font-medium text-gray-900">{b.batch_no}</td>
                          <td className="px-3 py-2.5 text-gray-600">{b.current_stock}</td>
                          <td className="px-3 py-2.5 text-gray-600">{formatDate(b.manufacture_date) || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-600">{formatDate(b.expiry_date)}</td>
                          <td className="px-3 py-2.5 text-gray-600">{b.cost_price != null ? `₹${Number(b.cost_price).toFixed(2)}` : '—'}</td>
                          <td className="px-3 py-2.5 text-gray-600">{b.rack_location || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-600">{b.supplier_name || '—'}</td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => openEditBatch(b)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Edit batch">
                              <Pencil className="h-3.5 w-3.5 text-blue-600" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {batchMode === 'idle' && (
                  <button onClick={openAddBatch}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">
                    <Plus className="h-4 w-4" /> Add Batch
                  </button>
                )}

                {(batchMode === 'add' || batchMode === 'edit') && (
                  <div className="border border-gray-200 rounded-xl p-4 mt-2">
                    <h3 className="text-sm font-bold text-gray-800 mb-3">
                      {batchMode === 'add' ? 'New Batch' : 'Edit Batch'}
                    </h3>
                    <form onSubmit={submitBatch} className="grid grid-cols-2 gap-3">
                      {[
                        { k: 'batch_no', label: 'Batch No', required: true, type: 'text' },
                        { k: 'current_stock', label: 'Current Stock', required: true, type: 'number' },
                        { k: 'manufacture_date', label: 'Manufacture Date', type: 'date' },
                        { k: 'expiry_date', label: 'Expiry Date', required: true, type: 'date' },
                        { k: 'cost_price', label: 'Cost Price (₹)', type: 'number' },
                        { k: 'rack_location', label: 'Rack Location', type: 'text' },
                        { k: 'supplier_name', label: 'Supplier Name', type: 'text' },
                      ].map(f => (
                        <div key={f.k}>
                          <label className="block text-xs font-bold text-gray-600 mb-1">
                            {f.label}{f.required && ' *'}
                          </label>
                          <input
                            type={f.type} required={f.required}
                            value={batchForm[f.k] ?? ''}
                            onChange={e => setBatchForm((p: any) => ({ ...p, [f.k]: e.target.value }))}
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      ))}
                      <div className="col-span-2 flex gap-3 mt-1">
                        <button type="button" onClick={closeBatchForm}
                          className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 text-sm">
                          Cancel
                        </button>
                        <button type="submit" disabled={batchSubmitting}
                          className="flex-1 py-2 px-4 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 text-sm">
                          {batchSubmitting ? 'Saving…' : 'Save Batch'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
