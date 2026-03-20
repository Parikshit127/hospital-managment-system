'use client';

import React from 'react';

interface TableProps {
    children: React.ReactNode;
    className?: string;
}

export function Table({ children, className = '' }: TableProps) {
    return (
        <div className={`overflow-x-auto rounded-xl border border-gray-200/60 shadow-[var(--shadow-card)] ${className}`}>
            <table className="w-full text-sm">{children}</table>
        </div>
    );
}

export function TableHeader({ children, className = '' }: TableProps) {
    return (
        <thead>
            <tr className={`border-b border-gray-100 bg-gray-50/60 ${className}`}>{children}</tr>
        </thead>
    );
}

export function TableBody({ children, className = '' }: TableProps) {
    return <tbody className={`divide-y divide-gray-100/80 ${className}`}>{children}</tbody>;
}

export function TableRow({ children, className = '', onClick }: TableProps & { onClick?: () => void }) {
    return (
        <tr
            className={`hover:bg-gray-50/60 transition-colors duration-150 ${onClick ? 'cursor-pointer' : ''} ${className}`}
            onClick={onClick}
        >
            {children}
        </tr>
    );
}

interface TableCellProps {
    children: React.ReactNode;
    className?: string;
    header?: boolean;
}

export function TableCell({ children, className = '', header = false }: TableCellProps) {
    if (header) {
        return (
            <th className={`px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider ${className}`}>
                {children}
            </th>
        );
    }
    return <td className={`px-4 py-3.5 text-gray-700 ${className}`}>{children}</td>;
}
