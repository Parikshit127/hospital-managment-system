'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `value` only after it has been stable for `delayMs`.
 * Replaces ad-hoc `useRef<NodeJS.Timeout>` debounce patterns scattered
 * across the pharmacy and admin pages.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 250): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(t);
    }, [value, delayMs]);
    return debounced;
}
