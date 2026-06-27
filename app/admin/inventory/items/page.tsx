'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Package, Search, Loader2, CheckCircle2 } from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { listItems, approveItem } from '@/app/actions/item-master-actions';
import { StatusBadge, btnPrimary, inputCls, cardCls } from '@/app/inventory/components/InventoryUI';
import { useDebouncedValue } from '@/app/lib/hooks/useDebouncedValue';

export default function AdminInventoryItemsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [filter, setFilter] = useState<'Draft' | 'all'>('Draft');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listItems({
      query: debouncedSearch,
      status: filter === 'Draft' ? 'Draft' : undefined,
      limit: 100,
    });
    if (res.success) setItems(res.data as any[]);
    setLoading(false);
  }, [debouncedSearch, filter]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: number) => {
    const res = await approveItem(id);
    if (res.success) load();
    else alert(res.error);
  };

  return (
    <AdminPage
      title="Inventory — Item Approvals"
      description="Maker-checker: approve draft items and finalize standard prices."
      icon={<Package className="h-5 w-5" />}
    >
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setFilter('Draft')} className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${filter === 'Draft' ? 'bg-teal-50 border-teal-200 text-teal-700' : 'border-gray-200'}`}>
          Pending Approval
        </button>
        <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${filter === 'all' ? 'bg-teal-50 border-teal-200 text-teal-700' : 'border-gray-200'}`}>
          All Items
        </button>
      </div>

      <div className={cardCls}>
        <div className="p-4 border-b border-gray-200 bg-gray-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} pl-9`} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold text-gray-400 uppercase bg-gray-50/80">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Purchase ₹</th>
                <th className="px-4 py-3">Selling ₹</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-teal-700">{item.item_code}</td>
                  <td className="px-4 py-3 font-bold">{item.name}</td>
                  <td className="px-4 py-3">{item.pending_std_purchase_price ?? item.std_purchase_price ?? 0}</td>
                  <td className="px-4 py-3">{item.pending_selling_price ?? item.selling_price ?? 0}</td>
                  <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                  <td className="px-4 py-3">
                    {item.status === 'Draft' && (
                      <button onClick={() => handleApprove(item.id)} className={btnPrimary}>
                        <CheckCircle2 className="h-4 w-4" /> Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">No items in this queue.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {loading && (
          <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-teal-500" /></div>
        )}
      </div>
    </AdminPage>
  );
}
