'use client';

import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
    icon?: React.ReactNode;
    title?: string;
    description?: string;
    action?: React.ReactNode;
    className?: string;
}

export function EmptyState({
    icon,
    title = 'No data found',
    description = 'There are no items to display.',
    action,
    className = '',
}: EmptyStateProps) {
    return (
        <div className={`flex flex-col items-center justify-center py-16 ${className}`}>
            <div className="p-4 rounded-2xl bg-gray-100 text-gray-400 mb-4">
                {icon || <Inbox className="h-8 w-8" />}
            </div>
            <h3 className="text-sm font-bold text-gray-700 mb-1">{title}</h3>
            <p className="text-xs text-gray-500 text-center max-w-xs">{description}</p>
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
