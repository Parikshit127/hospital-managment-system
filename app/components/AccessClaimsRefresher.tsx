'use client';

import { useEffect } from 'react';

/**
 * Keeps a signed-in user's access claims current (Company-OS, docs/COMPANY_OS_PLAN.md §7.5).
 *
 * Renders nothing and does nothing unless the session actually carries claims — i.e. only for units in `enforce`
 * mode. Every 5 minutes it asks the server to re-mint the claims; if the user's access changed (or the unit went
 * back to `legacy`) the page reloads so the sidebar and route gating reflect it.
 *
 * /api/auth/refresh is excluded from proxy.ts's matcher, so this background call does NOT count as user activity
 * and can never keep an idle session alive past the 15-minute timeout.
 */
export function AccessClaimsRefresher({ enabled }: { enabled: boolean }) {
    useEffect(() => {
        if (!enabled) return;
        const tick = async () => {
            try {
                const res = await fetch('/api/auth/refresh', { method: 'POST' });
                if (!res.ok) return;
                const body = await res.json();
                if (body?.status === 'updated') window.location.reload();
            } catch {
                /* transient — try again next tick */
            }
        };
        const t = setInterval(tick, 5 * 60 * 1000);
        return () => clearInterval(t);
    }, [enabled]);
    return null;
}
