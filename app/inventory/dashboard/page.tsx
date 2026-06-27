'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity, Package, Warehouse, ClipboardList, ShoppingCart,
  AlertTriangle, ArrowUpRight, Loader2, TrendingUp, Boxes,
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { getInventoryDashboardStats } from '@/app/actions/inventory-actions';
import { SkeletonCard } from '@/app/components/ui/Skeleton';
import { INVENTORY_DASHBOARD_MODULES, INVENTORY_MODULE_GROUPS } from '../inventory-nav';
import { useInventorySession } from '../components/useInventorySession';
import { inventoryNavForRole } from '../inventory-nav';

export default function InventoryDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { role, can } = useInventorySession();

  const allowedHrefs = new Set(role ? inventoryNavForRole(role).map((m) => m.href) : []);
  const roleModules = INVENTORY_DASHBOARD_MODULES.filter((m) => allowedHrefs.has(m.href));

  const load = async () => {
    setLoading(true);
    const res = await getInventoryDashboardStats();
    if (res.success) setData(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const kpis = data ? [
    can('manage_stores') && {
      label: 'Active Stores',
      value: data.storeCount,
      sub: 'Configured store locations',
      icon: Warehouse,
      color: 'text-teal-600',
      bg: 'bg-teal-50',
      link: '/inventory/stores',
    },
    (can('propose_items') || can('approve_items')) && {
      label: 'Active Items',
      value: data.itemCount,
      sub: 'Items in item master',
      icon: Package,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      link: '/inventory/items',
    },
    can('view_stock') && {
      label: 'Stock Value',
      value: `₹${Number(data.totalStockValue).toLocaleString('en-IN')}`,
      sub: `${data.lowStockCount ?? 0} below reorder point`,
      icon: TrendingUp,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      link: '/inventory/stock',
    },
    (can('raise_indent') || can('approve_indent')) && {
      label: 'Pending Indents',
      value: data.pendingIndents,
      sub: `${data.openPRs ?? 0} open purchase requisitions`,
      icon: ClipboardList,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      link: '/inventory/indents',
    },
  ].filter(Boolean) as Array<{
    label: string; value: string | number; sub: string; icon: typeof Warehouse;
    color: string; bg: string; link: string;
  }> : [];

  const modulesByGroup = INVENTORY_MODULE_GROUPS.map((group) => ({
    ...group,
    items: roleModules.filter((m) => m.group === group.key),
  })).filter((g) => g.items.length > 0);

  return (
    <AppShell
      pageTitle="Inventory Dashboard"
      pageIcon={<Activity className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
    >
      {/* Hero */}
      <div className="mb-6 rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 via-emerald-50 to-white p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-600 mb-1">
              Materials Management
            </p>
            <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">
              Inventory Control Center
            </h2>
            <p className="text-sm text-gray-500 mt-1 max-w-xl">
              Stores, stock ledger, indents, procurement, physical counts, and GL reconciliation — all in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {can('create_po') && (
              <Link href="/inventory/procurement?tab=po" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold shadow-sm hover:from-teal-600 hover:to-emerald-700 transition-all">
                <ShoppingCart className="h-4 w-4" /> New PO / GRN
              </Link>
            )}
            {can('raise_indent') && (
              <Link href="/inventory/indents" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-teal-200 text-teal-700 text-sm font-bold hover:bg-teal-50 transition-all">
                <ClipboardList className="h-4 w-4" /> Raise Indent
              </Link>
            )}
            {can('propose_items') && (
              <Link href="/inventory/items" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-teal-200 text-teal-700 text-sm font-bold hover:bg-teal-50 transition-all">
                <Package className="h-4 w-4" /> Item Master
              </Link>
            )}
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <Link
                  key={kpi.label}
                  href={kpi.link}
                  className="bg-white border border-gray-200 hover:border-teal-400 transition-all rounded-2xl p-5 group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-2.5 rounded-xl ${kpi.bg}`}>
                      <Icon className={`h-5 w-5 ${kpi.color}`} />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-teal-500 transition-colors" />
                  </div>
                  <p className="text-2xl font-black text-gray-900 tracking-tight">{kpi.value}</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">{kpi.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
                </Link>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Low Stock Alerts */}
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-gray-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Low Stock Alerts
                </h3>
                <Link href="/inventory/reports" className="text-[10px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                  View Reports <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              {data.lowStockItems?.length > 0 ? (
                <div className="space-y-2">
                  {data.lowStockItems.map((item: any) => (
                    <Link
                      key={item.id}
                      href="/inventory/stock"
                      className="flex justify-between items-center p-3 bg-red-50 border border-red-100 rounded-xl hover:border-red-200 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-bold text-gray-800">{item.name}</p>
                        <p className="text-[10px] text-gray-500">{item.item_code} · ROP: {item.reorder_point}</p>
                      </div>
                      <span className="text-xs font-black text-red-600">LOW</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 py-8 text-center">All items above reorder point</p>
              )}
              <div className="mt-4 flex flex-wrap gap-4 text-xs font-bold text-gray-500">
                <span className="text-amber-600">{data.lowStockCount} below ROP</span>
                <span className="text-orange-600">{data.expiringBatches} expiring (90d)</span>
              </div>
            </div>

            {/* Summary panel */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <h3 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
                <Boxes className="h-4 w-4 text-teal-500" /> At a Glance
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'Open PRs', value: data.openPRs ?? 0, href: '/inventory/procurement' },
                  { label: 'Pending Indents', value: data.pendingIndents ?? 0, href: '/inventory/indents' },
                  { label: 'Expiring Batches (90d)', value: data.expiringBatches ?? 0, href: '/inventory/reports' },
                  { label: 'Low Stock Items', value: data.lowStockCount ?? 0, href: '/inventory/stock' },
                ].map((row) => (
                  <Link
                    key={row.label}
                    href={row.href}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-teal-200 hover:bg-teal-50/30 transition-all"
                  >
                    <span className="text-sm font-medium text-gray-600">{row.label}</span>
                    <span className="text-sm font-black text-gray-900">{row.value}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Module Grid */}
          <div className="mb-6">
            <h3 className="text-sm font-black text-gray-700 mb-4">All Modules</h3>
            <div className="space-y-6">
              {modulesByGroup.map((group) => (
                <div key={group.key}>
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400 mb-3">{group.label}</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {group.items.map((mod) => {
                      const Icon = mod.icon;
                      return (
                        <Link
                          key={mod.href}
                          href={mod.href}
                          className="flex flex-col gap-2 p-4 rounded-2xl border border-gray-200 bg-white hover:border-teal-300 hover:bg-teal-50/20 transition-all group"
                        >
                          <div className="flex items-start justify-between">
                            <div className="p-2 rounded-lg bg-teal-50">
                              <Icon className="h-4 w-4 text-teal-600" />
                            </div>
                            <ArrowUpRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-teal-500 transition-colors" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-800">{mod.label}</p>
                            {mod.desc && (
                              <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{mod.desc}</p>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Movements */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-gray-700">Recent Movements</h3>
              <Link href="/inventory/stock" className="text-[10px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                Full Ledger <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
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
