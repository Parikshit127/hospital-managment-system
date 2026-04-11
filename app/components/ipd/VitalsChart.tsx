'use client';

import { useEffect, useRef } from 'react';
import {
    Chart,
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

interface VitalEntry {
    recorded_at: string;
    heart_rate?: number | null;
    bp_systolic?: number | null;
    bp_diastolic?: number | null;
    spo2?: number | null;
    temperature?: number | null;
    respiratory_rate?: number | null;
    news_score?: number | null;
}

interface VitalsChartProps {
    vitals: VitalEntry[];
    mode?: 'vitals' | 'news';
}

export function VitalsChart({ vitals, mode = 'vitals' }: VitalsChartProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<Chart | null>(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        chartRef.current?.destroy();

        const sorted = [...vitals].sort(
            (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
        );
        const labels = sorted.map(v => {
            const d = new Date(v.recorded_at);
            return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
        });

        const datasets =
            mode === 'news'
                ? [
                      {
                          label: 'NEWS Score',
                          data: sorted.map(v => v.news_score ?? null),
                          borderColor: '#ef4444',
                          backgroundColor: 'rgba(239,68,68,0.08)',
                          fill: true,
                          tension: 0.3,
                          pointRadius: 4,
                          pointBackgroundColor: sorted.map(v =>
                              (v.news_score ?? 0) >= 7 ? '#dc2626' :
                              (v.news_score ?? 0) >= 5 ? '#f97316' : '#22c55e'
                          ),
                      },
                  ]
                : [
                      {
                          label: 'Heart Rate',
                          data: sorted.map(v => v.heart_rate ?? null),
                          borderColor: '#ef4444',
                          backgroundColor: 'transparent',
                          tension: 0.3,
                          pointRadius: 3,
                      },
                      {
                          label: 'BP Systolic',
                          data: sorted.map(v => v.bp_systolic ?? null),
                          borderColor: '#3b82f6',
                          backgroundColor: 'transparent',
                          tension: 0.3,
                          pointRadius: 3,
                      },
                      {
                          label: 'BP Diastolic',
                          data: sorted.map(v => v.bp_diastolic ?? null),
                          borderColor: '#93c5fd',
                          backgroundColor: 'transparent',
                          tension: 0.3,
                          borderDash: [4, 2],
                          pointRadius: 2,
                      },
                      {
                          label: 'SpO₂ %',
                          data: sorted.map(v => v.spo2 ?? null),
                          borderColor: '#10b981',
                          backgroundColor: 'transparent',
                          tension: 0.3,
                          pointRadius: 3,
                      },
                  ];

        chartRef.current = new Chart(canvasRef.current, {
            type: 'line',
            data: { labels, datasets } as any,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { font: { size: 10 }, boxWidth: 12 } },
                    tooltip: { bodyFont: { size: 10 }, titleFont: { size: 10 } },
                },
                scales: {
                    x: { ticks: { font: { size: 9 } } },
                    y: { ticks: { font: { size: 10 } } },
                },
            },
        });

        return () => { chartRef.current?.destroy(); };
    }, [vitals, mode]);

    if (vitals.length < 2) {
        return (
            <div className="h-40 flex items-center justify-center text-xs text-gray-400 bg-gray-50 rounded-xl border">
                Record at least 2 vitals entries to see trend chart
            </div>
        );
    }

    return (
        <div className="bg-white border rounded-2xl p-4">
            <div className="h-52">
                <canvas ref={canvasRef} />
            </div>
        </div>
    );
}
