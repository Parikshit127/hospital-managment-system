'use client';

import React, { useEffect, useState } from 'react';
import { BarChart3, PieChart, Loader2, Truck, Clock } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { getInventoryAnalytics, getStockOnHand } from '@/app/actions/inventory-actions';
import {
  getExpiryRegister,
  getStockAging,
  getVendorPerformance,
  getIndentFulfillmentSLA,
  getABCVEDMatrix,
  runReorderEngine,
} from '@/app/actions/inventory-analytics-actions';
import { InventoryKpiCard, cardCls } from '../components/InventoryUI';

export default function InventoryReportsPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [stockValue, setStockValue] = useState(0);
  const [expiry, setExpiry] = useState<any[]>([]);
  const [aging, setAging] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [sla, setSla] = useState<any>(null);
  const [matrix, setMatrix] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [aRes, sRes, eRes, agRes, vRes, slaRes, mRes] = await Promise.all([
      getInventoryAnalytics(),
      getStockOnHand(),
      getExpiryRegister(90),
      getStockAging(90),
      getVendorPerformance(),
      getIndentFulfillmentSLA(),
      getABCVEDMatrix(),
    ]);
    if (aRes.success) setAnalytics(aRes.data);
    if (sRes.success) setStockValue(Math.round((sRes.data as any[]).reduce((sum, r) => sum + (r.value || 0), 0)));
    if (eRes.success) setExpiry(eRes.data as any[]);
    if (agRes.success) setAging(agRes.data as any[]);
    if (vRes.success) setVendors(vRes.data as any[]);
    if (slaRes.success) setSla(slaRes.data);
    if (mRes.success) setMatrix(mRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <AppShell
      pageTitle="Inventory Analytics"
      pageIcon={<BarChart3 className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
      headerActions={
        <button onClick={() => runReorderEngine().then(load)} className="text-xs font-bold text-teal-600 px-3 py-2 border border-teal-200 rounded-xl hover:bg-teal-50">
          Run Reorder Engine
        </button>
      }
    >
      {loading && !analytics ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-teal-500" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <InventoryKpiCard label="Stock Value" value={`₹${stockValue.toLocaleString('en-IN')}`} icon={BarChart3} />
            <InventoryKpiCard label="Annual Consumption" value={`₹${(analytics?.totalConsumption || 0).toLocaleString('en-IN')}`} icon={PieChart} color="text-violet-600" bg="bg-violet-50" />
            <InventoryKpiCard label="Indent SLA (avg hrs)" value={sla?.avg_hours ?? '—'} icon={Clock} color="text-amber-600" bg="bg-amber-50" />
            <InventoryKpiCard label="Slow-moving SKUs" value={aging.length} icon={PieChart} color="text-red-600" bg="bg-red-50" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className={`${cardCls} p-6`}>
              <h3 className="text-sm font-black text-gray-700 mb-4">ABC / VED Matrix</h3>
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold">
                {Object.entries(matrix?.matrix || {}).map(([k, v]) => (
                  <div key={k} className="p-3 bg-gray-50 rounded-xl">
                    <p className="text-gray-500">{k}</p>
                    <p className="text-lg font-black text-teal-700">{v as number}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${cardCls} p-6`}>
              <h3 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2"><Truck className="h-4 w-4" /> Vendor Performance</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {vendors.slice(0, 8).map((v) => (
                  <div key={v.vendor_id} className="flex justify-between p-2 bg-gray-50 rounded-lg text-sm">
                    <span className="font-bold truncate">{v.vendor_name}</span>
                    <span className="text-teal-700 font-black">{v.fill_rate}% fill</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`${cardCls} p-6`}>
            <h3 className="text-sm font-black text-gray-700 mb-4">Expiry Register (90 days)</h3>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold text-gray-400 uppercase">
                    <th className="pb-2 pr-4">Item</th>
                    <th className="pb-2 pr-4">Batch</th>
                    <th className="pb-2">Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {expiry.map((b) => (
                    <tr key={b.id} className="border-t border-gray-100">
                      <td className="py-2 pr-4">{b.item_master?.name}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{b.batch_no}</td>
                      <td className="py-2">{b.expiry_date ? new Date(b.expiry_date).toLocaleDateString('en-IN') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
