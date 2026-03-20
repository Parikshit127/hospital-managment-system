'use client';

import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    hover?: boolean;
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
};

export function Card({ children, className = '', hover = false, padding = 'md' }: CardProps) {
    return (
        <div
            className={`bg-white rounded-2xl border border-gray-200/60 shadow-[var(--shadow-card)] ${paddingMap[padding]} ${hover ? 'hover:shadow-[var(--shadow-card-hover)] hover:border-gray-200 transition-all duration-200' : ''} ${className}`}
        >
            {children}
        </div>
    );
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={`pb-4 border-b border-gray-100/80 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <h3 className={`text-sm font-bold text-gray-900 tracking-tight ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <p className={`text-xs text-gray-500 mt-1 leading-relaxed ${className}`}>{children}</p>;
}
