'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
    message?: string;
    className?: string;
}

export function LoadingState({ message = 'Loading...', className = '' }: LoadingStateProps) {
    return (
        <div className={`flex flex-col items-center justify-center py-20 ${className}`}>
            <Loader2 className="h-7 w-7 animate-spin mb-3" style={{ color: 'var(--admin-primary)' }} />
            <p className="text-sm text-gray-500 font-medium">{message}</p>
        </div>
    );
}
