'use client';

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    icon?: React.ReactNode;
    error?: string;
}

export function Input({ label, icon, error, className = '', ...props }: InputProps) {
    return (
        <div className="space-y-1.5">
            {label && (
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {label}
                </label>
            )}
            <div className="relative">
                {icon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {icon}
                    </div>
                )}
                <input
                    className={`w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/15 focus:border-teal-500 transition-all duration-200 shadow-sm hover:border-gray-300 ${icon ? 'pl-10' : ''} ${error ? 'border-rose-300 focus:ring-rose-500/15 focus:border-rose-500 hover:border-rose-300' : ''} ${className}`}
                    {...props}
                />
            </div>
            {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        </div>
    );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
}

export function Textarea({ label, error, className = '', ...props }: TextareaProps) {
    return (
        <div className="space-y-1.5">
            {label && (
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {label}
                </label>
            )}
            <textarea
                className={`w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/15 focus:border-teal-500 transition-all duration-200 resize-none shadow-sm hover:border-gray-300 ${error ? 'border-rose-300 hover:border-rose-300' : ''} ${className}`}
                {...props}
            />
            {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        </div>
    );
}
