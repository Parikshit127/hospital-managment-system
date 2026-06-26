'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity, Package, Warehouse, ClipboardList, ShoppingCart,
  AlertTriangle, ArrowUpRight, Loader2, TrendingUp, Truck,
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { getInventoryDashboardStats } from '@/app/actions/inventory-actions';
import { InventoryKpiCard } from '../components/InventoryUI';
import { SkeletonCard } from '@/app/components/ui/Skeleton';

export default function InventoryDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await getInventoryDashboardStats();
    if (res.success) setData(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const quickLinks = [
    { label: 'Item Master', href: '/inventory/items', icon: Package, desc: 'Catalogue & categories' },
    { label: 'Stores', href: '/inventory/stores', icon: Warehouse, desc: 'Store hierarchy' },
    { label: 'Stock', href: '/inventory/stock', icon: TrendingUp, desc: 'On-hand & ledger' },
    { label: 'Indents', href: '/inventory/indents', icon: ClipboardList, desc: 'Internal requisitions' },
    { label: 'Procurement', href: '/inventory/procurement', icon: ShoppingCart, desc: 'PR & GRN' },
    { label: 'Transfers', href: '/inventory/transfers', icon: Truck, desc: 'Inter-store moves' },
  ];

  return (
    <AppShell
      pageTitle="Inventory Dashboard"
      pageIcon={<Activity className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
    >
      {loading && !data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <InventoryKpiCard label="Active Stores" value={data.storeCount} icon={Warehouse} />
            <InventoryKpiCard label="Active Items" value={data.itemCount} icon={Package} color="text-blue-600" bg="bg-blue-50" />
            <InventoryKpiCard
              label="Stock Value"
              value={`₹${Number(data.totalStockValue).toLocaleString('en-IN')}`}
              icon={TrendingUp}
              color="text-violet-600"
              bg="bg-violet-50"
            />
            <InventoryKpiCard
              label="Pending Indents"
              value={data.pendingIndents}
              sub={`${data.openPRs} open PRs`}
              icon={ClipboardList}
              color="text-amber-600"
              bg="bg-amber-50"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6">
              <h3 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Low Stock Alerts
              </h3>
              {data.lowStockItems?.length > 0 ? (
                <div className="space-y-2">
                  {data.lowStockItems.map((item: any) => (
                    <div key={item.id} className="flex justify-between items-center p-3 bg-red-50 border border-red-100 rounded-xl">
                      <div>
                        <p className="text-sm font-bold text-gray-800">{item.name}</p>
                        <p className="text-[10px] text-gray-500">{item.item_code} · ROP: {item.reorder_point}</p>
                      </div>
                      <span className="text-xs font-black text-red-600">LOW</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 py-8 text-center">All items above reorder point</p>
              )}
              <div className="mt-4 flex gap-4 text-xs font-bold text-gray-500">
                <span className="text-amber-600">{data.lowStockCount} below ROP</span>
                <span className="text-orange-600">{data.expiringBatches} expiring (90d)</span>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <h3 className="text-sm font-black text-gray-700 mb-4">Quick Access</h3>
              <div className="space-y-2">
                {quickLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-teal-300 hover:bg-teal-50/30 transition-all group"
                    >
                      <div className="p-2 rounded-lg bg-teal-50">
                        <Icon className="h-4 w-4 text-teal-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800">{link.label}</p>
                        <p className="text-[10px] text-gray-400 truncate">{link.desc}</p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-teal-500" />
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h3 className="text-sm font-black text-gray-700 mb-4">Recent Movements</h3>
            {data.recentMovements?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                      <th className="pb-3 pr-4">Type</th>
                      <th className="pb-3 pr-4">Item</th>
                      <th className="pb-3 pr-4">Store</th>
                      <th className="pb-3 pr-4">In</th>
                      <th className="pb-3">Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentMovements.map((m: any) => (
                      <tr key={m.id} className="border-b border-gray-50">
                        <td className="py-2.5 pr-4 font-mono text-[10px] text-teal-700">{m.movement_type}</td>
                        <td className="py-2.5 pr-4">
                          <span className="font-bold text-gray-800">{m.item_master?.name}</span>
                          <span className="text-[10px] text-gray-400 ml-1">{m.item_master?.item_code}</span>
                        </td>
                        <td className="py-2.5 pr-4 text-gray-600">{m.stores?.name}</td>
                        <td className="py-2.5 pr-4 text-emerald-600 font-bold">{m.quantity_in || '—'}</td>
                        <td className="py-2.5 text-red-600 font-bold">{m.quantity_out || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-6 text-center">No movements recorded yet</p>
            )}
          </div>
        </>
      )}
      {loading && data && (
        <div className="fixed bottom-6 right-6">
          <Loader2 className="h-5 w-5 animate-spin text-teal-500" />
        </div>
      )}
    </AppShell>
  );
}
