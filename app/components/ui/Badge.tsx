'use client';

import React from 'react';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';

interface BadgeProps {
    children: React.ReactNode;
    variant?: BadgeVariant;
    size?: 'sm' | 'md';
    className?: string;
    dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 ring-1 ring-emerald-600/5',
    warning: 'bg-amber-50 text-amber-700 border-amber-200/60 ring-1 ring-amber-600/5',
    danger: 'bg-rose-50 text-rose-700 border-rose-200/60 ring-1 ring-rose-600/5',
    info: 'bg-sky-50 text-sky-700 border-sky-200/60 ring-1 ring-sky-600/5',
    neutral: 'bg-gray-50 text-gray-600 border-gray-200/60 ring-1 ring-gray-600/5',
    purple: 'bg-violet-50 text-violet-700 border-violet-200/60 ring-1 ring-violet-600/5',
};

const dotColors: Record<BadgeVariant, string> = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    info: 'bg-sky-500',
    neutral: 'bg-gray-400',
    purple: 'bg-violet-500',
};

export function Badge({ children, variant = 'neutral', size = 'sm', className = '', dot = false }: BadgeProps) {
    const sizeStyles = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1';

    return (
        <span
            className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${variantStyles[variant]} ${sizeStyles} ${className}`}
        >
            {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]} animate-[breathe_3s_ease-in-out_infinite]`} />}
            {children}
        </span>
    );
}
