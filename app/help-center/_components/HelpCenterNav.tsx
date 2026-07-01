'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function HelpCenterNav() {
    const pathname = usePathname();

    const tabs = [
        { name: 'Track Status', href: '/help-center/track' },
        { name: 'Raise Ticket', href: '/help-center/raise' },
        { name: 'Release Notes', href: '/help-center/release-notes' },
    ];

    return (
        <div className="bg-white border-b border-gray-200">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex h-12 gap-8">
                    {tabs.map((tab) => {
                        const active = pathname?.startsWith(tab.href);
                        return (
                            <Link
                                key={tab.name}
                                href={tab.href}
                                className={`inline-flex items-center justify-center border-b-2 px-1 text-sm font-medium transition-colors ${
                                    active
                                        ? 'border-primary-500 text-primary-600'
                                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                }`}
                            >
                                {tab.name}
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
