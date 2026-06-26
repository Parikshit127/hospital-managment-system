'use client';

import { Suspense } from 'react';
import ProcurementClient from './ProcurementClient';

export default function InventoryProcurementPage() {
  return (
    <Suspense fallback={null}>
      <ProcurementClient />
    </Suspense>
  );
}
