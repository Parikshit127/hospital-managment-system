'use client';

import { useEffect } from 'react';

/**
 * Deploy-resilience: after a deploy Next.js emits new content-hashed asset
 * filenames and deletes the old ones. During the build window (and for any tab
 * still holding a previous build's HTML) a request for an old asset 404s:
 *
 *   - a failed JS chunk  → "ChunkLoadError" / blank client-side-exception page
 *   - a failed CSS chunk → the page renders as raw, UNSTYLED HTML
 *
 * We catch both and do a ONE-TIME hard reload to fetch the current build. JS
 * chunk errors surface as window 'error'/'unhandledrejection' messages; CSS and
 * script <link>/<script> load failures do NOT bubble — they're only observable
 * on the element or in the capture phase — so we also listen in capture phase.
 * A short time-based guard prevents a runaway reload loop.
 */
export function ChunkErrorReload() {
    useEffect(() => {
        const KEY = '__chunk_reload_at__';

        // Guarded one-time reload (at most once per 15s per tab).
        const triggerReload = () => {
            const last = Number(sessionStorage.getItem(KEY) || 0);
            if (Date.now() - last > 15000) {
                sessionStorage.setItem(KEY, String(Date.now()));
                window.location.reload();
            }
        };

        const isChunkError = (msg?: string) =>
            !!msg &&
            /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to load chunk|error loading dynamically imported module|importing a module script failed/i.test(
                msg,
            );

        const onError = (e: ErrorEvent) => {
            if (isChunkError(e?.message || String(e?.error || ''))) triggerReload();
        };
        const onRejection = (e: PromiseRejectionEvent) => {
            if (isChunkError(e?.reason?.message || String(e?.reason || ''))) triggerReload();
        };

        // Capture-phase: a stylesheet or script asset from the current build
        // failed to load (deleted by a deploy / served mid-build). An unstyled
        // page is exactly a failed /_next/static CSS <link>. Reload to recover.
        const onResourceError = (e: Event) => {
            const t = e.target as HTMLElement | null;
            if (!t) return;
            const url =
                (t as HTMLLinkElement).href || (t as HTMLScriptElement).src || '';
            if ((t.tagName === 'LINK' || t.tagName === 'SCRIPT') && /\/_next\/static\//.test(url)) {
                triggerReload();
            }
        };

        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);
        window.addEventListener('error', onResourceError, true); // capture phase
        return () => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
            window.removeEventListener('error', onResourceError, true);
        };
    }, []);

    return null;
}
