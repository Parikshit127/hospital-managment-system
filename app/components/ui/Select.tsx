'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
    value: string;
    label: string;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
    label?: string;
    options: SelectOption[];
    placeholder?: string;
    error?: string;
}

export function Select({ label, options, placeholder, error, className = '', ...props }: SelectProps) {
    return (
        <div className="space-y-1.5">
            {label && (
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {label}
                </label>
            )}
            <div className="relative">
                <select
                    className={`w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 appearance-none focus:outline-none focus:ring-2 focus:ring-teal-500/15 focus:border-teal-500 transition-all duration-200 pr-10 shadow-sm hover:border-gray-300 ${error ? 'border-rose-300 hover:border-rose-300' : ''} ${className}`}
                    {...props}
                >
                    {placeholder && (
                        <option value="" className="text-gray-400">
                            {placeholder}
                        </option>
                    )}
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
            {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        </div>
    );
}
