'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Warehouse, LayoutDashboard, Settings2, Package, ClipboardList,
  ShoppingCart, BarChart3, Loader2, ChevronRight, AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { ModuleHubLayout } from '../components/ModuleHubLayout';
import { getInventoryDashboardStats } from '@/app/actions/inventory-actions';
import { getItemMasterStats } from '@/app/actions/item-master-actions';
import { createItemCategory } from '@/app/actions/item-master-actions';
import { migrateLegacyInventory } from '@/app/actions/inventory-operations-actions';
import { ITEM_TYPES } from '@/app/lib/inventory-roles';
import { inputCls, btnPrimary } from '@/app/inventory/components/InventoryUI';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'settings', label: 'Settings', icon: Settings2 },
];

export default function AdminInventoryHub() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState<any>(null);
  const [itemStats, setItemStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [catForm, setCatForm] = useState({ name: '', item_type: 'CONSUMABLE' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, items] = await Promise.all([
        getInventoryDashboardStats(),
        getItemMasterStats(),
      ]);
      if (dash.success) setStats(dash.data);
      if (items.success) setItemStats(items.data);
    } catch (err) {
      console.error('Inventory load error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await createItemCategory(catForm);
    if (res.success) {
      setCatForm({ name: '', item_type: 'CONSUMABLE' });
      alert('Category created');
    } else alert(res.error);
  };

  const links = [
    { href: '/admin/inventory/items', label: 'Item Approvals', icon: Package, desc: 'Maker-checker draft items' },
    { href: '/inventory/items', label: 'Item Master', icon: Package, desc: 'Catalogue & categories' },
    { href: '/inventory/stores', label: 'Stores', icon: Warehouse, desc: 'Hierarchy & par levels' },
    { href: '/inventory/indents', label: 'Indents', icon: ClipboardList, desc: 'Internal supply chain' },
    { href: '/inventory/procurement', label: 'Procurement', icon: ShoppingCart, desc: 'PR & GRN' },
    { href: '/inventory/reports', label: 'Analytics', icon: BarChart3, desc: 'ABC/VED & valuation' },
  ];

  return (
    <ModuleHubLayout
      moduleKey="inventory"
      moduleTitle="Inventory Module"
      moduleDescription="Hospital-wide materials management — stores, procurement, indents & stock control"
      moduleIcon={<Warehouse className="h-5 w-5" />}
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onRefresh={activeTab === 'dashboard' ? loadData : undefined}
      refreshing={loading}
    >
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {loading && !stats ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Stores', value: stats?.storeCount ?? 0, color: 'text-teal-600' },
                  { label: 'Active Items', value: itemStats?.active ?? 0, color: 'text-blue-600' },
                  { label: 'Stock Value', value: `₹${(stats?.totalStockValue ?? 0).toLocaleString('en-IN')}`, color: 'text-violet-600' },
                  { label: 'Low Stock', value: stats?.lowStockCount ?? 0, color: 'text-red-600' },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                    <p className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">{kpi.label}</p>
                  </div>
                ))}
              </div>

              {stats?.lowStockCount > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <p className="text-sm font-bold text-red-700">{stats.lowStockCount} items below reorder point</p>
                  <Link href="/inventory/stock?low=1" className="ml-auto text-xs font-bold text-red-600 hover:underline">View →</Link>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {links.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-teal-300 transition-all group flex items-start gap-4"
                    >
                      <div className="p-3 rounded-xl bg-teal-50">
                        <Icon className="h-5 w-5 text-teal-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-800 group-hover:text-teal-700">{link.label}</h3>
                        <p className="text-xs text-gray-500 mt-1">{link.desc}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-teal-500 mt-1" />
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="max-w-lg space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h3 className="font-bold text-gray-800 mb-4">Add Item Category</h3>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <input required placeholder="Category name" className={inputCls} value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
              <select className={inputCls} value={catForm.item_type} onChange={(e) => setCatForm({ ...catForm, item_type: e.target.value })}>
                {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button type="submit" className={btnPrimary}>Create Category</button>
            </form>
          </div>
          <p className="text-xs text-gray-500">Configure GL account mapping per category in Finance settings. Module can be enabled/disabled using the toggle above.</p>
          <button
            onClick={async () => {
              const res = await migrateLegacyInventory();
              alert(res.success ? `Migrated ${res.data?.migrated} records` : res.error);
            }}
            className="text-xs font-bold text-amber-700 px-4 py-2 border border-amber-200 rounded-xl hover:bg-amber-50"
          >
            Migrate WardStock + Lab Reagents
          </button>
        </div>
      )}
    </ModuleHubLayout>
  );
}
