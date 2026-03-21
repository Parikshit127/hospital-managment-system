'use client';

import { useMemo } from 'react';

interface FormattedDateProps {
    date: string | Date;
    timezone?: string;
    format?: 'datetime' | 'date' | 'time';
    className?: string;
}

const DEFAULT_TZ = 'Asia/Kolkata';

export function FormattedDate({ date, timezone = DEFAULT_TZ, format = 'datetime', className }: FormattedDateProps) {
    const formatted = useMemo(() => {
        const d = typeof date === 'string' ? new Date(date) : date;
        if (isNaN(d.getTime())) return '—';

        if (format === 'date') {
            return d.toLocaleDateString('en-IN', {
                timeZone: timezone,
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            });
        }
        if (format === 'time') {
            return d.toLocaleTimeString('en-IN', {
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            });
        }
        return d.toLocaleString('en-IN', {
            timeZone: timezone,
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
    }, [date, timezone, format]);

    return <span className={className}>{formatted}</span>;
}
