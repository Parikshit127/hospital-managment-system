'use client';

import { useRef, useCallback, useEffect, useState } from 'react';

/**
 * Pull-to-refresh hook for mobile patient portal pages.
 * Returns a ref to attach to the scrollable container and a refreshing indicator.
 */
export function usePullToRefresh(onRefresh: () => unknown) {
    const [refreshing, setRefreshing] = useState(false);
    const startY = useRef(0);
    const pulling = useRef(false);

    const handleTouchStart = useCallback((e: TouchEvent) => {
        if (window.scrollY === 0) {
            startY.current = e.touches[0].clientY;
            pulling.current = true;
        }
    }, []);

    const handleTouchEnd = useCallback(async (e: TouchEvent) => {
        if (!pulling.current) return;
        pulling.current = false;
        const diff = e.changedTouches[0].clientY - startY.current;
        if (diff > 80) {
            setRefreshing(true);
            try {
                await onRefresh();
            } finally {
                setRefreshing(false);
            }
        }
    }, [onRefresh]);

    useEffect(() => {
        document.addEventListener('touchstart', handleTouchStart, { passive: true });
        document.addEventListener('touchend', handleTouchEnd);
        return () => {
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, [handleTouchStart, handleTouchEnd]);

    return { refreshing };
}
