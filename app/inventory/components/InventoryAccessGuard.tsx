'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { canAccessInventoryRoute } from '@/app/lib/inventory-rbac';

export function InventoryAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/session')
      .then((r) => r.json())
      .then((session) => {
        if (cancelled) return;
        if (!session?.role) {
          router.replace('/login');
          return;
        }
        if (!canAccessInventoryRoute(session.role, pathname)) {
          router.replace('/inventory/dashboard');
          return;
        }
        setReady(true);
      })
      .catch(() => router.replace('/login'));
    return () => { cancelled = true; };
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
      </div>
    );
  }
  return <>{children}</>;
}
