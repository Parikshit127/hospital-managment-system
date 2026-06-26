'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Package, Plus, Search, Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
  listItems,
  listItemCategories,
  createItem,
  approveItem,
} from '@/app/actions/item-master-actions';
import {
  StatusBadge,
  btnPrimary,
  btnSecondary,
  inputCls,
  cardCls,
} from '../components/InventoryUI';
import { ITEM_TYPES } from '@/app/lib/inventory-roles';
import { useDebouncedValue } from '@/app/lib/hooks/useDebouncedValue';

export default function InventoryItemsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    category_id: '',
    item_type: 'CONSUMABLE',
    base_uom: 'Piece',
    purchase_uom: 'Piece',
    std_purchase_price: '',
    reorder_point: '',
    is_batch_tracked: false,
    is_expiry_tracked: false,
    ved_class: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [itemsRes, catRes] = await Promise.all([
      listItems({ query: debouncedSearch, limit: 100 }),
      listItemCategories(),
    ]);
    if (itemsRes.success) setItems(itemsRes.data as any[]);
    if (catRes.success) setCategories(catRes.data as any[]);
    setLoading(false);
  }, [debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.category_id) return alert('Select a category');
    setSaving(true);
    const res = await createItem({
      name: form.name,
      category_id: Number(form.category_id),
      item_type: form.item_type,
      base_uom: form.base_uom,
      purchase_uom: form.purchase_uom,
      std_purchase_price: Number(form.std_purchase_price) || 0,
      reorder_point: Number(form.reorder_point) || 0,
      is_batch_tracked: form.is_batch_tracked,
      is_expiry_tracked: form.is_expiry_tracked,
      ved_class: form.ved_class || undefined,
    });
    setSaving(false);
    if (res.success) {
      setModalOpen(false);
      setForm({ name: '', category_id: '', item_type: 'CONSUMABLE', base_uom: 'Piece', purchase_uom: 'Piece', std_purchase_price: '', reorder_point: '', is_batch_tracked: false, is_expiry_tracked: false, ved_class: '' });
      load();
    } else alert(res.error);
  };

  const handleApprove = async (id: number) => {
    const res = await approveItem(id);
    if (res.success) load();
    else alert(res.error);
  };

  return (
    <AppShell
      pageTitle="Item Master"
      pageIcon={<Package className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
      headerActions={
        <button onClick={() => setModalOpen(true)} className={btnPrimary}>
          <Plus className="h-4 w-4" /> New Item
        </button>
      }
    >
      <div className={cardCls}>
        <div className="p-4 border-b border-gray-200 bg-gray-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputCls} pl-9`}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/80">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">UOM</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-teal-700">{item.item_code}</td>
                  <td className="px-4 py-3 font-bold text-gray-800">{item.name}</td>
                  <td className="px-4 py-3 text-gray-600">{item.item_categories?.name}</td>
                  <td className="px-4 py-3 text-[10px] font-bold text-gray-500">{item.item_type}</td>
                  <td className="px-4 py-3 text-gray-600">{item.base_uom}</td>
                  <td className="px-4 py-3">
                    <span className={`font-black ${item.total_stock <= item.reorder_point && item.reorder_point > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {item.total_stock ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                  <td className="px-4 py-3">
                    {item.status === 'Draft' && (
                      <button onClick={() => handleApprove(item.id)} className="text-xs font-bold text-teal-600 hover:underline">
                        Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500">No items found. Create your first item.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center sticky top-0">
              <h3 className="font-bold text-gray-800">New Item</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <input required placeholder="Item name *" className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <select required className={inputCls} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">Select category *</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.item_type})</option>
                ))}
              </select>
              <select className={inputCls} value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value })}>
                {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input required placeholder="Base UOM *" className={inputCls} value={form.base_uom} onChange={(e) => setForm({ ...form, base_uom: e.target.value })} />
                <input placeholder="Purchase UOM" className={inputCls} value={form.purchase_uom} onChange={(e) => setForm({ ...form, purchase_uom: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" step="0.01" placeholder="Std purchase price" className={inputCls} value={form.std_purchase_price} onChange={(e) => setForm({ ...form, std_purchase_price: e.target.value })} />
                <input type="number" placeholder="Reorder point" className={inputCls} value={form.reorder_point} onChange={(e) => setForm({ ...form, reorder_point: e.target.value })} />
              </div>
              <select className={inputCls} value={form.ved_class} onChange={(e) => setForm({ ...form, ved_class: e.target.value })}>
                <option value="">VED class (optional)</option>
                <option value="V">V — Vital</option>
                <option value="E">E — Essential</option>
                <option value="D">D — Desirable</option>
              </select>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.is_batch_tracked} onChange={(e) => setForm({ ...form, is_batch_tracked: e.target.checked })} />
                  Batch tracked
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.is_expiry_tracked} onChange={(e) => setForm({ ...form, is_expiry_tracked: e.target.checked })} />
                  Expiry tracked
                </label>
              </div>
            </div>
            <div className="p-4 border-t flex gap-3 justify-end">
              <button type="button" onClick={() => setModalOpen(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={saving} className={btnPrimary}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Create Item
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
