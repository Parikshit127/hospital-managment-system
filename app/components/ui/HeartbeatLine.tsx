'use client';

import React from 'react';

interface HeartbeatLineProps {
    color?: string;
    className?: string;
    speed?: number;
}

export default function HeartbeatLine({
    color = '#E8621C',
    className = 'w-full h-12',
    speed = 3.2,
}: HeartbeatLineProps) {
    return (
        <div className={className}>
            <svg
                viewBox="0 0 460 64"
                preserveAspectRatio="none"
                className="w-full h-full"
                aria-hidden="true"
                style={{ overflow: 'visible' }}
            >
                <style>{`
                    @keyframes heartbeat-draw {
                        0% {
                            stroke-dashoffset: 600;
                        }
                        50% {
                            stroke-dashoffset: 0;
                        }
                        100% {
                            stroke-dashoffset: -600;
                        }
                    }
                    .heartbeat-line-path {
                        stroke-dasharray: 600;
                        animation: heartbeat-draw 3.2s ease-in-out infinite;
                    }
                    @media (prefers-reduced-motion: reduce) {
                        .heartbeat-line-path {
                            stroke-dashoffset: 0 !important;
                            animation: none !important;
                        }
                    }
                `}</style>
                <path
                    d="M0,32 L60,32 L80,32 L92,10 L104,54 L116,32 L140,32 L160,32 L172,20 L184,44 L196,32 L230,32 L250,32 L262,10 L274,54 L286,32 L310,32 L340,32 L352,20 L364,44 L376,32 L460,32"
                    fill="none"
                    stroke={color}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="heartbeat-line-path"
                    style={{ animationDuration: `${speed}s` }}
                />
            </svg>
        </div>
    );
}
