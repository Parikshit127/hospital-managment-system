'use client';

import React from 'react';

interface TableProps {
    children: React.ReactNode;
    className?: string;
}

export function Table({ children, className = '' }: TableProps) {
    return (
        <div className={`overflow-x-auto ${className}`}>
            <table className="w-full text-sm">{children}</table>
        </div>
    );
}

export function TableHeader({ children, className = '' }: TableProps) {
    return (
        <thead>
            <tr className={`border-b border-gray-200 ${className}`}>{children}</tr>
        </thead>
    );
}

export function TableBody({ children, className = '' }: TableProps) {
    return <tbody className={`divide-y divide-gray-100 ${className}`}>{children}</tbody>;
}

export function TableRow({ children, className = '', onClick }: TableProps & { onClick?: () => void }) {
    return (
        <tr
            className={`hover:bg-gray-50 transition-colors ${onClick ? 'cursor-pointer' : ''} ${className}`}
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
            <th className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide ${className}`}>
                {children}
            </th>
        );
    }
    return <td className={`px-4 py-3 text-gray-700 ${className}`}>{children}</td>;
}
