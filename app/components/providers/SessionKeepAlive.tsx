'use client';

import { useEffect, useRef } from 'react';

/**
 * Keeps an actively-used session from expiring mid-form.
 *
 * WHY: proxy.ts expires staff sessions after 15 minutes of inactivity, but it
 * measures activity by *server requests* (it refreshes the `last_activity`
 * cookie on each request that passes through it). Filling in a long form —
 * a multi-line purchase order, a discharge summary — is pure client-side state
 * and issues no requests, so the session died while the user was demonstrably
 * working. The submit then 307'd to /login and their work was lost behind an
 * opaque "An unexpected response was received from the server".
 *
 * HOW: we ping /api/keepalive (which runs the proxy, refreshing last_activity)
 * at most once every PING_INTERVAL_MS, and ONLY when the user has actually
 * interacted since the last ping.
 *
 * That last condition is deliberate and load-bearing: a blind timer would keep
 * every open tab logged in forever and defeat the idle timeout, which is a
 * security control on a system holding patient data. Here, a machine left
 * unattended sends no pings and still times out at 15 minutes exactly as
 * before; only a user who is genuinely typing stays signed in.
 *
 * Interaction is keydown/pointerdown/touchstart — deliberate intent. Mousemove
 * is excluded: a nudged desk or a resting hand shouldn't hold a session open.
 */

const PING_INTERVAL_MS = 5 * 60 * 1000; // well inside the 15-min server timeout

export function SessionKeepAlive() {
    const interactedRef = useRef(false);

    useEffect(() => {
        const markInteraction = () => { interactedRef.current = true; };

        const events: (keyof WindowEventMap)[] = ['keydown', 'pointerdown', 'touchstart'];
        events.forEach((e) => window.addEventListener(e, markInteraction, { passive: true }));

        const timer = setInterval(() => {
            // Nothing since the last tick → let the idle timeout do its job.
            if (!interactedRef.current) return;
            // Tab hidden → treat as away, even if a stray event fired.
            if (document.visibilityState === 'hidden') return;
            interactedRef.current = false;
            // Fire-and-forget: a failed ping must never surface to the user or
            // break the page. If the session is genuinely gone, the next real
            // action surfaces that normally.
            fetch('/api/keepalive', { method: 'GET', cache: 'no-store', credentials: 'same-origin' })
                .catch(() => { /* offline / transient — ignore */ });
        }, PING_INTERVAL_MS);

        return () => {
            events.forEach((e) => window.removeEventListener(e, markInteraction));
            clearInterval(timer);
        };
    }, []);

    return null;
}

export default SessionKeepAlive;
