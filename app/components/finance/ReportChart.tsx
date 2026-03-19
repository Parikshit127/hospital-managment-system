'use client';

import {
    Chart as ChartJS,
    CategoryScale, LinearScale, BarElement, PointElement, LineElement,
    ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

const PALETTE = [
    'rgba(26, 171, 116, 0.8)', 'rgba(15, 143, 94, 0.8)', 'rgba(52, 196, 138, 0.8)',
    'rgba(139, 92, 246, 0.7)', 'rgba(251, 146, 60, 0.7)', 'rgba(236, 72, 153, 0.7)',
    'rgba(59, 130, 246, 0.7)', 'rgba(234, 179, 8, 0.7)',
];

interface ReportChartProps {
    type: 'bar' | 'line' | 'pie' | 'doughnut';
    labels: string[];
    datasets: { label: string; data: number[]; color?: string }[];
    height?: number;
}

export function ReportChart({ type, labels, datasets, height = 300 }: ReportChartProps) {
    const chartData = {
        labels,
        datasets: datasets.map((ds, i) => ({
            label: ds.label,
            data: ds.data,
            backgroundColor: ds.color || (type === 'pie' || type === 'doughnut' ? PALETTE : PALETTE[i % PALETTE.length]),
            borderColor: ds.color || PALETTE[i % PALETTE.length],
            borderWidth: type === 'line' ? 2 : 0,
            borderRadius: type === 'bar' ? 6 : 0,
            tension: 0.3,
            fill: type === 'line' ? { target: 'origin', above: `${PALETTE[i % PALETTE.length].replace('0.8', '0.1')}` } : false,
            pointRadius: type === 'line' ? 4 : 0,
            pointBackgroundColor: PALETTE[i % PALETTE.length],
        })),
    };

    const options: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: datasets.length > 1 || type === 'pie' || type === 'doughnut',
                position: 'bottom' as const,
                labels: { padding: 16, usePointStyle: true, pointStyle: 'circle', font: { size: 11, weight: 600 } },
            },
            tooltip: {
                backgroundColor: 'rgba(14, 32, 24, 0.9)',
                titleFont: { size: 12, weight: 700 },
                bodyFont: { size: 11 },
                padding: 10,
                cornerRadius: 8,
                callbacks: {
                    label: (ctx: any) => {
                        const val = ctx.parsed?.y ?? ctx.parsed ?? ctx.raw;
                        return `${ctx.dataset.label}: ₹${Number(val).toLocaleString('en-IN')}`;
                    },
                },
            },
        },
        scales: type === 'bar' || type === 'line' ? {
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: {
                grid: { color: 'rgba(0,0,0,0.05)' },
                ticks: { font: { size: 11 }, callback: (v: number) => `₹${(v / 1000).toFixed(0)}K` },
            },
        } : undefined,
    };

    const ChartComponent = { bar: Bar, line: Line, pie: Pie, doughnut: Doughnut }[type];

    return (
        <div style={{ height }}>
            <ChartComponent data={chartData} options={options} />
        </div>
    );
}
