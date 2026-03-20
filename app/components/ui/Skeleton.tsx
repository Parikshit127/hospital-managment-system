'use client';

import React from 'react';

interface SkeletonProps {
    className?: string;
    width?: string;
    height?: string;
    rounded?: string;
}

export function Skeleton({ className = '', width, height, rounded = 'rounded-lg' }: SkeletonProps) {
    return (
        <div
            className={`shimmer ${rounded} ${className}`}
            style={{ width: width || '100%', height: height || '1rem' }}
        />
    );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
    return (
        <div className={`bg-white rounded-2xl border border-gray-100 p-5 space-y-3 ${className}`} style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center justify-between">
                <Skeleton width="60%" height="0.75rem" />
                <Skeleton width="2.5rem" height="2.5rem" rounded="rounded-xl" />
            </div>
            <Skeleton width="40%" height="1.75rem" />
            <Skeleton width="80%" height="0.625rem" />
        </div>
    );
}

export function SkeletonTable({ rows = 5, cols = 4, className = '' }: { rows?: number; cols?: number; className?: string }) {
    return (
        <div className={`bg-white rounded-2xl border border-gray-100 overflow-hidden ${className}`} style={{ boxShadow: 'var(--shadow-card)' }}>
            {/* Header */}
            <div className="border-b border-gray-100 px-5 py-3 flex gap-4">
                {Array.from({ length: cols }).map((_, i) => (
                    <Skeleton key={`h-${i}`} width={`${100 / cols}%`} height="0.75rem" />
                ))}
            </div>
            {/* Rows */}
            {Array.from({ length: rows }).map((_, r) => (
                <div key={`r-${r}`} className="border-b border-gray-50 px-5 py-3.5 flex gap-4 items-center">
                    {Array.from({ length: cols }).map((_, c) => (
                        <Skeleton
                            key={`r-${r}-c-${c}`}
                            width={`${100 / cols}%`}
                            height="0.625rem"
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

export function SkeletonKPIRow({ count = 4, className = '' }: { count?: number; className?: string }) {
    return (
        <div className={`grid gap-4 ${className}`} style={{ gridTemplateColumns: `repeat(${Math.min(count, 6)}, 1fr)` }}>
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonCard key={i} />
            ))}
        </div>
    );
}

export function DashboardSkeleton() {
    return (
        <div className="space-y-6 animate-in">
            <SkeletonKPIRow count={4} />
            <SkeletonTable rows={6} cols={5} />
        </div>
    );
}
