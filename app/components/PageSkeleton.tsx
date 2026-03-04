'use client';

import React from 'react';

interface PageSkeletonProps {
    type?: 'dashboard' | 'table' | 'form' | 'detail';
}

function SkeletonPulse({ className }: { className?: string }) {
    return <div className={`animate-pulse bg-gray-200 rounded-lg ${className || ''}`} />;
}

export function PageSkeleton({ type = 'dashboard' }: PageSkeletonProps) {
    if (type === 'dashboard') {
        return (
            <div className="space-y-6">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="bg-white border border-gray-200 rounded-2xl p-4">
                            <SkeletonPulse className="h-3 w-20 mb-3" />
                            <SkeletonPulse className="h-8 w-16" />
                        </div>
                    ))}
                </div>
                {/* Content area */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
                        <SkeletonPulse className="h-4 w-32" />
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="flex items-center gap-3">
                                <SkeletonPulse className="h-8 w-8 rounded-lg" />
                                <div className="flex-1 space-y-1.5">
                                    <SkeletonPulse className="h-3 w-3/4" />
                                    <SkeletonPulse className="h-2 w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
                        <SkeletonPulse className="h-4 w-28" />
                        <SkeletonPulse className="h-40 w-full rounded-xl" />
                    </div>
                </div>
            </div>
        );
    }

    if (type === 'table') {
        return (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <SkeletonPulse className="h-4 w-32" />
                    <SkeletonPulse className="h-8 w-24 rounded-xl" />
                </div>
                <div className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-center gap-4 px-2">
                        {[1, 2, 3, 4, 5].map(i => (
                            <SkeletonPulse key={i} className="h-3 flex-1" />
                        ))}
                    </div>
                    {/* Rows */}
                    {[1, 2, 3, 4, 5, 6, 7].map(i => (
                        <div key={i} className="flex items-center gap-4 px-2 py-2">
                            <SkeletonPulse className="h-4 w-4 rounded" />
                            {[1, 2, 3, 4, 5].map(j => (
                                <SkeletonPulse key={j} className="h-3 flex-1" />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (type === 'form') {
        return (
            <div className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
                <SkeletonPulse className="h-5 w-40 mb-2" />
                <div className="grid grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="space-y-1.5">
                            <SkeletonPulse className="h-2 w-16" />
                            <SkeletonPulse className="h-10 w-full rounded-xl" />
                        </div>
                    ))}
                </div>
                <div className="space-y-1.5">
                    <SkeletonPulse className="h-2 w-16" />
                    <SkeletonPulse className="h-24 w-full rounded-xl" />
                </div>
                <SkeletonPulse className="h-10 w-32 rounded-xl" />
            </div>
        );
    }

    // detail
    return (
        <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 flex items-center gap-4">
                <SkeletonPulse className="h-16 w-16 rounded-2xl" />
                <div className="space-y-2">
                    <SkeletonPulse className="h-5 w-48" />
                    <SkeletonPulse className="h-3 w-32" />
                </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
                <div className="flex gap-2">
                    {[1, 2, 3].map(i => (
                        <SkeletonPulse key={i} className="h-8 w-20 rounded-lg" />
                    ))}
                </div>
                <div className="grid grid-cols-2 gap-6">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="space-y-1.5">
                            <SkeletonPulse className="h-2 w-16" />
                            <SkeletonPulse className="h-4 w-32" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
