'use client';

import React, { useState } from 'react';
import { ScanLine } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { lookupBarcode } from '@/app/actions/inventory-analytics-actions';
import { inputCls, cardCls } from '../components/InventoryUI';

export default function InventoryBarcodePage() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const scan = async () => {
    setError('');
    setResult(null);
    const res = await lookupBarcode(code);
    if (res.success) setResult(res.data);
    else setError(res.error || 'Not found');
  };

  return (
    <AppShell pageTitle="Barcode / QR Scan" pageIcon={<ScanLine className="h-5 w-5" />}>
      <div className={`${cardCls} p-6 max-w-lg space-y-4`}>
        <p className="text-sm text-gray-500">Scan EAN, item code, or batch number. Hardware scanners work as keyboard input.</p>
        <input
          className={inputCls}
          placeholder="Scan or type code..."
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && scan()}
          autoFocus
        />
        <button onClick={scan} className="w-full py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl">
          Lookup
        </button>
        {error && <p className="text-sm text-red-600 font-bold">{error}</p>}
        {result?.type === 'item' && (
          <div className="p-4 bg-teal-50 rounded-xl border border-teal-100">
            <p className="font-black text-lg">{result.item.name}</p>
            <p className="text-xs font-mono text-teal-700">{result.item.item_code}</p>
            <p className="text-sm mt-2">Stock locations:</p>
            {result.stocks?.map((s: any) => (
              <p key={s.id} className="text-xs">{s.stores?.name}: {s.quantity_on_hand} @ ₹{s.avg_unit_cost}</p>
            ))}
          </div>
        )}
        {result?.type === 'batch' && (
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
            <p className="font-bold">Batch {result.batch.batch_no}</p>
            <p className="text-sm">{result.item?.name}</p>
            <p className="text-xs">Expiry: {result.batch.expiry_date ? new Date(result.batch.expiry_date).toLocaleDateString('en-IN') : 'N/A'}</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
