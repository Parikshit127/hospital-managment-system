'use client';

import { Activity, AlertTriangle } from 'lucide-react';

interface NEWSScoreBadgeProps {
    score: number | null | undefined;
    level?: string | null;
    showLabel?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

export function NEWSScoreBadge({ score, level, showLabel = true, size = 'md' }: NEWSScoreBadgeProps) {
    if (score == null) return null;

    const resolvedLevel =
        level ??
        (score === 0 ? 'Low' :
        score <= 4 ? 'Low' :
        score <= 6 ? 'Medium' :
        score <= 8 ? 'High' : 'Critical');

    const colorMap: Record<string, string> = {
        Low: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        Medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        High: 'bg-orange-100 text-orange-800 border-orange-200',
        Critical: 'bg-red-100 text-red-800 border-red-300',
    };

    const sizeMap = {
        sm: 'text-[9px] px-1.5 py-0.5 gap-0.5',
        md: 'text-[10px] px-2 py-0.5 gap-1',
        lg: 'text-xs px-2.5 py-1 gap-1',
    };

    const iconSize = size === 'lg' ? 'h-3.5 w-3.5' : 'h-3 w-3';
    const color = colorMap[resolvedLevel] ?? colorMap.Low;
    const Icon = resolvedLevel === 'Critical' || resolvedLevel === 'High' ? AlertTriangle : Activity;

    return (
        <span className={`inline-flex items-center font-black rounded-full border ${color} ${sizeMap[size]}`}>
            <Icon className={iconSize} />
            {showLabel ? `NEWS ${score} — ${resolvedLevel}` : `NEWS ${score}`}
        </span>
    );
}
