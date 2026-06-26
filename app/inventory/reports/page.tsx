'use client';

import React, { useEffect, useState } from 'react';
import { BarChart3, PieChart, Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { getInventoryAnalytics, getStockOnHand } from '@/app/actions/inventory-actions';
import { InventoryKpiCard, cardCls } from '../components/InventoryUI';

export default function InventoryReportsPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [stockValue, setStockValue] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [aRes, sRes] = await Promise.all([
      getInventoryAnalytics(),
      getStockOnHand(),
    ]);
    if (aRes.success) setAnalytics(aRes.data);
    if (sRes.success) {
      const total = (sRes.data as any[]).reduce((sum, r) => sum + (r.value || 0), 0);
      setStockValue(Math.round(total));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <AppShell
      pageTitle="Inventory Reports"
      pageIcon={<BarChart3 className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
    >
      {loading && !analytics ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-teal-500" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <InventoryKpiCard label="Total Stock Value" value={`₹${stockValue.toLocaleString('en-IN')}`} icon={BarChart3} />
            <InventoryKpiCard label="Annual Consumption" value={`₹${(analytics?.totalConsumption || 0).toLocaleString('en-IN')}`} icon={PieChart} color="text-violet-600" bg="bg-violet-50" />
            <InventoryKpiCard label="ABC Unclassified" value={analytics?.abcSummary?.unclassified ?? 0} icon={PieChart} color="text-amber-600" bg="bg-amber-50" sub="Run analytics to classify" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`${cardCls} p-6`}>
              <h3 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
                <PieChart className="h-4 w-4 text-teal-500" /> ABC Analysis
              </h3>
              <div className="space-y-3">
                {['A', 'B', 'C'].map((cls) => (
                  <div key={cls} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm font-bold text-gray-700">Class {cls}</span>
                    <span className="text-xl font-black text-teal-700">{analytics?.abcSummary?.[cls] ?? 0} items</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-4">A = top 70% consumption value · B = next 20% · C = remaining 10%</p>
            </div>

            <div className={`${cardCls} p-6`}>
              <h3 className="text-sm font-black text-gray-700 mb-4">VED Matrix</h3>
              <div className="space-y-3">
                {[
                  { key: 'V', label: 'Vital', color: 'bg-red-50 text-red-700' },
                  { key: 'E', label: 'Essential', color: 'bg-amber-50 text-amber-700' },
                  { key: 'D', label: 'Desirable', color: 'bg-gray-50 text-gray-600' },
                ].map(({ key, label, color }) => (
                  <div key={key} className={`flex items-center justify-between p-3 rounded-xl ${color}`}>
                    <span className="text-sm font-bold">{label} ({key})</span>
                    <span className="text-xl font-black">{analytics?.vedSummary?.[key] ?? 0}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-4">VED tags set on item master; combine with ABC for control policy.</p>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
