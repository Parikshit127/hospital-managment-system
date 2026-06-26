'use client';

import { useEffect, useState } from 'react';
import { hasInventoryCapability, type InventoryCapability } from '@/app/lib/inventory-rbac';

export function useInventorySession() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/session')
      .then((r) => r.json())
      .then((s) => { setRole(s?.role || null); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const can = (cap: InventoryCapability) => (role ? hasInventoryCapability(role, cap) : false);

  return { role, loading, can };
}
