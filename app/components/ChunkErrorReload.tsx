'use client';

import { useEffect } from 'react';

/**
 * After a deploy, Next.js emits new content-hashed chunk filenames and deletes
 * the old ones. Any browser tab still holding a previous build's HTML then 404s
 * on its old chunks → "ChunkLoadError" / a blank "client-side exception" page.
 *
 * This catches that specific error globally and does a ONE-TIME hard reload to
 * fetch the current build. A short time-based guard prevents reload loops if a
 * reload doesn't resolve it (e.g. offline).
 */
export function ChunkErrorReload() {
    useEffect(() => {
        const KEY = '__chunk_reload_at__';
        const isChunkError = (msg?: string) =>
            !!msg &&
            /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to load chunk|error loading dynamically imported module|importing a module script failed/i.test(
                msg,
            );

        const maybeReload = (msg?: string) => {
            if (!isChunkError(msg)) return;
            const last = Number(sessionStorage.getItem(KEY) || 0);
            // Reload at most once per 15s so a persistent failure can't loop.
            if (Date.now() - last > 15000) {
                sessionStorage.setItem(KEY, String(Date.now()));
                window.location.reload();
            }
        };

        const onError = (e: ErrorEvent) => maybeReload(e?.message || String(e?.error || ''));
        const onRejection = (e: PromiseRejectionEvent) =>
            maybeReload(e?.reason?.message || String(e?.reason || ''));

        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);
        return () => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
        };
    }, []);

    return null;
}
